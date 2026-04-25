# System Diagram

```mermaid
graph TB
    User([User]) --> FE["Lit Frontend<br/>(A2UI Renderer)"]

    FE -->|"A2A / JSON-RPC"| BE

    subgraph CloudRun["Cloud Run"]
        BE["ADK Backend"]
        Agent["Gemini Agent"]
        Tools["find_restaurants<br/>get_directions<br/>search_agent<br/>workspace_tools"]

        BE --> Agent
        Agent -->|"Tool calls"| Tools
        Agent -->|"v0.9: updateDataModel + updateComponents<br/>v0.8: beginRendering + surfaceUpdate"| BE
    end

    BE -->|"Text + A2UI Blueprints"| FE
    Tools -->|"Grounding"| GCP["Google Cloud<br/>(Gemini<br/>+ Maps APIs)"]
    Tools -->|"API Calls"| GWS["Google<br/>Workspace<br/>(Drive,<br/>Sheets,<br/>Slides)"]
    FE -->|"Maps Embed<br/> iframe"| GCP
    FE -->|"Drive Preview <br/>iframe"| GWS

    style User fill:#e8f5e9
    style FE fill:#e3f2fd
    style BE fill:#fff3e0
    style Agent fill:#fce4ec
    style Tools fill:#fce4ec
    style GCP fill:#f3e5f5
    style GWS fill:#e8f5e9
    style CloudRun stroke-dasharray:5 5,fill:#fafafa
```
