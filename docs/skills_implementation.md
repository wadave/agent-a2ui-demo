# Technical Implementation Plan: Workspace & PPTX Skills Integration

This document details the architectural design and step-by-step implementation plan for equipping the AI Agent with Google Workspace capabilities (via CLI and MCP) and local presentation generation.

---

## 1. System Architecture

The agent utilizes a hybrid strategy separating **Contextual Heuristics** from **Deterministic Execution**:

### A. Knowledge Layer (Skills)
Loaded via `google.adk.tools.skill_toolset.SkillToolset`.
- **`pptx_skill`**: (Existing) Instructions for layout, color palettes, and design QA.
- **`gws_skill`**: (New) Instructions governing file organization and naming conventions.

### B. Execution Layer (Tools)
- **`gemini-cli-extensions/workspace`**: Provides broad, read-heavy data access via MCP.
- **`googleworkspace/cli` (`gws`)**: Executes complex mutations via Python `subprocess`.

---

## 2. Setup & Installation

### A. Dependencies
```bash
npm install -g @googleworkspace/cli
npm install -g pptxgenjs
```

### B. Cloud Run Authentication (Secret Manager)
1. **Local Export:**
   ```bash
   gws auth login
   gws auth export --unmasked > workspace_creds.json
   ```
2. **Upload to Secret Manager:** Mount the secret to the Cloud Run instance at `/secrets/workspace_creds.json`.

---

## 3. Code Modifications

### `app/workspace_tools.py` [NEW]
Wraps `gws` command execution:
```python
import subprocess
import json


def create_doc_from_recommendations(title: str, content: str):
    cmd = ["gws", "docs", "create", "--json", json.dumps({"title": title})]
    # Additional logic to append content...
    return subprocess.run(cmd, capture_output=True, text=True).stdout
```

### `app/agent.py` [MODIFY]
```python
from google.adk.tools.skill_toolset import SkillToolset
from google.adk.tools.mcp_tool import McpToolset

workspace_mcp = McpToolset(server_params=...)
workspace_skill_toolset = SkillToolset(skills=[gws_skill, pptx_skill], additional_tools=[create_doc_from_recommendations])

root_agent = Agent(tools=[workspace_skill_toolset, workspace_mcp])
```
