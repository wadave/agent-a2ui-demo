# Workspace & PPTX Skills Integration

This document describes how Google Workspace capabilities are integrated into the Restaurant Finder agent using ADK Skills and the `workspace_tools` module.

## 1. Architecture

The agent has two main tool surfaces attached to the `LlmAgent`:

| Surface | Class | Purpose |
| --- | --- | --- |
| Skills | `SkillToolset` | Reference instructions (SKILL.md) for specific operations (e.g., `presentation-skill`). |
| Workspace Tools | Python Functions | High-performance mutation tools (`create_doc`, `create_sheet`) utilizing a dual-path execution model. |

### The Dual-Path Model (`app/workspace_tools.py`)

To support both local development and secure production deployment, the Workspace tools route requests differently based on the environment:

1.  **Local Development (The CLI Path)**:
    *   Uses the standalone `gws` executable binary.
    *   Executes via `subprocess.run(['gws', ...])`.
    *   Requires local user credentials cached via `gws auth login`.

2.  **Production Deployment (The SDK & ADC Path)**:
    *   Uses the standard `googleapiclient` Python SDK.
    *   Authenticates via Application Default Credentials (ADC) utilizing the Cloud Run runtime Service Account.
    *   Implements **Domain-Wide Delegation (DWD)** to act on behalf of real users, solving quota and permission limitations.

## 2. Infrastructure & Environment

### 2.1 Authentication

*   **Production**: The Service Account must hold `roles/iam.serviceAccountTokenCreator` on its own resource, and the Workspace admin must authorize the SA's OAuth Client ID in the admin console.
*   **Local**: Set `USE_ADC="TRUE"` and `GOOGLE_APPLICATION_CREDENTIALS` pointing to a valid SA key file to debug the DWD pipeline locally.

## 3. Code Structure

*   **`app/agent.py`**: Loads a specific subset of relevant skills (e.g., `gws-drive`, `gws-docs`) rather than the full generated suite to keep the LLM context focused.
*   **`app/workspace_tools.py`**: Contains the core implementations for creating, updating, and sharing Docs, Sheets, and Slides.
