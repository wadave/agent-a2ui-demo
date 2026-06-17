# Progress Bar Implementation

This document describes how the thinking steps and progress bars are wired in
the A2UI demo.

The active implementation is intentionally split into two responsibilities:

- Backend progress state is emitted as compact metadata on A2A text parts.
- The custom Lit frontend owns the visual progress bars and linear animation.
- Gemini Enterprise's native thinking panel is append-only. It cannot
  dynamically update an in-place progress bar, so GE receives chronological
  text progress lines such as `5%`, `50%`, then `100%`.
- The public agent card advertises `capabilities.streaming: false`, so GE
  should use `message/send` plus `tasks/get` polling rather than
  `message/stream`.
- While a polled GE task is not completed, GE displays `task.status.message`
  in the Thinking tab. Once the task is completed, GE renders `task.artifacts`
  as the output.

This avoids asking the model to render progress UI, and it avoids sending extra
A2UI progress surfaces during the hot path.

There is also a compatibility parser for older A2UI progress-surface messages.
That path is still wired in the frontend so historical `tool-progress-*`
surfaces do not render as final answer content, but current opt-in progress
requests should use the metadata path described below.

## End-To-End Flow

1. The frontend sends the user message with progress opt-in metadata. The
   custom Lit shell uses non-blocking `message/send` and polls `tasks/get`.

   File: `frontend/src/client.ts`

   ```ts
   metadata: { a2uiProgress: true }
   ```

2. The backend stores that opt-in on the ADK session.

   File: `app/agent_executor.py`

   ```py
   session.state[PROGRESS_OPT_IN_KEY] = bool((context.message.metadata or {}).get("a2uiProgress") if context.message else False)
   ```

3. The custom A2A event converter watches ADK events. It detects tool calls,
   tool responses, and final text events, then converts those into progress
   steps.

   Main class: `_MapsKeyEventConverter`

4. For each progress update, the backend appends a `TextPart` with metadata:

   ```json
   {
     "a2uiProgressStage": true,
     "a2uiProgressSteps": [
       {
         "title": "Searching for restaurants",
         "detail": "Calling Google Maps to find restaurants near the requested location.",
         "state": "active",
         "tools": [
           { "label": "Search for restaurants", "state": "running" }
         ],
         "completedTools": 0,
         "totalTools": 1
       }
     ]
   }
   ```

5. The frontend polling client treats those tagged text parts as progress
   events, not answer text. It calls `onStage(text, progressSteps)`.

6. The Lit app stores `progressSteps`, renders the thinking panel, and computes
   the overall progress percentage from aggregate tool completion when possible,
   falling back to weighted step progress when no tools are known.

Current opt-in requests do not send a separate A2UI progress surface. Normal
answer surfaces still arrive as A2UI data parts, but progress state itself is
carried by the metadata fields above.

## Backend Pieces

### Constants

File: `app/agent_executor.py`

```py
PROGRESS_OPT_IN_KEY = "system:a2ui_progress"
PROGRESS_STAGE_META = "a2uiProgressStage"
PROGRESS_STEPS_META = "a2uiProgressSteps"
```

`PROGRESS_OPT_IN_KEY` is internal backend session state. The other two strings
are the wire protocol between backend and frontend.

### Tool Labels And Step Titles

Tool names are mapped into user-facing labels with `_TOOL_LABELS`.

```py
_TOOL_LABELS = {
    "find_restaurants": "Search for restaurants",
    "send_a2ui_json_to_client": "Render dashboard UI",
    # ...
}
```

Step titles and details are defined by `_TOOL_STEP_TITLES`.

```py
_TOOL_STEP_TITLES = {
    "find_restaurants": (
        "Searching for restaurants",
        "Calling Google Maps to find restaurants near the requested location.",
    ),
    "send_a2ui_json_to_client": (
        "Compiling dashboard",
        "Generating the A2UI surface for your answer.",
    ),
}
```

These are the names shown in the frontend panel.

### Progress State Shape

The backend stores progress per ADK invocation id:

```py
self._progress[invocation_id] = {
    "steps": [],
    "surface_id": "...",
    "begin_sent": False,
}
```

Each internal step looks like this:

```py
{
    "title": "Searching for restaurants",
    "detail": "Calling Google Maps to find restaurants near the requested location.",
    "state": "active",  # pending, active, done, failed
    "call_key": ("tool-call-id",),
    "tools": [
        {
            "name": "find_restaurants",
            "id": "tool-call-id",
            "state": "running",  # pending, running, done, failed
        }
    ],
}
```

Before sending to the frontend, `_public_progress_steps()` removes internal
fields like `call_key`, converts tool names to labels, and adds
`completedTools` / `totalTools`.

### Event Conversion

The key method is `_MapsKeyEventConverter._advance_steps()`.

It inspects every ADK event part:

- `function_call`: starts or reactivates a step.
- `function_response`: marks matching tools as done.
- final text response: marks any remaining active tool as done.

Tool response matching prefers tool call ids, then falls back to tool names.
This matters because ADK/A2A streams can replay events or omit ids in some
shapes.

Duplicate streamed tool-call events are deduped by `call_key`:

```py
call_key = tuple(c.get("id") or f"name:{c['name']}" for c in function_calls)
if any(step.get("call_key") == call_key for step in steps):
    return stage
```

### Pre-Announcing The Dashboard Step

The restaurant search is slow, while the dashboard render step is now very
fast. Without pre-announcing it, the dashboard step can appear active for only
a few milliseconds and the browser may never paint it.

When `find_restaurants` starts, `_append_pending_dashboard_step()` adds:

```py
{
    "title": "Compiling dashboard",
    "state": "pending",
    "tools": [
        {
            "name": "send_a2ui_json_to_client",
            "state": "pending",
        }
    ],
}
```

Later, when the deterministic restaurant dashboard calls
`send_a2ui_json_to_client`, `_advance_steps()` reuses that existing pending
step and marks it active/running. When the tool response arrives, it marks it
done.

### Initial Understanding Step

The frontend shows an immediate local "Understanding request" step so the UI is
not blank before the first backend model event arrives. The backend also emits
the same step in metadata on the first opt-in progress event, so the two sides
stay aligned.

Backend creation happens in `_enrich_with_progress()` when there are no steps
yet and the event is not final:

```py
steps.append(
    {
        "title": "Understanding request",
        "detail": "Analyzing your message and choosing the next action.",
        "state": "active",
        "tools": [],
    }
)
```

When the first real tool call arrives, `_advance_steps()` marks the active
understanding step done and appends the tool step.

### Injecting Progress Into A2A Events

The backend does not create a separate A2UI progress surface for opt-in
requests. Instead, `_enrich_with_progress()` appends a tagged `TextPart` to the
working status message:

```py
Part(
    root=TextPart(
        text=stage,
        metadata={
            PROGRESS_STAGE_META: True,
            PROGRESS_STEPS_META: _public_progress_steps(steps),
        },
    )
)
```

If the converted A2A event does not already contain a working message, the
converter inserts a working `TaskStatusUpdateEvent` with that text part. This
keeps progress visible even for backend events that otherwise only carry tool
data.

Progress state is cleaned up when the ADK event is final:

```py
if is_final:
    self._progress.pop(inv_id, None)
```

For GE/non-opt-in requests, `RestaurantFinderExecutor` also runs a native
progress heartbeat while tools are active. The heartbeat emits
`TaskStatusUpdateEvent(state=working, message=...)` updates with estimated,
deduplicated percentages. The default A2A task store persists those updates as
the current `task.status.message`, which is what GE reads on each `tasks/get`
poll.

GE/non-opt-in requests also hold the last working status briefly before the
completed task and artifacts are emitted. Without that final hold, a fast task
can finish between GE polls and the Thinking tab can be skipped entirely.

## Frontend Client

File: `frontend/src/client.ts`

The client uses non-blocking `message/send` and then polls `tasks/get`. Each
polled task snapshot can contain progress messages in `history` or in the
current `status.message`. The client replays unseen tagged progress parts and
deduplicates them by text plus progress-step metadata.

Progress parts are detected by metadata:

```ts
#isStagePart(part: Record<string, unknown>): boolean {
  const meta = part["metadata"] as Record<string, unknown> | undefined;
  return Boolean(meta && meta[PROGRESS_STAGE_META]);
}
```

The progress step array is extracted from:

```ts
const steps = meta?.[PROGRESS_STEPS_META];
return Array.isArray(steps) ? steps : undefined;
```

In `send()`, working status updates are split this way:

- Tagged progress text calls `options.onStage(text, progressSteps)`.
- Untagged text is appended to final answer text.
- A2UI data parts are passed to `onA2UIMessage` or collected for final render.

This separation is important. Without it, progress messages would leak into the
assistant answer bubble.

### A2UI Extension Version

The local frontend currently sends:

```ts
const A2UI_EXTENSION_V08 = "https://a2ui.org/a2a-extension/a2ui/v0.8";
```

and the debug curl below uses the same `X-A2A-Extensions` value. Keep those two
call sites aligned when testing progress.

`app/config.py` also defines `A2UI_EXTENSION_URI` as the v0.9 URI, and some
integration tests use that v0.9 constant for regular A2UI rendering. Progress
metadata is not itself a v0.8 or v0.9 A2UI surface schema; it rides on tagged
A2A text parts before the A2UI renderer handles final content surfaces. If the
local client is moved to v0.9, update `frontend/src/client.ts`, the debug curl,
and the version-negotiation tests together.

## Frontend Rendering

File: `frontend/src/app.ts`

### State Types

The UI stores progress as structured steps:

```ts
type ProgressStepState = "pending" | "active" | "done" | "failed";
type ProgressToolState = "pending" | "running" | "done" | "failed";

interface ProgressStep {
  title: string;
  detail?: string;
  state: ProgressStepState;
  tools: ProgressTool[];
  completedTools: number;
  totalTools: number;
  visualStartedAt?: number;
}
```

`visualStartedAt` is frontend-only. It preserves when a step became active so
the local animation remains smooth across repeated backend metadata updates.

### Request Start

`sendAndProcess()` calls `startProgressTimer()` before sending the request.

`startProgressTimer()`:

- stores request start time,
- sets overall progress to 5 percent,
- creates a local active "Understanding request" step,
- starts a 300ms timer.

```ts
this.progressPercent = OVERALL_PROGRESS_START;
this.progressSteps = [
  {
    title: "Understanding request",
    state: "active",
    tools: [],
    completedTools: 0,
    totalTools: 0,
    visualStartedAt: now,
  },
];
```

### Receiving Backend Progress

`updateProgressFromMetadata(progressSteps)` normalizes backend data and then
calls `mergeProgressStepTiming()`.

The merge function preserves `visualStartedAt` for existing active steps and
sets it when a step first becomes active:

```ts
const becameActive = step.state === "active" && previous?.state !== "active";
const visualStartedAt =
  step.state === "active"
    ? becameActive
      ? now
      : previous?.visualStartedAt ?? now
    : previous?.visualStartedAt;
```

After merging, `syncProgressPercentToSteps()` updates the overall bar
immediately instead of waiting for the next timer tick.

`sendAndProcess()` queues progress-stage paints with
`MIN_PROGRESS_UPDATE_VISIBLE_MS`. This gives tightly coalesced backend events
separate render frames, so an intermediate milestone such as `50%` is not
immediately overwritten by `100%` before the browser paints it.

The merge matches both the full step key and a stable `index:title` fallback.
That prevents repeated backend metadata updates from resetting an active
step's local timer when tool details change slightly between events.

### Compatibility A2UI Progress Path

`sendAndProcess()` also passes live A2UI data parts to `processLiveA2UI()`.
That method is live for normal content surfaces, but it also contains a
compatibility progress branch:

```ts
processLiveA2UI()
  -> updateProgressFromA2UI()
  -> extractProgressSteps()
  -> isProgressA2UIMessage()
```

This branch recognizes legacy progress surfaces whose ids start with
`tool-progress-`. `extractProgressSteps()` parses component ids such as
`th-step-*`, `th-tool-*`, and `th-toolbar-label-*`, then converts the text
surface back into `ProgressStep` objects. `isProgressA2UIMessage()` filters
those progress-only A2UI messages out so they do not appear as answer cards.

The current backend opt-in path does not call `_progress_status_parts()` or the
`_tool_progress_messages*()` helpers that build those surfaces. New progress
features should normally add metadata fields and parsing in
`updateProgressFromMetadata()`, not extend the legacy A2UI surface parser,
unless progress surfaces are intentionally re-enabled.

### Rendering The Panel

The live panel is rendered by:

- `renderProgressPanel()`
- `renderProgressStep(step)`
- `renderStepToolProgress(step)`

The top bar displays the weighted overall percent. Each step displays:

- title and detail,
- tool rows with markers,
- a determinate step progress bar,
- a state label such as `Waiting`, `Tool call running`, `In progress`, or
  `Tool calls complete`.

Pending steps are shown with a 0 percent bar and `Waiting`. Active steps animate
linearly by elapsed time. Done steps show 100 percent.

In the live panel, pending steps are opened too. This matters for short final
steps like `Compiling dashboard`: the backend pre-announces the step while the
long search is still running, so the user can already see the third step's
waiting bar before the fast render tool starts.

### Overall Progress Math

The overall bar is no longer a fixed 90 second timer. When tool metadata is
available, it is computed from aggregate tool completion so known milestones
are visible. For the restaurant flow, two known tools produce `5%` while the
search tool is running, `50%` after search completes, and `100%` when the
dashboard step completes. When there are no tools, it falls back to step
weights and each step's visual percent.

Relevant constants:

```ts
const OVERALL_PROGRESS_START = 5;
const OVERALL_PROGRESS_MAX = 98;
const INITIAL_PROGRESS_TARGET_MS = 8_000;
const DEFAULT_STEP_TARGET_MS = 20_000;
const MIN_PROGRESS_UPDATE_VISIBLE_MS = 650;
const MIN_FINAL_STEP_VISIBLE_MS = 900;
const COMPLETION_HOLD_MS = 250;
```

Step estimates:

```ts
if (title.includes("understanding")) return INITIAL_PROGRESS_TARGET_MS;
if (title.includes("searching for restaurants")) return 32_000;
if (title.includes("compiling dashboard")) return 3_000;
if (title.includes("directions")) return 18_000;
if (title.includes("google workspace")) return 25_000;
return DEFAULT_STEP_TARGET_MS;
```

Step weights:

```ts
if (title.includes("understanding")) return 12;
if (title.includes("searching for restaurants")) return 84;
if (title.includes("compiling dashboard")) return 4;
return Math.max(10, this.getStepEstimatedMs(step) / 1000);
```

For non-tool work, this means longer steps own more of the fallback top-level
progress. For tool-backed work, aggregate tool completion takes precedence so
discrete milestones such as `50%` cannot be hidden by elapsed-time weighting.

The initial local-only "Understanding request" step is special-cased. While it
is the only step, the overall bar uses `getInitialProgressTarget()` instead of
the weighted-step formula. That keeps the top-level percent from climbing too
far before the backend sends the real tool steps.

Treat `frontend/src/app.ts` as the source of truth for numeric tuning. The
document names the current constants and formulas so future edits can find the
right code, but values such as the starting percent, maximum percent,
completion hold, and timer interval may drift as the UI is tuned.

### Per-Step Progress Math

`getStepVisualPercent(step)` returns:

- `100` for done steps,
- `0` for pending steps,
- capped elapsed-time progress for active steps,
- tool completion percent if that is higher than elapsed-time progress.

Active steps cap at 95 percent until the backend marks them done:

```ts
Math.min(0.95, elapsedMs / estimatedMs)
```

That makes long-running tool calls look linear without falsely claiming 100
percent before the tool response arrives.

### Completion

When the request succeeds, `sendAndProcess()` first calls
`holdFastFinalStepBeforeResult()`. If the last step just became done, the
frontend waits until that step has had at least `MIN_FINAL_STEP_VISIBLE_MS` of
live-panel visibility before inserting the final result surface. If the backend
emits only the done state for a very fast final step, the frontend still holds
that done state briefly so the user can see the 100 percent final step before
the result replaces the live panel.

If the final step is still `pending` when the response is ready, the frontend
briefly promotes that last step to `active`, marks its pending tools as
`running`, then completes it before rendering the final surface. This is a
visual bridge for very fast deterministic render steps such as
`Compiling dashboard`; it does not change the backend progress protocol.

After the result is inserted, the overall bar is briefly held at 100 percent
before clearing the live panel:

```ts
await this.holdFastFinalStepBeforeResult();

this.progressPercent = 100;
await this.delay(COMPLETION_HOLD_MS);
```

This prevents the UI from jumping straight from the second step to the final
answer when the final tool step starts and finishes in a tight backend burst.

## Restaurant Query Timeline

For `find 5 restaurants near google plv office`, the expected progress metadata
sequence is:

1. Search starts:

   - `Understanding request`: done
   - `Searching for restaurants`: active, tool running
   - `Compiling dashboard`: pending, tool pending

2. `find_restaurants` returns:

   - `Understanding request`: done
   - `Searching for restaurants`: done
   - `Compiling dashboard`: pending

3. Dashboard tool call starts:

   - `Compiling dashboard`: active, tool running

4. Dashboard tool response returns:

   - all steps done
   - final A2UI restaurant surface arrives
   - task completes

The dashboard step is intentionally pre-announced as pending because the actual
dashboard render is usually very fast after the deterministic backend shortcut.

## Adding A New Tool Step

When adding a new tool that should appear in progress:

1. Add a label in `_TOOL_LABELS`.
2. Add a title/detail pair in `_TOOL_STEP_TITLES`.
3. If the tool is predictably followed by another short step, add a pending
   step helper similar to `_append_pending_dashboard_step()`.
4. Add a frontend estimate in `getStepEstimatedMs()`.
5. Add a frontend weight in `getStepWeight()` if the step is common or long.
6. Add/update unit tests in `tests/unit/agent_executor_test.py`.

For simple tools, steps will still work without frontend-specific estimates.
They will use `DEFAULT_STEP_TARGET_MS` and the fallback weight
`Math.max(10, this.getStepEstimatedMs(step) / 1000)`.

No change is needed in `extractProgressSteps()` for normal metadata-backed
steps. Update the compatibility A2UI parser only if the backend starts sending
`tool-progress-*` progress surfaces again.

## Debugging

Useful checks:

```sh
uv run pytest tests/unit/agent_executor_test.py
npm run build
git diff --check
```

To inspect stored progress from the polling path, send a non-blocking A2A
request, poll the task, and search for `a2uiProgressSteps` in the task JSON:

```sh
TASK_ID=$(curl -sS \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.8' \
  --data-raw '{"jsonrpc":"2.0","method":"message/send","id":1,"params":{"configuration":{"blocking":false,"historyLength":100},"message":{"messageId":"debug-1","contextId":"debug-context-1","role":"user","parts":[{"kind":"text","text":"find 5 restaurants near google plv office"}],"kind":"message","metadata":{"a2uiProgress":true}}}}' \
  http://127.0.0.1:8001/ | jq -r '.result.id')

curl -sS \
  -H 'Content-Type: application/json' \
  --data-raw "{\"jsonrpc\":\"2.0\",\"method\":\"tasks/get\",\"id\":2,\"params\":{\"id\":\"$TASK_ID\",\"historyLength\":100}}" \
  http://127.0.0.1:8001/ > /tmp/a2a-progress-task.json

grep -n 'a2uiProgressSteps' /tmp/a2a-progress-task.json
```

Common symptoms:

- Overall bar jumps from mid-progress to 100:
  - Check `getStepWeight()` and `getStepEstimatedMs()`. The long phase probably
    has too little weight or too long an estimate.

- A step is not shown:
  - Check that the backend emitted it in `a2uiProgressSteps`.
  - Check that `frontend/src/client.ts` treats it as a stage part.

- A fast step flashes too quickly:
  - Pre-announce it as `pending` before the long previous step finishes.

- Progress text appears in the final answer:
  - Check `#isStagePart()` and make sure metadata contains
    `a2uiProgressStage: true`.

## Why This Design

Earlier versions tried to render progress by sending A2UI progress surfaces.
That made the request heavier and could interact badly with the same A2UI tool
path used for the final dashboard. Compatibility code for that surface shape is
still present in `processLiveA2UI()` and `extractProgressSteps()`, but the
current opt-in design keeps progress state as small metadata on normal A2A
status events and lets the frontend render it.

This makes progress updates cheaper, keeps final A2UI rendering isolated, and
lets the frontend smooth the bars locally even when backend events are sparse.
