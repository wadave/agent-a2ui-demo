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

"""Unit tests for agent_executor post-processing helpers."""

from types import SimpleNamespace

from a2a.types import DataPart, Part
from a2ui.a2a.parts import create_a2ui_part

from app.agent_executor import (
    _MapsKeyEventConverter,
    _process_a2ui_parts,
    _repair_catalog_id,
)

VALID_CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json"
HALLUCINATED_CATALOG_ID = "a2ui_restaurant_finder:v0_9"


def test_repair_leaves_correct_catalog_id_unchanged():
    msg = {
        "version": "v0.9",
        "createSurface": {"surfaceId": "s1", "catalogId": VALID_CATALOG_ID},
    }
    _repair_catalog_id(msg, VALID_CATALOG_ID)
    assert msg["createSurface"]["catalogId"] == VALID_CATALOG_ID


def test_repair_replaces_hallucinated_catalog_id():
    msg = {
        "version": "v0.9",
        "createSurface": {"surfaceId": "s1", "catalogId": HALLUCINATED_CATALOG_ID},
    }
    _repair_catalog_id(msg, VALID_CATALOG_ID)
    assert msg["createSurface"]["catalogId"] == VALID_CATALOG_ID


def test_repair_fills_missing_catalog_id():
    msg = {"version": "v0.9", "createSurface": {"surfaceId": "s1"}}
    _repair_catalog_id(msg, VALID_CATALOG_ID)
    assert msg["createSurface"]["catalogId"] == VALID_CATALOG_ID


def test_repair_ignores_non_create_surface_messages():
    msg = {
        "version": "v0.9",
        "updateDataModel": {"surfaceId": "s1", "path": "/x", "value": 1},
    }
    _repair_catalog_id(msg, VALID_CATALOG_ID)
    assert "catalogId" not in msg["updateDataModel"]


def test_repair_skips_v0_8_begin_rendering():
    """v0.8 beginRendering carries no catalogId; should be untouched."""
    msg = {"beginRendering": {"surfaceId": "s1", "root": "root"}}
    _repair_catalog_id(msg, VALID_CATALOG_ID)
    assert "catalogId" not in msg["beginRendering"]


def test_process_parts_repairs_catalog_id_end_to_end():
    bad_part = create_a2ui_part(
        {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": "s1",
                "catalogId": HALLUCINATED_CATALOG_ID,
            },
        }
    )
    out = _process_a2ui_parts([bad_part], valid_catalog_id=VALID_CATALOG_ID)
    assert len(out) == 1
    assert out[0].root.data["createSurface"]["catalogId"] == VALID_CATALOG_ID


def test_process_parts_no_op_when_no_valid_catalog_id():
    """When no session catalog is known, leave catalogId untouched."""
    bad_part = create_a2ui_part(
        {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": "s1",
                "catalogId": HALLUCINATED_CATALOG_ID,
            },
        }
    )
    out = _process_a2ui_parts([bad_part], valid_catalog_id=None)
    assert out[0].root.data["createSurface"]["catalogId"] == HALLUCINATED_CATALOG_ID


def test_process_parts_passes_through_non_a2ui_parts():
    plain_part = Part(root=DataPart(data={"foo": "bar"}, metadata={"mimeType": "x"}))
    out = _process_a2ui_parts([plain_part], valid_catalog_id=VALID_CATALOG_ID)
    assert out == [plain_part]


def _tool_call_event(name="find_restaurants", call_id="call-1"):
    return SimpleNamespace(
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=None,
                    function_call=SimpleNamespace(name=name, id=call_id),
                    function_response=None,
                )
            ]
        ),
        is_final_response=lambda: False,
    )


def _tool_response_event(name="find_restaurants", call_id="call-1"):
    return SimpleNamespace(
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=None,
                    function_call=None,
                    function_response=SimpleNamespace(name=name, id=call_id),
                )
            ]
        ),
        is_final_response=lambda: False,
    )


def test_progress_deduplicates_replayed_tool_call_event():
    """Repeated streaming events for the same tool call should not add steps."""
    conv = _MapsKeyEventConverter()
    steps = []

    conv._advance_steps(_tool_call_event(), steps)
    conv._advance_steps(_tool_call_event(), steps)
    conv._advance_steps(_tool_response_event(), steps)

    assert len(steps) == 1
    assert steps[0]["title"] == "Searching for restaurants"
    assert steps[0]["state"] == "done"
    assert len(steps[0]["tools"]) == 1
    assert steps[0]["tools"][0]["state"] == "done"
