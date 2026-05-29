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
import uuid
from typing import Any, override
from urllib.parse import parse_qs, urlencode

from a2a.server.agent_execution import RequestContext
from a2a.types import (
    DataPart,
    Message,
    Part,
    Role,
    TaskState,
    TaskStatus,
    TaskStatusUpdateEvent,
    TextPart,
)
from a2ui.a2a.extension import try_activate_a2ui_extension
from a2ui.a2a.parts import A2UI_MIME_TYPE, create_a2ui_part
from a2ui.adk.send_a2ui_to_client_toolset import (
    A2uiEventConverter,
)
from a2ui.schema.constants import A2UI_CLIENT_CAPABILITIES_KEY, VERSION_0_8, VERSION_0_9
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
from app.config import A2UI_EXTENSION_URI_V0_8, get_google_maps_api_key
from app.session_keys import A2UI_CATALOG_KEY, A2UI_ENABLED_KEY, A2UI_EXAMPLES_KEY

logger = logging.getLogger(__name__)

# Matches the /maps/embed proxy URL produced by the LLM.
_MAPS_PROXY_RE = re.compile(r"^/maps/embed\?(.+)$")

# A2UI message types that must each travel as their own message.
# Renderers (frontend Lit, Gemini Enterprise) reject a single message that
# contains more than one of these keys. Covers both v0.8 and v0.9 type names.
_A2UI_UPDATE_TYPES = (
    # v0.9
    "createSurface",
    "deleteSurface",
    "updateDataModel",
    "updateComponents",
    # v0.8
    "beginRendering",
    "surfaceUpdate",
    "dataModelUpdate",
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
    # Preserve the original `version` field only if the source had one.
    # v0.9 messages carry `"version": "v0.9"`; v0.8 messages have no
    # version field, so synthesizing one would fail v0.8 schema validation.
    base = {"version": data["version"]} if "version" in data else {}
    return [{**base, t: data[t]} for t in types_present]


def _repair_catalog_id(msg: dict, valid_catalog_id: str) -> None:
    """Overwrite a bad `createSurface.catalogId` with the session's active value.

    The LLM occasionally hallucinates IDs like ``"<agent_name>:<version>"``
    instead of copying the URL from the prompt example. Renderers reject
    those with ``Catalog not found`` and the surface never appears. v0.8
    ``beginRendering`` carries no catalogId so this is a v0.9-only repair.
    """
    create_surface = msg.get("createSurface")
    if not isinstance(create_surface, dict):
        return
    actual = create_surface.get("catalogId")
    if actual == valid_catalog_id:
        return
    logger.warning(
        "Repairing invalid createSurface.catalogId %r -> %r",
        actual,
        valid_catalog_id,
    )
    create_surface["catalogId"] = valid_catalog_id


def _process_a2ui_parts(parts: list, valid_catalog_id: str | None = None) -> list:
    """Split combined A2UI parts, rewrite /maps/embed proxy URLs, and repair catalogIds."""
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
            msg = _replace_proxy_urls(msg)
            if valid_catalog_id is not None:
                _repair_catalog_id(msg, valid_catalog_id)
            new_parts.append(create_a2ui_part(msg))
    return new_parts


# ---------------------------------------------------------------------------
# Thinking widget + progress bar
# ---------------------------------------------------------------------------

_STEP_MARKERS = {"done": "✓", "active": "▸", "pending": "○", "failed": "✗"}
_PROGRESS_CELLS = 20


def _progress_bar_text(pct: int, *, failed: bool = False) -> str:
    """Render a pure-text progress bar, e.g. ``██████░░░░░░░░░░  30%``."""
    pct = max(0, min(100, pct))
    filled = round(pct / 100 * _PROGRESS_CELLS)
    fill_char = "▓" if failed else "█"
    return f"{fill_char * filled}{'░' * (_PROGRESS_CELLS - filled)}  {pct}%"


_TOOL_MARKERS = {"running": "•", "done": "✓", "failed": "✗"}
_INDENT = " " * 4  # noqa: RUF001 - NBSP is intentional

_TOOL_LABELS = {
    "find_restaurants": "Search for restaurants",
    "get_directions": "Get driving directions",
    "send_a2ui_json_to_client": "Render dashboard UI",
    "gws_call": "Access Google Workspace",
    "create_doc": "Create Google Doc",
    "append_doc_text": "Append text to Google Doc",
    "share_doc": "Share Google Doc",
    "share_anyone_with_link": "Share file with link",
    "create_sheet": "Create Google Sheet",
    "append_sheet_data": "Append data to Google Sheet",
    "read_doc": "Read Google Doc",
    "read_sheet": "Read Google Sheet",
    "read_presentation": "Read Google Presentation",
    "read_drive_file": "Read Google Drive file",
}

_TOOL_STEP_TITLES = {
    "find_restaurants": (
        "Searching for restaurants",
        "Calling Google Maps to find restaurants near the requested location.",
    ),
    "get_directions": (
        "Calculating driving directions",
        "Calling Google Maps to get routes between locations.",
    ),
    "send_a2ui_json_to_client": (
        "Compiling dashboard",
        "Generating the A2UI surface for your answer.",
    ),
    "gws_call": (
        "Accessing Google Workspace",
        "Executing Workspace API command.",
    ),
    "create_doc": (
        "Creating Google Doc",
        "Creating a new Google Document.",
    ),
    "append_doc_text": (
        "Appending text to Google Doc",
        "Adding content to the Google Document.",
    ),
    "share_doc": (
        "Sharing Google Doc",
        "Updating permissions on the Google Document.",
    ),
    "share_anyone_with_link": (
        "Sharing file with link",
        "Making file accessible to anyone with the link.",
    ),
    "create_sheet": (
        "Creating Google Sheet",
        "Creating a new Google Spreadsheet.",
    ),
    "append_sheet_data": (
        "Appending data to Google Sheet",
        "Adding rows to the Google Spreadsheet.",
    ),
    "read_doc": (
        "Reading Google Doc",
        "Fetching content from the Google Document.",
    ),
    "read_sheet": (
        "Reading Google Sheet",
        "Fetching rows from the Google Spreadsheet.",
    ),
    "read_presentation": (
        "Reading Google Presentation",
        "Fetching slides from the Google Presentation.",
    ),
    "read_drive_file": (
        "Reading Google Drive file",
        "Fetching content from the Google Drive file.",
    ),
}

PROGRESS_OPT_IN_KEY = "system:a2ui_progress"
PROGRESS_STAGE_META = "a2uiProgressStage"
PROGRESS_SURFACE_PREFIX = "tool-progress-"


def _prettify_tool(name: str) -> str:
    """Map a tool name to a readable label."""
    if name in _TOOL_LABELS:
        return _TOOL_LABELS[name]
    pretty = name.removesuffix("_tool").replace("_", " ").strip()
    return pretty or name


def _tool_progress(steps: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Return ``(done, total, pct)`` counting only tool calls across steps."""
    total = sum(len(s.get("tools", [])) for s in steps)
    done = sum(1 for s in steps for t in s.get("tools", []) if t.get("state") == "done")
    pct = round(done / total * 100) if total else 0
    return done, total, pct


def _tool_progress_messages(
    surface_id: str,
    steps: list[dict[str, Any]],
    *,
    include_begin: bool = False,
    done: bool = False,
    failed: bool = False,
) -> list[dict[str, Any]]:
    """Build the A2UI "thinking" widget."""
    active_title = next((s["title"] for s in steps if s.get("state") == "active"), None)
    subtitle = (
        "Failed" if failed else "Complete" if done else (active_title or "Working")
    )

    components: list[dict[str, Any]] = [
        {"id": "progress-root", "component": {"Card": {"child": "progress-col"}}},
    ]
    children: list[str] = ["th-title", "th-subtitle"]
    components.append(
        {
            "id": "th-title",
            "component": {
                "Text": {"text": {"literalString": "Thinking"}, "usageHint": "h3"}
            },
        }
    )
    components.append(
        {
            "id": "th-subtitle",
            "component": {
                "Text": {"text": {"literalString": subtitle}, "usageHint": "caption"}
            },
        }
    )

    for idx, step in enumerate(steps):
        step_children: list[str] = []

        marker = _STEP_MARKERS.get(step.get("state", "pending"), "○")
        step_id = f"th-step-{idx}"
        step_children.append(step_id)
        components.append(
            {
                "id": step_id,
                "component": {
                    "Text": {
                        "text": {"literalString": f"{marker} {step.get('title', '')}"},
                        "usageHint": "body",
                    }
                },
            }
        )
        detail = step.get("detail")
        if detail:
            detail_id = f"th-detail-{idx}"
            step_children.append(detail_id)
            components.append(
                {
                    "id": detail_id,
                    "component": {
                        "Text": {
                            "text": {"literalString": f"{_INDENT}{detail}"},
                            "usageHint": "caption",
                        }
                    },
                }
            )
        tools = step.get("tools", [])
        for jdx, tool in enumerate(tools):
            tmarker = _TOOL_MARKERS.get(tool.get("state", "running"), "•")
            tool_id = f"th-tool-{idx}-{jdx}"
            step_children.append(tool_id)
            components.append(
                {
                    "id": tool_id,
                    "component": {
                        "Text": {
                            "text": {
                                "literalString": (
                                    f"{_INDENT}↳ {tmarker} "
                                    f"{_prettify_tool(tool.get('name', ''))}"
                                )
                            },
                            "usageHint": "caption",
                        }
                    },
                }
            )

        if tools:
            step_done = sum(1 for t in tools if t.get("state") == "done")
            step_failed = failed or any(t.get("state") == "failed" for t in tools)
            step_pct = round(step_done / len(tools) * 100) if tools else 0
            label_id = f"th-toolbar-label-{idx}"
            step_children.append(label_id)
            components.append(
                {
                    "id": label_id,
                    "component": {
                        "Text": {
                            "text": {
                                "literalString": (
                                    f"{_INDENT}Tool calls · {step_done}/{len(tools)}"
                                )
                            },
                            "usageHint": "caption",
                        }
                    },
                }
            )
            bar_id = f"th-toolbar-{idx}"
            step_children.append(bar_id)
            components.append(
                {
                    "id": bar_id,
                    "component": {
                        "Text": {
                            "text": {
                                "literalString": (
                                    _INDENT
                                    + _progress_bar_text(step_pct, failed=step_failed)
                                )
                            },
                            "usageHint": "body",
                        }
                    },
                }
            )

        step_col_id = f"th-step-col-{idx}"
        step_card_id = f"th-step-card-{idx}"
        components.append(
            {
                "id": step_col_id,
                "component": {
                    "Column": {
                        "children": {"explicitList": step_children},
                        "alignment": "stretch",
                    }
                },
            }
        )
        components.append(
            {
                "id": step_card_id,
                "component": {"Card": {"child": step_col_id}},
            }
        )
        children.append(step_card_id)

    components.insert(
        1,
        {
            "id": "progress-col",
            "component": {
                "Column": {
                    "children": {"explicitList": children},
                    "alignment": "stretch",
                }
            },
        },
    )

    messages: list[dict[str, Any]] = []
    if include_begin:
        messages.append(
            {"beginRendering": {"surfaceId": surface_id, "root": "progress-root"}}
        )
    messages.append(
        {"surfaceUpdate": {"surfaceId": surface_id, "components": components}}
    )
    return messages


def _tool_progress_messages_v0_9(
    surface_id: str,
    steps: list[dict[str, Any]],
    *,
    include_begin: bool = False,
    done: bool = False,
    failed: bool = False,
) -> list[dict[str, Any]]:
    """Build the A2UI v0.9 \"thinking\" widget."""
    active_title = next((s["title"] for s in steps if s.get("state") == "active"), None)
    subtitle = (
        "Failed" if failed else "Complete" if done else (active_title or "Working")
    )

    components: list[dict[str, Any]] = [
        {"id": "progress-root", "component": "Card", "child": "progress-col"},
    ]
    children: list[str] = ["th-title", "th-subtitle"]
    components.append(
        {
            "id": "th-title",
            "component": "Text",
            "text": "Thinking",
            "variant": "h3",
        }
    )
    components.append(
        {
            "id": "th-subtitle",
            "component": "Text",
            "text": subtitle,
            "variant": "caption",
        }
    )

    for idx, step in enumerate(steps):
        step_children: list[str] = []

        marker = _STEP_MARKERS.get(step.get("state", "pending"), "○")
        step_id = f"th-step-{idx}"
        step_children.append(step_id)
        components.append(
            {
                "id": step_id,
                "component": "Text",
                "text": f"{marker} {step.get('title', '')}",
                "variant": "body",
            }
        )
        detail = step.get("detail")
        if detail:
            detail_id = f"th-detail-{idx}"
            step_children.append(detail_id)
            components.append(
                {
                    "id": detail_id,
                    "component": "Text",
                    "text": f"{_INDENT}{detail}",
                    "variant": "caption",
                }
            )
        tools = step.get("tools", [])
        for jdx, tool in enumerate(tools):
            tmarker = _TOOL_MARKERS.get(tool.get("state", "running"), "•")
            tool_id = f"th-tool-{idx}-{jdx}"
            step_children.append(tool_id)
            components.append(
                {
                    "id": tool_id,
                    "component": "Text",
                    "text": f"{_INDENT}↳ {tmarker} {_prettify_tool(tool.get('name', ''))}",
                    "variant": "caption",
                }
            )

        if tools:
            step_done = sum(1 for t in tools if t.get("state") == "done")
            step_failed = failed or any(t.get("state") == "failed" for t in tools)
            step_pct = round(step_done / len(tools) * 100) if tools else 0
            label_id = f"th-toolbar-label-{idx}"
            step_children.append(label_id)
            components.append(
                {
                    "id": label_id,
                    "component": "Text",
                    "text": f"{_INDENT}Tool calls · {step_done}/{len(tools)}",
                    "variant": "caption",
                }
            )
            bar_id = f"th-toolbar-{idx}"
            step_children.append(bar_id)
            components.append(
                {
                    "id": bar_id,
                    "component": "Text",
                    "text": _INDENT + _progress_bar_text(step_pct, failed=step_failed),
                    "variant": "body",
                }
            )

        step_col_id = f"th-step-col-{idx}"
        step_card_id = f"th-step-card-{idx}"
        components.append(
            {
                "id": step_col_id,
                "component": "Column",
                "children": step_children,
                "alignment": "stretch",
            }
        )
        components.append(
            {
                "id": step_card_id,
                "component": "Card",
                "child": step_col_id,
            }
        )
        children.append(step_card_id)

    components.insert(
        1,
        {
            "id": "progress-col",
            "component": "Column",
            "children": children,
            "alignment": "stretch",
        },
    )

    messages: list[dict[str, Any]] = []
    if include_begin:
        messages.append(
            {
                "version": "v0.9",
                "createSurface": {
                    "surfaceId": surface_id,
                    "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
                },
            }
        )
    messages.append(
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": components,
            },
        }
    )
    return messages


def _progress_status_text(
    steps: list[dict[str, Any]],
    fallback_text: str,
    *,
    done: bool = False,
    failed: bool = False,
) -> str:
    """Build the native text status shown by GE's thinking panel."""
    if not steps:
        return fallback_text

    active_title = next((s["title"] for s in steps if s.get("state") == "active"), None)
    subtitle = (
        "Failed" if failed else "Complete" if done else (active_title or "Working")
    )
    lines: list[str] = [subtitle, ""]

    for step in steps:
        marker = _STEP_MARKERS.get(step.get("state", "pending"), "○")
        lines.append(f"{marker} {step.get('title', '')}")

        detail = step.get("detail")
        if detail:
            lines.append(f"{_INDENT}{detail}")

        tools = step.get("tools", [])
        for tool in tools:
            tmarker = _TOOL_MARKERS.get(tool.get("state", "running"), "•")
            lines.append(f"{_INDENT}↳ {tmarker} {_prettify_tool(tool.get('name', ''))}")

        if tools:
            step_done = sum(1 for t in tools if t.get("state") == "done")
            step_failed = failed or any(t.get("state") == "failed" for t in tools)
            step_pct = round(step_done / len(tools) * 100)
            lines.append(f"{_INDENT}Tool calls · {step_done}/{len(tools)}")
            lines.append(f"{_INDENT}{_progress_bar_text(step_pct, failed=step_failed)}")

        lines.append("")

    return "\n".join(lines).rstrip()


def _progress_status_parts(
    surface_id: str,
    steps: list[dict[str, Any]],
    stage_text: str,
    *,
    include_begin: bool = False,
    done: bool = False,
    failed: bool = False,
    include_a2ui: bool = True,
    ui_version: str = VERSION_0_8,
) -> list:
    """Build the parts for one progress status update."""
    text = (
        stage_text
        if include_a2ui
        else _progress_status_text(steps, stage_text, done=done, failed=failed)
    )
    parts: list = [Part(root=TextPart(text=text))]
    if include_a2ui:
        if ui_version == VERSION_0_9:
            msgs = _tool_progress_messages_v0_9(
                surface_id,
                steps,
                include_begin=include_begin,
                done=done,
                failed=failed,
            )
        else:
            msgs = _tool_progress_messages(
                surface_id,
                steps,
                include_begin=include_begin,
                done=done,
                failed=failed,
            )
        parts.extend(create_a2ui_part(msg) for msg in msgs)
    return parts


def _iter_part_owners(a2a_event):
    """Yield objects on an A2A event that own a mutable ``parts`` list."""
    owners = []
    message = getattr(getattr(a2a_event, "status", None), "message", None)
    if message is not None:
        owners.append(message)
    artifact = getattr(a2a_event, "artifact", None)
    if artifact is not None:
        owners.append(artifact)
    owners.extend(getattr(a2a_event, "artifacts", None) or [])

    seen: set[int] = set()
    for owner in owners:
        if id(owner) in seen:
            continue
        seen.add(id(owner))
        yield owner


def _generated_text_signature(text: str) -> str | None:
    """Return a stable signature for generated answer text we should not repeat."""
    normalized = text.strip()
    if not normalized:
        return None
    return re.sub(r"\s+", " ", normalized).lower()


def _dedupe_text_parts_across_events(a2a_events, seen: set[str] | None = None) -> None:
    """Remove repeated answer text when ADK/A2A emits it in multiple containers."""
    if seen is None:
        seen = set()

    def clean_parts(parts: list) -> list:
        cleaned_parts = []
        for part in parts:
            root = getattr(part, "root", None)
            if isinstance(root, TextPart):
                text = root.text
                signature = _generated_text_signature(text)
                if signature:
                    if signature in seen:
                        continue
                    seen.add(signature)
            cleaned_parts.append(part)
        return cleaned_parts

    for a2a_event in a2a_events:
        for owner in _iter_part_owners(a2a_event):
            if getattr(owner, "parts", None):
                owner.parts = clean_parts(owner.parts)


class _MapsKeyEventConverter(A2uiEventConverter):
    """Post-processes A2A events to keep A2UI parts well-formed and enrichment with progress."""

    def __init__(self):
        super().__init__()
        self._progress: dict[str, dict[str, Any]] = {}
        self._seen_text_signatures: dict[str, set[str]] = {}

    def _advance_steps(self, event, steps: list[dict[str, Any]]) -> str | None:
        """Update ``steps`` in place from one ADK event."""
        content = getattr(event, "content", None)
        parts = getattr(content, "parts", None) or []

        function_calls: list[dict[str, str | None]] = []
        function_responses: list[dict[str, str | None]] = []
        has_text = False
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None):
                function_calls.append({"name": fc.name, "id": getattr(fc, "id", None)})
            fr = getattr(part, "function_response", None)
            if fr and getattr(fr, "name", None):
                function_responses.append(
                    {"name": fr.name, "id": getattr(fr, "id", None)}
                )
            if getattr(part, "text", None):
                has_text = True

        stage: str | None = None

        if function_responses:
            response_ids = {r["id"] for r in function_responses if r.get("id")}
            response_names = {r["name"] for r in function_responses}
            for step in steps:
                for tool in step.get("tools", []):
                    if tool["state"] == "running" and (
                        (tool.get("id") and tool.get("id") in response_ids)
                        or (
                            tool.get("id")
                            and not response_ids
                            and tool["name"] in response_names
                        )
                        or (not tool.get("id") and tool["name"] in response_names)
                    ):
                        tool["state"] = "done"
            for step in steps:
                tools = step.get("tools", [])
                if (
                    tools
                    and step["state"] == "active"
                    and all(t["state"] != "running" for t in tools)
                ):
                    step["state"] = "done"
            names = ", ".join(_prettify_tool(r["name"]) for r in function_responses)
            stage = f"Processing results\nIntegrated output from {names}."

        if function_calls:
            call_key = tuple(c.get("id") or f"name:{c['name']}" for c in function_calls)
            if any(step.get("call_key") == call_key for step in steps):
                return stage

            existing_step = next(
                (
                    s
                    for s in steps
                    if any(
                        t["name"] == function_calls[0]["name"]
                        for t in s.get("tools", [])
                    )
                ),
                None,
            )
            if existing_step:
                existing_step["state"] = "active"
                existing_step["call_key"] = call_key
                existing_step["tools"] = [
                    {
                        "name": c["name"],
                        "id": c.get("id"),
                        "state": "running",
                    }
                    for c in function_calls
                ]
                stage = f"{existing_step['title']}...\n{existing_step['detail']}"
                return stage

            for step in steps:
                if step["state"] == "active":
                    step["state"] = "done"
            title, detail = _TOOL_STEP_TITLES.get(
                function_calls[0]["name"],
                (
                    f"Calling {_prettify_tool(function_calls[0]['name'])}",
                    "Running tool.",
                ),
            )
            steps.append(
                {
                    "title": title,
                    "detail": detail,
                    "state": "active",
                    "call_key": call_key,
                    "tools": [
                        {
                            "name": c["name"],
                            "id": c.get("id"),
                            "state": "running",
                        }
                        for c in function_calls
                    ],
                }
            )
            stage = f"{title}...\n{detail}"

        if has_text and not function_calls and event.is_final_response():
            for step in steps:
                if step["state"] == "active":
                    step["state"] = "done"
                for tool in step.get("tools", []):
                    if tool["state"] == "running":
                        tool["state"] = "done"
            if steps:
                stage = "Composing response\nFinalizing the answer."

        return stage

    def _enrich_with_progress(
        self, event, invocation_context, a2a_events, task_id, context_id
    ) -> None:
        """Surface the thinking steps + per-step progress bar."""
        opt_in = bool(invocation_context.session.state.get(PROGRESS_OPT_IN_KEY))

        inv_id = getattr(invocation_context, "invocation_id", "") or "default"
        progress = self._progress.setdefault(
            inv_id,
            {
                "steps": [],
                "surface_id": f"{PROGRESS_SURFACE_PREFIX}{uuid.uuid4().hex[:8]}",
                "begin_sent": False,
            },
        )

        stage = self._advance_steps(event, progress["steps"])
        steps = progress["steps"]
        is_final = bool(
            getattr(event, "is_final_response", None) and event.is_final_response()
        )
        all_done = bool(steps) and all(s["state"] in ("done", "failed") for s in steps)

        ui_version = invocation_context.session.state.get(
            "active_ui_version", VERSION_0_8
        )

        if opt_in and stage and steps:
            extra_parts = _progress_status_parts(
                progress["surface_id"],
                steps,
                stage,
                include_begin=not progress["begin_sent"],
                done=all_done,
                include_a2ui=True,
                ui_version=ui_version,
            )
            progress["begin_sent"] = True
            extra_parts[0] = Part(
                root=TextPart(text=stage, metadata={PROGRESS_STAGE_META: True})
            )
            for a2a_event in a2a_events:
                status = getattr(a2a_event, "status", None)
                msg = getattr(status, "message", None)
                if (
                    status is not None
                    and getattr(status, "state", None) == TaskState.working
                    and msg is not None
                ):
                    msg.parts = (msg.parts or []) + extra_parts
                    break
        elif not opt_in and is_final and steps:
            has_working_answer = any(
                getattr(getattr(e, "status", None), "state", None) == TaskState.working
                and getattr(getattr(e, "status", None), "message", None) is not None
                for e in a2a_events
            )
            if has_working_answer:
                native_text = _progress_status_text(
                    steps, stage or "Complete", done=all_done
                )
                a2a_events.insert(
                    0,
                    TaskStatusUpdateEvent(
                        task_id=task_id,
                        context_id=context_id,
                        final=False,
                        status=TaskStatus(
                            state=TaskState.working,
                            message=Message(
                                message_id=uuid.uuid4().hex,
                                role=Role.agent,
                                parts=[Part(root=TextPart(text=native_text))],
                            ),
                        ),
                    ),
                )

        if is_final:
            self._progress.pop(inv_id, None)

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

        catalog = invocation_context.session.state.get(A2UI_CATALOG_KEY)
        valid_catalog_id = getattr(catalog, "catalog_id", None)

        for a2a_event in a2a_events:
            message = getattr(getattr(a2a_event, "status", None), "message", None)
            if message and message.parts:
                message.parts = _process_a2ui_parts(message.parts, valid_catalog_id)
            for artifact in getattr(a2a_event, "artifacts", None) or []:
                if artifact.parts:
                    artifact.parts = _process_a2ui_parts(
                        artifact.parts, valid_catalog_id
                    )

        inv_id = getattr(invocation_context, "invocation_id", "") or "default"
        seen_text = self._seen_text_signatures.setdefault(inv_id, set())
        _dedupe_text_parts_across_events(a2a_events, seen_text)

        self._enrich_with_progress(
            event, invocation_context, a2a_events, task_id, context_id
        )

        if getattr(event, "is_final_response", None) and event.is_final_response():
            self._seen_text_signatures.pop(inv_id, None)

        return a2a_events


class RestaurantFinderExecutor(A2aAgentExecutor):
    """Executor for the Restaurant Finder agent with A2UI GE session setup."""

    def __init__(self, base_url: str, agent: RestaurantFinderAgent):
        self._base_url = base_url
        self._agent = agent

        config = A2aAgentExecutorConfig(event_converter=_MapsKeyEventConverter())
        # `use_legacy=True` forces ADK's legacy execute() path, which calls
        # the overridden `_prepare_session` below. The newer ADK impl
        # (`_A2aAgentExecutor` in `a2a_agent_executor_impl.py`) is opted
        # into by clients that send the `_NEW_A2A_ADK_INTEGRATION_EXTENSION`
        # extension (Gemini Enterprise does this), and that path bypasses
        # `_prepare_session` entirely — so our A2UI session state never gets
        # set and `send_a2ui_json_to_client` is missing from the toolset.
        super().__init__(
            runner=self._agent.get_runner(),
            config=config,
            use_legacy=True,
        )

    @override
    async def _prepare_session(
        self,
        context: RequestContext,
        run_request: AgentRunRequest,
        runner: Runner,
    ):
        logger.info("Loading session for message %s", context.message)

        active_ui_version = try_activate_a2ui_extension(context, self._agent.agent_card)

        # The agent supports both A2UI v0.8 (Gemini Enterprise) and v0.9
        # (custom Lit shell). When the client omits the X-A2A-Extensions
        # header the toolset would otherwise stay disabled and the LLM
        # would hallucinate `send_a2ui_json_to_client` from its system
        # prompt. Gemini Enterprise sends no A2UI header but only renders
        # v0.8, so default to v0.8. The Lit shell explicitly sends the
        # v0.9 extension header and is unaffected.
        if not active_ui_version:
            active_ui_version = VERSION_0_8
            try:
                context.add_activated_extension(A2UI_EXTENSION_URI_V0_8)
            except Exception:
                logger.debug("Could not register fallback A2UI extension on context")

        schema_manager = self._agent.get_schema_manager(active_ui_version)

        session = await super()._prepare_session(context, run_request, runner)

        if "base_url" not in session.state:
            session.state["base_url"] = self._base_url

        if active_ui_version:
            session.state["active_ui_version"] = active_ui_version

        session.state[PROGRESS_OPT_IN_KEY] = bool(
            (context.message.metadata or {}).get("a2uiProgress")
            if context.message
            else False
        )

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
