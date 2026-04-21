# Technical Implementation Plan: Workspace & PPTX Skills Integration (Revised)

This document establishes the production-grade plan for integrating Workspace capabilities and presentation generation into the agent.

---

## 1. System Architecture

### A. Knowledge Layer (Skills)
- **`pptx_skill`**: Manages layout logic, color systems, and slide constraints.
- **`gws_skill`**: (New) Enforces strict routing rules:
  - **Read Operations:** Use the Workspace MCP Server.
  - **Write Operations:** Use the `gws` CLI via Python tools.
  - **Naming Convention:** `YYYY-MM-DD_[City]_Restaurant_Recommendations`.

### B. Execution Layer (Tools)
- **Workspace MCP Server**: Read/List APIs.
- **GWS CLI**: Document/Sheet/Slide mutations.

---

## 2. Infrastructure & Environment

### A. Dependencies (Dockerfile Impact)
The base Cloud Run image must contain:
- Node.js 18+ (for `pptxgenjs` and MCP extension)
- Python 3.10+
- `@googleworkspace/cli` installed globally.

### B. Authentication (Production Pattern)
Do not use token exports in production.
1. **Cloud Run Service Account:** Attach a SA with Domain-Wide Delegation to the Cloud Run instance.
2. **Environment Variable:**
   `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/secrets/sa.json`

---

## 3. Implementation Details

### A. Subprocess Hygiene & Tool Logic (`app/workspace_tools.py`)
```python
import subprocess
import json
import logging

logger = logging.getLogger(__name__)


def _run_gws(args: list) -> dict:
    """Executes a GWS command with strict error checking."""
    try:
        result = subprocess.run(["gws"] + args, capture_output=True, text=True, check=True)
        return {"ok": True, "data": result.stdout.strip()}
    except subprocess.CalledProcessError as e:
        logger.error(f"GWS Command Failed: {e.stderr}")
        return {"ok": False, "error": e.stderr.strip()}


def create_doc_from_recommendations(title: str) -> dict:
    """Creates an empty doc."""
    return _run_gws(["docs", "create", "--json", json.dumps({"title": title})])


def append_doc_text(document_id: str, text: str) -> dict:
    """Appends content via batchUpdate equivalent."""
    params = {"requests": [{"insertText": {"location": {"index": 1}, "text": text}}]}
    return _run_gws(["docs", "documents", "batchUpdate", "--params", json.dumps({"documentId": document_id}), "--json", json.dumps(params)])
```

### B. Agent Configuration (`app/agent.py`)
```python
from google.adk.tools.skill_toolset import SkillToolset
from google.adk.tools.mcp_tool import McpToolset
from mcp import StdioServerParameters

workspace_mcp = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="node",
            args=["/opt/workspace-ext/scripts/start.js"],
            env={"GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE": "/secrets/sa.json"},
        )
    )
)

workspace_skills = SkillToolset(
    skills=[gws_skill, pptx_skill],
    additional_tools=[create_doc_from_recommendations, append_doc_text],
)

root_agent = LlmAgent(tools=[workspace_skills, workspace_mcp, find_restaurants])
```
