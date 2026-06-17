# 📋 A2UI Response Enrichment & Thinking-Progress Implementation

This document covers two related pieces of work that together make pipeline
queries (e.g. *"what portion of call pipeline has won?"*) feel premium across
both the **Custom UI** and the **Gemini Enterprise (GE) UI**:

1. **Response enrichment** — returning rich interactive A2UI components (KPI
   counters, Vega-Lite donut charts, insight cards) for the answer itself.
2. **Real-time thinking steps & tool-call progress** — a live "Thinking"
   widget that narrates the agent's reasoning step by step, with each step's
   tool calls and a **per-step progress bar** nested beneath it.

> Status: Phase 1 (template) and Phase 2 (route + thinking/progress widget) are
> implemented. Phase 2's thinking widget is documented in detail below and is
> implemented in `_MapsKeyEventConverter._enrich_with_progress()` in
> `app/agent_executor.py`. The older `_tool_progress_messages()` helpers are
> retained for compatibility with historical A2UI progress-surface messages,
> but current progress requests use compact metadata on streamed text parts.

---

## 🔍 Context & Architecture

Because A2UI is a **declarative, framework-agnostic protocol**, the frontend
rendering layers (both the Custom Lit Web Components and the built-in GE UI
renderer) automatically know how to draw standard A2UI catalog items once
received. The **response enrichment** therefore needs **no client-side
changes** — it is confined to the backend agent.

The **thinking/progress widget** is driven by backend progress metadata. The
custom UI renders that metadata with native Lit markup, while Gemini Enterprise
uses text-only progress status messages in its native thinking panel. Historical
A2UI progress-surface support remains in the frontend as a compatibility path,
but it is not the current hot path.

```mermaid
flowchart TD
    User(["👤 User Query"]) -->|"what portion of call pipeline has won?"| Agent["🤖 Backend Agent"]

    subgraph Backend ["Agent Logic (LangGraph)"]
        Agent --> Route{"Short-Circuit Trigger?"}
        Route -->|Yes| Template["Load Q2 2026 A2UI Template"]
        Route -->|No| LLM["LLM Generates A2UI via send_a2ui_json_to_client_tool"]
    end

    Template & LLM -->|"A2UI v0.8 Payload"| Outputs["A2A Message Parts"]

    Outputs -->|"application/json+a2ui"| CustomUI["🖥️ Custom UI (@a2ui/lit)"]
    Outputs -->|"application/json+a2ui"| GEUI["☁️ Gemini Enterprise UI (Native)"]

    style CustomUI fill:#e8f0fe,stroke:#4285f4,stroke-width:2px
    style GEUI fill:#e6f4ea,stroke:#34a853,stroke-width:2px
```

---

## 🛠️ Phase 1: A2UI Template Configuration

A dedicated template represents the Q2 2026 call pipeline conversion status.

1. **File Creation**: Save the file (repo-relative) as
   `app/examples/a2ui_demo_catalog/0.8/dashboard_q2_2026_call_pipeline.json`.
2. **Components Tree**:
   * **Root Column**: Lays out the sections vertically.
   * **Header Card**: Title `"Q2 2026 Call Pipeline Status"` and subtitle
     `"Breakdown of Won vs. Remaining Pipeline Value"`.
   * **KPI Row**: Two side-by-side cards showing the key metrics:
     * **Won**: `39.6%`
     * **Remaining**: `60.4%`
   * **Chart Card**: A `VegaChart` component holding the Vega-Lite donut spec.
   * **Insight Card**: Encapsulates the natural-language summary.

### A2UI JSON Blueprint Specification
```json
[
  {
    "beginRendering": {
      "surfaceId": "call-pipeline-conversion-widget",
      "root": "root"
    }
  },
  {
    "surfaceUpdate": {
      "surfaceId": "call-pipeline-conversion-widget",
      "components": [
        {
          "id": "root",
          "component": {
            "Column": {
              "children": {
                "explicitList": [
                  "header-card",
                  "kpi-row",
                  "chart-card",
                  "insight-card"
                ]
              },
              "alignment": "stretch"
            }
          }
        },
        {
          "id": "header-card",
          "component": {
            "Card": { "child": "header-col" }
          }
        },
        {
          "id": "header-col",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["title", "subtitle"]
              },
              "alignment": "start"
            }
          }
        },
        {
          "id": "title",
          "component": {
            "Text": {
              "text": { "literalString": "Q2 2026 Call Pipeline Status" },
              "usageHint": "h2"
            }
          }
        },
        {
          "id": "subtitle",
          "component": {
            "Text": {
              "text": { "literalString": "Breakdown of Won vs. Remaining Pipeline Value" },
              "usageHint": "caption"
            }
          }
        },
        {
          "id": "kpi-row",
          "component": {
            "Row": {
              "children": {
                "explicitList": ["kpi-won", "kpi-remain"]
              },
              "distribution": "spaceBetween"
            }
          }
        },
        {
          "id": "kpi-won",
          "component": {
            "Card": { "child": "kpi-won-col" }
          }
        },
        {
          "id": "kpi-won-col",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["kpi-won-label", "kpi-won-value"]
              }
            }
          }
        },
        {
          "id": "kpi-won-label",
          "component": {
            "Text": {
              "text": { "literalString": "Pipeline Won" },
              "usageHint": "caption"
            }
          }
        },
        {
          "id": "kpi-won-value",
          "component": {
            "Text": {
              "text": { "literalString": "39.6%" },
              "usageHint": "h1"
            }
          }
        },
        {
          "id": "kpi-remain",
          "component": {
            "Card": { "child": "kpi-remain-col" }
          }
        },
        {
          "id": "kpi-remain-col",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["kpi-remain-label", "kpi-remain-value"]
              }
            }
          }
        },
        {
          "id": "kpi-remain-label",
          "component": {
            "Text": {
              "text": { "literalString": "Remaining" },
              "usageHint": "caption"
            }
          }
        },
        {
          "id": "kpi-remain-value",
          "component": {
            "Text": {
              "text": { "literalString": "60.4%" },
              "usageHint": "h1"
            }
          }
        },
        {
          "id": "chart-card",
          "component": {
            "Card": { "child": "donut-chart" }
          }
        },
        {
          "id": "donut-chart",
          "component": {
            "VegaChart": {
              "spec": {
                "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                "data": {
                  "values": [
                    { "label": "Won", "value": 39.6 },
                    { "label": "Remaining", "value": 60.4 }
                  ]
                },
                "mark": { "type": "arc", "innerRadius": 50, "outerRadius": 80 },
                "encoding": {
                  "theta": { "field": "value", "type": "quantitative" },
                  "color": {
                    "field": "label",
                    "type": "nominal",
                    "scale": {
                      "domain": ["Won", "Remaining"],
                      "range": ["#34A853", "#a8a8a8"]
                    }
                  }
                }
              }
            }
          }
        },
        {
          "id": "insight-card",
          "component": {
            "Card": { "child": "insight-text" }
          }
        },
        {
          "id": "insight-text",
          "component": {
            "Text": {
              "text": {
                "literalString": "According to AskEPM, approximately 39.6% of the call pipeline value for Q2 2026 has been won, leaving 60.4% remaining to close."
              },
              "usageHint": "body"
            }
          }
        }
      ]
    }
  }
]
```

---

## 🛠️ Phase 2: Backend Route & Real-Time Thinking / Progress

### 2.1 Route Trigger Registration
Open `app/agent.py` and update the `_TRIGGERS` dictionary mapping query text to
the new template path:
```diff
 _TRIGGERS = {
     ...
     "which ut15s are underperforming against their saas budget": "dashboard_ut15_and_regional_cq.json",
     "cq performance by region": "dashboard_ut15_and_regional_cq.json",
-    "what portion of call pipeline has won": "dashboard_call_pipeline_conversion.json",
-    "call pipeline conversion": "dashboard_call_pipeline_conversion.json",
+    "what portion of call pipeline has won": "dashboard_q2_2026_call_pipeline.json",
+    "what portion of call pipeline has won?": "dashboard_q2_2026_call_pipeline.json",
+    "call pipeline conversion": "dashboard_q2_2026_call_pipeline.json",
 }
```

### 2.2 Thinking Steps & Tool-Call Progress Widget

> The original plan emitted plain-string `update_status(message="...")` stages.
> The implemented design is richer: the backend emits structured progress
> metadata, the custom UI renders an ordered checklist with per-step bars, and
> GE receives a chronological text log such as `5% -> 50% -> 100%`.

The agent surfaces its reasoning as a live **"Thinking" widget** — an ordered
checklist of thinking steps, with the tool calls each step issued nested
beneath it and a per-step progress bar that tracks tool-call completion.

For the custom UI, each progress update is a tagged A2A `TextPart` whose
metadata contains `a2uiProgressSteps`. For GE and other non-opt-in clients, the
same state is converted into a single-line native status message.

#### At a glance

```
Thinking
Complete

✓ Checking security & permissions
    Verified user is authorized for the AskIBM sales workspace...

✓ Loaded precompiled dashboard
    Matched a saved template and returned its A2UI blueprint.
    ↳ ✓ Render dashboard UI
    Tool calls · 1/1
    ████████████████████  100%
```

Each step that issued tool calls gets its **own** bar directly beneath its
tool list. Steps with no tools (e.g. the security gate) get no bar.

#### Data model

Progress is driven by an ordered list of `steps`, built up as ADK function
call and function response events stream through the A2A converter. Each step
is a plain dict:

```python
{
    "title": str,  # short headline, e.g. "Loaded precompiled dashboard"
    "detail": str,  # one-line explanation shown as caption
    "state": str,  # "pending" | "active" | "done" | "failed"
    "tools": [{"name": str, "state": "running" | "done" | "failed"}, ...],  # tool calls this step issued
}
```

- **Thinking steps** narrate the process; their state drives the step glyph and
  the subtitle.
- **Tool calls** are the only thing the progress bars count — thinking steps
  themselves never move a bar.

#### Glyphs (pure Unicode, no icon font)

| Kind | State    | Glyph |
|------|----------|-------|
| Step | done     | `✓`   |
| Step | active   | `▸`   |
| Step | pending  | `○`   |
| Step | failed   | `✗`   |
| Tool | running  | `•`   |
| Tool | done     | `✓`   |
| Tool | failed   | `✗`   |

The bar itself is built from Unicode block elements (`█` filled, `░` empty,
`▓` for the failed variant), which share an advance width even in proportional
fonts, so a single A2UI `Text` component renders as a bar — no custom element
or chart re-embed required.

#### Visual nesting (why indentation, not Card chrome)

The legacy A2UI progress-surface renderer uses an **empty theme**
(`EMPTY_THEME` in `frontend/src/app.ts`, e.g. `Card: {}`), so `Card` draws no
border/background and `Column` adds no indentation — every component stacks as
a plain block. Wrapping each step in a `Card` is therefore semantically correct
but produces **no visible grouping** on its own.

To make a step's sub-lines (detail, tool calls, progress bar) read as nested
*under* its title, each sub-line is prefixed with `_INDENT` — four
**non-breaking spaces** (` `). NBSP is required because `Text` renders
through markdown: ordinary leading spaces collapse, and four ordinary leading
spaces would be parsed as a code block. NBSP survives in both the custom UI and
the GE native renderer with no theme/CSS dependency, consistent with the
widget's pure-text design.

```
✓ Loaded precompiled dashboard
    Matched a saved template and returned its A2UI blueprint.
    ↳ ✓ Render dashboard UI
    Tool calls · 1/1
    ████████████████████  100%
```

#### Key functions (`app/agent_executor.py`)

| Function | Responsibility |
|----------|----------------|
| `_progress_bar_text(pct, *, failed=False)` | Render the 20-cell text bar, e.g. `██████░░░░░░░░░░  30%`. Clamps to 0–100. |
| `_prettify_tool(name)` | Map a tool name to a friendly label (`send_a2ui_json_to_client_tool` → `Render dashboard UI`), falling back to a humanized name. |
| `_tool_progress(steps)` | Cross-step `(done, total, pct)` aggregate. Retained for reuse/testing; not used by the widget after the move to per-step bars. |
| `_public_progress_steps(steps)` | Convert internal backend steps into compact metadata consumed by the custom UI. |
| `_get_single_line_progress(steps, *, done, failed)` | Convert the same state into the native text line used by GE, for example `▸ Compiling dashboard... (50%)`. |
| `_MapsKeyEventConverter._advance_steps(event, steps)` | Update progress state from ADK function calls, function responses, and final text events. |
| `_MapsKeyEventConverter._enrich_with_progress(...)` | Inject progress into converted A2A events as either tagged metadata parts or native text progress. |
| `_tool_progress_messages(surface_id, steps, *, include_begin, done, failed)` | Legacy A2UI progress-surface builder retained for compatibility parsing and tests. |

#### Legacy widget structure emitted by `_tool_progress_messages`

The current opt-in path does not emit this surface, but the compatibility
helpers still build this shape and the frontend can still parse historical
`tool-progress-*` surfaces.

```
Card  progress-root
└─ Column  progress-col (alignment: stretch)
   ├─ Text  th-title       "Thinking"            (h3)
   ├─ Text  th-subtitle    active step / state   (caption)
   └─ per step idx:
       Card  th-step-card-{idx}
       └─ Column  th-step-col-{idx} (alignment: stretch)
          ├─ Text  th-step-{idx}          "<glyph> <title>"   (body)
          ├─ Text  th-detail-{idx}        detail              (caption, if any)
          ├─ per tool jdx:
          │   └─ Text th-tool-{idx}-{jdx} "↳ <glyph> <label>" (caption)
          └─ if step has tools:
              ├─ Text th-toolbar-label-{idx}  "Tool calls · done/total" (caption)
              └─ Text th-toolbar-{idx}        progress bar              (body)
```

The subtitle reads `Failed` / `Complete` / the active step title / `Working`,
depending on the `failed` / `done` flags and step states. Sub-lines (detail,
tool, label, bar) are prefixed with `_INDENT`.

#### Per-step bar semantics

For each step that issued tool calls:

- `step_done` = count of that step's tools in state `done`.
- `step_pct` = `round(step_done / len(tools) * 100)`.
- `step_failed` = the global `failed` flag **or** any tool in the step is
  `failed` → renders the bar with the `▓` glyph.

This replaced the earlier design that showed a single aggregate bar at the
bottom of the widget.

#### Lifecycle (converter flow)

The ADK executor streams events, and `_MapsKeyEventConverter` post-processes
each converted A2A event batch:

1. **Request start** — the custom UI immediately shows a local
   "Understanding request" step at `5%` so the panel is not blank.
2. **Tool call** — `_advance_steps()` marks the previous active step done,
   appends the tool step as active, and pre-announces short known follow-up
   steps such as `Compiling dashboard` as pending.
3. **Tool response** — matching running tools are marked done. The top-level
   percent uses aggregate tool completion when tools are known, so a two-tool
   restaurant request moves from `5%` while search is running to `50%` after
   search completes.
4. **Final response** — remaining active tools are resolved and the UI holds
   the final visible step briefly before showing the result, so `100%` is
   painted instead of being skipped.
5. **Failure** — active steps and running tools flip to `failed`, and the task
   is marked failed with an error message part.

#### GE vs Custom UI — avoiding duplicate thinking windows

Each `working` status update can carry a **`TextPart`**. The two clients
consume that text differently:

| Client | Progress handling |
|--------|-------------------|
| Custom UI | tagged `TextPart` metadata drives the Lit-rendered live panel |
| GE | untagged text progress renders in the native append-only thinking panel |

GE's native panel **accumulates** every status message (each `working` update
is shown as its own thought). It cannot dynamically update an in-place progress
bar inside the thinking panel. Re-emitting an evolving checklist block per tick
would therefore stack duplicate, growing snapshots. We avoid that with client
routing plus a transition-based single-line text progress strategy:

- The public agent card advertises `capabilities.streaming: false`, so GE
  should use `message/send` plus `tasks/get` polling rather than
  `message/stream`.
- During polling, GE reads `task.status.state`. While the state is not
  completed, GE displays `task.status.message` in the Thinking tab. When the
  task becomes completed, GE renders `task.artifacts` as the output.
- The custom UI tags its A2A message with `metadata: { a2uiProgress: true }`
  (`frontend/src/client.ts`).
- The executor stores the opt-in in `session.state[PROGRESS_OPT_IN_KEY]`.
- `_enrich_with_progress(...)`:
  - **custom UI** → tagged `TextPart` metadata with `a2uiProgressSteps`; the Lit
    shell renders the live panel itself.
  - **GE / other** → text-only, formatting each stage as a single-line status
    message with its respective progress percentage:
    * *In-progress steps:* `▸ [Step Title]... ([Percentage]%)`
    * *Completion state:* `✓ Complete (100%)`
    * *Failure state:* `✗ Failed`
- **Monotonicity & Deduplication:** To ensure the append-only panel displays clean progress, the converter tracks:
  1. `last_native_pct` to clamp progress percentages monotonically upward (e.g. preventing a regression from 70% to 50% in loops).
  2. `last_emitted_text` to deduplicate sequential logs in the event of repeated node executions.
- **Fast final events:** ADK can coalesce a tool response and final text into
  one event. When that happens, native progress transitions are inserted as
  separate `working` status events so `50%` and `100%` do not share one message.
- **Native polling heartbeats:** For GE/non-opt-in requests, the executor emits
  periodic `TaskStatusUpdateEvent(state=working, message=...)` updates while a
  tool is running. Those updates become the `task.status.message` value returned
  by `tasks/get`, so GE can show append-only milestones such as `5%`, `25%`,
  `40%`, `50%`, `60%`, and then completion depending on its polling cadence.
- **Final hold for polling:** Before emitting the completed task and artifacts,
  GE/non-opt-in requests hold the last working status briefly so a polling
  client has time to observe `task.status.message` in the Thinking tab.

Result: the custom UI keeps its live in-place widget; GE shows a clean,
chronological append-only log of thoughts:

```
[System spinner: Thinking...]
▸ Searching for restaurants... (5%)
▸ Compiling dashboard... (50%)
✓ Complete (100%)
```

#### Frontend integration

- **`frontend/src/client.ts`** — `send()` uses non-blocking `message/send` plus
  `tasks/get` polling by default. It treats tagged progress text as stage
  metadata and passes it to `onStage(text, progressSteps)`. A2UI data parts are
  still parsed separately for answer surfaces.
- **`frontend/src/app.ts`** — `sendAndProcess()` queues progress-stage paints
  with a short minimum visibility window. This prevents tightly coalesced
  backend events from painting only the final value. `renderProgressPanel()`
  shows the live panel during the request and the finished message stores the
  final `progressSteps` for the collapsible reasoning details.

#### Tests

`tests/unit/agent_executor_test.py` covers:

- `_progress_bar_text` — empty/full, clamping/rounding, failed glyph.
- `_tool_progress` — counts only tool calls; zero when there are no tools.
- `_tool_progress_messages` — `beginRendering` only when requested, step/tool
  glyphs, per-step bar counts (a step with no tools emits no bar; a step with a
  running tool shows `Tool calls · 0/1`; a completed step shows `1/1` at 100%),
  NBSP-indented sub-lines, and subtitle states.
- coalesced final progress — preserves the intermediate `50%` milestone before
  `100%` and keeps those native updates in separate `working` events.
- opt-in metadata progress — confirms custom UI clients receive the
  intermediate metadata milestone when a final event is coalesced.

---

## 🛠️ Phase 3: Verification & Testing

### 1. Local Sandbox Testing (Custom UI)
* Spin up the local web application server:
  ```bash
  npm run dev
  ```
* Input the query `"what portion of call pipeline has won?"` into the chat
  input field.
* **Progressive Verification**: Verify the Thinking widget updates in place as
  the backend executes — the top-level percent paints `5%`, then `50%` for the
  restaurant/dashboard two-tool path, then `100%`; steps flip from active to
  done, tool calls appear nested under their step, and the per-step bar fills
  to `100%`.
* Verify the answer A2UI surface is correctly instantiated and the Vega chart
  draws without layout shifting or console errors.
* **Restart note**: restart the backend after changing
  `_MapsKeyEventConverter` or progress metadata shape so the new polling
  behavior is served.

### 2. Gemini Enterprise (GE) Integration Sandbox
* Synchronize the new agent metadata and capabilities configuration with Google
  Cloud:
  ```bash
  make register-gemini-enterprise
  ```
* Access the AskIBM workspace inside the GE portal.
* Verify the native GE collapsible reasoning panel shows chronological progress
  lines in real time, including the intermediate `50%` milestone before
  `✓ Complete (100%)`.
