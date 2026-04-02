# A2UI Restaurant Finder Demo

An AI-powered restaurant finder agent built with Google ADK (Agent Development Kit) and the A2A (Agent-to-Agent) protocol, featuring a rich interactive UI powered by [A2UI](https://github.com/google/A2UI) v0.8 rendered with Lit web components.

## System Description

This application demonstrates a full-stack AI agent architecture where:

- A **Gemini-powered root agent** orchestrates multiple tools to find restaurants, get directions, and look up locations using Google Maps grounding.
- The backend communicates via the **A2A protocol** (JSON-RPC), allowing interoperability with any A2A-compatible client.
- The frontend renders rich, interactive UI components using the **A2UI v0.8 specification** — the agent generates structured UI blueprints (not HTML), and the Lit-based client renders them as native components.
- A **save-then-render** pattern stores restaurant data via `dataModelUpdate` before rendering the UI via `surfaceUpdate`, enabling data reuse across conversation turns.
- A custom **GoogleMap** component extends the A2UI catalog for the custom frontend, while **WebFrameUrl** (built-in to GE) provides Google Maps embeds via the Maps Embed API for compatibility with both GE and custom UI.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend (Lit Web Components)"
        Browser[Browser]
        AppShell[A2UI App Shell]
        Surface[A2UI Surface Renderer]
        CustomComp[Custom GoogleMap Component]
        Browser --> AppShell
        AppShell --> Surface
        Surface --> CustomComp
    end

    subgraph "A2A Protocol Layer"
        Client[A2A JSON-RPC Client]
        Handler[DefaultRequestHandler]
        AppShell -->|"POST /a2a-rpc"| Client
        Client -->|"JSON-RPC 2.0"| Handler
    end

    subgraph "Backend (ADK + A2A)"
        Executor[AdkAgentToA2AExecutor]
        Runner[ADK Runner]
        Session[Session Service]
        Handler --> Executor
        Executor --> Runner
        Runner --> Session
    end

    subgraph "Root Agent (Gemini)"
        Agent[GeminiAgent]
        Runner --> Agent
    end

    subgraph "Tools"
        FindRest[find_restaurants]
        GetDir[get_directions]
        MapsAgent[maps_agent - AgentTool]
        Agent -->|"Tool Call"| FindRest
        Agent -->|"Tool Call"| GetDir
        Agent -->|"Tool Call"| MapsAgent
    end

    subgraph "Google Cloud"
        GeminiAPI[Gemini API]
        MapsGround[Google Maps Grounding]
        SecretMgr[Secret Manager]
        FindRest --> GeminiAPI
        FindRest --> MapsGround
        GetDir --> GeminiAPI
        GetDir --> MapsGround
        MapsAgent --> MapsGround
        Executor -.->|"API Key"| SecretMgr
    end

    subgraph "A2UI Message Flow"
        direction LR
        BR[beginRendering] --> DMU[dataModelUpdate]
        DMU --> SU[surfaceUpdate]
    end
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Lit Frontend
    participant A2A as A2A Protocol
    participant Executor as AgentExecutor
    participant Agent as Root Agent
    participant Tool as find_restaurants

    User->>Frontend: "Find 5 restaurants near Google PLV"
    Frontend->>A2A: JSON-RPC message/send
    A2A->>Executor: Execute request
    Executor->>Agent: Run with query
    Agent->>Tool: find_restaurants("5 restaurants near Google PLV LA")
    Tool-->>Agent: JSON array of restaurants
    Agent-->>Executor: Text + A2UI JSON (beginRendering, dataModelUpdate, surfaceUpdate)
    Executor->>Executor: Validate A2UI schema & cache data in session
    Executor-->>A2A: A2A response (text + data parts)
    A2A-->>Frontend: Text + A2UI messages
    Frontend->>Frontend: Render surfaces (MultipleChoice dropdown)
    Frontend-->>User: Interactive restaurant selection UI

    User->>Frontend: Selects restaurants & clicks "Show details"
    Frontend->>A2A: userAction (selectRestaurants)
    A2A->>Executor: Extract selected names + inject cached data
    Executor->>Agent: Query with cached restaurant data
    Agent-->>Executor: Markdown table (no re-query needed)
    Executor-->>Frontend: Text response
    Frontend-->>User: Restaurant details table
```

## Project Structure

```
agent-a2ui-demo/
├── app/                        # Backend agent code
│   ├── agent.py                # Root agent with A2UI instructions
│   ├── agent_executor.py       # A2A executor with A2UI validation & caching
│   ├── main.py                 # Uvicorn entry point, serves frontend + A2A
│   ├── tools.py                # find_restaurants, get_directions (Google Maps grounding)
│   ├── sub_agents.py           # maps_agent (AgentTool with GoogleMapsGroundingTool)
│   ├── catalog_schemas/        # A2UI catalog definitions (JSON Schema)
│   │   └── 0.8/                # v0.8 catalog with GoogleMap, WebFrameUrl, etc.
│   └── examples/               # A2UI example templates for the LLM
│       └── restaurant_finder_catalog/
│           └── 0.8/            # v0.8 examples (map.json, restaurant_selection.json)
├── frontend/                   # Lit-based A2UI client
│   ├── src/
│   │   ├── app.ts              # Main A2UI shell with chat UI
│   │   ├── client.ts           # A2A JSON-RPC client
│   │   └── google-map-component.ts  # Custom GoogleMap + WebFrameUrl components
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── lit_internal/               # GoogleMap component for GE integration
├── tests/                      # Unit, integration, and eval tests
├── deployment/                 # Terraform infrastructure
├── .cloudbuild/                # CI/CD pipeline configurations
├── Makefile                    # Development commands
└── pyproject.toml              # Python dependencies
```

## Requirements

- **uv**: Python package manager - [Install](https://docs.astral.sh/uv/getting-started/installation/)
- **Node.js**: For frontend build (v18+)
- **Google Cloud SDK**: For GCP services - [Install](https://cloud.google.com/sdk/docs/install)
- **Google Cloud Project** with the following APIs enabled:
  - Vertex AI API
  - Secret Manager API
  - Google Maps Platform (Maps Embed API)
- **Google Maps API Key** stored in Secret Manager as `google_map_api_key`:
  ```bash
  # Create the secret (one-time setup)
  echo -n "YOUR_MAPS_API_KEY" | gcloud secrets create google_map_api_key --data-file=-

  # Or for local dev, add to .env instead:
  echo 'GOOGLE_MAPS_API_KEY=YOUR_MAPS_API_KEY' >> .env
  ```

## Private Package Registry

By default, this project resolves all Python packages from [PyPI](https://pypi.org). If you are working in an environment that requires a private Artifact Registry (e.g., Google Cloudtop), add the following to `pyproject.toml`:

```toml
[[tool.uv.index]]
name = "ah-3p-staging-python"
url = "https://us-python.pkg.dev/artifact-foundry-prod/ah-3p-staging-python/simple/"
```

Then regenerate the lockfile:

```bash
rm uv.lock && uv lock
```

> [!WARNING]
> The `uv.lock` file pins download URLs to whichever registry was used during `uv lock`. A lockfile generated against the private registry will fail in environments without registry credentials (e.g., Docker/Cloud Build), and vice versa. Always regenerate the lockfile when switching registries.

## Local Testing

### 1. Set up environment

```bash
# Install Python dependencies
make install

# Set your GCP project
gcloud config set project <your-project-id>
gcloud auth application-default login

# Copy .env.example and fill in your details
cp .env.example .env
```

Edit the `.env` file to set your `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`.

> [!IMPORTANT]
> A `.env` file is required for local testing to specify your Google Cloud Project. Without it, the application may fall back to the Public API or use default locations (like `global`) that might return a `404 Not Found` error if the model is not available in that region for Vertex AI.


### 2. Build frontend and run backend

```bash
# Build the frontend (one-time, or after frontend changes)
make frontend-build

# Start the backend (serves frontend + A2A endpoint)
make local-backend PORT=8080
```

The app will be available at `http://localhost:8080`.

### 3. Alternative: Run frontend and backend separately (hot-reload)

```bash
# Terminal 1 — backend with hot-reload
make local-backend

# Terminal 2 — frontend dev server (proxies API to backend)
make frontend-dev
```

Frontend dev server runs at `http://localhost:5173` with hot-reload.

### 4. Test with ADK Playground

```bash
make playground
```

### 5. Test with A2A Inspector

```bash
# Start backend first, then in another terminal:
make inspector
```

## Cloud Deployment

### Deploy to Cloud Run

```bash
# Set project
gcloud config set project <your-project-id>

# Deploy
make deploy
```

### Deploy with IAP (Identity-Aware Proxy)

```bash
make deploy IAP=true
```

### Set up CI/CD and infrastructure

```bash
# One-command CI/CD pipeline setup
uvx agent-starter-pack setup-cicd

# Or set up dev environment with Terraform
make setup-dev-env
```

### Register with Gemini Enterprise

```bash
make register-gemini-enterprise
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `make install` | Install Python dependencies |
| `make frontend-build` | Build frontend for production |
| `make frontend-dev` | Launch frontend dev server with hot-reload |
| `make local-backend` | Launch backend server (serves built frontend) |
| `make playground` | Launch ADK development playground |
| `make inspector` | Launch A2A Protocol Inspector |
| `make deploy` | Deploy to Cloud Run |
| `make test` | Run unit and integration tests |
| `make lint` | Run code quality checks |
| `make eval` | Run agent evaluation |
| `make setup-dev-env` | Set up dev environment with Terraform |

## Key Technologies

- **[Google ADK](https://google.github.io/adk-docs/)** — Agent Development Kit for building AI agents
- **[A2A Protocol](https://a2aprotocol.ai/)** — Agent-to-Agent interoperability protocol
- **[A2UI](https://github.com/google/A2UI)** — Agent-driven UI specification (v0.8)
- **[Lit](https://lit.dev/)** — Web component framework for the frontend
- **[Gemini](https://ai.google.dev/)** — Google's LLM powering the agent
- **[Google Maps Platform](https://developers.google.com/maps)** — Maps grounding and embed API
