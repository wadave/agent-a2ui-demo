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
  progressSteps?: ProgressStep[];
  timestamp: Date;
}

type ProgressStepState = "pending" | "active" | "done" | "failed";
type ProgressToolState = "pending" | "running" | "done" | "failed";

interface ProgressTool {
  label: string;
  state: ProgressToolState;
}

interface ProgressStep {
  title: string;
  detail?: string;
  state: ProgressStepState;
  tools: ProgressTool[];
  completedTools: number;
  totalTools: number;
  visualStartedAt?: number;
}

const TAG = "a2ui-app-shell";
const PROGRESS_SURFACE_PREFIX = "tool-progress-";
const OVERALL_PROGRESS_START = 5;
const OVERALL_PROGRESS_MAX = 98;
const INITIAL_PROGRESS_TARGET_MS = 8_000;
const DEFAULT_STEP_TARGET_MS = 20_000;
const MIN_PROGRESS_UPDATE_VISIBLE_MS = 650;
const MIN_FINAL_STEP_VISIBLE_MS = 900;
const COMPLETION_HOLD_MS = 250;
const STEP_STATE_BY_MARKER: Record<string, ProgressStepState> = {
  "✓": "done",
  "▸": "active",
  "○": "pending",
  "✗": "failed",
};
const TOOL_STATE_BY_MARKER: Record<string, ProgressToolState> = {
  "○": "pending",
  "•": "running",
  "✓": "done",
  "✗": "failed",
};
const STEP_ICON_BY_STATE: Record<ProgressStepState, string> = {
  pending: "○",
  active: "•",
  done: "✓",
  failed: "✗",
};

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
  @state() accessor progressSteps: ProgressStep[] = [];
  @state() accessor liveContentSurfaceIds: string[] = [];
  @state() accessor progressPercent = 0;

  // Theme management
  @state() accessor isDark = false;
  #themeOverridden = false;
  #systemTheme?: MediaQueryList;
  #progressTimer?: number;
  #requestStartedAt = 0;

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
    this.stopProgressTimer();
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

    .progress-panel {
      border: 1px solid var(--ge-border);
      border-radius: 12px;
      background: var(--ge-bg-alt);
      padding: 12px 14px;
      box-shadow: var(--ge-shadow);
      min-width: 280px;
    }
    .progress-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .progress-copy {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .progress-kicker {
      color: var(--ge-text-muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .progress-title {
      color: var(--ge-text);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .progress-percent {
      color: var(--ge-text-muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .progress-track {
      position: relative;
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: light-dark(#dfe5ee, #333a45);
    }
    .progress-fill {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0;
      border-radius: inherit;
      background: linear-gradient(90deg, #1a73e8, #34a853);
      transition: width 0.35s ease;
    }
    .progress-fill::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,0.45),
        transparent
      );
      animation: sweep 1.3s ease-in-out infinite;
    }
    .progress-stage-list {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--ge-border);
    }
    .step-tools {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 2px 12px 2px 30px;
    }
    .step-tool-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: var(--ge-text-muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .step-tool-label {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .step-progress {
      padding: 6px 12px 8px 30px;
    }
    .step-progress-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 5px;
      color: var(--ge-text-muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .step-progress-track {
      position: relative;
      height: 4px;
      overflow: hidden;
      border-radius: 999px;
      background: light-dark(#d8dee8, #303742);
    }
    .step-progress-fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: inherit;
      background: var(--ge-blue);
      transition: width 0.25s ease;
    }
    .step-progress-fill.indeterminate {
      width: 34%;
      animation: stepIndeterminate 1.1s ease-in-out infinite;
    }
    .step-progress-track.failed .step-progress-fill {
      background: light-dark(#c5221f, #f28b82);
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
    @keyframes sweep {
      from { transform: translateX(-100%); }
      to { transform: translateX(100%); }
    }
    @keyframes stepIndeterminate {
      from { transform: translateX(-120%); }
      to { transform: translateX(320%); }
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
        ${this.requesting ? this.renderStages() : nothing}
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
    if (msg.progressSteps && msg.progressSteps.length > 0) {
      return this.renderReasoningProgressDetails(msg.progressSteps, false);
    }
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

  private renderReasoningProgressDetails(
    progressSteps: ProgressStep[],
    open = true,
  ) {
    return html`
      <details class="reasoning" ?open=${open}>
        <summary class="reasoning-summary">
          <span class="g-icon" style="font-size:14px">psychology</span>
          <span>Thought for ${progressSteps.length} step${progressSteps.length === 1 ? "" : "s"}</span>
        </summary>
        <div class="stages reasoning-stages">
          ${progressSteps.map((s) => this.renderProgressStep(s))}
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
      <details class="stage ${stateClass}" ?open=${isActive}>
        <summary class="stage-summary">
          <span class="stage-icon">${icon}</span>
          <span class="stage-text">${title}</span>
        </summary>
        ${detail ? html`<div class="stage-detail">${detail}</div>` : nothing}
      </details>
    `;
  }

  private renderProgressStep(
    step: ProgressStep,
    options: { openPending?: boolean } = {},
  ) {
    const stateClass = step.state === "active" ? "active" : step.state;
    const icon = STEP_ICON_BY_STATE[step.state] ?? "○";
    const open = options.openPending || step.state !== "pending";

    return html`
      <details class="stage ${stateClass}" ?open=${open}>
        <summary class="stage-summary">
          <span class="stage-icon">${icon}</span>
          <span class="stage-text">${step.title}</span>
        </summary>
        ${step.detail
          ? html`<div class="stage-detail">${step.detail}</div>`
          : nothing}
        ${step.tools.length > 0
          ? html`
              <div class="step-tools">
                ${step.tools.map(
                  (tool) => html`
                    <div class="step-tool-row">
                      <span>${this.renderToolMarker(tool.state)}</span>
                      <span class="step-tool-label">${tool.label}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}
        ${this.renderStepToolProgress(step)}
      </details>
    `;
  }

  private renderStepToolProgress(step: ProgressStep) {
    const total = Math.max(step.totalTools, step.tools.length);
    const completed = Math.max(0, Math.min(step.completedTools, total));
    const pct = this.getStepVisualPercent(step);
    const failed = step.state === "failed" || step.tools.some((t) => t.state === "failed");
    const label = this.getStepProgressLabel(step, total, completed, failed);
    const status = step.state === "pending" ? "Waiting" : `${pct}%`;

    return html`
      <div class="step-progress">
        <div class="step-progress-meta">
          <span>${label}</span>
          <span>${status}</span>
        </div>
        <div class="step-progress-track ${failed ? "failed" : ""}">
          <div
            class="step-progress-fill"
            style=${`width: ${pct}%`}
          ></div>
        </div>
      </div>
    `;
  }

  private renderToolMarker(state: ProgressToolState) {
    if (state === "done") return "✓";
    if (state === "failed") return "✗";
    if (state === "pending") return "○";
    return "•";
  }

  private getStepProgressLabel(
    step: ProgressStep,
    total: number,
    completed: number,
    failed: boolean,
  ) {
    if (failed) return total > 0 ? "Tool call failed" : "Step failed";
    if (step.state === "pending") {
      return total > 0 ? "Waiting for tool call" : "Waiting";
    }
    if (step.state === "done") {
      return total > 0 ? "Tool calls complete" : "Step complete";
    }
    if (total === 0) return "In progress";
    if (completed === 0) {
      return total === 1 ? "Tool call running" : "Tool calls running";
    }
    return `${completed}/${total} tool call${total === 1 ? "" : "s"} complete`;
  }

  private getStepVisualPercent(step: ProgressStep) {
    if (step.state === "done") return 100;
    if (step.state === "failed") return Math.max(8, Math.min(100, this.getToolPercent(step)));
    if (step.state === "pending") return 0;

    const startedAt = step.visualStartedAt ?? this.#requestStartedAt;
    const elapsedMs = Date.now() - startedAt;
    const estimatedMs = this.getStepEstimatedMs(step);
    const elapsedPct = Math.round(
      Math.min(0.95, Math.max(0, elapsedMs / estimatedMs)) * 100,
    );
    return Math.max(this.getToolPercent(step), elapsedPct);
  }

  private getToolPercent(step: ProgressStep) {
    const total = Math.max(step.totalTools, step.tools.length);
    if (total === 0) return 0;
    const completed = Math.max(0, Math.min(step.completedTools, total));
    return Math.round((completed / total) * 100);
  }

  private getStepEstimatedMs(step: ProgressStep) {
    const title = step.title.toLowerCase();
    if (title.includes("understanding")) return INITIAL_PROGRESS_TARGET_MS;
    if (title.includes("searching for restaurants")) return 32_000;
    if (title.includes("compiling dashboard")) return 3_000;
    if (title.includes("directions")) return 18_000;
    if (title.includes("google workspace")) return 25_000;
    return DEFAULT_STEP_TARGET_MS;
  }

  private renderProgressPanel() {
    const pct = Math.max(0, Math.min(100, Math.round(this.progressPercent)));
    const latest = this.stages[this.stages.length - 1] ?? "";
    const activeStep = this.progressSteps.find((step) => step.state === "active");
    const title =
      activeStep?.title || (latest ? latest.split("\n")[0] : "Preparing request");
    const progressLabel =
      pct >= OVERALL_PROGRESS_MAX ? "Still working" : `${pct}%`;

    return html`
      <div class="progress-panel">
        <div class="progress-head">
          <span class="g-icon" style="font-size:18px">psychology</span>
          <div class="progress-copy">
            <span class="progress-kicker">Thinking</span>
            <span class="progress-title">${title}</span>
          </div>
          <span class="progress-percent">${progressLabel}</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          aria-label="Agent progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${pct}
        >
          <div class="progress-fill" style=${`width: ${pct}%`}></div>
        </div>
        ${this.progressSteps.length > 0
          ? html`
              <div class="progress-stage-list">
                ${this.progressSteps.map((s) =>
                  this.renderProgressStep(s, { openPending: true }),
                )}
              </div>
            `
          : this.stages.length > 0
            ? html`
                <div class="progress-stage-list">
                  ${this.stages.map((s, i) =>
                  this.renderStage(s, i === this.stages.length - 1),
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderStages() {
    void this.renderVersion;
    const liveSurfaceIds = [...this.liveContentSurfaceIds];
    return html`
      <div class="typing-row">
        <div class="typing">
          <div class="avatar">
            <img src="/gemini-icon.svg" width="32" height="32" alt="Gemini" />
          </div>
          <div class="typing-content">
            ${this.renderProgressPanel()}
            ${liveSurfaceIds.length > 0
              ? this.renderSurfaces(liveSurfaceIds, true)
              : nothing}
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
    this.progressSteps = [];
    this.liveContentSurfaceIds = [];
    this.startProgressTimer();
    this.scrollToBottom();

    const existingIds = new Set(this.#processor.getSurfaces().keys());
    let lastProgressPaintAt = Date.now();
    let progressQueue = Promise.resolve();
    const enqueueProgressUpdate = (text: string, progressSteps?: unknown[]) => {
      progressQueue = progressQueue.then(async () => {
        const elapsedMs = Date.now() - lastProgressPaintAt;
        const waitMs = Math.max(0, MIN_PROGRESS_UPDATE_VISIBLE_MS - elapsedMs);
        if (waitMs > 0) {
          await this.delay(waitMs);
        }

        this.addStage(text);
        if (progressSteps) this.updateProgressFromMetadata(progressSteps);
        this.scrollToBottom();
        await this.updateComplete;
        lastProgressPaintAt = Date.now();
      });
    };

    try {
      const response = await this.#client.send(message, {
        onStage: (text: string, progressSteps?: unknown[]) => {
          enqueueProgressUpdate(text, progressSteps);
        },
        onA2UIMessage: (a2uiMessages) => {
          this.processLiveA2UI(a2uiMessages);
          this.scrollToBottom();
        },
      });

      await progressQueue;
      await this.holdFastFinalStepBeforeResult();

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
          progressSteps: this.progressSteps.length > 0
            ? this.progressSteps.map((step) => ({
                ...step,
                tools: [...step.tools],
              }))
            : undefined,
          timestamp: new Date(),
        },
      ];
    } catch (err) {
      await progressQueue.catch((queueErr) => {
        console.warn("[A2UI] Progress update failed:", queueErr);
      });
      console.error("[A2UI] Error:", err);
      this.error = `${err}`;
    } finally {
      if (!this.error) {
        this.progressPercent = 100;
        await this.delay(COMPLETION_HOLD_MS);
      }
      this.stopProgressTimer();
      this.requesting = false;
      this.stages = [];
      this.progressSteps = [];
      this.liveContentSurfaceIds = [];
      this.progressPercent = 0;
      this.scrollToBottom();
    }
  }

  private async holdFastFinalStepBeforeResult() {
    const lastIndex = this.progressSteps.length - 1;
    if (lastIndex < 0) {
      return;
    }

    let lastStep = this.progressSteps[lastIndex];
    if (lastStep.state === "pending") {
      this.setProgressStep(lastIndex, (step) => ({
        ...step,
        state: "active",
        tools: step.tools.map((tool) => ({
          ...tool,
          state: tool.state === "pending" ? "running" : tool.state,
        })),
        visualStartedAt: Date.now(),
      }));
      this.syncProgressPercentToSteps();
      await this.updateComplete;
      await this.delay(MIN_FINAL_STEP_VISIBLE_MS);
      lastStep = this.progressSteps[lastIndex];
    }

    if (lastStep.state === "active") {
      const startedAt = lastStep.visualStartedAt ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = MIN_FINAL_STEP_VISIBLE_MS - elapsedMs;
      if (remainingMs > 0) {
        await this.delay(remainingMs);
      }
      this.setProgressStep(lastIndex, (step) => this.completeProgressStep(step));
      this.progressPercent = 100;
      await this.updateComplete;
      await this.delay(COMPLETION_HOLD_MS);
      return;
    }

    if (lastStep.state !== "done") {
      return;
    }

    this.progressPercent = 100;
    await this.updateComplete;

    const startedAt = lastStep.visualStartedAt ?? Date.now();
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = MIN_FINAL_STEP_VISIBLE_MS - elapsedMs;
    if (remainingMs > 0) {
      await this.delay(remainingMs);
    }
  }

  private setProgressStep(
    index: number,
    update: (step: ProgressStep) => ProgressStep,
  ) {
    this.progressSteps = this.progressSteps.map((step, i) =>
      i === index ? update(step) : step,
    );
  }

  private completeProgressStep(step: ProgressStep): ProgressStep {
    const totalTools = Math.max(step.totalTools, step.tools.length);
    return {
      ...step,
      state: "done",
      tools: step.tools.map((tool) => ({ ...tool, state: "done" })),
      completedTools: totalTools,
      totalTools,
    };
  }

  private delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private addStage(text: string) {
    if (this.stages[this.stages.length - 1] === text) return;
    this.stages = [...this.stages, text];
  }

  private startProgressTimer() {
    this.stopProgressTimer();
    const now = Date.now();
    this.#requestStartedAt = now;
    this.progressPercent = OVERALL_PROGRESS_START;
    this.progressSteps = [
      {
        title: "Understanding request",
        detail: "Analyzing your message and choosing the next action.",
        state: "active",
        tools: [],
        completedTools: 0,
        totalTools: 0,
        visualStartedAt: now,
      },
    ];
    this.#progressTimer = window.setInterval(() => {
      this.advanceEstimatedProgress();
    }, 300);
  }

  private stopProgressTimer() {
    if (this.#progressTimer !== undefined) {
      window.clearInterval(this.#progressTimer);
      this.#progressTimer = undefined;
    }
  }

  private advanceEstimatedProgress() {
    if (!this.requesting) return;
    const target =
      this.getOverallProgressTarget() ?? this.getInitialProgressTarget();
    this.progressPercent = Math.max(this.progressPercent, target);
  }

  private getInitialProgressTarget() {
    const elapsedMs = Date.now() - this.#requestStartedAt;
    const elapsedRatio = Math.min(1, elapsedMs / INITIAL_PROGRESS_TARGET_MS);
    return OVERALL_PROGRESS_START + elapsedRatio * 14;
  }

  private getOverallProgressTarget() {
    if (this.progressSteps.length === 0) return null;
    if (this.isOnlyInitialUnderstandingStep()) {
      return this.getInitialProgressTarget();
    }

    const toolTarget = this.getOverallToolProgressTarget();
    if (toolTarget !== null) {
      return toolTarget;
    }

    const weights = this.progressSteps.map((step) => this.getStepWeight(step));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) return null;

    let weightedProgress = 0;
    for (let i = 0; i < this.progressSteps.length; i += 1) {
      weightedProgress += weights[i] * (this.getStepVisualPercent(this.progressSteps[i]) / 100);
    }

    const allDone = this.progressSteps.every((step) => step.state === "done");
    const target = (weightedProgress / totalWeight) * 100;
    return allDone ? 100 : Math.min(OVERALL_PROGRESS_MAX, target);
  }

  private getOverallToolProgressTarget() {
    const totalTools = this.progressSteps.reduce(
      (sum, step) => sum + Math.max(step.totalTools, step.tools.length),
      0,
    );
    if (totalTools === 0) return null;

    const completedTools = this.progressSteps.reduce((sum, step) => {
      const total = Math.max(step.totalTools, step.tools.length);
      return sum + Math.max(0, Math.min(step.completedTools, total));
    }, 0);
    const allDone = this.progressSteps.every((step) => step.state === "done");
    if (allDone && completedTools >= totalTools) return 100;

    const target = Math.round((completedTools / totalTools) * 100);
    return Math.max(OVERALL_PROGRESS_START, Math.min(OVERALL_PROGRESS_MAX, target));
  }

  private isOnlyInitialUnderstandingStep() {
    if (this.progressSteps.length !== 1) return false;
    const [step] = this.progressSteps;
    return (
      step.title.toLowerCase().includes("understanding") &&
      step.state === "active" &&
      step.tools.length === 0
    );
  }

  private getStepWeight(step: ProgressStep) {
    const title = step.title.toLowerCase();
    if (title.includes("understanding")) return 12;
    if (title.includes("searching for restaurants")) return 84;
    if (title.includes("compiling dashboard")) return 4;
    return Math.max(10, this.getStepEstimatedMs(step) / 1000);
  }

  private updateProgressFromA2UI(a2uiMessages: Array<Record<string, unknown>>) {
    let nextSteps: ProgressStep[] | null = null;
    for (const msg of a2uiMessages) {
      const steps = this.extractProgressSteps(msg);
      if (steps.length > 0) nextSteps = steps;
    }
    if (!nextSteps) return;

    this.progressSteps = this.mergeProgressStepTiming(nextSteps);
    this.syncProgressPercentToSteps();
  }

  private updateProgressFromMetadata(progressSteps: unknown[]) {
    const normalizedSteps = progressSteps
      .map((step) => this.normalizeProgressStep(step))
      .filter((step): step is ProgressStep => Boolean(step));
    if (normalizedSteps.length > 0) {
      this.progressSteps = this.mergeProgressStepTiming(normalizedSteps);
      this.syncProgressPercentToSteps();
    }
  }

  private syncProgressPercentToSteps() {
    const target = this.getOverallProgressTarget();
    if (target !== null) {
      this.progressPercent = Math.max(this.progressPercent, target);
    }
  }

  private mergeProgressStepTiming(nextSteps: ProgressStep[]) {
    const now = Date.now();
    const previousByKey = new Map(
      this.progressSteps.map((step, index) => [
        this.progressStepKey(step, index),
        step,
      ]),
    );
    const previousByStableKey = new Map(
      this.progressSteps.map((step, index) => [
        this.progressStableStepKey(step, index),
        step,
      ]),
    );

    return nextSteps.map((step, index) => {
      const previous =
        previousByKey.get(this.progressStepKey(step, index)) ??
        previousByStableKey.get(this.progressStableStepKey(step, index));
      const becameActive = step.state === "active" && previous?.state !== "active";
      const visualStartedAt =
        step.state === "active"
          ? becameActive
            ? now
            : previous?.visualStartedAt ?? now
          : previous?.visualStartedAt;
      return { ...step, visualStartedAt };
    });
  }

  private progressStepKey(step: ProgressStep, index: number) {
    const toolLabels = step.tools.map((tool) => tool.label).join(",");
    return `${index}:${step.title}:${toolLabels}`;
  }

  private progressStableStepKey(step: ProgressStep, index: number) {
    return `${index}:${step.title}`;
  }

  private normalizeProgressStep(step: unknown): ProgressStep | null {
    if (!step || typeof step !== "object") return null;
    const raw = step as Record<string, unknown>;
    const title = typeof raw["title"] === "string" ? raw["title"] : "Working";
    const detail = typeof raw["detail"] === "string" ? raw["detail"] : undefined;
    const state = this.normalizeProgressStepState(raw["state"]);
    const rawTools = Array.isArray(raw["tools"]) ? raw["tools"] : [];
    const tools = rawTools
      .map((tool) => this.normalizeProgressTool(tool))
      .filter((tool): tool is ProgressTool => Boolean(tool));
    const completedTools =
      typeof raw["completedTools"] === "number"
        ? raw["completedTools"]
        : tools.filter((tool) => tool.state === "done").length;
    const totalTools =
      typeof raw["totalTools"] === "number" ? raw["totalTools"] : tools.length;

    return {
      title,
      detail,
      state,
      tools,
      completedTools,
      totalTools,
    };
  }

  private normalizeProgressTool(tool: unknown): ProgressTool | null {
    if (!tool || typeof tool !== "object") return null;
    const raw = tool as Record<string, unknown>;
    const label = typeof raw["label"] === "string" ? raw["label"] : "Tool call";
    return {
      label,
      state: this.normalizeProgressToolState(raw["state"]),
    };
  }

  private normalizeProgressStepState(state: unknown): ProgressStepState {
    if (
      state === "pending" ||
      state === "active" ||
      state === "done" ||
      state === "failed"
    ) {
      return state;
    }
    return "pending";
  }

  private normalizeProgressToolState(state: unknown): ProgressToolState {
    if (
      state === "pending" ||
      state === "running" ||
      state === "done" ||
      state === "failed"
    ) {
      return state;
    }
    return "running";
  }

  private extractProgressSteps(msg: Record<string, unknown>): ProgressStep[] {
    type DraftStep = {
      title?: string;
      detail?: string;
      state?: ProgressStepState;
      tools: ProgressTool[];
      completedTools?: number;
      totalTools?: number;
    };

    const update =
      this.getProgressUpdate(msg, "surfaceUpdate") ??
      this.getProgressUpdate(msg, "updateComponents");
    const components = update?.["components"];
    if (!Array.isArray(components)) return [];

    const drafts = new Map<number, DraftStep>();
    const ensureDraft = (idx: number) => {
      let draft = drafts.get(idx);
      if (!draft) {
        draft = { tools: [] };
        drafts.set(idx, draft);
      }
      return draft;
    };

    for (const rawComponent of components) {
      if (!rawComponent || typeof rawComponent !== "object") continue;
      const component = rawComponent as Record<string, unknown>;
      const id = component["id"];
      if (typeof id !== "string") continue;
      const text = this.getProgressComponentText(component);
      if (!text) continue;

      let match = id.match(/^th-step-(\d+)$/);
      if (match) {
        const draft = ensureDraft(Number(match[1]));
        const parsed = this.parseMarkedProgressText(
          text,
          STEP_STATE_BY_MARKER,
          "pending",
        );
        draft.title = parsed.label;
        draft.state = parsed.state;
        continue;
      }

      match = id.match(/^th-detail-(\d+)$/);
      if (match) {
        ensureDraft(Number(match[1])).detail = this.normalizeProgressText(text);
        continue;
      }

      match = id.match(/^th-tool-(\d+)-(\d+)$/);
      if (match) {
        const draft = ensureDraft(Number(match[1]));
        const toolIndex = Number(match[2]);
        const parsed = this.parseMarkedProgressText(
          this.normalizeProgressText(text).replace(/^↳\s*/, ""),
          TOOL_STATE_BY_MARKER,
          "running",
        );
        draft.tools[toolIndex] = {
          label: parsed.label,
          state: parsed.state,
        };
        continue;
      }

      match = id.match(/^th-toolbar-label-(\d+)$/);
      if (match) {
        const counts = this.parseToolCounts(text);
        if (counts) {
          const draft = ensureDraft(Number(match[1]));
          draft.completedTools = counts.completed;
          draft.totalTools = counts.total;
        }
      }
    }

    return [...drafts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, draft]) => {
        const tools = draft.tools.filter((tool): tool is ProgressTool =>
          Boolean(tool),
        );
        const completedTools =
          draft.completedTools ??
          tools.filter((tool) => tool.state === "done").length;
        const totalTools = draft.totalTools ?? tools.length;
        const inferredState =
          draft.state ??
          (tools.some((tool) => tool.state === "running")
            ? "active"
            : tools.length > 0 && tools.every((tool) => tool.state === "done")
              ? "done"
              : "pending");
        return {
          title: draft.title || "Working",
          detail: draft.detail,
          state: inferredState,
          tools,
          completedTools,
          totalTools,
        };
      });
  }

  private getProgressUpdate(msg: Record<string, unknown>, key: string) {
    const update = msg[key] as Record<string, unknown> | undefined;
    const surfaceId = update?.["surfaceId"];
    if (
      typeof surfaceId === "string" &&
      surfaceId.startsWith(PROGRESS_SURFACE_PREFIX)
    ) {
      return update;
    }
    return undefined;
  }

  private getProgressComponentText(component: Record<string, unknown>) {
    const topLevelText = component["text"];
    if (typeof topLevelText === "string") return topLevelText;

    const componentBody = component["component"];
    if (!componentBody || typeof componentBody !== "object") return null;

    const textComponent = (componentBody as Record<string, unknown>)["Text"];
    if (!textComponent || typeof textComponent !== "object") return null;

    const text = (textComponent as Record<string, unknown>)["text"];
    if (typeof text === "string") return text;
    if (text && typeof text === "object") {
      const literalString = (text as Record<string, unknown>)["literalString"];
      if (typeof literalString === "string") return literalString;
    }
    return null;
  }

  private parseMarkedProgressText<T extends string>(
    text: string,
    stateByMarker: Record<string, T>,
    fallbackState: T,
  ) {
    const clean = this.normalizeProgressText(text);
    const marker = clean.charAt(0);
    const hasMarker = marker in stateByMarker;
    return {
      state: hasMarker ? stateByMarker[marker] : fallbackState,
      label: hasMarker ? clean.slice(marker.length).trim() : clean,
    };
  }

  private parseToolCounts(text: string) {
    const match = this.normalizeProgressText(text).match(
      /Tool calls\s*·\s*(\d+)\s*\/\s*(\d+)/,
    );
    if (!match) return null;
    return {
      completed: Number(match[1]),
      total: Number(match[2]),
    };
  }

  private normalizeProgressText(text: string) {
    return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  private processLiveA2UI(a2uiMessages: Array<Record<string, unknown>>) {
    if (a2uiMessages.length === 0) return;

    this.updateProgressFromA2UI(a2uiMessages);
    const renderMessages = a2uiMessages.filter(
      (msg) => !this.isProgressA2UIMessage(msg),
    );
    if (renderMessages.length === 0) {
      this.renderVersion++;
      return;
    }

    const idsFromMessages = this.extractSurfaceIds(renderMessages);
    const before = new Set(this.#processor.getSurfaces().keys());
    this.#processor.processMessages(renderMessages as any);
    const after = this.#processor.getSurfaces();
    const newIds = [...after.keys()].filter((id) => !before.has(id));
    const ids = [...new Set([...idsFromMessages, ...newIds])].filter((id) =>
      after.has(id),
    );

    for (const id of ids) {
      if (id.startsWith(PROGRESS_SURFACE_PREFIX)) {
        continue;
      }
      if (!this.liveContentSurfaceIds.includes(id)) {
        this.liveContentSurfaceIds = [...this.liveContentSurfaceIds, id];
      }
    }
    this.renderVersion++;
  }

  private isProgressA2UIMessage(msg: Record<string, unknown>) {
    return Boolean(
      this.getProgressUpdate(msg, "beginRendering") ||
        this.getProgressUpdate(msg, "createSurface") ||
        this.getProgressUpdate(msg, "surfaceUpdate") ||
        this.getProgressUpdate(msg, "updateComponents") ||
        this.getProgressUpdate(msg, "dataModelUpdate") ||
        this.getProgressUpdate(msg, "updateDataModel"),
    );
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
