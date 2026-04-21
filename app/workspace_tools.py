"""Google Workspace mutation wrappers backed by the `gws` CLI."""

from __future__ import annotations

import json
import logging
import subprocess
from typing import Any, Literal

logger = logging.getLogger(__name__)

_GWS = "gws"
_TIMEOUT_SEC = 30


def _run_gws(args: list[str]) -> dict[str, Any]:
    """Execute a gws command; always return a structured result."""
    try:
        proc = subprocess.run(
            [_GWS, *args],
            capture_output=True,
            text=True,
            check=True,
            timeout=_TIMEOUT_SEC,
        )
    except subprocess.CalledProcessError as exc:
        logger.error("gws failed: %s", exc.stderr)
        return {"ok": False, "error": exc.stderr.strip() or str(exc)}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "gws command timed out"}
    try:
        return {"ok": True, "data": json.loads(proc.stdout)}
    except json.JSONDecodeError:
        return {"ok": True, "data": {"raw": proc.stdout.strip()}}


def create_doc(title: str) -> dict[str, Any]:
    """Create an empty Google Doc; returns {ok, data: {doc_id, url}} or error."""
    result = _run_gws(
        ["docs", "documents", "create", "--json", json.dumps({"title": title})]
    )
    if not result["ok"]:
        return result
    doc_id = result["data"].get("documentId")
    return {
        "ok": True,
        "data": {
            "doc_id": doc_id,
            "url": f"https://docs.google.com/document/d/{doc_id}/edit",
        },
    }


def append_doc_text(document_id: str, text: str) -> dict[str, Any]:
    """Append text to the end of a doc via documents.batchUpdate."""
    body = {"requests": [{"insertText": {"endOfSegmentLocation": {}, "text": text}}]}
    return _run_gws(
        [
            "docs",
            "documents",
            "batchUpdate",
            "--documentId",
            document_id,
            "--json",
            json.dumps(body),
        ]
    )


def share_doc(
    document_id: str,
    email: str,
    role: Literal["reader", "commenter", "writer"] = "reader",
) -> dict[str, Any]:
    """Grant a user permission on a Drive file."""
    body = {"type": "user", "role": role, "emailAddress": email}
    return _run_gws(
        [
            "drive",
            "permissions",
            "create",
            "--fileId",
            document_id,
            "--json",
            json.dumps(body),
        ]
    )
