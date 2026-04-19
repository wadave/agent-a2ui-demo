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
