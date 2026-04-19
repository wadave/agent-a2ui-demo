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

"""Restaurant Finder agent using A2UI SDK for GE UI integration."""

import logging
import os
from typing import ClassVar

from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from a2ui.a2a import get_a2ui_agent_extension
from a2ui.adk.a2a_extension.send_a2ui_to_client_toolset import (
    SendA2uiToClientToolset,
)
from a2ui.basic_catalog.provider import BasicCatalog, BundledCatalogProvider
from a2ui.core.schema.catalog import CatalogConfig
from a2ui.core.schema.catalog_provider import (
    A2uiCatalogProvider,
    FileSystemCatalogProvider,
)
from a2ui.core.schema.common_modifiers import remove_strict_validation
from a2ui.core.schema.constants import (
    CATALOG_COMPONENTS_KEY,
    CATALOG_ID_KEY,
    VERSION_0_9,
)
from a2ui.core.schema.manager import A2uiSchemaManager
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.llm_agent import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import AgentTool
from google.genai import types

from app.config import DEFAULT_MODEL
from app.session_keys import A2UI_CATALOG_KEY, A2UI_ENABLED_KEY, A2UI_EXAMPLES_KEY
from app.sub_agents import maps_agent
from app.tools import find_restaurants, get_directions

logger = logging.getLogger(__name__)

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG_DEFINITION_JSON = os.path.join(
    _APP_DIR, "catalog_schemas", "0.9", "restaurant_finder_catalog_definition.json"
)


class _MergedBasicCatalogProvider(A2uiCatalogProvider):
    """Loads the bundled basic catalog and merges our custom components.

    v0.9 validation references `catalog.json#/$defs/anyComponent`, so a
    catalog used standalone must include both the basic component
    definitions and the `$defs.anyComponent` discriminator entry. Rather
    than duplicate the entire basic catalog in JSON, we load it from the
    SDK at startup and inject the custom components and matching
    `oneOf` entries.
    """

    def __init__(self, version: str, custom_catalog_path: str, catalog_id: str):
        self._basic = BundledCatalogProvider(version)
        self._custom = FileSystemCatalogProvider(custom_catalog_path)
        self._catalog_id = catalog_id

    def load(self) -> dict:
        merged = self._basic.load()
        custom = self._custom.load()
        merged[CATALOG_ID_KEY] = self._catalog_id

        custom_components = custom.get(CATALOG_COMPONENTS_KEY, {})
        merged.setdefault(CATALOG_COMPONENTS_KEY, {}).update(custom_components)

        any_component = merged.setdefault("$defs", {}).setdefault(
            "anyComponent",
            {"oneOf": [], "discriminator": {"propertyName": "component"}},
        )
        one_of = any_component.setdefault("oneOf", [])
        existing_refs = {item.get("$ref") for item in one_of if isinstance(item, dict)}
        for name in custom_components:
            ref = f"#/{CATALOG_COMPONENTS_KEY}/{name}"
            if ref not in existing_refs:
                one_of.append({"$ref": ref})

        return merged


ROLE_DESCRIPTION = """
You are a restaurant finder agent. Your goal is to help users find and explore restaurants by using the available tools.
You MUST use the `send_a2ui_json_to_client` tool with the `a2ui_json` argument to send A2UI JSON payloads to the client for rendering rich UI.

**CRITICAL — YOU MUST FOLLOW THESE RULES OR THE SYSTEM WILL BREAK:**
1. Use the native function calling interface. Do NOT generate code (no Python, no JavaScript, no imports, no variables, no loops).
2. Pass `a2ui_json` as a single compact JSON string. Do NOT split it across multiple strings or lines.
3. Do NOT use `default_api.`, `print()`, `json.dumps()`, or any wrapper.
4. Do NOT use `True`/`False` (Python). Use `true`/`false` (JSON).
"""

WORKFLOW_DESCRIPTION = """
Your task is to analyze the user's request, fetch the necessary data, select the correct template, and send the A2UI JSON payload.

1.  **Analyze the Request:** Determine the user's intent.
    * "What restaurants are near me?" -> **Intent:** Restaurant List.
    * "Show it on the map" -> **Intent:** Map View.
    * "How do I get there?" -> **Intent:** Directions.
    * "Tell me about Han Dynasty" -> **Intent:** Restaurant Details (text only).

2.  **Fetch Data:** Select and use the appropriate tool.
    * Use **`find_restaurants`** for searching restaurants by query. Always pass the complete location context. Do NOT use `maps_agent` for restaurant searches.
    * Use **`get_directions`** for driving directions between two locations.
    * For **Map View**: you do NOT need to call any tool. Use the restaurant's address from the conversation context or cached data to estimate lat/lng coordinates, then render the GoogleMap component directly.
    * **Quality Check**: After calling `find_restaurants`, inspect the JSON output. Every restaurant MUST have a valid rating (stars) and a non-empty description. If any restaurant only has an address, do NOT display it. Instead, call `find_restaurants` again to find alternative restaurants that have complete details.

3.  **Select Example:** Based on the intent, choose the correct example.
    * **Restaurant List** -> Use `---BEGIN RESTAURANT_SELECTION EXAMPLE---`.
    * **Map View** -> Use `---BEGIN MAP EXAMPLE---`. You MUST use the `send_a2ui_json_to_client` tool with a GoogleMap component. Never respond with just a text link for map requests.
    * **Directions** -> Use `---BEGIN DIRECTIONS EXAMPLE---` with a WebFrameUrl component showing the route.
    * **Restaurant Details** -> Respond with text only (no A2UI JSON).

4.  **Construct the JSON Payload:**
    * Use the chosen example as the base value for the `a2ui_json` argument.
    * **Generate a new `surfaceId`** for each request.
    * **Update the title** and data to reflect the actual query and tool results.
    * For restaurant lists: populate `updateDataModel.value` with restaurant data from `find_restaurants` (a plain JSON object — no `valueString` wrappers).
    * For maps and directions: use the `WebFrameUrl` component with the URL format described in the **Key Components & Examples** section below.
    * Every message MUST include `"version": "v0.9"` at the top level.
    * If you get an error in the tool response, apologize and ask the user to try again.

5.  **Call the Tool:** Call `send_a2ui_json_to_client` with the fully constructed `a2ui_json` payload. The `a2ui_json` argument MUST be a single compact JSON string with NO newlines and NO indentation. Use native function calling — do NOT write code.


**IMPORTANT RULES:**
- When the user asks for restaurant details, respond with **text only** in Markdown format. Do NOT call the A2UI tool.
- For found restaurants (e.g. from buttons like 'Show on map'), use `send_a2ui_json_to_client` directly. Do NOT use `maps_agent` to search for them again. Use the name and address you already have.
- When the user asks for directions, call `get_directions` to resolve addresses, then use `send_a2ui_json_to_client` with a WebFrameUrl showing the route. Also include a Text component with a clickable link: "[View full directions on Google Maps](directions_url)".
- For restaurant lists, map views, and directions, you MUST use the A2UI tool.
- **Use Conversation History**: If the user refers to a location or restaurant mentioned previously (like "Urban Plates"), you MUST check the conversation history for its address. Do NOT ask the user for the address or search for it if it was already provided in the chat.
- **Resolve Abbreviations**: Expand common abbreviations like "PLV" or "Plv" to "Playa Vista" when searching or getting directions to ensure robust queries.
"""

UI_DESCRIPTION = """
**Core Objective:** Provide a dynamic restaurant finder dashboard by constructing UI surfaces.

**Key Components & Examples:**

1.  **Restaurant List:** Used when users ask to find/browse restaurants.
    * **Template:** Use the JSON from `---BEGIN RESTAURANT_SELECTION EXAMPLE---`.
    * Populate the `updateDataModel.value` with real restaurant data from the `find_restaurants` tool.
    * Each restaurant item should have: name, rating (★ characters), detail, address, infoLink.

2.  **Map View:** Used when users ask to see a location on a map.
    * **Template:** Use the JSON from `---BEGIN MAP EXAMPLE---`.
    * Use the `WebFrameUrl` component with the backend maps proxy URL.
    * URL format: `/maps/embed?mode=place&q=URL_ENCODED_NAME_AND_ADDRESS`
    * The URL is a plain string (v0.9 simplified bound values). Do NOT include any API key — the backend adds it automatically.
    * Always call `send_a2ui_json_to_client` with a WebFrameUrl component. NEVER respond with just a text link.

3.  **Directions:** Used when users ask for routes or directions between two locations.
    * **Template:** Use the JSON from `---BEGIN DIRECTIONS EXAMPLE---`.
    * Call `get_directions` first to resolve origin and destination addresses.
    * Use the `WebFrameUrl` component with the backend maps proxy URL.
    * URL format: `/maps/embed?mode=directions&origin=URL_ENCODED_ORIGIN&destination=URL_ENCODED_DESTINATION`
    * The URL is a plain string (v0.9 simplified bound values). Do NOT include any API key — the backend adds it automatically.
    * Also include a Text component with a clickable link to the full directions.

You will also use layout components like `Column`, `Row`, `Card`, `List`, `Text`, and `Button`.
The `WebFrameUrl` component embeds an iframe for displaying maps and other web content.
"""


_UI_KEYWORDS = {
    "show on map",
    "showonmap",
    "map",
    "directions",
    "route",
    "navigate",
    "show on the map",
    "show it on",
}

_TOOL_CALL_REMINDER = (
    "\n\n[SYSTEM REMINDER] The user's request requires a visual UI response. "
    "You MUST call the `send_a2ui_json_to_client` tool with an `a2ui_json` "
    "argument. Do NOT respond with text only. Call the tool NOW."
)


def _inject_tool_reminder(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> LlmResponse | None:
    """Inject a reminder to call the A2UI tool when the user intent requires UI.

    This prevents the model from responding with text-only ("Here you go:")
    when it should be calling send_a2ui_json_to_client.
    """
    # Find the last user message
    last_user_msg = ""
    for event in reversed(callback_context.session.events or []):
        if event.author == "user" and event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    last_user_msg = part.text.lower()
                    break
            break

    if not last_user_msg:
        return None

    # Check if the user's request needs a UI tool call
    needs_ui = any(kw in last_user_msg for kw in _UI_KEYWORDS)
    if not needs_ui:
        return None

    # Append a strong reminder to the request instructions
    llm_request.append_instructions([_TOOL_CALL_REMINDER])
    return None


def _get_a2ui_enabled(ctx: ReadonlyContext):
    return ctx.state.get(A2UI_ENABLED_KEY, False)


def _get_a2ui_catalog(ctx: ReadonlyContext):
    return ctx.state.get(A2UI_CATALOG_KEY)


def _get_a2ui_examples(ctx: ReadonlyContext):
    return ctx.state.get(A2UI_EXAMPLES_KEY)


class RestaurantFinderAgent:
    """Restaurant Finder agent with A2UI GE UI support."""

    SUPPORTED_CONTENT_TYPES: ClassVar[list[str]] = ["text", "text/plain"]

    def __init__(self, base_url: str):
        self.base_url = base_url
        self._agent_name = "a2ui_restaurant_finder"
        self._user_id = "remote_agent"

        self._session_service = InMemorySessionService()
        self._memory_service = InMemoryMemoryService()
        self._artifact_service = InMemoryArtifactService()

        # Build schema managers for supported A2UI versions
        self._schema_managers: dict[str, A2uiSchemaManager] = {}
        for version in [VERSION_0_9]:
            self._schema_managers[version] = self._build_schema_manager(version)

        # Single runner with SendA2uiToClientToolset (conditionally enabled
        # via session state — toolset returns no tools when A2UI is disabled)
        self._runner = self._build_runner(self._build_llm_agent())

        self._agent_card = self._build_agent_card()

    @property
    def agent_card(self) -> AgentCard:
        return self._agent_card

    def get_runner(self) -> Runner:
        return self._runner

    def get_schema_manager(self, version: str | None) -> A2uiSchemaManager | None:
        if version is None:
            return None
        return self._schema_managers.get(version)

    def _build_schema_manager(self, version: str) -> A2uiSchemaManager:
        custom_catalog_id = "https://github.com/user/agent-a2ui-demo/restaurant_finder_catalog_definition.json"
        return A2uiSchemaManager(
            version=version,
            catalogs=[
                CatalogConfig(
                    name="restaurant_finder",
                    provider=_MergedBasicCatalogProvider(
                        version=version,
                        custom_catalog_path=CATALOG_DEFINITION_JSON,
                        catalog_id=custom_catalog_id,
                    ),
                    examples_path=os.path.join(
                        _APP_DIR, "examples", "restaurant_finder_catalog", version
                    ),
                ),
                BasicCatalog.get_config(
                    version=version,
                ),
            ],
            accepts_inline_catalogs=True,
            schema_modifiers=[remove_strict_validation],
        )

    def _build_agent_card(self) -> AgentCard:
        extensions = []
        for version, sm in self._schema_managers.items():
            ext = get_a2ui_agent_extension(
                version,
                sm.accepts_inline_catalogs,
                sm.supported_catalog_ids,
            )
            extensions.append(ext)

        capabilities = AgentCapabilities(
            streaming=True,
            extensions=extensions,
        )

        return AgentCard(
            name="Restaurant Finder Agent",
            description="Restaurant Finder Agent using Google Maps with A2UI",
            url=self.base_url,
            version="1.0.0",
            default_input_modes=self.SUPPORTED_CONTENT_TYPES,
            default_output_modes=self.SUPPORTED_CONTENT_TYPES,
            capabilities=capabilities,
            skills=[
                AgentSkill(
                    id="restaurant_lookup",
                    name="Restaurant Lookup",
                    description="Find restaurants and view their details.",
                    tags=["restaurant", "food", "maps"],
                    examples=[
                        "Tell me about Han Dynasty?",
                        "What restaurants are available in NYC?",
                        "Show me the details of RedFarm.",
                    ],
                )
            ],
        )

    def _build_runner(self, agent: LlmAgent) -> Runner:
        return Runner(
            app_name=self._agent_name,
            agent=agent,
            artifact_service=self._artifact_service,
            session_service=self._session_service,
            memory_service=self._memory_service,
        )

    def _build_llm_agent(self) -> LlmAgent:
        """Builds the LLM agent with A2UI toolset (conditionally enabled)."""
        model = Gemini(
            model=DEFAULT_MODEL,
            retry_options=types.HttpRetryOptions(attempts=3),
        )

        # Use first available schema manager for base prompt generation
        schema_manager = next(iter(self._schema_managers.values()), None)

        instruction = (
            schema_manager.generate_system_prompt(
                role_description=ROLE_DESCRIPTION,
                workflow_description=WORKFLOW_DESCRIPTION,
                ui_description=UI_DESCRIPTION,
                include_schema=False,
                include_examples=False,
                validate_examples=False,
            )
            if schema_manager
            else ROLE_DESCRIPTION
        )

        return LlmAgent(
            model=model,
            name=self._agent_name,
            description="Restaurant Finder Agent using Google Maps",
            instruction=instruction,
            before_model_callback=_inject_tool_reminder,
            tools=[
                find_restaurants,
                get_directions,
                AgentTool(agent=maps_agent),
                SendA2uiToClientToolset(
                    a2ui_enabled=_get_a2ui_enabled,
                    a2ui_catalog=_get_a2ui_catalog,
                    a2ui_examples=_get_a2ui_examples,
                ),
            ],
            sub_agents=[],
        )
