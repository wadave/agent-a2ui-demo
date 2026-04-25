import './a2ui-surface-container';
import 'google3/third_party/javascript/material/web/icon/icon';
import './demo-dialog';
import './demo-slide-out';

import {Types} from 'google3/third_party/a2ui/renderers/lit_internal';
import {css, html, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators';

import {styles as composerStyles} from './a2ui-composer.css';
import {DemoSlideOut} from './demo-slide-out';
import {SchemaValidator} from './schema-validator';
import {SAMPLE_A2UI_MESSAGES} from './settings';

/**
 * Composer interface for A2UI components.
 */
@customElement('a2ui-composer')
export class A2uiComposer extends LitElement {
  @state() messagesJson = SAMPLE_A2UI_MESSAGES;

  @state() validationError: string|null = null;
  @state() actionLogs: any[] = [];

  // The actual messages passed to the surface container
  @state() a2UIMessages: Types.ServerToClientMessage[] = [];

  @query('#messages-input') messagesTextarea!: HTMLTextAreaElement;
  @query('demo-slide-out') slideOut!: DemoSlideOut;

  @state() expandedEditor: boolean = false;
  @state() expandedLogs: boolean = false;

  static override styles = [composerStyles];

  override connectedCallback() {
    super.connectedCallback();
    this.refreshPreview();
  }

  private handleReformat() {
    try {
      if (this.messagesTextarea.value.trim()) {
        const msgs = JSON.parse(this.messagesTextarea.value);
        this.messagesJson = JSON.stringify(msgs, null, 2);
      }
      this.validationError = null;
    } catch (e: any) {
      this.validationError = 'Parse error during reformat: ' + e.message;
    }
  }

  private async handleCopy() {
    try {
      await navigator.clipboard.writeText(this.messagesTextarea.value);
      this.slideOut.show('JSON copied to clipboard!');
    } catch (e: any) {
      this.slideOut.show('Failed to copy: ' + e.message);
    }
  }

  private handleRefresh() {
    this.refreshPreview();
  }

  private refreshPreview() {
    this.validationError = null;
    try {
      const text = this.messagesTextarea ? this.messagesTextarea.value :
                                           this.messagesJson;

      if (!text.trim()) {
        this.a2UIMessages = [];
        return;
      }

      let msgs = JSON.parse(text) as any;
      if (!Array.isArray(msgs)) {
        msgs = [msgs];
      }

      const finalMessages: Types.ServerToClientMessage[] = [];
      const validationErrors: string[] = [];

      // Validate the messages.
      for (const msg of msgs) {
        if (msg.surfaceUpdate) {
          const error =
              SchemaValidator.validateSurfaceUpdate(msg.surfaceUpdate);
          if (error) {
            validationErrors.push(`Message (surfaceUpdate): ${error}`);
          }
        } else if (msg.beginRendering) {
          const error =
              SchemaValidator.validateBeginRendering(msg.beginRendering);
          if (error) {
            validationErrors.push(`Message (beginRendering): ${error}`);
          }
        } else if (msg.dataModelUpdate) {
          const error =
              SchemaValidator.validateDataModelUpdate(msg.dataModelUpdate);
          if (error) {
            validationErrors.push(`Message (dataModelUpdate): ${error}`);
          }
        } else {
          validationErrors.push(
              `Unknown message type. Must be one of surfaceUpdate, beginRendering, dataModelUpdate`);
        }
        finalMessages.push(msg);
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join('\\n'));
      }

      this.a2UIMessages = finalMessages;
    } catch (e: any) {
      this.validationError = 'Validation Error: ' + e.message;
    }
  }

  private handleActionTriggered(e: CustomEvent) {
    const timestamp = new Date().toLocaleTimeString();
    this.actionLogs = [{time: timestamp, detail: e.detail}, ...this.actionLogs];
  }

  private handleClearLogs() {
    this.actionLogs = [];
  }

  private async handleCopyLogs() {
    try {
      await navigator.clipboard.writeText(
          JSON.stringify(this.actionLogs, null, 2));
      this.slideOut.show('Logs copied to clipboard!');
    } catch (e: any) {
      this.slideOut.show('Failed to copy logs: ' + e.message);
    }
  }

  private renderLogEntry(log: any) {
    return html`
      <div class="log-entry">
        <div class="log-time">[${log.time}]</div>
        <div>${JSON.stringify(log.detail, null, 2)}</div>
      </div>
    `;
  }

  private handleModalInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.messagesJson = target.value;
    if (this.messagesTextarea) {
      this.messagesTextarea.value = target.value;
    }
  }

  override render() {
    return html`
      <div class="layout">
        <!-- Left Panel: Editor -->
        <div class="left-panel">
          <div class="action-bar">
            <button class="btn btn-primary" @click=${
        this.handleRefresh} title="Refresh Preview">
              <md-icon>refresh</md-icon>
            </button>
            <button class="btn" @click=${this.handleReformat} title="Reformat">
              <md-icon>format_align_left</md-icon>
            </button>
            <button class="btn" @click=${this.handleCopy} title="Copy">
              <md-icon>content_copy</md-icon>
            </button>
          </div>

          ${
        this.validationError ? html`
            <div class="error-banner">
              <md-icon style="vertical-align: bottom; margin-right: 4px;">error</md-icon>
              ${this.validationError}
            </div>
          ` :
                               ''}

          <div class="editor-section">
            <div class="editor-header">
              <span>A2UI Messages</span>
              <button class="expand-btn" @click=${
        () => this.expandedEditor = true} title="Expand Editor">
                <md-icon>open_in_full</md-icon>
              </button>
            </div>
            <textarea
              id="messages-input"
              .value=${this.messagesJson}
              @input=${
        (e: Event) => this.messagesJson =
            (e.target as HTMLTextAreaElement).value}></textarea>
          </div>
        </div>

        <!-- Right Panel: Preview and Logs -->
        <div class="right-panel">
          <div class="preview-container">
            <div class="preview-box">
              <a2ui-surface-container
                .a2UIMessages=${this.a2UIMessages}
                @a2ui-action-triggered=${this.handleActionTriggered}
              ></a2ui-surface-container>
            </div>
          </div>

          <div class="action-log-container">
             <div class="editor-header">
               <span>User Actions</span>
               <button class="expand-btn" @click=${
        () => this.expandedLogs = true} title="Expand Logs">
                 <md-icon>open_in_full</md-icon>
               </button>
             </div>
             <div class="action-logs">
                ${
        this.actionLogs.length === 0 ?
            html`<div style="color: var(--n-60); font-style: italic;">No actions recorded yet. Click a button in the preview area.</div>` :
            this.actionLogs.map(log => this.renderLogEntry(log))}
             </div>
          </div>
        </div>
      </div>

      <demo-dialog
        dialogTitle="A2UI Messages"
        ?open=${this.expandedEditor}
        @close=${() => {
      this.expandedEditor = false;
    }}
      >
        <textarea
          style="flex: 1; border: 1px solid var(--md-sys-color-outline-variant, var(--n-90)); border-radius: 8px; padding: 16px; background: var(--md-sys-color-background, var(--background-light));"
          .value=${this.messagesJson}
          @input=${this.handleModalInput}
        ></textarea>
      </demo-dialog>

      <demo-dialog
        dialogTitle="User Actions"
        ?open=${this.expandedLogs}
        @close=${() => {
      this.expandedLogs = false;
    }}
      >
        <div slot="actions" style="display: flex; gap: 8px;">
          <md-icon-button @click=${this.handleCopyLogs} title="Copy Logs">
            <md-icon>content_copy</md-icon>
          </md-icon-button>
          <md-icon-button @click=${this.handleClearLogs} title="Clear Logs">
            <md-icon>delete_sweep</md-icon>
          </md-icon-button>
        </div>
        <div class="action-logs" style="background: var(--md-sys-color-background, var(--background-light)); border: 1px solid var(--md-sys-color-outline-variant, var(--n-90)); border-radius: 8px; height: 100%;">
          ${
        this.actionLogs.length === 0 ?
            html`<div style="color: var(--n-60); font-style: italic; padding: 16px;">No actions recorded yet.</div>` :
            this.actionLogs.map(log => this.renderLogEntry(log))}
        </div>
      </demo-dialog>
      <demo-slide-out></demo-slide-out>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-composer': A2uiComposer;
  }
}
