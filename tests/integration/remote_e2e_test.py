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

"""End-to-end tests against a remote Cloud Run deployment.

Usage:
  # Test against Cloud Run (requires gcloud auth)
  uv run pytest tests/integration/remote_e2e_test.py -v

  # Override the URL
  AGENT_URL=https://my-agent.run.app uv run pytest tests/integration/remote_e2e_test.py -v
"""

import logging
import os
import subprocess
import uuid

import pytest
import requests
from a2a.types import (
    Message,
    MessageSendParams,
    Part,
    Role,
    SendMessageRequest,
    TextPart,
)

from app.config import A2UI_EXTENSION_URI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AGENT_URL = os.environ.get(
    "AGENT_URL",
    "",
)
RPC_URL = AGENT_URL.rstrip("/") + "/"
AGENT_CARD_URL = AGENT_URL.rstrip("/") + "/.well-known/agent-card.json"
A2UI_EXTENSION = A2UI_EXTENSION_URI

pytestmark = pytest.mark.skipif(not AGENT_URL, reason="AGENT_URL not set")


def _get_auth_token() -> str:
    """Get a Google Cloud identity token for authenticated requests."""
    result = subprocess.run(
        ["gcloud", "auth", "print-identity-token"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        pytest.skip("gcloud auth not available — run: gcloud auth login")  # type: ignore
    return result.stdout.strip()


@pytest.fixture(scope="session")
def auth_headers():
    token = _get_auth_token()
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }


def _send(text: str, headers: dict, extensions: list[str] | None = None) -> dict:
    """Send an A2A message/send request."""
    msg = Message(
        message_id=f"msg-{uuid.uuid4()}",
        role=Role.user,
        parts=[Part(root=TextPart(text=text))],
    )
    body = SendMessageRequest(
        id=str(uuid.uuid4()),
        params=MessageSendParams(message=msg),
    ).model_dump(mode="json", exclude_none=True)

    req_headers = dict(headers)
    if extensions:
        req_headers["X-A2A-Extensions"] = ",".join(extensions)

    resp = requests.post(RPC_URL, headers=req_headers, json=body, timeout=120)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Agent Card
# ---------------------------------------------------------------------------


class TestAgentCard:
    def test_agent_card_reachable(self, auth_headers):
        resp = requests.get(AGENT_CARD_URL, headers=auth_headers, timeout=10)
        assert resp.status_code == 200

    def test_agent_card_required_fields(self, auth_headers):
        card = requests.get(AGENT_CARD_URL, headers=auth_headers, timeout=10).json()
        for field in [
            "name",
            "description",
            "url",
            "version",
            "skills",
            "capabilities",
        ]:
            assert field in card, f"Missing field: {field}"

    def test_agent_card_has_a2ui_extension(self, auth_headers):
        card = requests.get(AGENT_CARD_URL, headers=auth_headers, timeout=10).json()
        extensions = card.get("capabilities", {}).get("extensions", [])
        a2ui_uris = [e["uri"] for e in extensions]
        assert any("a2ui" in uri for uri in a2ui_uris), (
            f"No A2UI extension found. Extensions: {a2ui_uris}"
        )

    def test_agent_card_has_dashboard_skill(self, auth_headers):
        card = requests.get(AGENT_CARD_URL, headers=auth_headers, timeout=10).json()
        skill_ids = [s["id"] for s in card.get("skills", [])]
        assert "askibm_whitepaper_dashboards" in skill_ids


# ---------------------------------------------------------------------------
# Text-only responses
# ---------------------------------------------------------------------------


class TestTextOnly:
    def test_simple_query_returns_text(self, auth_headers):
        data = _send("Tell me about the Q1 2026 whitepaper", auth_headers)
        assert "result" in data
        assert data["result"]["status"]["state"] in ("completed", "input_required")
        artifacts = data["result"].get("artifacts", [])
        assert artifacts
        parts = artifacts[0].get("parts", [])
        text_parts = [p for p in parts if p.get("kind") == "text"]
        assert text_parts


# ---------------------------------------------------------------------------
# A2UI responses (with extension header)
# ---------------------------------------------------------------------------


class TestA2UI:
    def test_whitepaper_dashboard_returns_a2ui(self, auth_headers):
        """Whitepaper dashboard query should return A2UI components."""
        data = _send(
            "What is CQ performance vs budget?",
            auth_headers,
            extensions=[A2UI_EXTENSION],
        )
        assert "result" in data
        assert data["result"]["status"]["state"] in ("completed", "input_required")

        artifacts = data["result"].get("artifacts", [])
        assert artifacts

        all_parts = []
        for a in artifacts:
            all_parts.extend(a.get("parts", []))

        a2ui_parts = [
            p
            for p in all_parts
            if p.get("kind") == "data"
            and p.get("metadata", {}).get("mimeType") == "application/json+a2ui"
        ]
        assert a2ui_parts, "Expected A2UI data parts in response"


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestErrors:
    def test_invalid_request(self, auth_headers):
        invalid = {
            "jsonrpc": "2.0",
            "id": "err-1",
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "messageId": f"msg-{uuid.uuid4()}",
                }
            },
        }
        resp = requests.post(RPC_URL, headers=auth_headers, json=invalid, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
