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
from google.adk.tools.google_maps_grounding_tool import GoogleMapsGroundingTool
from google.adk.tools.google_search_tool import GoogleSearchTool

from app.config import DEFAULT_MODEL

search_agent = LlmAgent(
    model=DEFAULT_MODEL,
    name="search_agent",
    instruction=(
        "You're a specialist in Google Search grounding. "
        "Use web search to find current, factual information "
        "and provide structured findings with source attribution."
    ),
    tools=[GoogleSearchTool()],
)


maps_agent = LlmAgent(
    model=DEFAULT_MODEL,
    name="maps_agent",
    instruction=(
        "You are a general location and maps assistant. Use Google Maps grounding to answer "
        "questions about places, directions, landmarks, neighborhoods, and businesses.\n"
        "You handle queries like:\n"
        '- "Where is Google PLV office?"\n'
        '- "How do I get from LAX to Santa Monica?"\n'
        '- "What\'s near the Hollywood sign?"\n'
        '- "Find coffee shops in downtown SF"\n\n'
        "Always provide:\n"
        "- Full addresses\n"
        "- Google Maps links when available\n"
        "- Directions with estimated travel time when asked about routes\n"
        "- Ratings and hours of operation when relevant\n"
        "Be concise but comprehensive."
    ),
    tools=[GoogleMapsGroundingTool()],
)
