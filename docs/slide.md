# Slide Narratives: Intro to A2UI

This document contains a suggested narrative for each slide in the `Intro to GE - A2UI.pptx` presentation.

---

## Slide 1: Title
**Content:** Intro to A2UI - LLM Generated UI for Multi-Agent Systems by Dave Wang, April 2026.
**Narrative:** "Welcome everyone. Today we are introducing A2UI, a protocol for LLM-generated user interfaces designed specifically for multi-agent systems. This presentation was prepared in April 2026."

## Slide 2: Problem
**Content:** Problem
**Narrative:** "Let's start by looking at the problem we are trying to solve with this protocol."

## Slide 3: Inefficient Text Interactions
**Content:** Text-only agent interactions are inefficient.
**Narrative:** "Traditional text-only interactions with agents can be highly inefficient. For example, if a user wants to book a table, it often requires multiple back-and-forth turns just to clarify the date and time. A much better approach is for the agent to generate a form with a date picker and time selector, allowing the user to interact with UI elements directly instead of typing."

## Slide 4: Rendering UI Elements
**Content:** You have an Agent… How does it render UI elements?
**Narrative:** "When you have an agent, the question arises: how does it actually render these UI elements? We know that providing button options is far better than asking the user to type out their choices."

## Slide 5: Remote Agents
**Content:** What about remote Agents?
**Narrative:** "What happens when we deal with remote agents? In this example, a Symptom Checker Agent returns structured inputs like symptoms and duration as JSON. The primary agent sends this data after the user clicks submit via the A2A protocol."

## Slide 6: The Challenge
**Content:** The Challenge - Remote agents can't directly manipulate UI.
**Narrative:** "The core challenge in multi-agent systems is that agents often run remotely on different servers or even in different organizations. They cannot directly manipulate the host application's UI. The traditional approach of sending HTML or JavaScript in iframes is heavy, visually disjointed, and poses significant security risks. We need a way to transmit UI that is as safe as data but as expressive as code."

## Slide 7: The Solution
**Content:** The Solution - A2UI: JSON messages describing UI.
**Narrative:** "The solution we are proposing is A2UI. It uses JSON messages to describe the UI. LLMs can generate these as structured output, they can travel over any transport, and the client renders them using its own native components. This ensures the client controls security and styling, making the agent-generated UI feel native to the app."

## Slide 8: Illustrative Scenario
**Content:** Illustrative scenario with Gemini Orchestrator.
**Narrative:** "Here is an illustrative scenario showing a common pattern. It involves a Gemini Orchestrator, a User Surface, and various expert agents and tools interacting via A2A and MCP protocols."

## Slide 9: Approaches Explored
**Content:** Many approaches explored.
**Narrative:** "We explored several approaches before arriving at this solution. Text-only lacks standards; Front End Apps are heavy and inflexible; Private UI Widgets can have security gaps. Mapping UI client widgets as agent tools emerged as the most efficient and standardized method."

## Slide 10: Gotchas
**Content:** Key Challenges and Considerations in LLM-Generated UI.
**Narrative:** "There are important 'gotchas' to consider. On the security side, we must protect against malicious UI injection, user manipulation, and data exfiltration. On the performance side, we need to manage component synchronization, latency, and payload size."

## Slide 11: An Ideal Solution
**Content:** An Ideal Solution.
**Narrative:** "An ideal solution is a new open UI toolkit for LLM-generated UI that is secure, performant, and uses widgets composed of components. It should support structured output, allow for custom components, and be easily debuggable across any front end and model with low development effort."

## Slide 12: Introducing A2UI
**Content:** Introducing A2UI.
**Narrative:** "Now, let's take a closer look at the A2UI protocol itself."

## Slide 13: Protocol Definition
**Content:** A2UI is a Protocol for Agent-Driven Interfaces.
**Narrative:** "A2UI is a protocol for agent-driven interfaces that enables AI agents to generate rich, interactive UIs across web, mobile, and desktop platforms. You can find more documentation at a2ui.org."

## Slide 14: Local Agent Generation
**Content:** Example - local agent generation.
**Narrative:** "Here is an example of local agent generation, where the layout and structured content are generated directly by a local agent and rendered by the client."

## Slide 15: Remote Agent Generation (Passthrough)
**Content:** Example - remote agent generation.
**Narrative:** "In the case of a remote agent, the orchestrator might simply pass through the generated UI messages directly to the client without needing to regenerate them."

## Slide 16: Remote Agent Generation (Rewrite)
**Content:** Example - remote agent generation, orchestrator rewrite.
**Narrative:** "Alternatively, the orchestrator might choose to rewrite or regenerate the remote UI message before passing it to the client for rendering."

## Slide 17: A2UI Details (Overview)
**Content:** A2UI is a new open source protocol...
**Narrative:** "To summarize some details: A2UI is a new open-source protocol co-developed by the Flutter team and teams building for Gemini Enterprise. it features component-based widgets, structured output optimized for LLMs, and a transport-agnostic design."

## Slide 18: Details Title
**Content:** A2UI Details.
**Narrative:** "Let's dive deeper into the specific details and mechanics of A2UI."

## Slide 19: Philosophy
**Content:** Philosophy - Decoupling structure, state, and catalog.
**Narrative:** "The central philosophy of A2UI is the decoupling of three key elements: The Component Tree defining the structure, The Data Model managing the state, and the Widget Registry or Catalog which maps components to native implementations."

## Slide 20: Architecture and Data Flow
**Content:** A2UI is transport-agnostic.
**Narrative:** "A2UI is transport-agnostic and typically rides on A2A JSON-RPC. The client sends requests and receives UI descriptions in the response, processing messages like `beginRendering` and `surfaceUpdate` in batches."

## Slide 21: Blank Slide
**Content:** (No text detected)
**Narrative:** "This slide appears to be blank or contains only visual elements without text."

## Slide 22: Implementation Steps
**Content:** Implementation Steps: Define Artifacts Wire up Agent Runtime + Render.
**Narrative:** "The main implementation steps involve defining your artifacts and then wiring up the agent runtime and the renderer."

## Slide 23: Two Main Artifacts
**Content:** Two main artifacts: Catalog and Examples.
**Narrative:** "There are two main artifacts required: The Catalog, which defines the component schemas, and Examples, which show the agent how to actually use the catalog."

## Slide 24: The Catalog
**Content:** The Catalog - What is it?
**Narrative:** "The Catalog is a JSON file defining available UI components via JSON Schema. It contains a unique ID and a map of components, allowing you to merge basic standard components with your own custom, app-specific components."

## Slide 25: Examples
**Content:** Examples: Teaching the LLM.
**Narrative:** "Examples are the primary way the LLM learns the A2UI output format. They are JSON files representing UI patterns that are injected into the agent's prompt. The typical message sequence involves `beginRendering`, `surfaceUpdate`, and `dataModelUpdate`."

## Slide 26: Component Categories
**Content:** Standard Component Categories.
**Narrative:** "Standard component categories include Layout components like rows and columns, Display components like text and images, Interactive components like buttons and text fields, and Container components like cards and modals."

## Slide 27: Transports
**Content:** Transport options.
**Narrative:** "A2UI is transport-agnostic. Currently, A2A and AG UI are supported, with plans for REST, WebSockets, and SSE transports in the future."

## Slide 28: Renderers
**Content:** Renderers.
**Narrative:** "Renderers are what convert the JSON UI descriptions into native components. There are current implementations for Lit and Angular on the web, and Flutter for cross-platform support."

## Slide 29: Gemini Enterprise Title
**Content:** A2UI in Gemini Enterprise.
**Narrative:** "Now let's look at how A2UI is specifically applied within Gemini Enterprise."

## Slide 30: Integration Steps
**Content:** Steps for developer and admin.
**Narrative:** "The workflow involves a developer implementing A2UI in their agent's code, followed by the GE Admin integrating the agent via A2A and sharing it with users."

## Slide 31: GE Data Flow
**Content:** Gemini Enterprise calls the agent’s A2A endpoint.
**Narrative:** "In this flow, Gemini Enterprise calls the agent's endpoint and provides the catalog. The agent decides to display a UI widget and returns the appropriate A2UI JSON, which GE then renders."

## Slide 32: Widget Example
**Content:** User is presented with a multi-select dropdown.
**Narrative:** "Here is an example where the user is presented with a multi-select dropdown widget generated entirely via A2UI."

## Slide 33: User Interaction
**Content:** Using the multi-select dropdown.
**Narrative:** "The user can then interact with this generated dropdown to select options, such as insurance plans, and submit their selection."

## Slide 34: Response Flow
**Content:** Gemini Enterprise translates the user’s interaction...
**Narrative:** "Gemini Enterprise translates that user interaction back into a JSON object and sends it to the agent, which processes it to generate the next step in the conversation."

## Slide 35: Outcome
**Content:** The user sees a clean comparison table.
**Narrative:** "As a result, the user sees a clean comparison table featuring only the plans they selected, all rendered natively."

## Slide 36: Demo
**Content:** Demo.
**Narrative:** "Let's move on to a live demo of this system in action."

## Slide 37: Conclusion
**Content:** Thank you.
**Narrative:** "Thank you for your time and attention."
