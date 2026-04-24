/**
 * A2UI Chat Shell — chat-based UI for the restaurant finder agent.
 *
 * v0.9 architecture:
 *   - `v0_9.MessageProcessor([basicCatalog, customCatalog], actionHandler)`
 *     consumes incoming messages and exposes surfaces via `processor.model.surfacesMap`.
 *   - `<a2ui-surface .surface=${surface}>` renders each surface — the renderer
 *     handles all data binding, path resolution, and component dispatch internally.
 *   - The action handler receives a flat `A2uiClientAction` ({name, surfaceId,
 *     sourceComponentId, timestamp, context}); paths in button context are
 *     pre-resolved by the processor.
 *   - Theme is CSS-only (no JS theme provider in v0.9 lit).
 *   - Markdown renderer is provided through `Context.markdown`.
 */

import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, html, css, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { customElement, state } from "lit/decorators.js";
import { until } from "lit/directives/until.js";
import { repeat } from "lit/directives/repeat.js";

import * as v0_9 from "@a2ui/web_core/v0_9";
import { basicCatalog, Context, type LitComponentApi } from "@a2ui/lit/v0_9";
import { renderMarkdown } from "@a2ui/markdown-it";

import { RestaurantA2UIClient } from "./client.js";
import { customCatalog } from "./google-map-component.js";
// Side-effect import: registers Chart + Canvas on the shared basicCatalog so
// v0.9 MessageProcessor can resolve them when surfaces arrive.
import "./chart-component.js";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  surfaceIds?: string[];
  timestamp: Date;
}

const TAG = "a2ui-app-shell";

/** Render markdown asynchronously and return a `lit-html`-friendly Promise. */
async function renderMarkdownHtml(text: string) {
  const out = await renderMarkdown(text);
  return html`${unsafeHTML(out)}`;
}

@customElement(TAG)
export class A2UIShell extends SignalWatcher(LitElement) {
  // v0.9 lit only exposes `Context.markdown` — no theme provider.
  @provide({ context: Context.markdown })
  accessor markdownRenderer = renderMarkdown;

  @state() accessor requesting = false;
  @state() accessor error: string | null = null;
  @state() accessor messages: ChatMessage[] = [];

  // Bump this to force a re-render after the processor's surfacesMap mutates.
  @state() accessor renderVersion = 0;

  #client = new RestaurantA2UIClient();

  /**
   * Single processor for the lifetime of the shell. Surfaces accumulate in
   * `processor.model.surfacesMap`; we tag each chat message with the surface
   * IDs that came in with that response so we can render them in-place.
   */
  #processor = new v0_9.MessageProcessor<LitComponentApi>(
    [basicCatalog, customCatalog],
    async (action: v0_9.A2uiClientAction): Promise<void> => {
      // Show the action as a synthetic user message in the transcript.
      this.messages = [
        ...this.messages,
        {
          role: "user",
          text: `Selected: ${action.name}`,
          timestamp: new Date(),
        },
      ];
      this.scrollToBottom();

      // Wire format expected by app/agent_executor.py.
      await this.sendAndProcess({
        userAction: {
          name: action.name,
          surfaceId: action.surfaceId,
          sourceComponentId: action.sourceComponentId,
          timestamp: action.timestamp,
          context: action.context,
        },
      });
    },
  );

  static styles = css`
    * { box-sizing: border-box; }

    /* Material Symbols — global class doesn't cross shadow DOM boundary */
    .g-icon {
      font-family: "Material Symbols Outlined";
      font-weight: normal;
      font-style: normal;
      font-size: 24px;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      display: inline-block;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      -webkit-font-smoothing: antialiased;
    }
    .g-icon.filled-heavy {
      font-variation-settings: "FILL" 1, "wght" 500;
    }

    /* GE color tokens */
    :host {
      --ge-bg:          light-dark(#ffffff, #1e1e1e);
      --ge-bg-alt:      light-dark(#f8f9fa, #2a2a2a);
      --ge-border:      light-dark(#e0e0e0, #3a3a3a);
      --ge-text:        light-dark(#202124, #e8eaed);
      --ge-text-muted:  light-dark(#5f6368, #9aa0a6);
      --ge-blue:        #1a73e8;
      --ge-blue-hover:  #1557b0;
      --ge-blue-bg:     light-dark(#e8f0fe, #1a2a4a);
      --ge-gem-start:   #4285f4;
      --ge-gem-end:     #a142f4;
      --ge-user-bg:     light-dark(#e8f0fe, #1a2a4a);
      --ge-user-text:   light-dark(#1a73e8, #8ab4f8);
      --ge-surface-bg:  light-dark(#ffffff, #2a2a2a);
      --ge-shadow:      light-dark(0 1px 3px rgba(60,64,67,.15),
                                   0 1px 3px rgba(0,0,0,.4));

      /* a2ui CSS tokens consumed by basicCatalog components */
      --a2ui-color-primary: var(--ge-blue);
      --a2ui-color-on-primary: #ffffff;
      --a2ui-color-secondary: var(--ge-bg-alt);
      --a2ui-color-on-secondary: var(--ge-text);
      --a2ui-color-on-background: var(--ge-text);
      --a2ui-color-border: var(--ge-border);
      --a2ui-border-width: 1px;
      --a2ui-border-radius: 8px;
      --a2ui-spacing-m: 12px;
      --a2ui-text-color-text: var(--ge-text);

      display: flex;
      flex-direction: column;
      height: 100svh;
      background: var(--ge-bg);
      color: var(--ge-text);
      font-family: var(--font-family);
      font-size: 14px;
      overflow: hidden;
    }

    .header {
      display: flex; align-items: center; gap: 10px;
      padding: 0 20px; height: 56px;
      background: var(--ge-bg);
      border-bottom: 1px solid var(--ge-border);
      flex-shrink: 0;
    }
    .header-title { display: flex; flex-direction: column; }
    .header h1 {
      margin: 0; font-size: 1rem; font-weight: 500;
      color: var(--ge-text);
    }
    .header .subtitle {
      font-size: 0.72rem; color: var(--ge-text-muted); font-weight: 400;
    }
    .header-spacer { flex: 1; }
    .theme-toggle {
      background: none; border: none; border-radius: 50%;
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--ge-text-muted);
      font-size: 20px; padding: 0;
      transition: background 0.15s;
    }
    .theme-toggle:hover { background: var(--ge-bg-alt); }

    .chat-area {
      flex: 1; overflow-y: auto;
      padding: 24px 0;
      display: flex; flex-direction: column;
      scroll-behavior: smooth;
    }

    .welcome {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      flex: 1; gap: 12px;
      text-align: center; padding: 48px 24px;
    }
    .welcome-gem { width: 56px; height: 56px; margin-bottom: 4px; }
    .welcome h2 {
      margin: 0; font-size: 1.6rem; font-weight: 400;
      background: linear-gradient(90deg, var(--ge-gem-start), var(--ge-gem-end));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .welcome p {
      margin: 0; color: var(--ge-text-muted);
      max-width: 420px; line-height: 1.6; font-size: 14px;
    }
    .suggestions {
      display: flex; flex-wrap: wrap; gap: 8px;
      justify-content: center; margin-top: 16px;
    }
    .suggestion {
      padding: 10px 20px; border-radius: 999px;
      border: 1px solid var(--ge-border);
      background: var(--ge-bg); color: var(--ge-blue);
      font-size: 13px; font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, box-shadow 0.15s;
      box-shadow: var(--ge-shadow);
    }
    .suggestion:hover {
      background: var(--ge-blue-bg);
      box-shadow: 0 1px 6px rgba(60,64,67,.2);
    }

    .msg-row {
      display: flex; padding: 4px 24px;
      animation: fadeIn 0.25s ease;
    }
    .msg-row.user { justify-content: flex-end; }
    .msg-row.agent { justify-content: flex-start; }
    .msg { display: flex; gap: 12px; max-width: min(680px, 90%); }
    .msg.user { flex-direction: row-reverse; }
    .avatar {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0; margin-top: 2px;
    }
    .msg.user .avatar { background: var(--ge-blue); color: white; font-size: 14px; }
    .msg.agent .avatar { background: transparent; }

    .msg-content { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .sender-name {
      font-size: 12px; font-weight: 500;
      color: var(--ge-text-muted); padding: 0 2px;
    }
    .bubble {
      padding: 10px 16px; border-radius: 18px;
      line-height: 1.6; font-size: 16px;
      word-break: break-word; white-space: pre-wrap;
    }
    .msg.user .bubble {
      background: var(--ge-user-bg); color: var(--ge-user-text);
      border-radius: 18px 18px 4px 18px; font-weight: 400;
    }
    .msg.agent .bubble {
      background: transparent; color: var(--ge-text); padding: 0 2px;
    }
    .bubble a { color: var(--ge-blue); text-decoration: underline; }
    .bubble a:hover { opacity: 0.8; }
    .msg-time {
      font-size: 11px; color: var(--ge-text-muted); padding: 0 2px;
    }
    .msg.user .msg-time { text-align: right; }

    .surface-container {
      background: var(--ge-surface-bg);
      border: 1px solid var(--ge-border);
      border-radius: 12px; padding: 16px; margin-top: 4px;
      box-shadow: var(--ge-shadow);
      max-width: 520px; max-height: 60vh; overflow-y: auto;
    }

    .typing-row { display: flex; padding: 8px 24px; animation: fadeIn 0.25s ease; }
    .typing { display: flex; gap: 12px; align-items: center; }
    .typing .avatar { background: transparent; width: 32px; height: 32px; }
    .typing-dots {
      display: flex; align-items: center; gap: 5px;
      padding: 12px 16px;
      background: var(--ge-bg-alt); border-radius: 18px;
    }
    .typing-dots span {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--ge-text-muted);
      animation: bounce 1.2s ease-in-out infinite;
    }
    .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.3s; }

    .input-area {
      flex-shrink: 0; padding: 12px 24px 20px;
      background: var(--ge-bg);
    }
    .input-wrap {
      display: flex; align-items: center; gap: 8px;
      background: var(--ge-bg-alt);
      border: 1px solid var(--ge-border); border-radius: 999px;
      padding: 6px 6px 6px 20px;
      transition: box-shadow 0.2s, border-color 0.2s;
      box-shadow: var(--ge-shadow);
    }
    .input-wrap:focus-within {
      border-color: var(--ge-blue);
      box-shadow: 0 0 0 2px rgba(26,115,232,0.15);
    }
    .input-wrap input {
      flex: 1; border: none; background: transparent;
      color: var(--ge-text); font-size: 14px;
      outline: none; padding: 6px 0;
    }
    .input-wrap input::placeholder { color: var(--ge-text-muted); }
    .send-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: none;
      background: var(--ge-blue); color: white;
      cursor: pointer; transition: background 0.15s;
      flex-shrink: 0; font-size: 18px;
    }
    .send-btn:hover:not(:disabled) { background: var(--ge-blue-hover); }
    .send-btn:disabled { background: var(--ge-border); cursor: not-allowed; }
    .input-hint {
      text-align: center; font-size: 11px;
      color: var(--ge-text-muted); margin-top: 8px;
    }

    .error-banner {
      margin: 0 24px 8px; padding: 10px 16px;
      background: light-dark(#fce8e6, #3c1410);
      color: light-dark(#c5221f, #f28b82);
      border-radius: 8px; font-size: 13px;
      border: 1px solid light-dark(#f5c6cb, #5a2020);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }
  `;

  render() {
    return html`
      <div class="header">
        <img src="/gemini-icon.svg" width="28" height="28" alt="Gemini" />
        <div class="header-title">
          <h1>Restaurant Finder</h1>
          <div class="subtitle">Agent · A2UI v0.9</div>
        </div>
        <div class="header-spacer"></div>
        <button class="theme-toggle" @click=${this.toggleTheme}>
          <span class="g-icon">dark_mode</span>
        </button>
      </div>

      <div class="chat-area" id="chat-area">
        ${this.messages.length === 0 && !this.requesting
          ? this.renderWelcome()
          : nothing}
        ${this.messages.map((m) => this.renderMessage(m))}
        ${this.requesting ? this.renderTyping() : nothing}
      </div>

      ${this.error
        ? html`<div class="error-banner">${this.error}</div>`
        : nothing}

      <div class="input-area">
        <form class="input-wrap" @submit=${this.onSubmit}>
          <input
            type="text"
            name="query"
            placeholder="Ask about restaurants..."
            autocomplete="off"
            ?disabled=${this.requesting}
          />
          <button class="send-btn" type="submit" ?disabled=${this.requesting}>
            <span class="g-icon filled-heavy" style="font-size:18px">send</span>
          </button>
        </form>
        <div class="input-hint">Gemini can make mistakes. Check important info.</div>
      </div>
    `;
  }

  private renderWelcome() {
    return html`
      <div class="welcome">
        <img class="welcome-gem" src="/gemini-icon.svg" alt="Gemini" />
        <h2>Hello, foodie</h2>
        <p>Ask me about restaurants, get details, compare options, or browse what's available near you.</p>
        <div class="suggestions">
          <button class="suggestion" @click=${() => this.quickSend("What restaurants are available?")}>
            Browse all restaurants
          </button>
          <button class="suggestion" @click=${() => this.quickSend("Tell me about Han Dynasty")}>
            Tell me about Han Dynasty
          </button>
          <button class="suggestion" @click=${() => this.quickSend("Show me details for RedFarm")}>
            Show details for RedFarm
          </button>
        </div>
      </div>
    `;
  }

  private renderMessage(msg: ChatMessage) {
    const time = msg.timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Force render dependency on renderVersion so the surfaces re-render
    // whenever processor state mutates.
    void this.renderVersion;

    return html`
      <div class="msg-row ${msg.role}">
        <div class="msg ${msg.role}">
          <div class="avatar">
            ${msg.role === "user"
              ? html`<span class="g-icon" style="font-size:16px">person</span>`
              : html`<img src="/gemini-icon.svg" width="32" height="32" alt="Gemini" />`}
          </div>
          <div class="msg-content">
            <div class="sender-name">${msg.role === "user" ? "You" : "Gemini"}</div>
            <div class="bubble">
              ${until(renderMarkdownHtml(msg.text), html`${msg.text}`)}
            </div>
            ${msg.surfaceIds && msg.surfaceIds.length > 0
              ? this.renderSurfaces(msg.surfaceIds)
              : nothing}
            <div class="msg-time">${time}</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSurfaces(surfaceIds: string[]) {
    const surfacesMap = this.#processor.model.surfacesMap;
    const surfaces = surfaceIds
      .map((id) => [id, surfacesMap.get(id)] as const)
      .filter(([, s]) => s != null);

    if (surfaces.length === 0) return nothing;

    return html`
      ${repeat(
        surfaces,
        ([id]) => id,
        ([, surface]) => html`
          <div class="surface-container">
            <a2ui-surface .surface=${surface}></a2ui-surface>
          </div>
        `,
      )}
    `;
  }

  private renderTyping() {
    return html`
      <div class="typing-row">
        <div class="typing">
          <div class="avatar">
            <img src="/gemini-icon.svg" width="32" height="32" alt="Gemini" />
          </div>
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
  }

  private toggleTheme() {
    const cs = getComputedStyle(document.body).colorScheme;
    document.body.classList.toggle("light", cs === "dark");
    document.body.classList.toggle("dark", cs !== "dark");
  }

  private async quickSend(text: string) {
    await this.sendAndProcess(text);
  }

  private async onSubmit(evt: Event) {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement;
    const input = form.querySelector("input") as HTMLInputElement;
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    await this.sendAndProcess(message);
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      const area = this.renderRoot.querySelector("#chat-area");
      if (area) area.scrollTop = area.scrollHeight;
    });
  }

  private async sendAndProcess(message: string | Record<string, unknown>) {
    if (typeof message === "string") {
      this.messages = [
        ...this.messages,
        { role: "user", text: message, timestamp: new Date() },
      ];
    }

    this.requesting = true;
    this.error = null;
    this.scrollToBottom();

    try {
      const response = await this.#client.send(message);

      // Snapshot existing surface IDs so we can identify which ones arrive
      // with this response (= the ones to display under this agent message).
      const existingIds = new Set(this.#processor.model.surfacesMap.keys());

      if (response.a2uiMessages.length > 0) {
        this.#processor.processMessages(
          response.a2uiMessages as unknown as v0_9.A2uiMessage[],
        );
      }

      const newSurfaceIds = [...this.#processor.model.surfacesMap.keys()].filter(
        (id) => !existingIds.has(id),
      );

      this.renderVersion++;
      this.messages = [
        ...this.messages,
        {
          role: "agent",
          text: response.text || "Here you go:",
          surfaceIds: newSurfaceIds.length > 0 ? newSurfaceIds : undefined,
          timestamp: new Date(),
        },
      ];
    } catch (err) {
      console.error("[A2UI] Error:", err);
      this.error = `${err}`;
    } finally {
      this.requesting = false;
      this.scrollToBottom();
    }
  }
}
