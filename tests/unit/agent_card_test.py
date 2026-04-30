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

"""Unit tests for agent card creation."""

from app.agent import A2uiDemoAgent


def test_agent_card_has_required_fields():
    agent = A2uiDemoAgent(base_url="http://localhost:8000")
    card = agent.agent_card
    assert card.name == "A2UI Dashboard Agent"
    assert card.description
    assert card.url == "http://localhost:8000"
    assert card.version


def test_agent_card_has_skills():
    agent = A2uiDemoAgent(base_url="http://localhost:8000")
    card = agent.agent_card
    assert card.skills
    assert len(card.skills) > 0
    skill = card.skills[0]
    assert skill.id == "askibm_whitepaper_dashboards"
    assert skill.name
    assert skill.description
    assert skill.examples


def test_agent_card_has_capabilities():
    agent = A2uiDemoAgent(base_url="http://localhost:8000")
    card = agent.agent_card
    assert card.capabilities is not None
    assert card.capabilities.streaming is True


def test_agent_card_url():
    url = "https://example.com/my-agent"
    agent = A2uiDemoAgent(base_url=url)
    card = agent.agent_card
    assert card.url == url


def test_agent_card_input_output_modes():
    agent = A2uiDemoAgent(base_url="http://localhost:8000")
    card = agent.agent_card
    assert "text/plain" in card.default_input_modes
    assert "text/plain" in card.default_output_modes


def test_agent_card_has_a2ui_extension():
    agent = A2uiDemoAgent(base_url="http://localhost:8000")
    card = agent.agent_card
    extensions = card.capabilities.extensions
    assert extensions is not None
    assert len(extensions) > 0
    a2ui_uris = [e.uri for e in extensions]
    assert any("a2ui" in uri for uri in a2ui_uris)
