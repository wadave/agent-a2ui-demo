# System Diagram

```mermaid
graph TB
    User([User]) --> FE["GE UI or <br/>Custom Frontend<br/>(A2UI Renderer)"]

    FE -->|"A2A / JSON-RPC"| BE

    subgraph CloudRun["Cloud Run"]
        BE["ADK Backend"]
        Agent["Gemini Agent"]
        Tools["read_whitepaper_section"]

        BE --> Agent
        Agent -->|"Tool calls"| Tools
        Agent -->|"v0.9: updateDataModel + updateComponents<br/>v0.8: beginRendering + surfaceUpdate"| BE
    end

    BE -->|"Text + A2UI Blueprints"| FE
    Tools -->|"Fixture"| Data["Q1 2026 Whitepaper JSON"]

    style User fill:#e8f5e9
    style FE fill:#e3f2fd
    style BE fill:#fff3e0
    style Agent fill:#fce4ec
    style Tools fill:#fce4ec
    style Data fill:#f3e5f5
    style CloudRun stroke-dasharray:5 5,fill:#fafafa
```
