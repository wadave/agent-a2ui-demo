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

"""Unit tests for restaurant tools and their schemas."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.config import build_vertex_model_name
from app.prompts import _RESTAURANT_SCHEMA
from app.tools import (
    find_restaurants,
    get_directions,
)


def test_build_vertex_model_name_default(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("MODEL", raising=False)
    # Reload config values since they are read at import time
    monkeypatch.setattr("app.config.GOOGLE_CLOUD_PROJECT", None)
    monkeypatch.setattr("app.config.DEFAULT_MODEL", "gemini-2.5-flash")
    assert build_vertex_model_name() == "gemini-2.5-flash"


def test_build_vertex_model_name_with_project(monkeypatch):
    monkeypatch.setattr("app.config.GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.setattr("app.config.GOOGLE_CLOUD_LOCATION", "us-west1")
    monkeypatch.setattr("app.config.DEFAULT_MODEL", "gemini-2.5-pro")

    expected = "projects/test-project/locations/us-west1/publishers/google/models/gemini-2.5-pro"
    assert build_vertex_model_name() == expected


def test_restaurant_schema_valid():
    """Verify that the restaurant schema is a valid JSON Schema object."""
    assert "$schema" in _RESTAURANT_SCHEMA
    assert _RESTAURANT_SCHEMA["type"] == "object"
    assert "name" in _RESTAURANT_SCHEMA["properties"]


@pytest.mark.asyncio
@patch("app.tools.genai.Client")
async def test_find_restaurants_success(mock_client):
    mock_instance = MagicMock()
    mock_client.return_value = mock_instance

    mock_response = MagicMock()
    mock_response.text = '```json\n[{"name": "Test Restaurant", "detail": "Test Detail", "rating": "★★★★☆", "infoLink": "[Link](url)", "address": "123 Main St"}]\n```'
    mock_instance.models.generate_content.return_value = mock_response

    result = await find_restaurants("Test query")
    data = json.loads(result)

    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Test Restaurant"


@pytest.mark.asyncio
@patch("app.tools.genai.Client")
async def test_get_directions_success(mock_client):
    mock_instance = MagicMock()
    mock_client.return_value = mock_instance

    mock_response = MagicMock()
    mock_response.text = '```json\n{"origin": "123 Start St", "destination": "456 End St", "origin_name": "Start", "destination_name": "End"}\n```'
    mock_instance.models.generate_content.return_value = mock_response

    result = await get_directions("Directions from Start to End")
    data = json.loads(result)

    assert "directions_url" in data
    assert "123%20Start%20St" in data["directions_url"]
