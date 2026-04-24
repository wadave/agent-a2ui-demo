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

import json
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
    apply_presentation_replacements_data,
    create_doc,
    create_sheet,
    extract_presentation_inventory,
    gws_call,
    read_doc,
    read_drive_file,
    read_local_file,
    read_presentation,
    read_sheet,
    rearrange_presentation_slides,
    share_anyone_with_link,
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
7. **Exactly ONE top-level JSON value.** The string starts with `[`, ends with the matching `]`, and contains nothing else — no trailing object, no second array, no markdown fence, no narration. To send N messages, put them as N elements inside the SAME array (`[msg1, msg2, msg3]`). Do NOT concatenate multiple arrays (`[msg1][msg2]` is broken — the parser fails with `Extra data: ...` and the UI never renders).
8. **One tool call per response.** If the user's request needs multiple A2UI messages (e.g. createSurface + dataModelUpdate), put them all in the single `a2ui_json` array of one `send_a2ui_json_to_client` call — do NOT make two back-to-back calls and do NOT emit a second JSON value as a workaround.
9. **Always emit a short plain-text intro alongside the tool call**, e.g. "Here are 5 restaurants near Google Playa Vista:" or "Showing the map for Urban Plates:". The text and the tool call are part of the same response. The text serves as a graceful fallback for clients that cannot render rich A2UI; do NOT skip it.
"""

WORKFLOW_DESCRIPTION = """
Your task is to analyze the user's request, fetch the necessary data, select the correct template, and send the A2UI JSON payload.

1.  **Analyze the Request:** Determine the user's intent.
    * "What restaurants are near me?" -> **Intent:** Restaurant List.
    * "Show it on the map" -> **Intent:** Map View.
    * "How do I get there?" -> **Intent:** Directions.
    * "Tell me about Han Dynasty" -> **Intent:** Restaurant Details (text only).
    * "What's the weather in Playa Vista?" / "Will it rain tomorrow?" -> **Intent:** Weather / live web lookup. Delegate to the `search_agent` sub-agent (it has Google Search grounding) and return its findings as plain text with source attribution. Do NOT call `send_a2ui_json_to_client` for weather responses.

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
- **Presentation Generation (template-based, MANDATORY for new decks)**: When the user asks to create a presentation, slide deck, or slides, you MUST use the `presentation-skill` workflow — never `gws_call`, never the Slides API directly. Steps:
  1. Call `load_skill(skill_name="presentation-skill")` first.
  2. **Source the content from this conversation.** The harness automatically inlines any prior `find_restaurants` results into a `[SYSTEM REMINDER] === Restaurant data from this conversation ===` block when it sees a presentation request — use that data verbatim, one body slide per restaurant. If no system reminder appears AND no other source is referenced (a file path, a Drive ID, an open scratch doc), then and only then ask the user what to cover.
  3. **Plan the outline.** Bundled 5-slide template indices: `0`=cover, `1`=TOC (5 entry-title placeholders), `2`=section divider, `3`=body content page (title + body — the workhorse), `4`=closing. Every deck starts at `0`, ends at `4`, includes at least one body slide. For N restaurants use `[0, 1] + [3]*N + [4]`. Empty placeholders in the inventory are real shapes that MUST be filled.
  4. Workflow: `rearrange_presentation_slides` → `extract_presentation_inventory` → `read_local_file` (the inventory) → `apply_presentation_replacements_data` → `upload_presentation`.
  5. **NEVER** use `gws_call(service="slides", method="create", ...)` to create a deck — that bypasses the template.
  6. After apply, read `data.log`. If `J shape(s) left untouched > 0`, go back and add replacement entries for the missing shapes before uploading.
  7. Only call `upload_presentation` once `data.log` reports `0 shape(s) left untouched`.



- **A2UI Drive Preview after creating workspace artifacts**: After `upload_presentation`, `create_doc`, or `create_sheet` returns successfully (`{"ok": True, "data": {"file_id": "...", "url": "..."}}`), do these THREE steps before answering:
  1. Call `share_anyone_with_link(file_id="<file_id>")` so the preview iframe loads for the user (the file is owned by the agent's service account; without this the iframe shows a "request access" page).
  2. Call `send_a2ui_json_to_client` using the `---BEGIN DRIVE_PREVIEW EXAMPLE---` template. Replace the literal `FILE_ID_HERE` in BOTH the `previewUrl` and `openLink` (in v0.9, set the values inside `updateDataModel.value`; in v0.8, substitute `FILE_ID_HERE` everywhere it appears in the literalString fields). Set `title` to the file name and `subtitle` to one of `"Google Slides — saved in <Folder>"` / `"Google Docs — saved in <Folder>"` / `"Google Sheets — saved in <Folder>"`. Use folder name `Drive root` if no folder was specified.
  3. Emit a short plain-text confirmation alongside the tool call (e.g. `"Saved as 'restaurants0' in Documents:"`) — never tool-call only, never text-only.

  Read-only workspace operations (`read_doc`, `read_sheet`, `read_presentation`, `read_drive_file`) normally respond with text only — EXCEPT when the user asks for a chart/graph (see next rule).

- **A2UI Chart for Google Sheets data**: When the user asks to chart, graph, plot, or visualize sheet data — phrasing like "show this as a chart", "graph the ratings", "plot revenue by month" — do this. The `Chart` component is registered in both v0.8 (for Gemini Enterprise) and v0.9 (for the local Lit shell), and the catalog example is auto-included for both versions.
  1. Resolve the data. If the sheet was just created/appended this turn, the agent already has the rows in context. Otherwise call `read_sheet(spreadsheet_id, range)` to fetch them. If a column is referenced ("by rating"), pick the right pair of columns: one for `label`, one numeric for `value`.
  2. Decide chart type from the user's intent — categorical breakdown (share of a whole) → `pie` or `doughnut`; ranked comparison (top-N, by-score) → `bar`. If neither fits cleanly (time series, scatter, multi-series), fall through to the **Sheets-embedded fallback** (3b) instead.
  3a. Call `send_a2ui_json_to_client` using the `---BEGIN CHART EXAMPLE---` template. Substitute:
      - `chart.title` literalString with a concise title.
      - the `Chart.type` literal with `"bar"`, `"pie"`, or `"doughnut"`.
      - the `chart.items[N]` keys (`label` valueString, `value` valueNumber) with one entry per row from the sheet. Drop the example's 5 rows entirely and replace with the real data — never ship the example's restaurant ratings.
      - Generate a fresh `surfaceId` per request (e.g. `sheet-chart-<unix-ts>`).
  3b. **Fallback for unsupported chart types** (line, scatter, area, time series): instead of `Chart`, call `gws_call(service="sheets", resource="spreadsheets", method="batchUpdate", json_body=...)` with an `addChart` request to add a real Google Sheets chart to the sheet, then send the `---BEGIN drive_preview---` surface pointed at the sheet — the embedded Sheets viewer renders the chart natively. After this, also call `share_anyone_with_link(file_id)` if not already shared.
  4. Always include a short plain-text intro alongside the chart tool call (e.g. `"Restaurants by rating:"`).
  5. Cap the chart at ~12 data points. If the source data has more, take the top 12 by `value` and add a `"+ N more"` aggregate row.


- When the user asks for restaurant details, respond with **text only** in Markdown format. Do NOT call the A2UI tool.
- For found restaurants (e.g. from buttons like 'Show on map'), use `send_a2ui_json_to_client` directly with the name and address you already have. Do NOT re-fetch the restaurant.
- **Action button clicks**: If the user message starts with `Selected:` (e.g. `Selected: showOnMap`, `Selected: selectRestaurants`), the user clicked an A2UI button. You MUST respond by calling `send_a2ui_json_to_client` with the appropriate example — NEVER with text only. The restaurant name and address are in the action context; reuse them.
- When the user asks for directions, call `get_directions` to resolve addresses, then use `send_a2ui_json_to_client` with a `WebFrameUrl` showing the route. Also include a Text component with a clickable link: "[View full directions on Google Maps](directions_url)". **For the WebFrameUrl `origin` and `destination` query params, use `origin_query` and `destination_query` from the tool response (NOT the bare `origin`/`destination` addresses)** — these are name-prefixed and disambiguate POIs that share a street address (e.g. two restaurants inside the same resort).
- For restaurant lists, map views, and directions, you MUST use the A2UI tool.
- **Use Conversation History**: If the user refers to a location or restaurant mentioned previously (like "Urban Plates"), you MUST check the conversation history for its address. Do NOT ask the user for the address or search for it if it was already provided in the chat.
- **Resolve Abbreviations**: Expand common abbreviations like "PLV" or "Plv" to "Playa Vista" when searching or getting directions to ensure robust queries.
- **Workspace Documents (simple writes)**: If the user asks to create a Google Doc or summarize in Drive and you only need plain-text content, the convenience wrappers are the shortest path:
  - First, call **`create_doc`** with a descriptive title (and optional `folder_name`).
  - Second, call **`append_doc_text`** with the generated content.
  - Do NOT call a tool named `write` — it does not exist.
- **Workspace API via `gws_call` (full surface)**: For anything beyond plain-text doc/sheet ops — rich Docs formatting (`batchUpdate` with `updateTextStyle`, `insertText`), Sheets formula writes, Drive search/move, **modifying existing** Slides decks (NOT creating new ones — see Presentation Generation above) — translate every documented `gws-*` skill command into one `gws_call` invocation. The pattern:
  - `gws <service> <resource> [<sub_resource>] <method> [--params <JSON>] [--json <JSON>] [--upload <PATH>] [--page-all]`
  - becomes
  - `gws_call(service="<service>", resource="<resource>", sub_resource="<sub_resource or empty>", method="<method>", params="<JSON string from --params, empty if absent>", json_body="<JSON string from --json, empty if absent>", upload_path="<path from --upload, empty if absent>", page_all=<true if --page-all>)`
  - **`params` and `json_body` are JSON-encoded strings, not dicts.** Pass `params='{"spreadsheetId":"abc"}'`, NOT `params={"spreadsheetId":"abc"}`.
  - Examples:
    - `gws docs documents create --json '{"title":"X"}'` → `gws_call(service="docs", resource="documents", method="create", json_body='{"title":"X"}')`
    - `gws sheets spreadsheets values get --params '{"spreadsheetId":"abc","range":"A1:C10"}'` → `gws_call(service="sheets", resource="spreadsheets", sub_resource="values", method="get", params='{"spreadsheetId":"abc","range":"A1:C10"}')`
    - `gws drive files list --page-all` → `gws_call(service="drive", resource="files", method="list", page_all=True)`
  - The ADK runtime cannot run shell commands directly — `gws_call` is the only path to the `gws` CLI.
- **Workspace artifact naming** (restaurant-finder defaults; honor user overrides). Substitute `<YYYY-MM-DD>` with today's date and `<City>` with the city you searched in:
  - Docs: `<YYYY-MM-DD>_<City>_Restaurant_Recommendations`
  - Sheets: `<YYYY-MM-DD>_<City>_Restaurants`
  - Slides: `<YYYY-MM-DD>_<City>_Restaurant_Tour`
  - Place artifacts in the user's Drive root unless they specify a folder. For multi-city trips, create one artifact and append sections — not one per restaurant.
- **Tool error handling**: Every workspace tool returns `{"ok": True, "data": ...}` or `{"ok": False, "error": ...}`. On `ok=False`, surface a one-line apology and the human-readable `error` verbatim. Do NOT retry automatically.

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

_PRESENTATION_KEYWORDS = (
    "presentation",
    "slide deck",
    "slidedeck",
    "slides",
    " deck",  # leading space avoids matching "decked" etc.
    "pptx",
    "powerpoint",
    ".pptx",
)

_PRESENTATION_CONTEXT_PREAMBLE = (
    "\n\n[SYSTEM REMINDER] The user is requesting a presentation/deck. "
    "Restaurant data from earlier turns of THIS conversation is reproduced "
    "below — it came from prior `find_restaurants` tool responses still in "
    "your session events. USE THIS DATA as the source for the deck. Do NOT "
    "respond 'I don't have any previous information' or 'Could you let me "
    "know which city...' — that exact response is the failure mode this "
    "reminder exists to prevent. Build the outline from these restaurants, "
    "one body slide per restaurant, then run the presentation-skill workflow.\n\n"
    "=== Restaurant data from this conversation ===\n"
)


def _extract_function_response_payload(fr) -> str | None:
    """Pull the actual return value out of a function_response part.

    ADK wraps tool returns in a few shapes depending on version. Try the
    common keys, fall back to a JSON dump.
    """
    resp = getattr(fr, "response", None)
    if resp is None:
        return None
    if isinstance(resp, str):
        return resp
    if isinstance(resp, dict):
        for key in ("result", "response", "value", "output"):
            if key in resp:
                inner = resp[key]
                return inner if isinstance(inner, str) else json.dumps(inner)
        try:
            return json.dumps(resp)
        except (TypeError, ValueError):
            return str(resp)
    return str(resp)


def _collect_recent_restaurant_data(events) -> str | None:
    """Walk session events newest-first; return the most recent
    `find_restaurants` tool response as a string, or None if no
    restaurant data exists in this session.
    """
    for event in reversed(events or []):
        content = getattr(event, "content", None)
        if not content or not getattr(content, "parts", None):
            continue
        for part in content.parts:
            fr = getattr(part, "function_response", None)
            if fr and getattr(fr, "name", None) == "find_restaurants":
                payload = _extract_function_response_payload(fr)
                if payload:
                    return payload
    return None


def _before_model_callback(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> LlmResponse | None:
    """Inject reminders on the way into the model:

    1. A2UI tool-call reminder when the user's intent needs visual UI.
    2. Inline restaurant data from prior `find_restaurants` results when
       the user asks for a presentation. Putting the data right next to
       the directive is the only reliable way to stop the model from
       falsely claiming "I don't have any previous information" — prompt
       rules alone have proven insufficient.
    """
    events = callback_context.session.events or []

    # Find the most recent user message
    last_user_msg = ""
    for event in reversed(events):
        if event.author == "user" and event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    last_user_msg = part.text.lower()
                    break
            break

    if not last_user_msg:
        return None

    extra_instructions: list[str] = []

    needs_ui = any(kw in last_user_msg for kw in _UI_KEYWORDS)
    is_presentation = any(kw in last_user_msg for kw in _PRESENTATION_KEYWORDS)

    if needs_ui:
        extra_instructions.append(_TOOL_CALL_REMINDER)

    if is_presentation:
        # Diagnostic: enumerate every event so we can see what (if anything)
        # earlier turns deposited into this session. If the list is short
        # or empty when the user "previously searched", the client is
        # sending a fresh context_id per turn and the search results never
        # made it here.
        event_summary: list[str] = []
        function_responses: list[str] = []
        function_calls: list[str] = []
        for ev in events:
            author = getattr(ev, "author", "?")
            content = getattr(ev, "content", None)
            if not content or not getattr(content, "parts", None):
                event_summary.append(f"{author}:<no-parts>")
                continue
            kinds = []
            for part in content.parts:
                if getattr(part, "text", None):
                    kinds.append(f"text({len(part.text)}b)")
                fr = getattr(part, "function_response", None)
                if fr:
                    name = getattr(fr, "name", "?")
                    kinds.append(f"fn_resp({name})")
                    function_responses.append(name)
                fc = getattr(part, "function_call", None)
                if fc:
                    name = getattr(fc, "name", "?")
                    kinds.append(f"fn_call({name})")
                    function_calls.append(name)
            event_summary.append(f"{author}:[{','.join(kinds)}]")

        restaurant_payload = _collect_recent_restaurant_data(events)
        if restaurant_payload:
            if len(restaurant_payload) > 16_000:
                restaurant_payload = (
                    restaurant_payload[:16_000]
                    + "\n... [truncated; full data in conversation history]"
                )
            extra_instructions.append(
                _PRESENTATION_CONTEXT_PREAMBLE + restaurant_payload
            )
            logger.warning(
                "[before_model_callback] presentation request — INJECTED"
                " %d bytes of restaurant data. session_events=%d"
                " fn_calls=%s fn_responses=%s",
                len(restaurant_payload),
                len(events),
                function_calls,
                function_responses,
            )
        else:
            logger.warning(
                "[before_model_callback] presentation request but NO"
                " find_restaurants response found. session_id=%s"
                " session_events=%d fn_calls=%s fn_responses=%s"
                " event_summary=%s last_user_msg=%r",
                getattr(callback_context.session, "id", "?"),
                len(events),
                function_calls,
                function_responses,
                event_summary,
                last_user_msg[:200],
            )

    if extra_instructions:
        llm_request.append_instructions(extra_instructions)
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
        # NOTE on catalog registration: A2uiSchemaManager keys
        # `_catalog_example_paths` by `catalog.catalog_id`. Every config
        # below resolves to the same standard v0.9 basic_catalog id (the
        # custom variants must claim it for renderer compatibility, and
        # the bundled BasicCatalog uses it natively), so the LAST entry
        # in this list wins for examples_path. Pass `examples_path` on
        # the bundled basic catalog too, otherwise it overwrites the
        # custom catalogs' path with None and the LLM sees no examples.
        # Selection (which catalog is sent to the renderer) still picks
        # the first entry — keep a custom-with-WebFrameUrl variant first.
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
                BasicCatalog.get_config(version=version, examples_path=examples_path),
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
            name="A2UI Skill Demo Agent",
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
                ),
                AgentSkill(
                    id="weather_lookup",
                    name="Weather Lookup",
                    description=(
                        "Look up current weather conditions and short-term "
                        "forecasts for a given location via Google Search."
                    ),
                    tags=["weather", "forecast", "search"],
                    examples=[
                        "What's the weather in Playa Vista right now?",
                        "Will it rain in NYC tomorrow?",
                        "How hot is it in Phoenix today?",
                    ],
                ),
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

        # Explicit skill list — narrowed to the docs/sheets/slides surface
        # the agent actually needs. The recursive glob previously loaded ~95
        # vendored skills (gmail, calendar, persona-*, recipe-*, …) that the
        # agent advertises but cannot fulfil. The routing overlay
        # `restaurant-finder-overrides` tells the LLM how to translate every
        # `gws-*` skill's documented bash commands into `gws_call(...)`.
        skill_subdirs = [
            "presentation-skill",
            "workspace/gws-shared",
            "workspace/gws-drive",
            "workspace/gws-drive-upload",
            "workspace/gws-docs",
            "workspace/gws-docs-write",
            "workspace/gws-sheets",
            "workspace/gws-sheets-read",
            "workspace/gws-sheets-append",
            "workspace/gws-slides",
        ]
        skills = [
            load_skill_from_dir(os.path.join(_APP_DIR, "skills", sub))
            for sub in skill_subdirs
        ]

        workspace_skills = SkillToolset(
            skills=skills,
            additional_tools=[
                # Tools claimed by `presentation-skill` via its
                # `adk_additional_tools` metadata. SkillToolset only exposes
                # these once the LLM activates the skill via load_skill(),
                # which keeps the surface narrow until needed.
                upload_presentation,
                rearrange_presentation_slides,
                extract_presentation_inventory,
                apply_presentation_replacements_data,
                read_local_file,
            ],
        )

        return LlmAgent(
            model=model,
            name=self._agent_name,
            description="Restaurant Finder Agent using Google Maps",
            instruction=instruction,
            before_model_callback=_before_model_callback,
            tools=[
                find_restaurants,
                get_directions,
                SendA2uiToClientToolset(
                    a2ui_enabled=_get_a2ui_enabled,
                    a2ui_catalog=_get_a2ui_catalog,
                    a2ui_examples=_get_a2ui_examples,
                ),
                # Always-on workspace tools. None of the loaded `gws-*`
                # skills declare `adk_additional_tools`, so anything that
                # should be available without a `load_skill` ceremony has
                # to live here, not inside the SkillToolset. Avoid putting
                # presentation-skill's tools here too — that would emit
                # duplicate function declarations once the skill is loaded.
                gws_call,
                create_doc,
                append_doc_text,
                share_doc,
                share_anyone_with_link,
                create_sheet,
                append_sheet_data,
                read_doc,
                read_sheet,
                read_presentation,
                read_drive_file,
                workspace_skills,
            ],
            sub_agents=[get_search_agent()],
        )
