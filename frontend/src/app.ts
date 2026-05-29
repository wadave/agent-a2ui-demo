/**
 * A2UI Chat Shell — chat-based UI for the restaurant finder agent.
 *
 * v0.8 architecture:
 *   - `v0_8.MessageProcessor` consumes incoming messages and exposes surfaces.
 *   - `<a2ui-surface .surface=${surface}>` renders each surface.
 *   - Theme is provided via A2UI_THEME context.
 */

import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, html, css, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { customElement, state } from "lit/decorators.js";
import { until } from "lit/directives/until.js";
import { repeat } from "lit/directives/repeat.js";

import * as v0_8 from "@a2ui/lit/v0_8";
import { Context } from "@a2ui/lit/ui";
import "@a2ui/lit/ui";
import { renderMarkdown } from "@a2ui/markdown-it";

// v0.8 standard components (a2ui-column, a2ui-text, etc.) read
// `this.theme.components.X` during render. There's no built-in theme in
// @a2ui/lit, so without a provided one every render throws
// "Cannot read properties of undefined (reading 'components')". This
// minimal theme satisfies the shape with empty classMaps.
const EMPTY_CLASSMAP = {};
const A2UI_THEME = {
  components: {
    AudioPlayer: EMPTY_CLASSMAP,
    Button: EMPTY_CLASSMAP,
    Card: EMPTY_CLASSMAP,
    Column: EMPTY_CLASSMAP,
    CheckBox: { container: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP, label: EMPTY_CLASSMAP },
    DateTimeInput: { container: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP, label: EMPTY_CLASSMAP },
    Divider: EMPTY_CLASSMAP,
    Image: {
      all: EMPTY_CLASSMAP, icon: EMPTY_CLASSMAP, avatar: EMPTY_CLASSMAP,
      smallFeature: EMPTY_CLASSMAP, mediumFeature: EMPTY_CLASSMAP,
      largeFeature: EMPTY_CLASSMAP, header: EMPTY_CLASSMAP,
    },
    Icon: EMPTY_CLASSMAP,
    List: EMPTY_CLASSMAP,
    Modal: { backdrop: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP },
    MultipleChoice: { container: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP, label: EMPTY_CLASSMAP },
    Row: EMPTY_CLASSMAP,
    Slider: { container: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP, label: EMPTY_CLASSMAP },
    Tabs: {
      container: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP,
      controls: { all: EMPTY_CLASSMAP, selected: EMPTY_CLASSMAP },
    },
    Text: {
      all: EMPTY_CLASSMAP, h1: EMPTY_CLASSMAP, h2: EMPTY_CLASSMAP, h3: EMPTY_CLASSMAP,
      h4: EMPTY_CLASSMAP, h5: EMPTY_CLASSMAP, caption: EMPTY_CLASSMAP, body: EMPTY_CLASSMAP,
    },
    TextField: { container: EMPTY_CLASSMAP, element: EMPTY_CLASSMAP, label: EMPTY_CLASSMAP },
    Video: EMPTY_CLASSMAP,
  },
  elements: {
    a: EMPTY_CLASSMAP, audio: EMPTY_CLASSMAP, body: EMPTY_CLASSMAP, button: EMPTY_CLASSMAP,
    h1: EMPTY_CLASSMAP, h2: EMPTY_CLASSMAP, h3: EMPTY_CLASSMAP, h4: EMPTY_CLASSMAP,
    h5: EMPTY_CLASSMAP, iframe: EMPTY_CLASSMAP, input: EMPTY_CLASSMAP,
    p: EMPTY_CLASSMAP, pre: EMPTY_CLASSMAP, textarea: EMPTY_CLASSMAP, video: EMPTY_CLASSMAP,
  },
  markdown: {
    p: [], h1: [], h2: [], h3: [], h4: [], h5: [],
    ul: [], ol: [], li: [], a: [], strong: [], em: [],
  },
};

import { RestaurantA2UIClient } from "./client.js";
import "./google-map-component.js";
import "./chart-component.js";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  surfaceIds?: string[];
  stages?: string[];
  timestamp: Date;
}

const TAG = "a2ui-app-shell";
const PROGRESS_SURFACE_PREFIX = "tool-progress-";

/** Render markdown asynchronously and return a `lit-html`-friendly Promise. */
async function renderMarkdownHtml(text: string) {
  const out = await renderMarkdown(text);
  return html`${unsafeHTML(out)}`;
}

@customElement(TAG)
export class A2UIShell extends SignalWatcher(LitElement) {
  @provide({ context: Context.theme })
  accessor a2uiTheme = A2UI_THEME;

  @provide({ context: Context.markdown })
  accessor markdownRenderer = renderMarkdown;

  @state() accessor requesting = false;
  @state() accessor error: string | null = null;
  @state() accessor messages: ChatMessage[] = [];

  // Live streaming state for the in-flight request.
  @state() accessor stages: string[] = [];
  @state() accessor activeSurfaceIds: string[] = [];
  @state() accessor liveContentSurfaceIds: string[] = [];

  // Theme management
  @state() accessor isDark = false;
  #themeOverridden = false;
  #systemTheme?: MediaQueryList;

  // Bump this to force a re-render after the processor's surfacesMap mutates.
  @state() accessor renderVersion = 0;

  #client = new RestaurantA2UIClient();

  #processor = v0_8.Data.createSignalA2uiMessageProcessor();

  #surfaceStyleSheet = (() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      a2ui-row {
        align-items: stretch !important;
        flex-wrap: wrap !important;
        gap: 12px !important;
      }
      a2ui-card {
        display: flex !important;
        flex-direction: column !important;
        border: 1px solid var(--ge-border) !important;
        background: var(--ge-bg-alt) !important;
        border-radius: 12px !important;
        padding: 16px !important;
        box-shadow: var(--ge-shadow) !important;
        transition: transform 0.2s, box-shadow 0.2s !important;
        height: 100% !important;
      }
      a2ui-card:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 18px rgba(0,0,0,0.08) !important;
      }
      a2ui-button button {
        border: 1px solid var(--ge-blue) !important;
        color: var(--ge-blue) !important;
        background: transparent !important;
        border-radius: 20px !important;
        padding: 6px 14px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        transition: all 0.15s !important;
      }
      a2ui-button button:hover {
        background: var(--ge-blue-bg) !important;
      }
      a2ui-button.primary button {
        background: var(--ge-blue) !important;
        color: white !important;
        border: 1px solid var(--ge-blue) !important;
      }
      a2ui-button.primary button:hover {
        background: var(--ge-blue-hover) !important;
      }
    `);
    return sheet;
  })();

  connectedCallback() {
    super.connectedCallback();
    this.#systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    this.#applyTheme(this.#systemTheme?.matches ?? false);
    this.#systemTheme?.addEventListener?.("change", this.#onSystemThemeChange);
  }

  disconnectedCallback() {
    this.#systemTheme?.removeEventListener?.("change", this.#onSystemThemeChange);
    super.disconnectedCallback();
  }

  #onSystemThemeChange = (e: MediaQueryListEvent) => {
    if (!this.#themeOverridden) this.#applyTheme(e.matches);
  };

  #applyTheme(dark: boolean) {
    document.body.classList.toggle("dark", dark);
    document.body.classList.toggle("light", !dark);
    this.isDark = dark;
  }

  private toggleTheme() {
    this.#themeOverridden = true;
    this.#applyTheme(!this.isDark);
  }

  private async onA2uiAction(evt: CustomEvent<any>) {
    const detail = evt.detail;
    const action = detail?.action || detail;
    if (!action) return;
    const actionName = action.name || action.actionName || detail?.actionName;
    if (!actionName) return;

    const resolvedContext: Record<string, any> = {};
    const context = action.context;
    if (context) {
      if (Array.isArray(context)) {
        for (const item of context) {
          if (item.key && item.value) {
            const val =
              item.value.literalString ??
              item.value.literalNumber ??
              item.value.literalBoolean ??
              item.value;
            resolvedContext[item.key] = val;
          }
        }
      } else if (typeof context === "object") {
        Object.entries(context).forEach(([k, v]: [string, any]) => {
          resolvedContext[k] = v?.literalString ?? v?.literalNumber ?? v?.literalBoolean ?? v;
        });
      }
    }

    this.messages = [
      ...this.messages,
      {
        role: "user",
        text: `Selected: ${actionName}`,
        timestamp: new Date(),
      },
    ];
    this.scrollToBottom();

    await this.sendAndProcess({
      userAction: {
        actionName,
        sourceComponentId: detail.sourceComponentId,
        timestamp: new Date().toISOString(),
        context: resolvedContext,
      },
    }, { skipDisplay: true });
  }

  static styles = css`
    * { box-sizing: border-box; }

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

    .msg-content { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
    .sender-name {
      font-size: 12px; font-weight: 500;
      color: var(--ge-text-muted); padding: 0 2px;
    }
    .bubble {
      padding: 10px 16px; border-radius: 18px;
      line-height: 1.6; font-size: 16px;
      word-break: break-word;
    }
    .bubble p { margin: 0; }
    .bubble a { color: var(--ge-blue); text-decoration: underline; }
    .bubble a:hover { opacity: 0.8; }
    .bubble p + p { margin-top: 0.5em; }
    .bubble > :first-child { margin-top: 0; }
    .bubble > :last-child { margin-bottom: 0; }
    .bubble ul, .bubble ol { margin: 0.3em 0; padding-left: 1.2em; }
    .bubble pre { margin: 0.4em 0; }

    .msg.user .bubble {
      background: var(--ge-user-bg); color: var(--ge-user-text);
      border-radius: 18px 18px 4px 18px; font-weight: 400;
    }
    .msg.agent .bubble {
      background: transparent; color: var(--ge-text); padding: 0 2px;
    }
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
    .typing-content {
      display: flex; flex-direction: column; gap: 6px;
      min-width: min(520px, calc(100vw - 96px));
      max-width: min(850px, calc(100vw - 96px));
    }
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

    /* Live thinking widget / reasoning panel styling */
    .surface-container.live {
      max-width: 560px;
      max-height: none;
      margin-top: 8px;
      padding: 10px;
    }

    .stages {
      display: flex; flex-direction: column; gap: 4px;
      padding: 10px 14px;
      background: var(--ge-bg-alt); border-radius: 12px;
      min-width: 280px;
    }
    .stage {
      font-size: 13px; line-height: 1.4;
      animation: fadeIn 0.2s ease;
      border-radius: 6px;
    }
    .stage-summary {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 6px;
      cursor: pointer; user-select: none; list-style: none;
      border-radius: 6px;
    }
    .stage-summary::-webkit-details-marker { display: none; }
    .stage-summary::after {
      content: "▾"; margin-left: auto; font-size: 10px;
      color: var(--ge-text-muted); transition: transform 0.15s;
    }
    .stage:not([open]) .stage-summary::after { transform: rotate(-90deg); }
    .stage-summary:hover { background: var(--ge-border); }
    .stage-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; font-size: 12px; font-weight: 700;
    }
    .stage.done .stage-icon { color: #34a853; }
    .stage.done .stage-text { color: var(--ge-text-muted); }
    .stage.active .stage-icon { color: var(--ge-blue); }
    .stage.active .stage-text { color: var(--ge-text); font-weight: 500; }
    .stage-detail {
      padding: 4px 12px 8px 30px;
      font-size: 12px; line-height: 1.5; color: var(--ge-text-muted);
    }

    .reasoning {
      margin: 4px 0 8px;
      border: 1px solid var(--ge-border);
      border-radius: 10px;
      background: var(--ge-bg-alt);
      overflow: hidden;
    }
    .reasoning-summary {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px;
      cursor: pointer; font-size: 12px; color: var(--ge-text-muted);
      user-select: none; list-style: none;
    }
    .reasoning-summary::-webkit-details-marker { display: none; }
    .reasoning-summary::after {
      content: "▾"; margin-left: auto; font-size: 10px;
      transition: transform 0.15s;
    }
    .reasoning:not([open]) .reasoning-summary::after { transform: rotate(-90deg); }
    .reasoning-summary:hover { background: var(--ge-border); }
    .reasoning-stages {
      padding: 8px 12px 10px; background: transparent; border-radius: 0;
    }

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
          <div class="subtitle">Agent · A2UI v0.8</div>
        </div>
        <div class="header-spacer"></div>
        <button class="theme-toggle" @click=${this.toggleTheme}>
          <span class="g-icon">${this.isDark ? "dark_mode" : "light_mode"}</span>
        </button>
      </div>

      <div class="chat-area" id="chat-area">
        ${this.messages.length === 0 && !this.requesting
          ? this.renderWelcome()
          : nothing}
        ${this.messages.map((m) => this.renderMessage(m))}
        ${this.requesting
          ? this.stages.length > 0 ||
            this.activeSurfaceIds.length > 0 ||
            this.liveContentSurfaceIds.length > 0
            ? this.renderStages()
            : this.renderTyping()
          : nothing}
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
            ${msg.role === "agent"
              ? html`<div class="sender-name">Gemini</div>`
              : nothing}
            ${this.renderActivity(msg)}
            ${msg.text && msg.text.trim()
              ? html`<div class="bubble">
                  ${msg.role === "user"
                    ? msg.text
                    : until(renderMarkdownHtml(msg.text), html`${msg.text}`)}
                </div>`
              : nothing}
            ${msg.surfaceIds && msg.surfaceIds.length > 0
              ? this.renderSurfaces(msg.surfaceIds)
              : nothing}
            ${msg.role === "agent"
              ? html`<div class="msg-time">${time}</div>`
              : nothing}
          </div>
        </div>
      </div>
    `;
  }

  #surfaceObservers = new WeakMap<Element, MutationObserver>();

  updated() {
    const surfaces = this.renderRoot.querySelectorAll("a2ui-surface");
    for (const el of surfaces) {
      const sr = (el as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (!sr) continue;
      this.#adoptIntoAllShadowRoots(sr);
      requestAnimationFrame(() => this.#adoptIntoAllShadowRoots(sr));
      setTimeout(() => this.#adoptIntoAllShadowRoots(sr), 120);
      if (!this.#surfaceObservers.has(el)) {
        const obs = new MutationObserver(() => this.#adoptIntoAllShadowRoots(sr));
        obs.observe(sr, { childList: true, subtree: true });
        this.#surfaceObservers.set(el, obs);
      }
    }
  }

  #adoptIntoAllShadowRoots(root: ShadowRoot | Element) {
    const sheet = this.#surfaceStyleSheet;
    const adopt = (sr: ShadowRoot) => {
      if (!sr.adoptedStyleSheets.includes(sheet)) {
        sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
      }
    };
    if (root instanceof ShadowRoot) adopt(root);
    const queue: (Element | ShadowRoot)[] = [root];
    while (queue.length) {
      const node = queue.shift()!;
      const children = node instanceof Element ? [...node.children] : [...node.children];
      for (const c of children) {
        const childShadow = (c as HTMLElement).shadowRoot;
        if (childShadow) {
          adopt(childShadow);
          queue.push(childShadow);
        }
        queue.push(c);
      }
    }
  }

  private renderActivity(msg: ChatMessage) {
    if (msg.role !== "agent") return nothing;
    if (msg.stages && msg.stages.length > 0) {
      return this.renderReasoningDetails(msg.stages, false);
    }
    return nothing;
  }

  private renderSurfaces(surfaceIds: string[], live = false) {
    const surfacesMap = this.#processor.getSurfaces();
    const surfaces = surfaceIds
      .map((id) => [id, surfacesMap.get(id)] as const)
      .filter(([, s]) => s != null);

    if (surfaces.length === 0) return nothing;

    return html`
      ${repeat(
        surfaces,
        ([id]) => id,
        ([id, surface]) => html`
          <div class="surface-container ${live ? "live" : ""}">
            <a2ui-surface
              .surfaceId=${id}
              .surface=${surface}
              .processor=${this.#processor}
              .enableCustomElements=${true}
              @a2uiaction=${this.onA2uiAction}
            ></a2ui-surface>
          </div>
        `,
      )}
    `;
  }

  private renderReasoningDetails(stages: string[], open = true) {
    return html`
      <details class="reasoning" ?open=${open}>
        <summary class="reasoning-summary">
          <span class="g-icon" style="font-size:14px">psychology</span>
          <span>Thought for ${stages.length} step${stages.length === 1 ? "" : "s"}</span>
        </summary>
        <div class="stages reasoning-stages">
          ${stages.map((s) => this.renderStage(s, false))}
        </div>
      </details>
    `;
  }

  private renderStage(stageText: string, isActive: boolean) {
    const nl = stageText.indexOf("\n");
    const title = nl === -1 ? stageText : stageText.slice(0, nl);
    const detail = nl === -1 ? "" : stageText.slice(nl + 1).trim();
    const stateClass = isActive ? "active" : "done";
    const icon = isActive ? "•" : "✓";

    return html`
      <details class="stage ${stateClass}">
        <summary class="stage-summary">
          <span class="stage-icon">${icon}</span>
          <span class="stage-text">${title}</span>
        </summary>
        ${detail ? html`<div class="stage-detail">${detail}</div>` : nothing}
      </details>
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

  private renderStages() {
    void this.renderVersion;
    const progressSurfaceIds = this.activeSurfaceIds.length > 0
      ? [this.activeSurfaceIds[this.activeSurfaceIds.length - 1]]
      : [];
    const liveSurfaceIds = [
      ...progressSurfaceIds,
      ...this.liveContentSurfaceIds,
    ];
    return html`
      <div class="typing-row">
        <div class="typing">
          <div class="avatar">
            <img src="/gemini-icon.svg" width="32" height="32" alt="Gemini" />
          </div>
          <div class="typing-content">
            ${liveSurfaceIds.length > 0
              ? this.renderSurfaces(liveSurfaceIds, true)
              : html`
                  <div class="stages">
                    ${this.stages.map((s, i) =>
                      this.renderStage(s, i === this.stages.length - 1),
                    )}
                  </div>
                `}
          </div>
        </div>
      </div>
    `;
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

  private async sendAndProcess(
    message: string | Record<string, unknown>,
    options: { skipDisplay?: boolean } = {},
  ) {
    if (typeof message === "string" && !options.skipDisplay) {
      this.messages = [
        ...this.messages,
        { role: "user", text: message, timestamp: new Date() },
      ];
    }

    this.requesting = true;
    this.error = null;
    this.stages = [];
    this.activeSurfaceIds = [];
    this.liveContentSurfaceIds = [];
    this.scrollToBottom();

    const existingIds = new Set(this.#processor.getSurfaces().keys());

    try {
      const response = await this.#client.send(message, {
        onStage: (text: string) => {
          this.stages = [...this.stages, text];
          this.scrollToBottom();
        },
        onA2UIMessage: (a2uiMessages) => {
          this.processLiveA2UI(a2uiMessages);
          this.scrollToBottom();
        },
      });

      if (response.a2uiMessages.length > 0) {
        this.#processor.processMessages(response.a2uiMessages as any);
      }

      const newSurfaceIds = [...this.#processor.getSurfaces().keys()].filter(
        (id) => !existingIds.has(id) && !id.startsWith(PROGRESS_SURFACE_PREFIX),
      );
      const contentIds = [
        ...new Set([...this.liveContentSurfaceIds, ...newSurfaceIds]),
      ];
      this.renderVersion++;
      this.messages = [
        ...this.messages,
        {
          role: "agent",
          text: response.text || "",
          surfaceIds: contentIds.length > 0 ? contentIds : undefined,
          stages: this.stages.length > 0 ? [...this.stages] : undefined,
          timestamp: new Date(),
        },
      ];
    } catch (err) {
      console.error("[A2UI] Error:", err);
      this.error = `${err}`;
    } finally {
      this.requesting = false;
      this.stages = [];
      this.activeSurfaceIds = [];
      this.liveContentSurfaceIds = [];
      this.scrollToBottom();
    }
  }

  private processLiveA2UI(a2uiMessages: Array<Record<string, unknown>>) {
    if (a2uiMessages.length === 0) return;

    const idsFromMessages = this.extractSurfaceIds(a2uiMessages);
    const before = new Set(this.#processor.getSurfaces().keys());
    this.#processor.processMessages(a2uiMessages as any);
    const after = this.#processor.getSurfaces();
    const newIds = [...after.keys()].filter((id) => !before.has(id));
    const ids = [...new Set([...idsFromMessages, ...newIds])].filter((id) =>
      after.has(id),
    );

    for (const id of ids) {
      if (id.startsWith(PROGRESS_SURFACE_PREFIX)) {
        this.activeSurfaceIds = [id];
      } else if (!this.liveContentSurfaceIds.includes(id)) {
        this.liveContentSurfaceIds = [...this.liveContentSurfaceIds, id];
      }
    }
    this.renderVersion++;
  }

  private extractSurfaceIds(a2uiMessages: Array<Record<string, unknown>>) {
    const ids: string[] = [];
    for (const msg of a2uiMessages) {
      for (const key of ["beginRendering", "surfaceUpdate", "dataModelUpdate"]) {
        const update = msg[key] as Record<string, unknown> | undefined;
        const surfaceId = update?.["surfaceId"];
        if (typeof surfaceId === "string") ids.push(surfaceId);
      }
    }
    return ids;
  }
}
