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

"""End-to-end integration tests for the A2A server (app/main.py).

The server uses A2AStarletteApplication which serves:
  POST /                              JSON-RPC endpoint
  GET  /.well-known/agent-card.json  Agent card
"""

import logging
import os
import subprocess
import sys
import threading
import time
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
import requests
from a2a.types import (
    JSONRPCErrorResponse,
    Message,
    MessageSendParams,
    Part,
    Role,
    SendMessageRequest,
    TextPart,
)
from requests.exceptions import RequestException

from app.config import A2UI_EXTENSION_URI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "http://127.0.0.1:8001"
RPC_URL = f"{BASE_URL}/"
AGENT_CARD_URL = f"{BASE_URL}/.well-known/agent-card.json"
HEADERS = {"Content-Type": "application/json"}


def _log_pipe(pipe: Any, log_fn: Any) -> None:
    for line in iter(pipe.readline, ""):
        log_fn(line.strip())


def _start_server() -> subprocess.Popen:
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8001",
    ]
    env = os.environ.copy()
    env["AGENT_URL"] = BASE_URL
    env["INTEGRATION_TEST"] = "TRUE"
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
    )
    threading.Thread(
        target=_log_pipe, args=(process.stdout, logger.info), daemon=True
    ).start()
    threading.Thread(
        target=_log_pipe, args=(process.stderr, logger.warning), daemon=True
    ).start()
    return process


def _wait_for_server(timeout: int = 90) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.get(AGENT_CARD_URL, timeout=5).status_code == 200:
                return True
        except RequestException:
            pass
        time.sleep(1)
    return False


@pytest.fixture(scope="session")
def server(request: Any) -> Iterator[subprocess.Popen]:
    logger.info("Starting main.py server on port 8001")
    proc = _start_server()
    if not _wait_for_server():
        proc.terminate()
        pytest.fail("Server failed to start within timeout")
    logger.info("Server ready")

    def teardown():
        proc.terminate()
        proc.wait()

    request.addfinalizer(teardown)
    yield proc


# ---------------------------------------------------------------------------
# Agent card
# ---------------------------------------------------------------------------


def test_agent_card_served(server):
    resp = requests.get(AGENT_CARD_URL, timeout=10)
    assert resp.status_code == 200


def test_agent_card_required_fields(server):
    card = requests.get(AGENT_CARD_URL, timeout=10).json()
    for field in ["name", "description", "url", "version", "skills", "capabilities"]:
        assert field in card, f"Missing field: {field}"


def test_agent_card_name(server):
    card = requests.get(AGENT_CARD_URL, timeout=10).json()
    assert card["name"] == "Restaurant Finder Agent"


def test_agent_card_has_restaurant_skill(server):
    card = requests.get(AGENT_CARD_URL, timeout=10).json()
    skill_ids = [s["id"] for s in card["skills"]]
    assert "restaurant_lookup" in skill_ids


# ---------------------------------------------------------------------------
# message/send — restaurant list
# ---------------------------------------------------------------------------


def _send(text: str, req_id: str = "1", extensions: list[str] | None = None) -> dict:
    msg = Message(
        message_id=f"msg-{uuid.uuid4()}",
        role=Role.user,
        parts=[Part(root=TextPart(text=text))],
        extensions=extensions,
    )
    body = SendMessageRequest(
        id=req_id,
        params=MessageSendParams(message=msg),
    ).model_dump(mode="json", exclude_none=True)
    return requests.post(RPC_URL, headers=HEADERS, json=body, timeout=60).json()


def test_list_restaurants_returns_task(server):
    data = _send("What restaurants do you have?")
    assert "result" in data
    assert data["result"]["kind"] == "task"


def test_list_restaurants_task_completed(server):
    data = _send("What restaurants do you have?")
    assert data["result"]["status"]["state"] == "completed"


def test_list_restaurants_has_artifacts(server):
    data = _send("What restaurants do you have?")
    assert data["result"]["artifacts"], "Expected at least one artifact"


def test_list_restaurants_text_part(server):
    data = _send("What restaurants do you have?")
    parts = data["result"]["artifacts"][0]["parts"]
    text_parts = [p for p in parts if p.get("kind") == "text"]
    assert text_parts, "Expected a text part in the artifact"


def test_list_restaurants_a2ui_data_part(server):
    """Agent should return A2UI component data for the restaurant list."""
    data = _send("Show me restaurants in New York", extensions=[A2UI_EXTENSION_URI])
    parts = data["result"]["artifacts"][0]["parts"]
    a2ui_parts = [
        p
        for p in parts
        if p.get("kind") == "data"
        and p.get("metadata", {}).get("mimeType") == "application/json+a2ui"
    ]
    assert a2ui_parts, "Expected at least one A2UI data part"


def test_list_restaurants_a2ui_contains_surface_update(server):
    data = _send("Show me restaurants in New York", extensions=[A2UI_EXTENSION_URI])
    parts = data["result"]["artifacts"][0]["parts"]
    a2ui_parts = [
        p
        for p in parts
        if p.get("kind") == "data"
        and p.get("metadata", {}).get("mimeType") == "application/json+a2ui"
    ]
    component_updates = [
        p for p in a2ui_parts if "updateComponents" in p.get("data", {})
    ]
    assert component_updates, "Expected an updateComponents message in A2UI data"


def _collect_names(value):
    """Recursively collect every 'name' string from a v0.9 data model value."""
    found: list[str] = []
    if isinstance(value, dict):
        if isinstance(value.get("name"), str):
            found.append(value["name"])
        for v in value.values():
            found.extend(_collect_names(v))
    elif isinstance(value, list):
        for item in value:
            found.extend(_collect_names(item))
    return found


def test_list_restaurants_a2ui_options(server):
    """The updateDataModel should list the available restaurants."""
    data = _send("Show me restaurants in New York", extensions=[A2UI_EXTENSION_URI])
    parts = data["result"]["artifacts"][0]["parts"]
    all_data = [
        p["data"]
        for p in parts
        if p.get("kind") == "data"
        and p.get("metadata", {}).get("mimeType") == "application/json+a2ui"
    ]

    data_updates = [d for d in all_data if "updateDataModel" in d]
    assert data_updates, "Expected at least one updateDataModel in A2UI data"

    names: list[str] = []
    for d in data_updates:
        names.extend(_collect_names(d["updateDataModel"].get("value")))

    assert names, "Expected names in updateDataModel.value"
    # The mock data names are "Han Dynasty", etc.
    assert "Han Dynasty" in names


# ---------------------------------------------------------------------------
# message/send — restaurant details
# ---------------------------------------------------------------------------


def test_restaurant_details_single(server):
    data = _send("Tell me about Han Dynasty")
    assert data["result"]["status"]["state"] == "completed"
    parts = data["result"]["artifacts"][0]["parts"]
    text_parts = [p for p in parts if p.get("kind") == "text"]
    assert text_parts
    combined_text = " ".join(p["text"] for p in text_parts)
    assert "Han Dynasty" in combined_text


def test_restaurant_details_no_a2ui_for_details(server):
    """When showing details, agent should not return A2UI components."""
    data = _send("Show me details for Mott 32")
    parts = data["result"]["artifacts"][0]["parts"]
    a2ui_parts = [
        p
        for p in parts
        if p.get("kind") == "data"
        and p.get("metadata", {}).get("mimeType") == "application/json+a2ui"
    ]
    assert not a2ui_parts, "Did not expect A2UI components for a detail view"


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


def test_invalid_request_returns_jsonrpc_error(server):
    invalid = {
        "jsonrpc": "2.0",
        "id": "err-1",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "messageId": f"msg-{uuid.uuid4()}",
                # missing required 'parts'
            }
        },
    }
    resp = requests.post(RPC_URL, headers=HEADERS, json=invalid, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
    error = JSONRPCErrorResponse.model_validate(data)
    assert error.error.code == -32602  # Invalid params


def test_unknown_method_returns_error(server):
    body = {
        "jsonrpc": "2.0",
        "id": "err-2",
        "method": "nonexistent/method",
        "params": {},
    }
    resp = requests.post(RPC_URL, headers=HEADERS, json=body, timeout=10)
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
