# Workspace & PPTX Skills Integration — Implementation Plan

This document specifies how to add Google Workspace capabilities to the
Restaurant Finder agent (`app/agent.py`) using ADK Skills, the
`gemini-cli-extensions/workspace` MCP server, and the `googleworkspace/cli`
(`gws`) command. PPTX generation is already in place as a Skill; this plan
slots Workspace alongside it.

---

## 1. Architecture

The agent has three tool surfaces, all attached to the existing `LlmAgent`
built in `_build_llm_agent()` at `app/agent.py:399`:

| Surface | Class | Purpose |
| --- | --- | --- |
| Skills | `SkillToolset(skills=[...], additional_tools=[...])` | Knowledge (when/how to act) **and** the Python wrappers it routes to |
| Workspace MCP | `McpToolset(connection_params=Stdio...)` | Read-heavy Workspace queries (Drive search, Doc read, Calendar list) |
| A2UI / domain | existing `find_restaurants`, `get_directions`, `SendA2uiToClientToolset` | Unchanged |

### Routing rule (enforced in the SKILL body, not in code)

The `gws_skill` SKILL.md tells the model:

- **Reads → MCP** (`google-workspace.*` tools): list/search/get on Drive, Docs,
  Calendar, Gmail.
- **Mutations → Python wrappers** (`create_doc`, `append_doc_text`,
  `share_doc`): anything that writes.

Without this rule the model will pick whichever tool name looks closer to the
user's phrasing and the two surfaces will fight.

### Naming convention

`YYYY-MM-DD_[City]_Restaurant_Recommendations` — set in the SKILL, not in the
Python wrapper, so future doc types (trip plans, etc.) can adopt their own
patterns without touching code.

---

## 2. Infrastructure & Environment

### 2.1 Dockerfile changes

The current `Dockerfile:25` Python stage has no Node runtime. The MCP server
and `gws` CLI both need it. Insert before the `uv sync` step:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @googleworkspace/cli@latest \
 && npm install -g @gemini-cli-extensions/workspace@latest
```

PPTX generation continues to use `python-pptx` (already the convention in this
repo). Do **not** introduce `pptxgenjs` — keep the runtime single-language for
everything except the MCP server itself.

### 2.2 Authentication

Two paths. **Use SA in production. Use user-OAuth only for local demos.**

**A. Service account (Cloud Run, recommended)**

1. Create an SA with the Workspace API scopes you need.
2. If acting on behalf of a user (Docs/Drive in a domain), enable
   domain-wide delegation and authorize the SA's client ID in the Workspace
   admin console for those scopes.
3. Mount the key at `/secrets/workspace_sa.json` via Secret Manager.
4. Set on the Cloud Run service:
   ```
   GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/secrets/workspace_sa.json
   GOOGLE_WORKSPACE_IMPERSONATE_USER=ops@yourdomain.com   # if DWD
   ```
   Both `gws` and the MCP server child process inherit these.

**B. User OAuth (local dev only)**

```bash
gws auth login
gws auth export --unmasked > .secrets/gws.json
export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=$(pwd)/.secrets/gws.json
```

This token is single-user, expires, and is not appropriate for a shared
deployment. Do not check it in; do not mount it in Cloud Run.

---

## 3. Code changes

### 3.1 New file: `app/skills/gws/SKILL.md`

This is the substance of the Skill — without it the SkillToolset is overhead.

```markdown
---
name: google_workspace
description: Create and organize Google Docs/Sheets for restaurant recommendations.
---

## When to use this skill

Activate when the user asks to "save", "share", "send to Docs", "create a doc",
"export to Sheets", or otherwise persist results outside the chat.

## Tool routing (strict)

- **Read** existing Workspace content → call MCP tools prefixed
  `google-workspace.` (e.g. `google-workspace.drive_search`,
  `google-workspace.docs_get`).
- **Write** new content → call the Python wrappers:
  - `create_doc(title)` — returns `{ok, data: {doc_id, url}}`
  - `append_doc_text(document_id, text)` — appends Markdown-flavored text
  - `share_doc(document_id, email, role)` — `role ∈ {"reader","commenter","writer"}`

Never invoke `gws` from a tool call directly — only via these wrappers.

## Naming & organization

- Doc titles: `{YYYY-MM-DD}_{City}_Restaurant_Recommendations`
- Place new docs in the user's Drive root unless they specify a folder.
- For trip plans across multiple cities, create one doc and append sections;
  do not create one doc per restaurant.

## Failure handling

If a wrapper returns `{"ok": false, "error": ...}`, surface a one-line apology
and the human-readable error verbatim. Do not retry automatically.
```

### 3.2 New file: `app/workspace_tools.py`

Subprocess wrappers. Real `batchUpdate` for inserts, structured returns, no
silent failures.

```python
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
    result = _run_gws(["docs", "documents", "create", "--json", json.dumps({"title": title})])
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
```

### 3.3 Modify `app/agent.py`

Two surgical changes inside `_build_llm_agent()` (currently at
`app/agent.py:399-438`). **Do not** introduce a new `root_agent = ...` — the
existing `LlmAgent` is what the executor uses.

**Add imports near the top of the file:**

```python
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from google.adk.tools.skill_toolset import SkillToolset, load_skill_from_dir
from mcp import StdioServerParameters

from app.workspace_tools import append_doc_text, create_doc, share_doc
```

**Inside `_build_llm_agent`, before the `return LlmAgent(...)` call:**

```python
gws_skill = load_skill_from_dir(os.path.join(_APP_DIR, "skills", "gws"))
pptx_skill = load_skill_from_dir(os.path.join(_APP_DIR, "skills", "pptx"))

workspace_skills = SkillToolset(
    skills=[gws_skill, pptx_skill],
    additional_tools=[create_doc, append_doc_text, share_doc],
)

workspace_mcp = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="node",
            args=["/usr/lib/node_modules/@gemini-cli-extensions/workspace/scripts/start.js"],
            env={
                "GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE": os.environ.get("GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE", ""),
                "GOOGLE_WORKSPACE_IMPERSONATE_USER": os.environ.get("GOOGLE_WORKSPACE_IMPERSONATE_USER", ""),
            },
        )
    )
)
```

**Extend the existing `tools=[...]` list** (currently at `app/agent.py:428`):

```python
tools = (
    [
        find_restaurants,
        get_directions,
        SendA2uiToClientToolset(...),  # unchanged
        workspace_skills,
        workspace_mcp,
    ],
)
```

> **Standalone-launch caveat.** Before merging, verify
> `@gemini-cli-extensions/workspace/scripts/start.js` runs without the
> gemini-cli host. If it depends on gemini-cli env, write a thin launcher
> (`scripts/workspace_mcp.js`) that imports the server module directly and
> point `args` at that instead.

---

## 4. Local development

```bash
make install
gws auth login                                 # one-time
gws auth export --unmasked > .secrets/gws.json
export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=$(pwd)/.secrets/gws.json
make dev
```

`.secrets/` must be in `.gitignore`. The env var feeds both the `gws`
subprocess and the spawned MCP server child.

---

## 5. Failure modes

| Symptom | Likely cause | Handling |
| --- | --- | --- |
| `gws: command not found` | Image missing Node/CLI install | Build-time check in CI |
| `401 / invalid_grant` | User-OAuth token expired in prod | Switch to SA per §2.2 |
| `403 insufficientPermissions` | DWD scopes not authorized | Re-authorize SA client ID in admin console |
| MCP server exits at startup | `start.js` needs gemini-cli env | Use the standalone launcher (§3.3 caveat) |
| Wrapper returns `{ok: false}` | doc_id wrong, quota, network | SKILL instructs model to surface error verbatim |

---

## 6. Test plan

- **Unit (`tests/unit/test_workspace_tools.py`)**: monkeypatch `subprocess.run`
  to return canned stdout/stderr; assert `create_doc`, `append_doc_text`,
  `share_doc` each produce the expected `{ok, data}` / `{ok: false, error}`
  shapes for: success, non-zero exit, timeout, non-JSON stdout.
- **MCP boot test**: spawn the MCP server with the documented `args` + `env`
  and assert it advertises tools within 5s. Catches the standalone-vs-
  gemini-cli regression early.
- **Integration smoke (manual, gated by `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE`)**:
  create → append → share → delete a real doc. Skip cleanly if the env var
  is unset.
- **Agent eval**: add one prompt to the existing eval suite — *"Save these 5
  restaurants to a Google Doc and share it with me@example.com"* — and assert
  exactly one `create_doc` + one `append_doc_text` + one `share_doc` call,
  in that order.

---

## 7. Out of scope for this PR

- Sheets export (the SKILL mentions it, but no wrapper yet — add when a real
  use case lands).
- Calendar writes (read-only via MCP for now).
- Multi-tenant auth (the SA / DWD model assumes a single Workspace domain).
