# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Agent executor for GE UI with A2UI extension support."""

import logging
import re
from typing import override
from urllib.parse import parse_qs, urlencode

from a2a.server.agent_execution import RequestContext
from a2a.types import DataPart
from a2ui.a2a.extension import try_activate_a2ui_extension
from a2ui.a2a.parts import A2UI_MIME_TYPE, create_a2ui_part
from a2ui.adk.send_a2ui_to_client_toolset import (
    A2uiEventConverter,
)
from a2ui.schema.constants import A2UI_CLIENT_CAPABILITIES_KEY, VERSION_0_9
from google.adk.a2a.converters.request_converter import AgentRunRequest
from google.adk.a2a.executor.a2a_agent_executor import (
    A2aAgentExecutor,
    A2aAgentExecutorConfig,
)
from google.adk.agents.invocation_context import new_invocation_context_id
from google.adk.events.event import Event
from google.adk.events.event_actions import EventActions
from google.adk.runners import Runner

from app.agent import RestaurantFinderAgent
from app.config import A2UI_EXTENSION_URI, get_google_maps_api_key
from app.session_keys import A2UI_CATALOG_KEY, A2UI_ENABLED_KEY, A2UI_EXAMPLES_KEY

logger = logging.getLogger(__name__)

# Matches the /maps/embed proxy URL produced by the LLM.
_MAPS_PROXY_RE = re.compile(r"^/maps/embed\?(.+)$")

# A2UI v0.9 message types that must each travel as their own message.
# Renderers (frontend Lit, Gemini Enterprise) reject a single message that
# contains more than one of these keys.
_A2UI_UPDATE_TYPES = (
    "createSurface",
    "deleteSurface",
    "updateDataModel",
    "updateComponents",
)


def _proxy_url_to_full_embed_url(url: str) -> str:
    """Convert /maps/embed?mode=place&q=... to a full Google Maps Embed URL."""
    match = _MAPS_PROXY_RE.match(url)
    if not match:
        return url
    api_key = get_google_maps_api_key()
    if not api_key:
        return url
    params = parse_qs(match.group(1), keep_blank_values=True)
    mode = params.pop("mode", ["place"])[0]
    # Flatten single-value lists from parse_qs
    flat_params = {k: v[0] for k, v in params.items()}
    qs = urlencode(flat_params)
    return f"https://www.google.com/maps/embed/v1/{mode}?key={api_key}&{qs}"


def _replace_proxy_urls(obj):
    """Recursively walk A2UI data and replace /maps/embed proxy URLs."""
    if isinstance(obj, str):
        return _proxy_url_to_full_embed_url(obj)
    if isinstance(obj, dict):
        return {k: _replace_proxy_urls(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_proxy_urls(item) for item in obj]
    return obj


def _split_combined_a2ui_data(data: dict) -> list[dict]:
    """Split one A2UI message containing multiple update types into separate messages.

    The LLM occasionally bundles createSurface + updateComponents +
    updateDataModel into a single object. Renderers reject this. Emit one
    message per update type, ordered so createSurface (and deleteSurface)
    run before updates that depend on the surface existing.
    """
    types_present = [t for t in _A2UI_UPDATE_TYPES if t in data]
    if len(types_present) <= 1:
        return [data]
    version = data.get("version", "v0.9")
    return [{"version": version, t: data[t]} for t in types_present]


def _process_a2ui_parts(parts: list) -> list:
    """Split combined A2UI parts and rewrite /maps/embed proxy URLs."""
    new_parts = []
    for part in parts:
        data_part = getattr(part, "root", None)
        is_a2ui = (
            isinstance(data_part, DataPart)
            and data_part.metadata
            and data_part.metadata.get("mimeType") == A2UI_MIME_TYPE
            and isinstance(data_part.data, dict)
        )
        if not is_a2ui:
            new_parts.append(part)
            continue
        for msg in _split_combined_a2ui_data(data_part.data):
            new_parts.append(create_a2ui_part(_replace_proxy_urls(msg)))
    return new_parts


class _MapsKeyEventConverter(A2uiEventConverter):
    """Post-processes A2A events to keep A2UI parts well-formed for any renderer.

    Two responsibilities:
      1. Split A2UI data parts that combine multiple update types into one
         object (LLM behavior the v0.9 schema rejects).
      2. Rewrite `/maps/embed?...` proxy URLs to full Google Maps Embed URLs
         with the API key attached.
    """

    def __call__(
        self,
        event,
        invocation_context,
        task_id=None,
        context_id=None,
        part_converter_func=None,
    ):
        kwargs = {
            "event": event,
            "invocation_context": invocation_context,
            "task_id": task_id,
            "context_id": context_id,
        }
        if part_converter_func is not None:
            kwargs["part_converter_func"] = part_converter_func
        a2a_events = super().__call__(**kwargs)
        for a2a_event in a2a_events:
            message = getattr(getattr(a2a_event, "status", None), "message", None)
            if message and message.parts:
                message.parts = _process_a2ui_parts(message.parts)
            for artifact in getattr(a2a_event, "artifacts", None) or []:
                if artifact.parts:
                    artifact.parts = _process_a2ui_parts(artifact.parts)
        return a2a_events


class RestaurantFinderExecutor(A2aAgentExecutor):
    """Executor for the Restaurant Finder agent with A2UI GE session setup."""

    def __init__(self, base_url: str, agent: RestaurantFinderAgent):
        self._base_url = base_url
        self._agent = agent

        config = A2aAgentExecutorConfig(event_converter=_MapsKeyEventConverter())
        # Single runner — SendA2uiToClientToolset is conditionally enabled
        # via session state (returns no tools when A2UI is not activated).
        super().__init__(runner=self._agent.get_runner(), config=config)

    @override
    async def _prepare_session(
        self,
        context: RequestContext,
        run_request: AgentRunRequest,
        runner: Runner,
    ):
        logger.info("Loading session for message %s", context.message)

        active_ui_version = try_activate_a2ui_extension(context, self._agent.agent_card)

        # This agent is purpose-built for A2UI v0.9. If the client did not
        # send the X-A2A-Extensions header (observed with some Gemini
        # Enterprise requests), the toolset would otherwise stay disabled
        # and the LLM would hallucinate `send_a2ui_json_to_client` from
        # its system prompt. Default to v0.9 and record the activation so
        # the response advertises it back to the client.
        if not active_ui_version:
            active_ui_version = VERSION_0_9
            try:
                context.add_activated_extension(A2UI_EXTENSION_URI)
            except Exception:
                logger.debug("Could not register fallback A2UI extension on context")

        schema_manager = self._agent.get_schema_manager(active_ui_version)

        session = await super()._prepare_session(context, run_request, runner)

        if "base_url" not in session.state:
            session.state["base_url"] = self._base_url

        if active_ui_version and schema_manager:
            capabilities = (
                context.message.metadata.get(A2UI_CLIENT_CAPABILITIES_KEY)
                if context.message and context.message.metadata
                else None
            )
            a2ui_catalog = schema_manager.get_selected_catalog(
                client_ui_capabilities=capabilities
            )
            examples = schema_manager.load_examples(a2ui_catalog, validate=True)

            await runner.session_service.append_event(
                session,
                Event(
                    invocation_id=new_invocation_context_id(),
                    author="system",
                    actions=EventActions(
                        state_delta={
                            A2UI_ENABLED_KEY: True,
                            A2UI_CATALOG_KEY: a2ui_catalog,
                            A2UI_EXAMPLES_KEY: examples,
                        }
                    ),
                ),
            )

        return session
