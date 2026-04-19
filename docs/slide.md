# Slide Narratives: Intro to GE - A2UI
### LLM Generated UI for Multi-Agent Systems

Speaker notes for each slide in `Intro to GE - A2UI.pptx`.

---

## Slide 1 — Title

**Content:** *A2UI Deep Dive – LLM Generated UI for Multi-Agent Systems. Dave Wang, April 2026.*

Welcome. Today we're talking about one of the most practical challenges in deploying AI agents at enterprise scale: how do you give them the ability to generate rich, interactive user interfaces — not just text?

As AI agents become more capable, users increasingly expect them to surface information in polished, actionable UI. A2UI is the open protocol we've built to make that possible — securely, at scale, and with low developer effort.

---

## Slide 2 — Table of Contents

**Content:** *Problem → Introducing A2UI → A2UI Implementation → A2UI in Gemini Enterprise → Demo.*

We'll cover four areas today. First, the problem — why text-only agents fall short and why existing workarounds don't hold up. Then we'll introduce A2UI and how it works. We'll walk through what implementation looks like for a developer. And finally, we'll show how A2UI is integrated into Gemini Enterprise, followed by a live demo.

---

## Slide 3 — Problem (Section Header)

**Content:** *Problem.*

Let's start with the problem. You've built a capable AI agent — it can answer questions, take actions, call APIs. But when it comes to interacting with users, it's limited to plain text. That's a significant constraint — one that affects adoption, efficiency, and user satisfaction.

---

## Slide 4 — Text-Only Interactions Are Inefficient

**Content:** *Text-only agent interactions are inefficient.*

Here's a concrete example: booking a table. In a text-only interaction, what should be a two-second task becomes a back-and-forth conversation. The agent has to ask for every piece of information one at a time.

Contrast that with what users expect from any modern app: a form with a date picker, a time selector, and a submit button. Fill it in, tap submit, done.

Text-only agents are powerful under the hood, but they create unnecessary friction at the point of interaction. That friction erodes trust and adoption — especially for enterprise users who need to move fast.

---

## Slide 5 — How Does an Agent Render UI Elements?

**Content:** *You have an Agent… How does it render UI elements?*

So the natural question becomes: you've built the agent — how do you give it the ability to render UI elements?

Buttons, forms, maps, dropdowns — these aren't nice-to-haves. They're the difference between an agent that feels like a polished product and one that feels like a chatbot from 2020.

---

## Slide 6 — What About Remote Agents?

**Content:** *What about remote Agents? Forms and UI interactions return structured inputs.*

The challenge becomes even more interesting with remote agents. When a sub-agent lives on a different server — or belongs to a different organization — it can't directly update your UI. It has to communicate through messages.

But those messages don't have to be plain text. With A2UI, a remote agent can return a form. The user fills it out. The structured data flows back to the agent as a clean JSON object — no parsing, no ambiguity. The agent gets exactly what it needs to continue.

---

## Slide 7 — The Challenge

**Content:** *The Challenge – In multi-agent systems, agents often run remotely.*

This is the core challenge: in multi-agent systems, agents are often remote. They need to send UI — but they can't send code you'd execute in your app.

The traditional workaround is iframes: HTML and JavaScript that render in the host app. But this creates real problems — security headaches, visual inconsistency, and operational complexity. You're essentially executing untrusted code inside your application.

What you really need is something expressive enough to describe rich UI, but as safe to transmit as data.

---

## Slide 8 — The Solution

**Content:** *The Solution – A2UI: JSON messages describing UI that LLMs generate as structured output.*

A2UI is that solution. Instead of sending executable code, agents send JSON messages that describe what the UI should look like — declaratively. The client receives those messages and renders them using its own native components.

This means the client app controls security and visual consistency. The agent describes what it wants to show; the client decides how to show it. The result is agent-generated UI that feels completely native to your application.

---

## Slide 9 — Illustrative Scenario

**Content:** *Gemini Orchestrator → Expert Agents → User Surface via A2A and MCP.*

Here's what this looks like in a real enterprise architecture. A Gemini orchestrator receives queries from users, coordinates with specialized search and expert agents, and pulls from enterprise services and memory.

Each of those agents can now contribute not just data and text, but rich UI — and all of it flows back to the user's surface as a cohesive, native experience. A2UI is the protocol that makes this coordination possible.

---

## Slide 10 — Many Approaches Explored

**Content:** *Text Only / Front End Apps / UIs as Tools / Private UI Widgets.*

Before A2UI, teams tried several approaches, each with real tradeoffs.

Text only works but creates friction. Front-end apps are rich but heavyweight — you're mapping entire application screens as agent tools. Private UI widgets offer flexibility but create security exposure with no standardization. Mapping UI widgets as agent tools is the right direction, but without a standard, every team reinvents the wheel.

A2UI provides the standard.

---

## Slide 11 — Gotchas

**Content:** *Key Challenges: Security (injection, manipulation, exfiltration) and Performance (sync, latency).*

There are real challenges to get right when agents generate UI.

Security is the most important: without guardrails, a malicious remote agent could inject UI designed to deceive users into revealing PII, or capture sensitive data and exfiltrate it to an external server.

Performance matters too: component mismatches between client and server can break UI silently, and large payloads hurt responsiveness.

A2UI was designed with both of these challenges in mind. The declarative catalog model is specifically what prevents injection attacks — agents can only use pre-approved components that the client has registered.

---

## Slide 12 — An Ideal Solution

**Content:** *Secure, performant, widget-based, structured output, custom components, any front end, any model, low dev effort.*

So what does the ideal solution look like?

Secure by design — no arbitrary code execution. A standard library of common components so teams aren't starting from scratch. Support for custom components for app-specific needs. Works with any front-end framework and any LLM. Low enough effort that developers can adopt it without a major investment.

That's exactly what A2UI delivers.

---

## Slide 13 — Introducing A2UI (Section Header)

**Content:** *Introducing A2UI.*

Let's introduce A2UI.

---

## Slide 14 — A2UI Is a Protocol for Agent-Driven Interfaces

**Content:** *A2UI is a Protocol for Agent-Driven Interfaces. a2ui.org.*

A2UI — Agent to UI Protocol — is an open protocol at a2ui.org. At its core, it enables AI agents to generate rich, interactive user interfaces across web, mobile, and desktop, without executing arbitrary code on the client.

The key word is "protocol." This isn't a proprietary library you're locked into. It's a specification — like HTTP or JSON-RPC — that any agent and any client can implement.

---

## Slide 15 — Example: Local Agent Generation

**Content:** *Agent generates layout → client collects JSONL chunks → renders. Text-only fallback.*

When your agent runs locally — on the same infrastructure as your backend — the flow is straightforward. The agent generates a layout and structured content as A2UI JSON. The client collects those JSON chunks as they stream in and renders them in real time. Users see the UI building up progressively, which feels fast and responsive.

Notice the text-only fallback arrow: if the client doesn't support A2UI, the agent gracefully degrades to a text response. You never break existing clients.

---

## Slide 16 — Example: Remote Agent Generation (Passthrough)

**Content:** *Orchestrator passes through A2UI messages from sub-agent to client.*

When agents are remote, there are two patterns. In the first — passthrough — the sub-agent generates the A2UI JSON, and the orchestrator passes it through to the client without modification. This is the simplest pattern and works well when the orchestrator trusts the sub-agent's output completely.

---

## Slide 17 — Example: Remote Agent Generation (Orchestrator Rewrite)

**Content:** *Orchestrator rewrites or re-generates remote UI message before sending to client.*

In the second pattern, the orchestrator rewrites or enriches the A2UI output before sending it to the client. This gives the orchestrator full control over the final UI — useful when you need to enforce consistent styling, merge outputs from multiple agents, or apply business logic to what gets displayed.

---

## Slide 18 — A2UI Features

**Content:** *Open source protocol. Components & Widgets. LLM Structured Output. Transport-Agnostic.*

A2UI has four defining characteristics.

It's open source — co-developed with the Flutter team and teams building for Google-internal products and external products like Agentspace and Gemini Enterprise.

Components compose into widgets. There's a standard library so you're not starting from scratch, and clients can advertise custom components for app-specific needs.

It's built for LLM structured output — JSON that models generate reliably and that you can inspect and debug when things go wrong.

And it's transport-agnostic — A2UI payloads travel over A2A, AG UI, or any transport that can carry JSON. No new networking primitives required.

---

## Slide 19 — A2UI Implementation (Section Header)

**Content:** *A2UI Implementation.*

Let's talk implementation. What does a developer actually need to do to add A2UI to their agent?

---

## Slide 20 — Philosophy

**Content:** *Decoupling: Component Tree (structure) / Data Model (state) / Widget Registry (catalog).*

The philosophy of A2UI is a clean separation of three concerns.

The component tree — the structure — is defined by `updateComponents` messages. Think of this as the skeleton of your UI.

The data model — the state — is populated separately by `updateDataModel` messages. This is the live data that fills in the skeleton.

The widget registry — what we call the catalog — lives on the client. It maps component names to native widget implementations. The server references it, but never modifies it.

This decoupling is what makes A2UI secure: the agent can only reference components that already exist in the client's registry. It cannot inject new behavior.

---

## Slide 21 — Architecture and Data Flow

**Content:** *Client sends A2A JSON-RPC with X-A2A-Extensions → Server returns DataParts (application/json+a2ui).*

Technically, A2UI rides on top of A2A JSON-RPC. The client sends a message with an `X-A2A-Extensions` header declaring that it supports A2UI. The server returns `DataPart` objects with MIME type `application/json+a2ui`. Each DataPart is an A2UI v0.9 message — `createSurface`, `updateComponents`, `updateDataModel`.

The client processes these in order, builds up the UI, and renders it. When the user interacts — taps a button, submits a form — that interaction goes back to the agent as a new A2A message. The loop closes cleanly.

---

## Slide 22 — Request Lifecycle Diagram

**Content:** *(Architecture diagram — Init → Handshake → Execute → Validate & Send → Render.)*

[Walk through the architecture diagram on screen — highlight the handshake at the top, the per-request flow in the box, and the data flow from user through to renderer and back.]

---

## Slide 23 — Implementation Steps

**Content:** *Define Artifacts → Wire up Agent → Runtime + Render.*

Implementation comes down to three steps: define your artifacts, wire up the agent, then configure the runtime and renderer. Let's look at each.

---

## Slide 24 — Example: "Find Mexican Restaurants in Downtown LA"

**Content:** *Handshake → Schema Manager loads catalog → Tool execution → Validate & Send as DataPart.*

Here's a concrete example. A user asks "Find Mexican restaurants in Downtown LA."

Step 1 — Handshake: the agent executor validates the `X-A2A-Extensions` header and confirms the client supports A2UI. The schema manager loads the restaurant catalog definition and example templates.

Step 2 — Tool execution: the LLM calls `find_restaurants()` and gets back real data from the Maps API.

Step 3 — Validate and send: the agent builds a layout — Column containing a List of Cards — the schema manager validates it against the catalog, and sends it back as DataPart messages.

The client renders a polished restaurant list. The whole flow from query to rendered UI happens in seconds.

---

## Slide 25 — Two Main Artifacts

**Content:** *Catalog (catalog_definition.json) + Examples (*.json files).*

Everything you need to add A2UI boils down to two artifacts.

The **catalog definition** — a JSON file that defines what UI components your agent is allowed to use, and what properties each component accepts. This is your contract between the agent and the client.

**Examples** — a few JSON files showing the agent complete, valid A2UI message sequences for each UI pattern you want to support. These are injected into the agent's system prompt at runtime to teach the LLM exactly how to produce valid output.

That's it. Two files, and your agent can generate rich UI.

---

## Slide 26 — The Catalog

**Content:** *catalogId + components map. BasicCatalog + custom. Merged by A2uiSchemaManager at startup.*

The catalog is a JSON file with a unique ID and a map of component names to JSON Schemas. Each schema defines what properties a component accepts and which are required.

You don't start from scratch. `BasicCatalog` provides the standard components — Row, Column, Text, Button, and more — out of the box. Your custom catalog only needs to add app-specific components your use case requires, like `GoogleMap` or a custom chart widget.

At startup, `A2uiSchemaManager` merges your custom catalog with `BasicCatalog`. The agent sees the full combined component set and can only use components within it.

---

## Slide 27 — Examples: Teaching the LLM

**Content:** *One file per UI pattern. createSurface → updateComponents → updateDataModel. Injected into system prompt.*

Examples are how the LLM learns to generate valid A2UI output. Think of them as few-shot prompts, but specifically for UI generation.

Each example file shows a complete message sequence: `createSurface` to initialize the surface, `updateComponents` to define the component tree, and `updateDataModel` to populate the data.

Examples are loaded dynamically based on what the client supports and injected into the system prompt at runtime. The schema validates structure; examples demonstrate pattern. This is a critical point: bad examples lead directly to bad LLM output. Getting these right is one of the highest-leverage things you can do as an implementer.

---

## Slide 28 — Standard Component Categories

**Content:** *Layout / Display / Interactive / Container. Reference: a2ui.org/reference/components.*

The standard component library covers the most common UI needs out of the box.

**Layout:** Row, Column, List for arranging content. **Display:** Text, Image, Icon, Video, Divider for showing information. **Interactive:** Button, TextField, ChoicePicker, DateTimeInput, Slider for user input. **Container:** Card, Tabs, Modal for grouping and organizing.

These are all documented at a2ui.org/reference/components. For anything beyond these, you define custom components in your catalog.

---

## Slide 29 — Transport Options

**Content:** *A2UI is transport-agnostic. A2A and AG UI supported today. REST/WebSockets/SSE planned.*

A2UI is transport-agnostic. Today, A2A and AG UI are supported natively. REST API, WebSockets, and SSE are planned. If your system can deliver JSON messages, it can deliver A2UI.

This matters because it means you're not locked into a specific networking stack. A2UI integrates with whatever transport your architecture already uses.

---

## Slide 30 — Renderers

**Content:** *Lit and Angular for web. Flutter GenUI SDK for mobile/desktop.*

Once the agent generates A2UI JSON, a renderer on the client side converts it into native UI. For web, there are Lit and Angular renderers. For mobile and desktop, the Flutter GenUI SDK handles rendering.

Renderers are what make A2UI feel native — they translate abstract component descriptions into the actual buttons, lists, and forms your users see, rendered using your application's own design system.

---

## Slide 31 — A2UI in Gemini Enterprise (Section Header)

**Content:** *A2UI in Gemini Enterprise.*

Now let's look at what A2UI looks like specifically within Gemini Enterprise.

---

## Slide 32 — Integration Flow: Developer → GE Admin → Users

**Content:** *Developer implements A2UI. GE Admin integrates via A2A. Admin shares with employees.*

The integration flow has three steps.

First, a developer implements A2UI in their A2A agent — they add the catalog definition, the example files, and wire up the schema manager. The agent now knows how to generate A2UI output.

Second, a GE Admin integrates that agent into Gemini Enterprise via standard A2A integration. Nothing A2UI-specific is required on the admin side.

Third, the admin shares the agent with specific employees. From that point, those users get the full rich UI experience whenever they interact with the agent through GE.

---

## Slide 33 — GE Sends Its Catalog to the Agent

**Content:** *GE calls agent's A2A endpoint with its A2UI catalog. Agent returns A2UI JSON. GE renders natively.*

Here's the key interaction at runtime. When Gemini Enterprise calls the agent's A2A endpoint, it sends along GE's A2UI catalog — the list of UI components that GE's frontend knows how to render.

The agent uses that catalog to know what components it can safely reference. When it decides to render a UI widget, it returns A2UI JSON alongside its text response. GE reads that JSON and renders it using GE's own design language. The result looks like a native GE component — not something injected from outside.

---

## Slide 34 — Widget: Multi-Select Dropdown

**Content:** *User is presented with a multi-select dropdown generated with A2UI.*

Here's what that looks like in practice. The agent renders a multi-select dropdown — a native GE UI component — generated entirely by the agent via A2UI.

The user sees a polished, on-brand widget. Not a text prompt asking them to type out a list of options. This is the experience users expect from enterprise software.

---

## Slide 35 — User Selects Insurance Plans

**Content:** *User selects 3 insurance plans and submits. Multi-select menu generated with A2UI.*

The user interacts with the dropdown naturally — selecting multiple insurance plans from a list — and clicks submit.

This is the UX users expect from modern applications. And the agent made it possible without any custom frontend code. The interaction is driven entirely by A2UI messages.

---

## Slide 36 — GE Translates Interaction to JSON

**Content:** *GE translates user interaction → {"selectedOptions": ["Aetna","Anthem","Kaiser Permanente"]} → sent back to agent.*

When the user submits, GE translates the UI interaction into a structured JSON object — in this case, the selected plan names — and sends it back to the agent via A2A.

The agent receives clean, unambiguous data — not a text message it has to parse or interpret. This is what makes A2UI-powered interactions so reliable for downstream processing and orchestration.

---

## Slide 37 — Result: Clean Comparison Table

**Content:** *The user sees a clean comparison table, featuring only the selected insurance plans.*

And the agent responds with another rich UI: a clean comparison table showing only the three plans the user selected. No extra noise. No walls of text. Just the data the user asked for, in the format that makes the most sense for comparison.

This is the full loop: agent generates UI, user interacts with it, structured data flows back, agent responds with more rich UI. All of it driven by a lightweight, open JSON protocol.

---

## Slide 38 — Demo

**Content:** *Demo.*

Let's see this in action. [Launch demo.]

---

## Slide 39 — Thank You

**Content:** *Thank you. Proprietary & Confidential.*

Thank you. Happy to take questions — whether on the implementation details, the Gemini Enterprise integration, or what it would look like to add A2UI to your own agent.

---

*End of narrative.*
