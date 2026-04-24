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

"""Sub-agents for the restaurant finder agent."""

from google.adk.agents import LlmAgent
from google.adk.tools.google_search_tool import GoogleSearchTool

from app.config import DEFAULT_MODEL


def get_search_agent() -> LlmAgent:
    return LlmAgent(
        model=DEFAULT_MODEL,
        name="search_agent",
        description=(
            "Specialist for live web information lookups, including current "
            "weather conditions and forecasts, news, and other real-time facts "
            "that require Google Search grounding."
        ),
        instruction=(
            "You're a specialist in Google Search grounding. "
            "Use web search to find current, factual information "
            "and provide structured findings with source attribution.\n\n"
            "For weather queries, search for the current conditions and "
            "(when relevant) the short-term forecast for the requested "
            "location. Report temperature, conditions (e.g. sunny, rain), "
            "and any notable advisories. Always cite the source."
        ),
        tools=[GoogleSearchTool()],
    )
