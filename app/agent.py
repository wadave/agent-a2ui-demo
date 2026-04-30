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
from google.genai import types

from app.config import DEFAULT_MODEL
from app.session_keys import A2UI_CATALOG_KEY, A2UI_ENABLED_KEY, A2UI_EXAMPLES_KEY
from app.sub_agents import get_search_agent
from app.tools import read_whitepaper_section

logger = logging.getLogger(__name__)

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG_DEFINITION_JSON = os.path.join(
    _APP_DIR, "catalog_schemas", "0.9", "a2ui_demo_catalog_definition.json"
)
CATALOG_DEFINITION_JSON_V0_8 = os.path.join(
    _APP_DIR, "catalog_schemas", "0.8", "a2ui_demo_catalog_definition.json"
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
You are a sales analytics dashboard agent. Your goal is to help users visualize IBM data using VegaChart and DataGrid components based on the Q1 2026 whitepaper.
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
9. **Always emit a short plain-text intro alongside the tool call**, e.g. "Here's CQ performance vs budget from the Q1 2026 whitepaper:". The text and the tool call are part of the same response. The text serves as a graceful fallback for clients that cannot render rich A2UI; do NOT skip it.
10. **NEVER** use the component named 'Chart' for Gemini Enterprise UI (v0.8). It is unsupported. You MUST use the 'VegaChart' component with a `literalObject` Vega-Lite specification for all data visualizations.
"""

WORKFLOW_DESCRIPTION = """
Your task is to analyze the user's request, fetch the necessary data, select the correct template, and send the A2UI JSON payload.

1.  **Analyze the Request:** Determine the user's intent.
    * "What is CQ performance vs budget?" -> **Intent:** AskIBM Dashboard.
    * "Show me win rate analysis" -> **Intent:** AskIBM Dashboard.
    * "Chart this data" -> **Intent:** Ad-hoc Charting.

2.  **Fetch Data:** Select and use the appropriate tool.
    * Use **`read_whitepaper_section`** for fetching sales data from the whitepaper.

3.  **Select Example:** Based on the intent, choose the correct example.
    * Use the appropriate `---BEGIN dashboard_*---` template for AskIBM dashboards.
    * Use `---BEGIN chart---`, `---BEGIN pie_chart---`, or `---BEGIN multi_series_bar---` for ad-hoc charting.

4.  **Construct the JSON Payload:**
    * Use the chosen example as the base value for the `a2ui_json` argument. Follow the example format exactly.
    * **Generate a new `surfaceId`** for each request.
    * **Update the title** and data to reflect the actual query and tool results.
    * **CRITICAL — `catalogId`**: Copy the `catalogId` value **verbatim** from the example.

**IMPORTANT RULES:**

- **A2UI Chart for Data**: When the user asks to chart, graph, plot, or visualize data (whether from a Google Sheet or provided directly in the prompt) — phrasing like "show this as a chart", "graph the ratings", "plot revenue by month" — do this. The `VegaChart` component is used for v0.8 (Gemini Enterprise) and the `Chart` component for v0.9 (local shell).
  1. Resolve the data. If the data is provided directly in the prompt, use it.
  2. Decide chart type from the user's intent and pick the matching v0.8 template:
       - Categorical share of a whole -> **pie/doughnut** -> `---BEGIN pie_chart---`.
       - Two metrics per category -> **grouped multi-series bar** -> `---BEGIN multi_series_bar---`.
       - Date-labeled single-series forecast/temperature -> `---BEGIN weather_forecast_chart---`.
       - Any other ranked single-series comparison (top-N, by-score) -> `---BEGIN chart---`.
  3a. Call `send_a2ui_json_to_client` using the chosen template. Substitute:
      - **For v0.8 (Gemini Enterprise)**: Use the `VegaChart` component shown in the example. Replace the `spec.data.values` array with the real data using the field names the chosen template references — single-series templates use `{"label": "Name", "value": 4.5}`; `multi_series_bar` additionally needs `"series": "..."` on each row. Keep these field names exactly (`label`, `value`, `series`).
      - **For v0.9 (local shell)**: Use the `Chart` component. Update `chart.title` and `chart.items[N]` keys (`label` valueString, `value` valueNumber).
      - Generate a fresh `surfaceId` per request.
  4. Always include a short plain-text intro alongside the chart tool call.
  5. Cap the chart at ~12 data points. If the source data has more, take the top 12 by `value` and add a `"+ N more"` aggregate row.

- **AskIBM whitepaper dashboards (v0.8 only)**: When the user asks an AskIBM-style sales analytics question grounded in the Q1 2026 US Select Territory Sales Performance Whitepaper, do this:
  1. Call `read_whitepaper_section(section=...)` with the matching key. Triggers and section keys:
       - "What is CQ performance vs budget?" / "Show me transactional and SaaS attainment" -> `cq_performance_vs_budget`
       - "What pipelines did we lose last quarter and the primary loss reasons?" / "Lost pipeline by reason" -> `lost_pipeline_by_reason`
       - "Show me Q1 2026 pipeline coverage by product category" / "Coverage by Focus / Key Core" -> `pipeline_coverage_by_category`
       - "Show me UT15 SaaS underperformance on SaaS for Q1 2026" / "SaaS by platform" -> `ut15_saas_underperformance`
       - "Show me win rate analysis by product category for 2026" -> `win_rate_by_category`
       - "Which UT15s are underperforming against their SaaS budget?" / "CQ performance by region" -> `ut15_and_regional_cq`
       - "What portion of call pipeline has won?" / "Call pipeline conversion" -> `call_pipeline_conversion`
     The tool resolves common aliases and returns `{ok, document, section, page, citation, data}`.
  2. Pick the matching v0.8 example template (one per section):
       - `cq_performance_vs_budget`         -> `---BEGIN dashboard_cq_performance_vs_budget---`
       - `lost_pipeline_by_reason`          -> `---BEGIN dashboard_lost_pipeline_by_reason---`
       - `pipeline_coverage_by_category`    -> `---BEGIN dashboard_pipeline_coverage_by_category---`
       - `ut15_saas_underperformance`       -> `---BEGIN dashboard_ut15_saas_underperformance---`
       - `win_rate_by_category`             -> `---BEGIN dashboard_win_rate_by_category---`
       - `ut15_and_regional_cq`             -> `---BEGIN dashboard_ut15_and_regional_cq---`
       - `call_pipeline_conversion`         -> `---BEGIN dashboard_call_pipeline_conversion---`
  3. Use the tool response numbers verbatim. Substitute every `Text` `literalString` and every Vega `data.values` row from the corresponding sub-block in the tool's `data` field. Keep Vega `field` names (`category`, `series`, `value`, `pct`, `region`, etc.) unchanged.
  4. **Always render the citation** in the trailing `citation-text` Text component, copied verbatim from `data.citation`.
  5. For DataGrids, pass raw numeric values in `rowData` (e.g. `2400000`, `0.55`, `-1080000`) — `schema.fields[].type` of `currency` / `percentage` / `integer` drives the formatting.
  6. Generate a fresh `surfaceId` per request.
  7. These dashboards are v0.8-only. If the active client is v0.9, fall back to a single `Chart` (donut for breakdowns, bar for ranked comparisons) plus a Text summary that includes the citation.
  8. Always include a short plain-text intro alongside the tool call.
"""

UI_DESCRIPTION = """
**Core Objective:** Provide sales analytics dashboards by constructing UI surfaces based on the Q1 2026 whitepaper.

**Key Components & Examples:**

1.  **AskIBM Dashboards:** Used when users ask about sales performance based on the whitepaper.
    * **Templates:** `---BEGIN dashboard_*---` templates.
    * Populate with data from `read_whitepaper_section`.

2.  **Generic Charts:** Used for ad-hoc charting requests.
    * **Templates:** `---BEGIN chart---`, `---BEGIN pie_chart---`, `---BEGIN multi_series_bar---`, `---BEGIN weather_forecast_chart---`.
"""


def _before_model_callback(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> LlmResponse | None:
    """No-op callback as restaurant and presentation reminders are removed."""
    return None


def _get_a2ui_enabled(ctx: ReadonlyContext):
    return ctx.state.get(A2UI_ENABLED_KEY, False)


def _get_a2ui_catalog(ctx: ReadonlyContext):
    return ctx.state.get(A2UI_CATALOG_KEY)


def _get_a2ui_examples(ctx: ReadonlyContext):
    return ctx.state.get(A2UI_EXAMPLES_KEY)


class A2uiDemoAgent:
    """A2UI Demo agent with A2UI GE UI support."""

    SUPPORTED_CONTENT_TYPES: ClassVar[list[str]] = ["text", "text/plain"]

    def __init__(self, base_url: str):
        self.base_url = base_url
        self._agent_name = "a2ui_dashboard_agent"
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
        examples_path = os.path.join(_APP_DIR, "examples", "a2ui_demo_catalog", version)
        if version == VERSION_0_8:
            # v0.8: ship a custom catalog defining WebFrameUrl + GoogleMap
            # alongside the standard components. GE renders v0.8 inline
            # catalogs, so map/directions surfaces can use WebFrameUrl
            # rather than fall back to text-only links.
            return A2uiSchemaManager(
                version=version,
                catalogs=[
                    CatalogConfig(
                        name="a2ui_demo",
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
                    name="a2ui_demo",
                    provider=_MergedBasicCatalogProvider(
                        version=version,
                        custom_catalog_path=CATALOG_DEFINITION_JSON,
                        catalog_id=custom_catalog_id,
                    ),
                    examples_path=examples_path,
                ),
                CatalogConfig(
                    name="a2ui_demo_agent",
                    provider=_MergedBasicCatalogProvider(
                        version=version,
                        custom_catalog_path=CATALOG_DEFINITION_JSON,
                        catalog_id=custom_catalog_id,
                    ),
                    examples_path=examples_path,
                ),
                CatalogConfig(
                    name="a2ui-demo-catalog",
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
            name="A2UI Dashboard Agent",
            description="A2UI Dashboard Agent using VegaChart and DataGrid based on Q1 2026 whitepaper",
            url=self.base_url,
            version="1.0.0",
            default_input_modes=self.SUPPORTED_CONTENT_TYPES,
            default_output_modes=self.SUPPORTED_CONTENT_TYPES,
            capabilities=capabilities,
            skills=[
                AgentSkill(
                    id="askibm_whitepaper_dashboards",
                    name="AskIBM Whitepaper Dashboards",
                    description=(
                        "Render AskIBM-style sales analytics dashboards "
                        "grounded in the Q1 2026 US Select Territory Sales "
                        "Performance Whitepaper. Seven dashboards: CQ "
                        "performance vs budget, lost pipeline by reason, "
                        "pipeline coverage by product category, UT15 SaaS "
                        "underperformance, win rate by category, UT15 + "
                        "regional CQ progress, and call pipeline conversion. "
                        "Each surface combines KPI cards, Vega charts, and "
                        "DataGrid tables with a 'Source: Whitepaper p.X' "
                        "citation."
                    ),
                    tags=["analytics", "dashboard", "askibm", "whitepaper", "sales"],
                    examples=[
                        "What is CQ performance vs budget?",
                        "What pipelines did we lose last quarter and what were the primary loss reasons?",
                        "Show me Q1 2026 pipeline coverage by product category.",
                        "Show me UT15 underperformance on SaaS for Q1 2026.",
                        "Show me win rate analysis by product category for 2026.",
                        "Which UT15s are underperforming against their SaaS budget?",
                        "What portion of call pipeline has won?",
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

        return LlmAgent(
            model=model,
            name=self._agent_name,
            description="A2UI Dashboard Agent (AskIBM whitepaper)",
            instruction=instruction,
            before_model_callback=_before_model_callback,
            tools=[
                read_whitepaper_section,
                SendA2uiToClientToolset(
                    a2ui_enabled=_get_a2ui_enabled,
                    a2ui_catalog=_get_a2ui_catalog,
                    a2ui_examples=_get_a2ui_examples,
                ),
            ],
            sub_agents=[get_search_agent()],
        )
