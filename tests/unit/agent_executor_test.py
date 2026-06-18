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

import json
import uuid
from types import SimpleNamespace

from a2a.types import (
    DataPart,
    Message,
    Part,
    Role,
    TaskState,
    TaskStatus,
    TaskStatusUpdateEvent,
    TextPart,
)
from a2ui.a2a.parts import create_a2ui_part
from a2ui.schema.constants import VERSION_0_8

from app.agent import (
    _latest_function_response_after_user,
    _parse_lenient_a2ui_payload,
    _restaurant_list_llm_response,
)
from app.agent_executor import (
    PROGRESS_STAGE_META,
    PROGRESS_STEPS_META,
    NativeProgressTracker,
    _get_estimated_single_line_progress,
    _get_single_line_progress,
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


def test_lenient_a2ui_payload_flattens_concatenated_arrays():
    payload = (
        '[{"version":"v0.9","createSurface":{"surfaceId":"s1"}}]'
        '[{"version":"v0.9","updateComponents":{"surfaceId":"s1","components":[]}}]'
    )

    out = _parse_lenient_a2ui_payload(payload)

    assert len(out) == 2
    assert "createSurface" in out[0]
    assert "updateComponents" in out[1]


def _session_text_event(text: str, author="user"):
    return SimpleNamespace(
        author=author,
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=text,
                    function_call=None,
                    function_response=None,
                )
            ]
        ),
    )


def _session_function_response_event(
    name="find_restaurants",
    payload='[{"name":"Urban Plates","address":"12746 W Jefferson Blvd"}]',
):
    return SimpleNamespace(
        author="a2ui_restaurant_finder",
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=None,
                    function_call=None,
                    function_response=SimpleNamespace(
                        name=name,
                        response={"result": payload},
                    ),
                )
            ]
        ),
    )


def test_latest_function_response_after_user_ignores_previous_turn_results():
    events = [
        _session_text_event("find restaurants"),
        _session_function_response_event(),
        _session_text_event("make a presentation from those restaurants"),
    ]

    assert _latest_function_response_after_user(events, last_user_index=2) is None


def test_restaurant_list_shortcut_emits_a2ui_tool_call():
    payload = json.dumps(
        [
            {
                "name": "Urban Plates",
                "detail": "Scratch-made plates and bowls.",
                "rating": "*****",
                "infoLink": "[More Info](https://maps.google.com/?cid=1)",
                "address": "12746 W Jefferson Blvd, Playa Vista, CA",
            }
        ]
    )

    response = _restaurant_list_llm_response(
        payload,
        ui_version=VERSION_0_8,
        title="Restaurants Near Google Playa Vista",
    )

    assert response is not None
    parts = response.content.parts
    assert parts[0].text == "Here are 1 restaurants near Google Playa Vista:"
    function_call = parts[1].function_call
    assert function_call.name == "send_a2ui_json_to_client"
    messages = json.loads(function_call.args["a2ui_json"])
    assert "beginRendering" in messages[0]
    assert "surfaceUpdate" in messages[1]


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

    assert len(steps) == 2
    assert steps[0]["title"] == "Searching for restaurants"
    assert steps[0]["state"] == "done"
    assert len(steps[0]["tools"]) == 1
    assert steps[0]["tools"][0]["state"] == "done"
    assert steps[1]["title"] == "Compiling dashboard"
    assert steps[1]["state"] == "pending"
    assert len(steps[1]["tools"]) == 1
    assert steps[1]["tools"][0]["state"] == "pending"


def test_get_single_line_progress_in_progress_no_tools():
    steps = [
        {"title": "Understanding request", "state": "done", "tools": []},
        {"title": "Searching for restaurants", "state": "active", "tools": []},
    ]
    text, pct = _get_single_line_progress(steps)
    assert text == "▸ Searching for restaurants... (75%)"
    assert pct == 75


def test_get_single_line_progress_in_progress_with_tools():
    steps = [
        {
            "title": "Searching for restaurants",
            "state": "active",
            "tools": [
                {"name": "find_restaurants", "state": "done"},
                {"name": "other_tool", "state": "running"},
            ],
        }
    ]
    text, pct = _get_single_line_progress(steps)
    assert text == "▸ Searching for restaurants... (50%)"
    assert pct == 50


def test_get_single_line_progress_done():
    steps = [{"title": "Searching for restaurants", "state": "done", "tools": []}]
    text, pct = _get_single_line_progress(steps, done=True)
    assert text == "✓ Complete (100%)"
    assert pct == 100


def test_get_single_line_progress_failed():
    steps = [{"title": "Searching for restaurants", "state": "active", "tools": []}]
    text, pct = _get_single_line_progress(steps, failed=True)
    assert text == "✗ Failed"
    assert pct == 0


def test_get_estimated_single_line_progress_quantizes_running_tool_milestones():
    steps = [
        {
            "title": "Searching for restaurants",
            "state": "active",
            "active_started_at": 100.0,
            "tools": [{"name": "find_restaurants", "state": "running"}],
        },
        {
            "title": "Compiling dashboard",
            "state": "pending",
            "tools": [{"name": "send_a2ui_json_to_client", "state": "pending"}],
        },
    ]

    text, pct = _get_estimated_single_line_progress(steps, now=116.0)
    assert text == "▸ Searching for restaurants... (25%)"
    assert pct == 25

    text, pct = _get_estimated_single_line_progress(steps, now=128.0)
    assert text == "▸ Searching for restaurants... (40%)"
    assert pct == 40


def test_native_progress_heartbeat_updates_task_status_message():
    conv = _MapsKeyEventConverter()
    conv._progress["heartbeat-inv"] = {
        "steps": [
            {
                "title": "Searching for restaurants",
                "state": "active",
                "active_started_at": 100.0,
                "tools": [{"name": "find_restaurants", "state": "running"}],
            },
            {
                "title": "Compiling dashboard",
                "state": "pending",
                "tools": [{"name": "send_a2ui_json_to_client", "state": "pending"}],
            },
        ],
        "surface_id": "tool-progress-test",
        "begin_sent": False,
        "last_native_pct": 5,
        "last_emitted_text": "▸ Searching for restaurants... (5%)",
    }

    event = conv.native_progress_heartbeat("heartbeat-inv", "task-1", "ctx-1")

    assert event is not None
    assert event.status.state == TaskState.working
    assert event.status.message.parts[0].root.text.startswith(
        "▸ Searching for restaurants..."
    )


def _multi_tool_call_event(calls: list[tuple[str, str]]):
    return SimpleNamespace(
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=None,
                    function_call=SimpleNamespace(name=name, id=call_id),
                    function_response=None,
                )
                for name, call_id in calls
            ]
        ),
        is_final_response=lambda: False,
    )


def _multi_tool_response_event(responses: list[tuple[str, str]]):
    return SimpleNamespace(
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=None,
                    function_call=None,
                    function_response=SimpleNamespace(name=name, id=call_id),
                )
                for name, call_id in responses
            ]
        ),
        is_final_response=lambda: False,
    )


def _coalesced_final_tool_response_event(name="find_restaurants", call_id="call-1"):
    return SimpleNamespace(
        content=SimpleNamespace(
            parts=[
                SimpleNamespace(
                    text=None,
                    function_call=None,
                    function_response=SimpleNamespace(name=name, id=call_id),
                ),
                SimpleNamespace(
                    text="Here are 5 restaurants near Google Playa Vista",
                    function_call=None,
                    function_response=None,
                ),
            ]
        ),
        is_final_response=lambda: True,
    )


def test_native_progress_keeps_intermediate_update_when_final_event_is_coalesced():
    class MockSession:
        def __init__(self):
            self.state = {"system:a2ui_progress": False}

    class MockContext:
        def __init__(self):
            self.invocation_id = "coalesced-final"
            self.session = MockSession()

    conv = _MapsKeyEventConverter()
    context = MockContext()

    conv._enrich_with_progress(
        _tool_call_event("find_restaurants", "call-1"),
        context,
        [],
        "t1",
        "c1",
    )

    final_event = TaskStatusUpdateEvent(
        task_id="t1",
        context_id="c1",
        final=True,
        status=TaskStatus(
            state=TaskState.completed,
            message=Message(
                message_id=uuid.uuid4().hex,
                role=Role.agent,
                parts=[
                    Part(
                        root=TextPart(
                            text="Here are 5 restaurants near Google Playa Vista"
                        )
                    )
                ],
            ),
        ),
    )
    a2a_events = [final_event]

    conv._enrich_with_progress(
        _coalesced_final_tool_response_event("find_restaurants", "call-1"),
        context,
        a2a_events,
        "t1",
        "c1",
    )

    progress_texts = [
        part.root.text
        for event in a2a_events
        if getattr(getattr(event, "status", None), "state", None) == TaskState.working
        for part in (event.status.message.parts or [])
        if isinstance(part.root, TextPart)
    ]

    assert progress_texts == ["▸ Compiling dashboard... (50%)"]


def test_coalesced_final_progress_uses_separate_working_events():
    class MockSession:
        def __init__(self):
            self.state = {"system:a2ui_progress": False}

    class MockContext:
        def __init__(self):
            self.invocation_id = "coalesced-final-existing-working"
            self.session = MockSession()

    conv = _MapsKeyEventConverter()
    context = MockContext()

    conv._enrich_with_progress(
        _tool_call_event("find_restaurants", "call-1"),
        context,
        [],
        "t1",
        "c1",
    )

    existing_working_event = TaskStatusUpdateEvent(
        task_id="t1",
        context_id="c1",
        final=False,
        status=TaskStatus(
            state=TaskState.working,
            message=Message(
                message_id=uuid.uuid4().hex,
                role=Role.agent,
                parts=[],
            ),
        ),
    )
    final_event = TaskStatusUpdateEvent(
        task_id="t1",
        context_id="c1",
        final=True,
        status=TaskStatus(
            state=TaskState.completed,
            message=Message(
                message_id=uuid.uuid4().hex,
                role=Role.agent,
                parts=[
                    Part(
                        root=TextPart(
                            text="Here are 5 restaurants near Google Playa Vista"
                        )
                    )
                ],
            ),
        ),
    )
    a2a_events = [existing_working_event, final_event]

    conv._enrich_with_progress(
        _coalesced_final_tool_response_event("find_restaurants", "call-1"),
        context,
        a2a_events,
        "t1",
        "c1",
    )

    progress_events = [
        event
        for event in a2a_events
        if getattr(getattr(event, "status", None), "state", None) == TaskState.working
        and event.status.message.parts
    ]
    progress_texts_by_event = [
        [
            part.root.text
            for part in event.status.message.parts
            if isinstance(part.root, TextPart)
        ]
        for event in progress_events
    ]

    assert progress_texts_by_event[:1] == [["▸ Compiling dashboard... (50%)"]]


def test_opt_in_progress_emits_coalesced_final_metadata_milestone():
    class MockSession:
        def __init__(self):
            self.state = {"system:a2ui_progress": True}

    class MockContext:
        def __init__(self):
            self.invocation_id = "opt-in-coalesced-final"
            self.session = MockSession()

    conv = _MapsKeyEventConverter()
    context = MockContext()

    conv._enrich_with_progress(
        _tool_call_event("find_restaurants", "call-1"),
        context,
        [],
        "t1",
        "c1",
    )

    final_event = TaskStatusUpdateEvent(
        task_id="t1",
        context_id="c1",
        final=True,
        status=TaskStatus(
            state=TaskState.completed,
            message=Message(
                message_id=uuid.uuid4().hex,
                role=Role.agent,
                parts=[
                    Part(
                        root=TextPart(
                            text="Here are 5 restaurants near Google Playa Vista"
                        )
                    )
                ],
            ),
        ),
    )
    a2a_events = [final_event]

    conv._enrich_with_progress(
        _coalesced_final_tool_response_event("find_restaurants", "call-1"),
        context,
        a2a_events,
        "t1",
        "c1",
    )

    progress_parts = [
        part.root
        for event in a2a_events
        if getattr(getattr(event, "status", None), "state", None) == TaskState.working
        for part in (event.status.message.parts or [])
        if isinstance(part.root, TextPart)
        and (part.root.metadata or {}).get(PROGRESS_STAGE_META)
    ]

    assert len(progress_parts) == 1
    progress_steps = progress_parts[0].metadata[PROGRESS_STEPS_META]
    assert progress_steps[0]["title"] == "Understanding request"
    assert progress_steps[0]["state"] == "done"
    assert progress_steps[1]["title"] == "Searching for restaurants"
    assert progress_steps[1]["state"] == "done"
    assert progress_steps[1]["completedTools"] == 1
    assert progress_steps[1]["totalTools"] == 1
    assert progress_steps[2]["title"] == "Compiling dashboard"
    assert progress_steps[2]["state"] == "pending"
    assert progress_steps[2]["completedTools"] == 0
    assert progress_steps[2]["totalTools"] == 1


def test_progress_monotonicity_and_deduplication():
    # Setup mock invocation context & a2a events
    class MockSession:
        def __init__(self):
            self.state = {"system:a2ui_progress": False}

    class MockContext:
        def __init__(self):
            self.invocation_id = "test-inv-id"
            self.session = MockSession()

    conv = _MapsKeyEventConverter()
    context = MockContext()

    def make_working_event():
        return TaskStatusUpdateEvent(
            task_id="t1",
            context_id="c1",
            final=False,
            status=TaskStatus(
                state=TaskState.working,
                message=Message(message_id=uuid.uuid4().hex, role=Role.agent, parts=[]),
            ),
        )

    # Simulate steps
    steps = [
        {
            "title": "Searching for restaurants",
            "detail": "Searching for restaurants near the requested location.",
            "state": "active",
            "tools": [
                {"name": "find_restaurants", "state": "running"},
                {"name": "other_tool", "state": "running"},
            ],
        }
    ]
    conv._progress["test-inv-id"] = {
        "steps": steps,
        "surface_id": "tool-progress-1234",
        "begin_sent": False,
        "last_native_pct": 0,
        "last_emitted_text": None,
    }

    # 1. First event: parallel tool call (total tools = 2, completed = 0 -> 0% pct -> max(5, 0) = 5% pct)
    event1 = _multi_tool_call_event(
        [("find_restaurants", "call-1"), ("other_tool", "call-2")]
    )
    a2a_events1 = [make_working_event()]
    conv._enrich_with_progress(event1, context, a2a_events1, "t1", "c1")

    # Verify we got a working text part with the step name and percentage
    status1 = a2a_events1[0].status
    assert (
        status1 is not None
        and status1.message is not None
        and status1.message.parts is not None
    )
    assert len(status1.message.parts) == 1
    part1 = status1.message.parts[0]
    root1 = part1.root
    assert root1 is not None and isinstance(root1, TextPart)
    text1 = root1.text
    assert "Searching for restaurants" in text1
    assert "(5%)" in text1

    # 2. Simulate tool call 1 completed (completed = 1 -> 50%)
    event2 = _multi_tool_response_event([("find_restaurants", "call-1")])
    a2a_events2 = [make_working_event()]
    conv._enrich_with_progress(event2, context, a2a_events2, "t1", "c1")
    status2 = a2a_events2[0].status
    assert (
        status2 is not None
        and status2.message is not None
        and status2.message.parts is not None
    )
    part2 = status2.message.parts[0]
    root2 = part2.root
    assert root2 is not None and isinstance(root2, TextPart)
    text2 = root2.text
    assert "(50%)" in text2

    # 3. Monotonicity test:
    # If the converter somehow gets an event that drops the percentage back,
    # it should clamp to the highest seen percentage (50%).
    # We change the title so it's not deduplicated:
    steps[0]["title"] = "Refined Search"
    steps[0]["tools"][0]["state"] = "running"

    event3 = _multi_tool_call_event([("other_tool", "call-2")])
    a2a_events3 = [make_working_event()]
    conv._enrich_with_progress(event3, context, a2a_events3, "t1", "c1")
    status3 = a2a_events3[0].status
    assert (
        status3 is not None
        and status3.message is not None
        and status3.message.parts is not None
    )
    part3 = status3.message.parts[0]
    root3 = part3.root
    assert root3 is not None and isinstance(root3, TextPart)
    text3 = root3.text
    # Title is new, percentage should stay 50%
    assert "Refined Search" in text3
    assert "(50%)" in text3

    # 4. Deduplication test:
    # If the formatted text is exactly the same as last text, no new part should be added.
    a2a_events4 = [make_working_event()]
    conv._enrich_with_progress(event3, context, a2a_events4, "t1", "c1")
    status4 = a2a_events4[0].status
    assert status4 is not None and status4.message is not None
    # Since text is identical, the parts of a2a_events4[0].status.message should remain empty
    assert not status4.message.parts


# ---------------------------------------------------------------------------
# NativeProgressTracker — poll-driven GE Thinking-tab stage (read-time compute)
# ---------------------------------------------------------------------------


def _tracker_text(tracker, task_id, *, now):
    msg = tracker.status_message(task_id, now=now)
    if msg is None:
        return None
    return msg.parts[0].root.text


def test_native_tracker_unstarted_task_returns_none():
    tracker = NativeProgressTracker()
    assert tracker.status_message("missing") is None


def test_native_tracker_understanding_phase_advances_over_time():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    started = tracker._tasks["t1"]["started_at"]

    # Immediately after start: floor of 5%.
    assert "(5%)" in _tracker_text(tracker, "t1", now=started)
    # A few seconds in: climbs but stays in the understanding band (<=30%).
    text = _tracker_text(tracker, "t1", now=started + 3)
    assert "Understanding request" in text
    assert "(20%)" in text
    # Far in: capped at the understanding ceiling, never racing to 100%.
    assert "(30%)" in _tracker_text(tracker, "t1", now=started + 60)


def test_native_tracker_uses_tool_steps_when_attached():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    started = tracker._tasks["t1"]["started_at"]
    steps = [
        {
            "title": "Searching for restaurants",
            "state": "active",
            "active_started_at": started,
            "tools": [{"name": "find_restaurants", "state": "running"}],
        }
    ]
    tracker.attach_steps("t1", steps)
    text = _tracker_text(tracker, "t1", now=started + 1)
    assert "Searching for restaurants" in text


def test_native_tracker_is_monotonic_across_polls():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    started = tracker._tasks["t1"]["started_at"]
    # Advance to 30% via the understanding curve.
    _tracker_text(tracker, "t1", now=started + 60)
    # A later poll that would compute a lower value must not regress.
    text = _tracker_text(tracker, "t1", now=started)
    assert "(30%)" in text


def test_native_tracker_finalize_replays_milestones():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    started = tracker._tasks["t1"]["started_at"]
    steps = [
        {
            "title": "Searching for restaurants",
            "state": "done",
            "active_started_at": started,
            "tools": [{"name": "find_restaurants", "state": "done"}],
        },
        {
            "title": "Compiling dashboard",
            "state": "done",
            "active_started_at": started,
            "tools": [{"name": "send_a2ui_json_to_client", "state": "done"}],
        },
    ]
    tracker.attach_steps("t1", steps)
    tracker.finalize("t1")
    assert not tracker.final_replay_complete("t1")
    assert _tracker_text(tracker, "t1", now=0) == "▸ Understanding request... (5%)"

    text = _tracker_text(tracker, "t1", now=0.5)
    assert "✓ Searching for restaurants... (40%)" in text
    assert "↳ ✓ Search for restaurants" in text
    assert "Tool calls · 1/1" in text

    text = _tracker_text(tracker, "t1", now=1.1)
    assert "✓ Compiling dashboard... (70%)" in text
    assert "↳ ✓ Render dashboard UI" in text
    assert "Tool calls · 1/1" in text

    assert _tracker_text(tracker, "t1", now=2.2) == "▸ Composing response... (90%)"
    assert _tracker_text(tracker, "t1", now=3.3) == "✓ Complete (100%)"
    assert tracker.final_replay_complete("t1")


def test_native_tracker_replays_done_tool_steps_before_finalizing():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    started = tracker._tasks["t1"]["started_at"]
    tracker._tasks["t1"]["last_pct"] = 15
    tracker.attach_steps(
        "t1",
        [
            {
                "title": "Searching for restaurants",
                "state": "done",
                "active_started_at": started,
                "tools": [{"name": "find_restaurants", "state": "done"}],
            },
            {
                "title": "Compiling dashboard",
                "state": "done",
                "active_started_at": started,
                "tools": [{"name": "send_a2ui_json_to_client", "state": "done"}],
            },
        ],
    )

    text = _tracker_text(tracker, "t1", now=started + 1)
    assert "✓ Searching for restaurants... (40%)" in text
    assert "↳ ✓ Search for restaurants" in text
    assert "Tool calls · 1/1" in text

    text = _tracker_text(tracker, "t1", now=started + 2)
    assert "✓ Compiling dashboard... (70%)" in text
    assert "↳ ✓ Render dashboard UI" in text
    assert "Tool calls · 1/1" in text

    tracker.finalize("t1")
    assert _tracker_text(tracker, "t1", now=started + 3) == (
        "▸ Composing response... (90%)"
    )
    assert _tracker_text(tracker, "t1", now=started + 4) == "✓ Complete (100%)"


def test_native_tracker_finalize_keeps_tool_steps_after_high_live_progress():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    started = tracker._tasks["t1"]["started_at"]
    tracker._tasks["t1"]["last_pct"] = 95
    tracker.attach_steps(
        "t1",
        [
            {
                "title": "Searching for restaurants",
                "state": "done",
                "active_started_at": started,
                "tools": [{"name": "find_restaurants", "state": "done"}],
            },
            {
                "title": "Compiling dashboard",
                "state": "done",
                "active_started_at": started,
                "tools": [{"name": "send_a2ui_json_to_client", "state": "done"}],
            },
        ],
    )
    tracker.finalize("t1")

    text = _tracker_text(tracker, "t1", now=0)
    assert "✓ Searching for restaurants... (96%)" in text
    assert "↳ ✓ Search for restaurants" in text

    text = _tracker_text(tracker, "t1", now=1)
    assert "✓ Compiling dashboard... (97%)" in text
    assert "↳ ✓ Render dashboard UI" in text

    assert _tracker_text(tracker, "t1", now=2) == "▸ Composing response... (98%)"
    assert _tracker_text(tracker, "t1", now=3) == "✓ Complete (100%)"


def test_native_tracker_finish_stops_overriding():
    tracker = NativeProgressTracker()
    tracker.start("t1")
    tracker.finish("t1")
    assert tracker.status_message("t1") is None
