# How to Implement A2UI

## What is A2UI?

A2UI is a protocol for **agent-driven interfaces** ([a2ui.org](https://a2ui.org/)). It enables AI agents to generate rich, interactive UIs that render natively across web, mobile, and desktop — without executing arbitrary code.

Instead of returning plain text, an agent emits a declarative JSON payload describing **surfaces**, **components**, and **data**. A client-side renderer turns that payload into native UI. Because A2UI is a data format (not executable code), agents can only use pre-approved components from a **catalog**, preventing UI injection attacks.

**Key design principles:**

- **LLM-friendly** — flat JSON structure supports incremental/streaming generation
- **Framework-agnostic** — the same agent response renders across Angular, Flutter, React, Lit, native mobile
- **Progressive rendering** — UI updates stream in real time as the agent generates them
- **Secure** — declarative catalog model; no code execution on the client

---

## Relationship between CopilotKit/AG-UI, Lit/Flutter/Angular, A2A, and A2UI

### The Setup
You build a Web Application.

*   You use **CopilotKit/AG-UI** to build the overall application shell (the chat window, the input box, the state management).
*   Inside that shell, you register an **A2UI Renderer** built with **Lit, Flutter, or Angular** to handle drawing rich cards.

### The Interaction (Step-by-Step)

#### 1. The Request (Client Side)
The user types *"Show me a map of local bakeries"* into the CopilotKit/AG-UI chat wrapper.

The application uses the **A2A Client** library running in the browser to package this text into a standard `JSON-RPC` message.

#### 2. The Transport (Both Sides)
This is where **A2A** shines as a full-stack protocol.

The **A2A Client** (Browser) sends the message over HTTP/WebSockets.
The **A2A Server** (Backend) receives the message, authenticates it, and passes it to the AI Agent.

#### 3. The Response (Server Side)
The AI Agent fetches the bakery locations and decides a map is the best UI to show.

It generates the **A2UI Blueprint** (the JSON describing the Map component).
The **A2A Server** attaches this blueprint to the response and sends it back across the network to the client.

#### 4. The Rendering (Client Side)
The message arrives back at the browser.

The **CopilotKit/AG-UI wrapper** receives the message and sees the A2UI blueprint inside it.
It hands that blueprint to the low-level **Lit/Flutter/Angular** engine.
The engine "paints" the interactive Google Map card right inside the chat history.

### Summary
*   **CopilotKit/AG-UI** owns the **App Experience** (Client).
*   **Lit/Flutter/Angular** own the **Pixel Drawing** (Client).
*   **A2A** owns the **Conversation Pipeline** (Client & Server).
*   **A2UI** is the **Cargo** moving through the pipeline (Data).

---

## Versions

| Version | Status | Notes |
|---------|--------|-------|
| **v0.8** | Stable | Adjacency-list model with `beginRendering` / `surfaceUpdate` / `dataModelUpdate` and `literalString` / `literalNumber` wrappers. Currently the version Gemini Enterprise renders. |
| **v0.9** | Stable / Production | `createSurface` / `updateComponents` / `updateDataModel`; discriminator-based components (`"component": "Text"`); simplified bound values (direct literal or `{path}`); modular schema with `common_types.json` and unified `basic_catalog.json` |

This repo serves **both** versions from one backend. The active version is selected per-request from the client's `X-A2A-Extensions` header — the custom Lit shell sends the v0.9 URI, Gemini Enterprise omits the header and the executor falls back to v0.8.

---

## What You Need

Two artifacts are required to wire up A2UI in an agent:

| Artifact | Purpose |
|---|---|
| **Catalog** (`catalog_definition.json`) | Defines available UI components and their JSON Schemas |
| **Examples** (`*.json` files) | Shows the LLM how to produce valid A2UI messages for each use case |

The `BasicCatalog` from the a2ui library provides standard components for free. Your custom catalog only needs to add app-specific components.

---

## Key Components

### Standard Components (BasicCatalog)

**Layout:**

| Component | Description |
|---|---|
| `Column` | Vertical stack of children (by explicit ID list or data template) |
| `Row` | Horizontal stack of children |
| `List` | Scrollable list (vertical/horizontal), supports data binding via template |
| `Card` | Wraps a single child component in a card surface |
| `Tabs` | Tab container with titled tab items, each containing a child component |
| `Divider` | Horizontal or vertical divider line |

**Content:**

| Component | Description |
|---|---|
| `Text` | Display text with `variant` (`h1`-`h5`, `body`, `caption`) |
| `Image` | Display an image by URL with `fit` and `variant` options |
| `Icon` | Named icon from a fixed set (e.g. `star`, `locationOn`, `search`) |

**Interactive:**

| Component | Description |
|---|---|
| `Button` | Triggers a named action; passes context key/value pairs back to agent. Style via `variant: "primary" \| "default" \| "borderless"` |
| `TextField` | Text input (`shortText`, `longText`, `number`, `obscured`) via `variant` |
| `ChoicePicker` | Single or multiple selection from options list (`variant: "mutuallyExclusive" \| "multipleSelection"`) — replaces v0.8 `MultipleChoice` |
| `DateTimeInput` | Date and/or time input |

### Custom Components (this repo)

| Component | Description |
|---|---|
| `WebFrameUrl` | Embeds a URL in an iframe (maps, directions, web content) |
| `GoogleMap` | Renders a Google Map with center, zoom, and optional pins |

Custom components are defined in the catalog JSON and registered in the frontend renderer.

---

## Message Types (v0.9)

Each A2UI payload is an **array** of message objects. Each message must include `"version": "v0.9"` and exactly **one** action key. Messages are processed in order. The component with `id: "root"` is automatically treated as the root of the surface.

### 1. `createSurface`

Initializes a new UI surface. Must come first. The `catalogId` declares which component catalog the agent is rendering against.

```json
{
  "version": "v0.9",
  "createSurface": {
    "surfaceId": "restaurant-map-view",
    "catalogId": "https://github.com/user/agent-a2ui-demo/restaurant_finder_catalog_definition.json"
  }
}
```

Optional fields: `theme` (e.g. `{"primaryColor": "#1a73e8"}`) and `sendDataModel` (when true, the client mirrors its full data model back on every reply).

### 2. `updateComponents`

Defines or updates the component tree. Components are **discriminator-based**: the type goes in a top-level `"component"` field instead of being a wrapping key. Exactly one component must have `id: "root"`.

```json
{
  "version": "v0.9",
  "updateComponents": {
    "surfaceId": "restaurant-map-view",
    "components": [
      {
        "id": "root",
        "component": "Column",
        "children": ["map-header", "map-frame"]
      },
      {
        "id": "map-header",
        "component": "Text",
        "variant": "h2",
        "text": "Restaurant Location"
      },
      {
        "id": "map-frame",
        "component": "WebFrameUrl",
        "url": "/maps/embed?mode=place&q=Han+Dynasty"
      }
    ]
  }
}
```

### 3. `updateDataModel`

Populates the data model with a plain JSON value. Components bind to this data via `path`.

```json
{
  "version": "v0.9",
  "updateDataModel": {
    "surfaceId": "restaurant-selection-surface",
    "path": "/",
    "value": {
      "title": "Restaurants Near You",
      "items": [
        { "name": "Han Dynasty", "rating": "★★★★☆", "address": "123 Main St, City, ST 00000" }
      ]
    }
  }
}
```

### 4. `deleteSurface`

Removes a surface from the client.

```json
{
  "version": "v0.9",
  "deleteSurface": { "surfaceId": "restaurant-map-view" }
}
```

---

## Data Binding

Components reference values two ways:

- **Literal values** — direct JSON: `"Hello"`, `42`, `true`, `["a", "b"]`. The v0.8 `literalString` / `literalNumber` / `literalBoolean` / `literalArray` wrappers are gone.
- **Data paths** — `{ "path": "/title" }` for values populated by `updateDataModel`.

List templates use `path` (not `dataBinding`) to loop over an array:

```json
{
  "id": "item-list",
  "component": "List",
  "children": {
    "componentId": "item-card-template",
    "path": "/items"
  }
}
```

Each item in `/items` becomes the local data context for the template. Paths starting with `/` are **absolute** (resolved from the surface root); paths without a leading `/` are **relative** to the current context. Inside the item template, use `{ "path": "name" }` to reference the item's `name` field — `{ "path": "/name" }` would look up `name` at the surface root, not on the item.

For richer string composition, v0.9 introduces the `formatString` function:

```json
{
  "text": {
    "call": "formatString",
    "args": { "value": "Hello ${/username}, you have ${/messageCount} messages" }
  }
}
```

---

## Architecture & Data Flow

### High-Level Overview (one-page)

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#4285F4"
    primaryTextColor: "#fff"
    primaryBorderColor: "#1a73e8"
    secondaryColor: "#34A853"
    secondaryTextColor: "#fff"
    secondaryBorderColor: "#1e8e3e"
    tertiaryColor: "#F9AB00"
    lineColor: "#5f6368"
    fontSize: 14px
---
flowchart LR
    User(("👤\nUser"))

    subgraph CLIENT ["🖥️ Frontend"]
        direction TB
        C1["A2A Client\n+ A2UI Extension"]
        C2["A2UI Renderer"]
        C1 --> C2
    end

    subgraph AGENT ["🤖 Backend"]
        direction TB
        A1["Executor\nActivate A2UI"]
        A2["LLM Agent\n+ Catalog + Examples"]
        A1 --> A2
    end

    Services[/"☁️ Gemini · Maps"/]

    User -- "message" --> C1
    C1 -- "A2A JSON-RPC" --> A1
    A2 -- "tool calls" --> Services
    Services -- "data" --> A2
    A2 -- "A2UI JSON" --> A1
    A1 -- "DataParts" --> C1
    C2 -- "rich UI" --> User

    style CLIENT fill:#E8F0FE,stroke:#4285F4,stroke-width:2px,color:#1a73e8
    style AGENT fill:#E6F4EA,stroke:#34A853,stroke-width:2px,color:#1e8e3e
    style User fill:#4285F4,stroke:#1a73e8,color:#fff
    style Services fill:#FEF7E0,stroke:#F9AB00,stroke-width:2px,color:#E37400
```

### Detailed Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Lit Web Components)"]
        direction TB
        A2AClient["A2A Client<br/><i>client.ts</i><br/>JSON-RPC + X-A2A-Extensions header"]
        A2UIRenderer["A2UI Renderer<br/><i>@a2ui/lit</i><br/>Surface manager + data binding"]
        CustomComponents["Custom Components<br/><i>google-map-component.ts</i><br/>GoogleMap, WebFrameUrl"]
    end

    subgraph Backend["Backend (Python + ADK)"]
        direction TB
        A2AServer["A2A Server<br/><i>main.py</i><br/>Discovery, CORS, Maps proxy"]
        Executor["AgentExecutor<br/><i>agent_executor.py</i>"]
        LLMAgent["LLM Agent<br/><i>agent.py</i>"]
        Toolset["SendA2uiToClientToolset<br/><i>a2ui library</i><br/>Validate + wrap as DataPart"]
        EventConverter["EventConverter<br/><i>agent_executor.py</i><br/>Inject Maps API key"]

        subgraph Session["Session State"]
            direction LR
            Enabled["a2ui_enabled"]
            Catalog["a2ui_catalog"]
            Examples["a2ui_examples"]
        end

        subgraph Tools["Domain Tools"]
            direction LR
            FindRest["find_restaurants"]
            GetDir["get_directions"]
            SearchAgent["search_agent"]
        end
    end

    External[("External Services<br/>Gemini / Google Maps")]

    A2AClient -->|"A2A JSON-RPC request<br/>+ A2UI extension header"| A2AServer
    A2AServer --> Executor
    Executor -->|"1. try_activate_a2ui_extension<br/>2. Load catalog + examples<br/>3. Write session state"| Session
    Session --> LLMAgent
    LLMAgent -->|"Call domain tools"| Tools
    Tools --> External
    External --> Tools
    LLMAgent -->|"send_a2ui_json_to_client<br/>(A2UI JSON)"| Toolset
    Toolset -->|"Validated DataPart<br/>application/json+a2ui"| EventConverter
    EventConverter -->|"A2A response<br/>(text + A2UI DataParts)"| A2AServer
    A2AServer --> A2AClient
    A2AClient --> A2UIRenderer
    A2UIRenderer --> CustomComponents
    CustomComponents -->|"Rich UI"| User([User])
    User -->|"Message / Action"| A2AClient
```

---

## A2A Protocol Integration

A2UI is transported over the **A2A (Agent-to-Agent)** protocol via an extension mechanism.

### Discovery

The backend serves `/.well-known/agent-card.json` advertising capabilities:

```json
{
  "capabilities": {
    "extensions": [{
      "uri": "https://a2ui.org/a2a-extension/a2ui",
      "version": "0.9",
      "accepts_inline_catalogs": true,
      "supported_catalog_ids": ["restaurant_finder", "basic"]
    }]
  }
}
```

### Activation

1. Frontend sends `X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.9` header
2. Backend calls `try_activate_a2ui_extension()` to detect the header
3. If detected, catalog + examples are loaded into session state
4. `SendA2uiToClientToolset` becomes active (returns `send_a2ui_json_to_client` tool)

### Response Format

A2UI data is returned as A2A `DataPart` objects alongside regular text parts:

```json
{
  "result": {
    "status": {
      "message": {
        "parts": [
          { "kind": "text", "text": "Here are the restaurants:" },
          {
            "kind": "data",
            "data": { "version": "v0.9", "createSurface": { "surfaceId": "s1", "catalogId": "..." } },
            "metadata": { "mimeType": "application/json+a2ui" }
          },
          {
            "kind": "data",
            "data": { "version": "v0.9", "updateComponents": { "surfaceId": "s1", "components": [...] } },
            "metadata": { "mimeType": "application/json+a2ui" }
          }
        ]
      }
    }
  }
}
```

---

## Implementation Steps

### Workflow Overview

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#E8F0FE"
    primaryTextColor: "#1a73e8"
    primaryBorderColor: "#4285F4"
    secondaryColor: "#E6F4EA"
    secondaryTextColor: "#1e8e3e"
    secondaryBorderColor: "#34A853"
    tertiaryColor: "#FEF7E0"
    tertiaryTextColor: "#E37400"
    tertiaryBorderColor: "#F9AB00"
    lineColor: "#5f6368"
    fontSize: 18px
---
flowchart LR
    subgraph CATALOG ["1 — Define Artifacts"]
        direction TB
        S1["<b>① Catalog</b><br/><i>catalog_schemas/</i><br/><i>0.9/*.json</i><br/>JSON Schema<br/>of components"]
        S2["<b>② Examples</b><br/><i>examples/</i><br/><i>&lt;catalog&gt;/0.9/*.json</i><br/>One file<br/>per UI pattern"]
        S1 --> S2
    end

    subgraph AGENT ["2 — Wire Up Agent"]
        direction TB
        S3["<b>③ Schema Manager</b><br/><i>agent.py</i><br/>A2uiSchemaManager<br/>+ CatalogConfig<br/>+ schema_modifiers"]
        S4["<b>④ System Prompt</b><br/><i>agent.py</i><br/>generate_system_<br/>prompt()"]
        S5["<b>⑤ Toolset</b><br/><i>agent.py</i><br/>SendA2uiToClient<br/>Toolset"]
        S3 --> S4 --> S5
    end

    subgraph RUNTIME ["3 — Runtime + Render"]
        direction TB
        S6["<b>⑥ Executor</b><br/><i>agent_executor.py</i><br/>try_activate_a2ui<br/>_extension()<br/>→ session state<br/>via Event"]
        S7["<b>⑦ Frontend</b><br/><i>frontend/src/*.ts</i><br/>componentRegistry<br/>.register()"]
        S6 --> S7
    end

    CATALOG --> AGENT --> RUNTIME

    style CATALOG fill:#E8F0FE,stroke:#4285F4,stroke-width:2px,color:#1a73e8
    style AGENT fill:#E6F4EA,stroke:#34A853,stroke-width:2px,color:#1e8e3e
    style RUNTIME fill:#FEF7E0,stroke:#F9AB00,stroke-width:2px,color:#E37400
```

### A2UI Request Lifecycle

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#E8F0FE"
    primaryTextColor: "#1a73e8"
    primaryBorderColor: "#4285F4"
    secondaryColor: "#E6F4EA"
    secondaryTextColor: "#1e8e3e"
    secondaryBorderColor: "#34A853"
    tertiaryColor: "#FEF7E0"
    tertiaryTextColor: "#E37400"
    tertiaryBorderColor: "#F9AB00"
    lineColor: "#5f6368"
    fontSize: 14px
---
flowchart TD
    A["📦 Init <i>(server startup)</i><br/><i>agent.py</i> — Load CatalogConfig<br/>+ A2uiSchemaManager"]

    A -->|"pre-loaded"| B

    subgraph REQUEST ["Per-Request Flow"]
        direction LR
        U(("👤 User<br/><i>Browser</i>")) -->|"message +<br/>X-A2A-Extensions"| B

        B["🤝 Handshake<br/><i>agent_executor.py</i><br/>Detect X-A2A-Extensions<br/>→ Load catalog & examples"] -->|enabled| C

        C["🔧 Execute<br/><i>tools.py</i>→ find_restaurants()"] --> D

        D["✅ Validate & Send<br/><i>Schema Manager</i><br/>Build components<br/>→ Validate → DataPart"] -->|"A2UI JSON<br/>DataParts"| R

        R["🖥️ Render<br/><i>A2UI Renderer</i><br/>→ Rich UI"] --> U
    end

    style A fill:#E8F0FE,stroke:#4285F4,stroke-width:2px,color:#1a73e8
    style U fill:#4285F4,stroke:#1a73e8,color:#fff
    style B fill:#E6F4EA,stroke:#34A853,stroke-width:2px,color:#1e8e3e
    style C fill:#FEF7E0,stroke:#F9AB00,stroke-width:2px,color:#E37400
    style D fill:#FCE8E6,stroke:#EA4335,stroke-width:2px,color:#C5221F
    style R fill:#E8F0FE,stroke:#4285F4,stroke-width:2px,color:#1a73e8
    style REQUEST fill:none,stroke:#5f6368,stroke-width:1px,stroke-dasharray:5 5
```

> **Example**: *"Find Mexican restaurants in Downtown LA"*
> 1. **Handshake** — `agent_executor.py` validates `X-A2A-Extensions` header from the client
> 2. **Schema Manager** — Loads `restaurant_finder_catalog_definition.json` (components: `GoogleMap`, `Text`, ...) and example templates (`restaurant_selection.json`)
> 3. **Tool Execution** — LLM calls `find_restaurants("Mexican restaurants Downtown LA")`
> 4. **Validate & Send** — Agent builds layout (`Column` > `List` > `Card`), Schema Manager validates structure, sends as `DataPart`

### Detailed Steps


#### Step 1. Define Your Catalog

Create a catalog JSON with a `catalogId` and a `components` map. Each component uses the v0.9 discriminator pattern (a literal `component` const), and properties reference shared types from `common_types.json`:

```json
{
  "catalogId": "https://example.com/my_catalog.json",
  "components": {
    "MyWidget": {
      "type": "object",
      "allOf": [
        { "$ref": "common_types.json#/$defs/ComponentCommon" },
        {
          "type": "object",
          "properties": {
            "component": { "const": "MyWidget" },
            "title": { "$ref": "common_types.json#/$defs/DynamicString" }
          },
          "required": ["component", "title"]
        }
      ],
      "unevaluatedProperties": false
    }
  }
}
```

#### Step 2. Create Examples

Create one JSON file per UI pattern (e.g. `list.json`, `detail.json`). Each file is an array of A2UI v0.9 messages showing a complete render:

```
createSurface -> updateComponents -> updateDataModel
```

These examples are injected into the agent's system prompt to teach the LLM the correct output format.

#### Step 3. Register Catalog in the Schema Manager

```python
from a2ui.core.schema.manager import A2uiSchemaManager, CatalogConfig
from a2ui.core.schema.common_modifiers import remove_strict_validation
from a2ui.basic_catalog.provider import BasicCatalog

schema_manager = A2uiSchemaManager(
    version="0.9",
    catalogs=[
        CatalogConfig.from_path(
            name="my_catalog",
            catalog_path="catalog_schemas/0.9/my_catalog_definition.json",
            examples_path="examples/my_catalog/0.9",
        ),
        BasicCatalog.get_config(version="0.9"),
    ],
    accepts_inline_catalogs=True,
    schema_modifiers=[remove_strict_validation],
)
```

> **v0.9 gotcha — catalog must be self-contained for validation.**
> The v0.9 server-to-client schema validates components against
> `catalog.json#/$defs/anyComponent`. When `_select_catalog()` runs without
> client capabilities (e.g. during startup-time example validation), it returns
> `supported_catalogs[0]` *standalone* — the bundled `BasicCatalog` is not
> auto-merged in. So if your custom catalog only declares
> `WebFrameUrl`/`GoogleMap` and your examples reference `Text`/`Column`/etc.,
> validation will fail with `'/$defs/anyComponent' does not exist`.
>
> This repo solves it with a small `_MergedBasicCatalogProvider` in
> `app/agent.py` that loads the bundled `basic_catalog.json` and injects the
> custom components into both `components` and `$defs.anyComponent.oneOf`
> before returning. The result: one self-sufficient catalog that knows
> about every component the agent can emit.

#### Step 4. Generate the System Prompt

```python
instruction = schema_manager.generate_system_prompt(
    role_description="You are a helpful assistant...",
    workflow_description="1. Analyze the request...",
    ui_description="Use Card for detail views...",
    include_schema=False,
    include_examples=False,  # examples loaded dynamically via session
    validate_examples=False,
)
```

#### Step 5. Attach the Toolset to Your Agent

```python
from a2ui.adk.a2a_extension.send_a2ui_to_client_toolset import SendA2uiToClientToolset

LlmAgent(
    model=model,
    instruction=instruction,
    tools=[
        SendA2uiToClientToolset(
            a2ui_enabled=lambda ctx: ctx.state.get("system:a2ui_enabled", False),
            a2ui_catalog=lambda ctx: ctx.state.get("system:a2ui_catalog"),
            a2ui_examples=lambda ctx: ctx.state.get("system:a2ui_examples"),
        ),
        # ... your domain tools
    ],
)
```

#### Step 6. Activate A2UI in the Executor

In `AgentExecutor._prepare_session()`, detect client support and write catalog + examples into session state:

```python
from a2ui.a2a import try_activate_a2ui_extension
from google.adk.agents.invocation_context import new_invocation_context_id
from google.adk.events.event import Event
from google.adk.events.event_actions import EventActions

active_version = try_activate_a2ui_extension(context, agent_card)
if active_version:
    schema_manager = agent.get_schema_manager(active_version)
    catalog = schema_manager.get_selected_catalog(client_ui_capabilities=capabilities)
    examples = schema_manager.load_examples(catalog, validate=True)

    await runner.session_service.append_event(
        session,
        Event(
            invocation_id=new_invocation_context_id(),
            author="system",
            actions=EventActions(
                state_delta={
                    "system:a2ui_enabled": True,
                    "system:a2ui_catalog": catalog,
                    "system:a2ui_examples": examples,
                }
            ),
        ),
    )
```

#### Step 7. Register Custom Components in the Frontend

Build a `Catalog` and pass it to `MessageProcessor`. Each custom component pairs a Zod schema (its API contract) with a Lit element that renders it:

```typescript
import { Catalog } from "@a2ui/web_core/v0_9";
import { basicCatalog, type LitComponentApi } from "@a2ui/lit/v0_9";
import { z } from "zod";

const WebFrameUrlSchema = z.object({ url: z.union([z.string(), z.object({ path: z.string() })]) });
const WebFrameUrlApi = { name: "WebFrameUrl", schema: WebFrameUrlSchema };

// (Lit element implementation: extend A2uiLitElement<typeof WebFrameUrlApi>,
// register it via @customElement("a2ui-restaurant-webframeurl"), and read
// resolved props from this.controller.props.)

export const WebFrameUrl: LitComponentApi = {
  ...WebFrameUrlApi,
  tagName: "a2ui-restaurant-webframeurl",
};

// Mirror the backend merge: the agent emits createSurface with the custom
// catalogId, so the surface's catalog must resolve every component the
// agent might use — basic AND custom.
export const customCatalog = new Catalog<LitComponentApi>(
  CATALOG_ID,
  [...basicCatalog.components.values(), WebFrameUrl, GoogleMap],
  [...basicCatalog.functions.values()],
);

// In app.ts:
new v0_9.MessageProcessor<LitComponentApi>([basicCatalog, customCatalog], actionHandler);
```

> **Frontend mirror of the backend merge.** Because `_MergedBasicCatalogProvider`
> stamps the merged catalog with the *custom* `catalogId`, the frontend
> `customCatalog` must also include the basic components. Otherwise
> `createSurface` resolves to a catalog that only knows `WebFrameUrl`/`GoogleMap`
> and basic components like `Text`/`Column` render as `nothing`.

---

## Project Structure

```
agent-a2ui-demo/
├── app/
│   ├── main.py                          # Entry point, A2A server, maps proxy
│   ├── agent.py                         # Agent definition, system prompt, tools
│   ├── agent_executor.py                # A2A executor, A2UI session setup
│   ├── tools.py                         # find_restaurants, get_directions
│   ├── sub_agents.py                    # search_agent (Google Search grounding)
│   ├── prompts.py                       # Restaurant search instructions
│   ├── config.py                        # Environment config (GCP, model, keys)
│   ├── session_keys.py                  # A2UI session state key constants
│   ├── a2ui_examples.py                 # Inline A2UI examples (RESTAURANT_SELECTION_EXAMPLES)
│   ├── a2ui_schema.py                   # A2UI v0.9 JSON schema definition
│   ├── deploy.sh                        # Manual deployment script
│   ├── app_utils/
│   │   ├── telemetry.py                 # OpenTelemetry / tracing setup
│   │   └── typing.py                    # Shared type definitions
│   ├── catalog_schemas/
│   │   ├── 0.8/
│   │   │   └── restaurant_finder_catalog_definition.json   # Custom v0.8 catalog (GE)
│   │   └── 0.9/
│   │       └── restaurant_finder_catalog_definition.json   # Custom v0.9 catalog (Lit shell)
│   └── examples/
│       └── restaurant_finder_catalog/
│           ├── 0.8/
│           │   ├── restaurant_selection.json   # v0.8 List of restaurant cards
│           │   ├── map.json                    # v0.8 Map embed view
│           │   └── directions.json             # v0.8 Directions with iframe + link
│           └── 0.9/
│               ├── restaurant_selection.json   # v0.9 List of restaurant cards
│               ├── map.json                    # v0.9 Map embed view
│               └── directions.json             # v0.9 Directions with iframe + link
├── frontend/
│   ├── src/
│   │   ├── app.ts                       # A2UI shell (chat UI, surface renderer)
│   │   ├── client.ts                    # A2A JSON-RPC client with A2UI extension
│   │   ├── google-map-component.ts      # Custom GoogleMap + WebFrameUrl components
│   │   ├── iframe-component.ts          # Older/alternative GoogleMap component
│   │   └── test-standalone.ts           # Test harness
│   ├── index.html
│   └── package.json                     # @a2ui/lit, @a2a-js/sdk, lit
├── lit_internal/                         # GE-internal GoogleMap component
│   └── src/v0_9/ui/custom_components/
│       └── google_map/
│           ├── google_map.ts
│           └── index.ts
├── tests/
├── pyproject.toml                       # a2ui-agent-sdk, google-adk, a2a-sdk
└── Makefile
```

---

## Key Dependencies

**Backend (Python):**

| Package | Purpose |
|---|---|
| `a2ui-agent-sdk` | A2UI protocol library (schema manager, toolset, validation) |
| `google-adk` | Google Agent Development Kit (LlmAgent, Runner, tools) |
| `a2a-sdk` | A2A protocol server (request handling, task store) |

**Frontend (TypeScript):**

| Package | Purpose |
|---|---|
| `@a2ui/lit` | A2UI renderer for Lit web components |
| `@a2a-js/sdk` | A2A JSON-RPC client (listed in package.json but unused; `client.ts` uses raw `fetch()`) |
| `lit` | Web components framework |
