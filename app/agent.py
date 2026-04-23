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
from a2ui.a2a.extension import get_a2ui_agent_extension
from a2ui.adk.send_a2ui_to_client_toolset import (
    SendA2uiToClientToolset,
)
from a2ui.basic_catalog.provider import BasicCatalog, BundledCatalogProvider
from a2ui.schema.catalog import CatalogConfig
from a2ui.schema.catalog_provider import (
    A2uiCatalogProvider,
    FileSystemCatalogProvider,
)
from a2ui.schema.common_modifiers import remove_strict_validation
from a2ui.schema.constants import (
    CATALOG_COMPONENTS_KEY,
    CATALOG_ID_KEY,
    VERSION_0_8,
    VERSION_0_9,
)
from a2ui.schema.manager import A2uiSchemaManager
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
from google.adk.skills import load_skill_from_dir
from google.adk.tools.skill_toolset import SkillToolset
from google.genai import types

from app.config import DEFAULT_MODEL
from app.session_keys import A2UI_CATALOG_KEY, A2UI_ENABLED_KEY, A2UI_EXAMPLES_KEY
from app.sub_agents import get_search_agent
from app.tools import find_restaurants, get_directions
from app.workspace_tools import (
    append_doc_text,
    append_sheet_data,
    apply_presentation_replacements,
    create_doc,
    create_sheet,
    extract_presentation_inventory,
    read_doc,
    read_drive_file,
    read_local_file,
    read_presentation,
    read_sheet,
    rearrange_presentation_slides,
    share_doc,
    upload_presentation,
)

logger = logging.getLogger(__name__)

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG_DEFINITION_JSON = os.path.join(
    _APP_DIR, "catalog_schemas", "0.9", "restaurant_finder_catalog_definition.json"
)
CATALOG_DEFINITION_JSON_V0_8 = os.path.join(
    _APP_DIR, "catalog_schemas", "0.8", "restaurant_finder_catalog_definition.json"
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
If the `send_a2ui_json_to_client` tool is available to you, you MUST use it with the `a2ui_json` argument to send A2UI JSON payloads to the client for rendering rich UI. If it is NOT in your available tools list, respond with helpful plain text instead.

**CRITICAL — when using `send_a2ui_json_to_client`, YOU MUST FOLLOW THESE RULES OR THE SYSTEM WILL BREAK:**
1. Use the native function calling interface. Do NOT generate code (no Python, no JavaScript, no imports, no variables, no loops).
2. Pass `a2ui_json` as a single compact JSON string. Do NOT split it across multiple strings or lines.
3. Do NOT use `default_api.`, `print()`, `json.dumps()`, or any wrapper.
4. Do NOT use `True`/`False` (Python). Use `true`/`false` (JSON).
5. **JSON syntax MUST be strictly valid.** Specifically:
   - Every property and array element except the last MUST be followed by a comma.
   - No trailing commas after the last element of an object or array.
   - Every double quote inside a string value MUST be escaped as `\\"`.
   - Every backslash inside a string MUST be escaped as `\\\\`.
   - No unescaped newlines or tabs inside string values.
   - Use straight ASCII quotes `"`, never smart quotes `\u201c` `\u201d`.
6. The whole `a2ui_json` argument is a JSON ARRAY of A2UI messages as shown in the catalog examples. Never merge multiple message types into one object.
7. **Always emit a short plain-text intro alongside the tool call**, e.g. "Here are 5 restaurants near Google Playa Vista:" or "Showing the map for Urban Plates:". The text and the tool call are part of the same response. The text serves as a graceful fallback for clients that cannot render rich A2UI; do NOT skip it.
"""

WORKFLOW_DESCRIPTION = """
Your task is to analyze the user's request, fetch the necessary data, select the correct template, and send the A2UI JSON payload.

1.  **Analyze the Request:** Determine the user's intent.
    * "What restaurants are near me?" -> **Intent:** Restaurant List.
    * "Show it on the map" -> **Intent:** Map View.
    * "How do I get there?" -> **Intent:** Directions.
    * "Tell me about Han Dynasty" -> **Intent:** Restaurant Details (text only).

2.  **Fetch Data:** Select and use the appropriate tool.
    * Use **`find_restaurants`** for searching restaurants by query. Always pass the complete location context.
    * Use **`get_directions`** for driving directions between two locations.
    * For **Map View**: you do NOT need to call any tool. Use the restaurant's name and address from the conversation context to build the `WebFrameUrl` URL directly.
    * **Quality Check**: After calling `find_restaurants`, inspect the JSON output. Every restaurant MUST have a valid rating (stars) and a non-empty description. If any restaurant only has an address, do NOT display it. Instead, call `find_restaurants` again to find alternative restaurants that have complete details.

3.  **Select Example:** Based on the intent, choose the correct example.
    * **Restaurant List** -> Use `---BEGIN RESTAURANT_SELECTION EXAMPLE---`. (Never use the Map example for lists).
    * **Map View** -> Use `---BEGIN MAP EXAMPLE---`. You MUST use the `send_a2ui_json_to_client` tool. Never respond with just plain text for map requests.
    * **Directions** -> Use `---BEGIN DIRECTIONS EXAMPLE---`.
    * **Restaurant Details** -> Respond with text only (no A2UI JSON).

4.  **Construct the JSON Payload:**
    * Use the chosen example as the base value for the `a2ui_json` argument. Follow the example format exactly — message type names, component structure, and field names must match the example.
    * **Generate a new `surfaceId`** for each request.
    * **Update the title** and data to reflect the actual query and tool results.
    * For restaurant lists: populate each restaurant's fields with data from `find_restaurants`, following the format shown in the example exactly.
    * For maps and directions: use the `WebFrameUrl` component with the backend maps proxy URL. The URL must be a `literalString` and must NOT include any API key — the backend adds it automatically.
    * **CRITICAL — `catalogId`**: Copy the `catalogId` value **verbatim** from the example. Never substitute the agent name, a short string, or any other invented value. Do NOT add `theme`, `styles`, or any field not present in the example.
    * If you get an error in the tool response, apologize and ask the user to try again.

5.  **Call the Tool:** Call `send_a2ui_json_to_client` with the fully constructed `a2ui_json` payload. The `a2ui_json` argument MUST be a single compact JSON string with NO newlines and NO indentation. Use native function calling — do NOT write code.


**IMPORTANT RULES:**
- **Presentation Generation via Template**: When the user asks to create a presentation, slide deck, or slides:
  - 1. Call **`rearrange_presentation_slides`** mapping your required structure to template slide indices.
  - 2. Call **`extract_presentation_inventory`** on the working file to discover shape IDs.
  - 3. Create a replacement mapping and execute **`apply_presentation_replacements`**.
  - 4. Call **`upload_presentation`** to convert the local artifact into Google Slides.
  - *Replacement JSON Format*:
    ```json
    {
      "slide-0": {
        "shape-0": {"paragraphs": [{"text": "Title Text", "bold": true}]},
        "shape-1": {"paragraphs": [{"text": "Bullet 1", "bullet": true, "level": 0}, {"text": "Bullet 2", "bullet": true, "level": 0}]}
      }
    }
    ```



- **No A2UI for Workspace Tasks**: When the user asks to create or read Google Docs, Sheets, or Slides, do NOT call the `send_a2ui_json_to_client` tool. Respond with text confirmation only after calling the appropriate workspace tools.


- When the user asks for restaurant details, respond with **text only** in Markdown format. Do NOT call the A2UI tool.
- For found restaurants (e.g. from buttons like 'Show on map'), use `send_a2ui_json_to_client` directly with the name and address you already have. Do NOT re-fetch the restaurant.
- **Action button clicks**: If the user message starts with `Selected:` (e.g. `Selected: showOnMap`, `Selected: selectRestaurants`), the user clicked an A2UI button. You MUST respond by calling `send_a2ui_json_to_client` with the appropriate example — NEVER with text only. The restaurant name and address are in the action context; reuse them.
- When the user asks for directions, call `get_directions` to resolve addresses, then use `send_a2ui_json_to_client` with a `WebFrameUrl` showing the route. Also include a Text component with a clickable link: "[View full directions on Google Maps](directions_url)".
- For restaurant lists, map views, and directions, you MUST use the A2UI tool.
- **Use Conversation History**: If the user refers to a location or restaurant mentioned previously (like "Urban Plates"), you MUST check the conversation history for its address. Do NOT ask the user for the address or search for it if it was already provided in the chat.
- **Resolve Abbreviations**: Expand common abbreviations like "PLV" or "Plv" to "Playa Vista" when searching or getting directions to ensure robust queries.
- **Workspace Documents**: If the user asks to create a Google Doc or summarize in Drive:
  - First, call **`create_doc`** with a descriptive title.
  - Second, call **`append_doc_text`** with the generated content.
  - **CRITICAL:** Do NOT try to call a tool named `write`. You MUST use `create_doc` and `append_doc_text`.

"""

UI_DESCRIPTION = """
**Core Objective:** Provide a dynamic restaurant finder dashboard by constructing UI surfaces.

**Key Components & Examples:**

1.  **Restaurant List:** Used when users ask to find/browse restaurants.
    * **Template:** Use the JSON from `---BEGIN RESTAURANT_SELECTION EXAMPLE---`.
    * Populate the example with real restaurant data from the `find_restaurants` tool, following the example's structure exactly.
    * Each restaurant item should have: name, rating (★ characters), detail, address, infoLink.
    * **CRITICAL:** For queries asking to find, search, or list multiple restaurants, you MUST use this template. Do NOT use the `MAP` template for list queries.
    * **Button labels MUST be copied verbatim from the example.** The two
      per-restaurant buttons are "Detailed Information" (action
      `selectRestaurants`) and "Show on Map" (action `showOnMap`). Do NOT
      rename them, do NOT add a "Directions" button, and do NOT change the
      action names.

2.  **Map View:** Used when users ask to see a location on a map.
    * **Template:** Use the JSON from `---BEGIN MAP EXAMPLE---`.
    * Use the `WebFrameUrl` component with URL `/maps/embed?mode=place&q=URL_ENCODED_NAME_AND_ADDRESS`.
    * The URL must be a `literalString`. Do NOT include any API key — the backend adds it automatically.
    * Always call `send_a2ui_json_to_client` with a WebFrameUrl component. NEVER respond with just a text link.

3.  **Directions:** Used when users ask for routes or directions between two locations.
    * **Template:** Use the JSON from `---BEGIN DIRECTIONS EXAMPLE---`.
    * Call `get_directions` first to resolve origin and destination addresses.
    * Use the `WebFrameUrl` component with URL `/maps/embed?mode=directions&origin=URL_ENCODED_ORIGIN&destination=URL_ENCODED_DESTINATION`.
    * The URL must be a `literalString`. Do NOT include any API key — the backend adds it automatically.
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
    "selected:",
}

_TOOL_CALL_REMINDER = (
    "\n\n[SYSTEM REMINDER] The user's request requires a visual UI response. "
    "You MUST call the `send_a2ui_json_to_client` tool with an `a2ui_json` "
    "argument. Do NOT respond with text only. In particular, do NOT reply "
    "with 'Here you go:' followed by the restaurant name and address — that "
    "is exactly the failure case. Call the tool NOW."
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
        self._llm_agent = None

        # Build schema managers for both supported A2UI versions. The
        # active version is selected per-request in the executor based on
        # the client's X-A2A-Extensions header (v0.8 = Gemini Enterprise,
        # v0.9 = local Lit shell).
        self._schema_managers: dict[str, A2uiSchemaManager] = {}
        for version in [VERSION_0_9, VERSION_0_8]:
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
        examples_path = os.path.join(
            _APP_DIR, "examples", "restaurant_finder_catalog", version
        )
        if version == VERSION_0_8:
            # v0.8: ship a custom catalog defining WebFrameUrl + GoogleMap
            # alongside the standard components. GE renders v0.8 inline
            # catalogs, so map/directions surfaces can use WebFrameUrl
            # rather than fall back to text-only links.
            return A2uiSchemaManager(
                version=version,
                catalogs=[
                    CatalogConfig(
                        name="restaurant_finder",
                        provider=FileSystemCatalogProvider(
                            CATALOG_DEFINITION_JSON_V0_8
                        ),
                        examples_path=examples_path,
                    ),
                    CatalogConfig(
                        name="a2ui_restaurant_finder",
                        provider=FileSystemCatalogProvider(
                            CATALOG_DEFINITION_JSON_V0_8
                        ),
                        examples_path=examples_path,
                    ),
                    CatalogConfig(
                        name="a2ui-restaurant-finder-catalog",
                        provider=FileSystemCatalogProvider(
                            CATALOG_DEFINITION_JSON_V0_8
                        ),
                        examples_path=examples_path,
                    ),
                    BasicCatalog.get_config(version=version),
                ],
                accepts_inline_catalogs=True,
                schema_modifiers=[remove_strict_validation],
            )

        # v0.9: merge the bundled basic catalog with custom WebFrameUrl/GoogleMap components.
        # Stamp with the standard A2UI basic catalog ID so renderers (Gemini Enterprise,
        # the local Lit shell) recognize the createSurface.catalogId.
        custom_catalog_id = "https://a2ui.org/specification/v0_9/basic_catalog.json"
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
                    examples_path=examples_path,
                ),
                CatalogConfig(
                    name="a2ui_restaurant_finder",
                    provider=_MergedBasicCatalogProvider(
                        version=version,
                        custom_catalog_path=CATALOG_DEFINITION_JSON,
                        catalog_id=custom_catalog_id,
                    ),
                    examples_path=examples_path,
                ),
                CatalogConfig(
                    name="a2ui-restaurant-finder-catalog",
                    provider=_MergedBasicCatalogProvider(
                        version=version,
                        custom_catalog_path=CATALOG_DEFINITION_JSON,
                        catalog_id=custom_catalog_id,
                    ),
                    examples_path=examples_path,
                ),
                BasicCatalog.get_config(version=version),
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
            description="Restaurant Finder Agent using Google Maps with A2UI v0.8",
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
        if hasattr(self, "_llm_agent") and self._llm_agent:
            return self._llm_agent

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

        import glob

        # Load every vendored SKILL.md (gws-*, google-*) plus our overlay and pptx.
        skill_dirs = sorted(
            os.path.dirname(p)
            for p in glob.glob(
                os.path.join(_APP_DIR, "skills", "**", "SKILL.md"), recursive=True
            )
        )
        skills = [load_skill_from_dir(d) for d in skill_dirs]

        workspace_skills = SkillToolset(
            skills=skills,
            additional_tools=[
                create_doc,
                append_doc_text,
                share_doc,
                create_sheet,
                append_sheet_data,
                upload_presentation,
                read_doc,
                read_sheet,
                read_presentation,
                read_drive_file,
                read_local_file,
                rearrange_presentation_slides,
                extract_presentation_inventory,
                apply_presentation_replacements,
            ],
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
                SendA2uiToClientToolset(
                    a2ui_enabled=_get_a2ui_enabled,
                    a2ui_catalog=_get_a2ui_catalog,
                    a2ui_examples=_get_a2ui_examples,
                ),
                workspace_skills,
                create_doc,
                append_doc_text,
                share_doc,
                create_sheet,
                append_sheet_data,
                upload_presentation,
                read_doc,
                read_sheet,
                read_presentation,
                read_drive_file,
                read_local_file,
                rearrange_presentation_slides,
                extract_presentation_inventory,
                apply_presentation_replacements,
            ],
            sub_agents=[get_search_agent()],
        )
