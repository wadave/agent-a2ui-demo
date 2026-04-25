# Architecture Overview: A2UI, A2A, CopilotKit/AG-UI, and Renderers

## The Stack Roles
*   **CopilotKit / AG-UI**: Owns the **App Experience** (Client Shell & State)
*   **Lit / Flutter / Angular**: Own the **Pixel Drawing** (Component Rendering)
*   **A2A Protocol**: Owns the **Conversation Pipeline** (Client & Server Transport)
*   **A2UI**: Is the **Cargo** moving through the pipeline (Data Format)

---

## The Setup
1.  Build the application shell using **CopilotKit/AG-UI** (chat UI, input handling).
2.  Register an **A2UI Renderer** (Lit, Flutter, or Angular) inside the shell to draw rich cards.

---

## The Interaction Lifecycle

| Phase | Actor | Action |
| :--- | :--- | :--- |
| **1. Request** | Client | User types request → **CopilotKit/AG-UI** hands to **A2A Client** → Packaged as JSON-RPC. |
| **2. Transport** | Network | **A2A Client** sends over HTTP/WS → **A2A Server** receives & authenticates. |
| **3. Response** | Server | AI Agent generates **A2UI Blueprint** → **A2A Server** returns as `DataPart`. |
| **4. Render** | Client | **A2A Client** receives → **CopilotKit/AG-UI** routes to **Lit/Flutter/Angular** → Card drawn in chat. |

---

## Deployment Paths
*   **Gemini Enterprise**: Uses GE's built-in wrapper and v0.8 Lit renderer.
*   **Custom Framework App**: Uses CopilotKit/AG-UI wrapper and custom v0.9 renderer.
*   **Bespoke/Vanilla App**: Uses a custom-built client shell (like this repo's Lit `frontend/` implementation) and custom v0.9 renderer.
