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

"""Tools for the restaurant finder agent."""

import json
import logging
import os

logger = logging.getLogger(__name__)


_WHITEPAPER_FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "q1_2026_whitepaper.json"
)
_WHITEPAPER_SECTION_ALIASES = {
    # CQ performance vs budget (transactional + SaaS attainment)
    "cq_performance": "cq_performance_vs_budget",
    "cq_performance_vs_budget": "cq_performance_vs_budget",
    "budget_vs_won": "cq_performance_vs_budget",
    "performance": "cq_performance_vs_budget",
    "attainment": "cq_performance_vs_budget",
    "revenue": "cq_performance_vs_budget",
    # Lost pipeline by reason
    "lost_pipeline": "lost_pipeline_by_reason",
    "lost_pipeline_by_reason": "lost_pipeline_by_reason",
    "lost_reasons": "lost_pipeline_by_reason",
    "loss_reasons": "lost_pipeline_by_reason",
    "lost": "lost_pipeline_by_reason",
    # Pipeline coverage by product category
    "pipeline_coverage": "pipeline_coverage_by_category",
    "pipeline_coverage_by_category": "pipeline_coverage_by_category",
    "coverage_by_category": "pipeline_coverage_by_category",
    "product_category": "pipeline_coverage_by_category",
    "category_coverage": "pipeline_coverage_by_category",
    # UT15 SaaS underperformance (4 platforms)
    "ut15_saas": "ut15_saas_underperformance",
    "ut15_saas_underperformance": "ut15_saas_underperformance",
    "saas_underperformance": "ut15_saas_underperformance",
    "saas_attainment": "ut15_saas_underperformance",
    "platform_attainment": "ut15_saas_underperformance",
    # Win rate by product category
    "win_rate": "win_rate_by_category",
    "win_rate_by_category": "win_rate_by_category",
    "win_loss_by_category": "win_rate_by_category",
    "category_win_rate": "win_rate_by_category",
    # UT15 detail table + regional CQ progress (mockup p.6)
    "ut15": "ut15_and_regional_cq",
    "ut15_and_regional_cq": "ut15_and_regional_cq",
    "ut15_underperformance": "ut15_and_regional_cq",
    "regional_cq": "ut15_and_regional_cq",
    "cq_by_region": "ut15_and_regional_cq",
    "regional": "ut15_and_regional_cq",
    # Call pipeline conversion (mockup p.7)
    "call_pipeline": "call_pipeline_conversion",
    "call_pipeline_conversion": "call_pipeline_conversion",
    "call_coverage_conversion": "call_pipeline_conversion",
    "portion_won": "call_pipeline_conversion",
    "call_won": "call_pipeline_conversion",
}


async def read_whitepaper_section(section: str) -> str:
    """Read a section of the Q1 2026 US Select Territory Sales Whitepaper.

    The whitepaper is the canonical data source for the AskIBM-style sales
    dashboards. This tool returns structured numbers + a citation pointer so
    the agent can render any section as an A2UI dashboard with a
    'Source: Whitepaper p.X' attribution. Backed by a JSON fixture extracted
    from app/assets/whitepapers/q1_2026_us_select_whitepaper.pdf.

    Args:
        section: One of `at_a_glance`, `pipeline_health`, or `win_loss`.
            Case-insensitive; common synonyms ("kpis", "summary",
            "coverage", "win_loss", "lost") resolve to the right section.

    Returns:
        JSON string `{ok, document, section, page, citation, data}` on
        success, or `{ok: false, error, available}` when the section is
        unknown.
    """
    normalized = section.strip().lower().replace("-", "_").replace(" ", "_")
    key = _WHITEPAPER_SECTION_ALIASES.get(normalized, normalized)

    try:
        with open(_WHITEPAPER_FIXTURE_PATH, encoding="utf-8") as f:
            fixture = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Failed to load whitepaper fixture: %s", exc)
        return json.dumps({"ok": False, "error": f"Fixture load failed: {exc}"})

    sections = fixture.get("sections", {})
    payload = sections.get(key)
    if payload is None:
        return json.dumps(
            {
                "ok": False,
                "error": f"Unknown section '{section}'.",
                "available": sorted(sections.keys()),
            }
        )

    return json.dumps(
        {
            "ok": True,
            "document": fixture.get("document"),
            "period": fixture.get("period"),
            "section": key,
            "page": payload.get("page"),
            "citation": payload.get("citation"),
            "data": payload,
        }
    )
