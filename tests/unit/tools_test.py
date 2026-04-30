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

"""Unit tests for tools and their schemas."""

from app.config import build_vertex_model_name


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
