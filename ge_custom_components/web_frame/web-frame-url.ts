/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {consume} from '@lit/context';
import {css, html, nothing, PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {when} from 'lit/directives/when.js';
import {sanitizeUrl} from 'safevalues';
import {IframeIntent, setIframeSrcWithIntent} from 'safevalues/dom';

import {StateEvent} from '../../../events/events';
import type {Action} from '../../../types/components';
import type {StringValue} from '../../../types/primitives';
import {allowlistContext, iframeEnabledContext} from '../../context/allowlist';
import {Root} from '../../root';
import {extractStringValue} from '../../utils/utils';

import {securityErrorStyles, securityErrorTemplate} from './shared/security-error';

/**
 * A custom component that renders a URL in a direct iframe with safe
 * intent-based src assignment via safevalues.
 */
@customElement('a2ui-web-frame-url')
export class WebFrameUrl extends Root {
  static override styles = [
    ...Root.styles,
    securityErrorStyles,
    css`
      :host {
        display: block;
        width: 100%;
        border: 1px solid var(--nv-90);
        position: relative;
        overflow: hidden; /* For Aspect Ratio / Container */
      }
      iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: var(--n-95);
      }
    `,
  ];

  /* --- Properties (Server Contract) --- */

  @property({type: Object}) url: StringValue|undefined = undefined;

  @property({type: Number}) height: number|undefined = undefined;

  @consume({context: allowlistContext, subscribe: true})
  allowlist: readonly string[] = [];

  @consume({context: iframeEnabledContext, subscribe: true})
  iframeEnabled = true;

  // --- Internal State ---

  @query('.iframe-container') private readonly iframeContainerEl?:
      HTMLDivElement;

  private directIframe?: HTMLIFrameElement;

  /**
   * Whether the URL is blocked by the allowlist.
   * If true, the URL is not in the allowlist and its content will be blocked
   * from rendering in the iframe.
   */
  @state() private blockedByAllowlist = true;

  /**
   * Computes blocking state reactively before render. This ensures the render
   * template always reflects the correct state.
   */
  override willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);

    if (changedProperties.has('url') || changedProperties.has('allowlist')) {
      this.blockedByAllowlist = this.computeBlockedByAllowlist();
    }
  }

  private computeBlockedByAllowlist(): boolean {
    const urlStr = extractStringValue(
        this.url ?? null, this.component, this.processor, this.surfaceId);
    if (urlStr) {
      return !this.isAllowlisted(urlStr);
    }
    return true; // No URL, block by default.
  }

  /*
   * Checks if the URL is allowlisted.
   */
  private isAllowlisted(urlStr: string): boolean {
    try {
      const url = new URL(urlStr);
      return this.allowlist.includes(url.hostname);
    } catch (e) {
      console.error(`Failed to parse URL ${urlStr} for allowlist check: ${e}`);
      return false;
    }
  }

  /**
   * After render, populate the iframe-container with the URL iframe.
   */
  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    if (changedProperties.has('iframeEnabled')) {
      this.style.display = this.iframeEnabled ? '' : 'none';
    }

    if (changedProperties.has('url') || changedProperties.has('allowlist')) {
      this.populateFrame();
    }
  }

  /**
   * Creates a direct iframe with the provided URL using safe intent-based
   * assignment. Only called after render, so container is guaranteed to exist
   * when `allowlistBlocked` is false.
   */
  private populateFrame() {
    this.teardownFrame();

    if (this.blockedByAllowlist || !this.iframeContainerEl) return;

    const urlStr = extractStringValue(
        this.url ?? null, this.component, this.processor, this.surfaceId);

    if (urlStr) {
      this.directIframe = document.createElement('iframe');
      setIframeSrcWithIntent(
          this.directIframe, IframeIntent.EMBEDDED_TRUSTED_EXTERNAL_CONTENT,
          sanitizeUrl(urlStr));
      this.iframeContainerEl.appendChild(this.directIframe);
    }
  }

  /** Cleans up any previously created iframe. */
  private teardownFrame() {
    if (this.directIframe) {
      this.directIframe = undefined;
    }
    if (this.iframeContainerEl) {
      this.iframeContainerEl.textContent = '';
    }
  }

  override render() {
    if (!this.iframeEnabled) {
      return nothing;
    }

    // Default to 4/3 aspect ratio if no height.
    const style =
        this.height ? `height: ${this.height}px;` : 'aspect-ratio: 4/3;';

    return html`
      <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; ${
        style}">
        ${
        when(this.blockedByAllowlist, () => securityErrorTemplate(), () => html`
          <div class="iframe-container" style="flex-grow: 1; width: 100%;"></div>
        `)}
      </div>
    `;
  }

  // --- Event Bridge ---

  override firstUpdated() {
    window.addEventListener('message', this.onMessage);
  }

  override disconnectedCallback() {
    window.removeEventListener('message', this.onMessage);
    super.disconnectedCallback();
  }

  private onMessage = (event: MessageEvent) => {
    // Verify the message came from our embedded iframe to prevent processing
    // malicious messages from other frames or the parent page itself.
    if (this.directIframe) {
      if (event.source !== this.directIframe.contentWindow) {
        return;
      }
    } else {
      return;
    }

    const data = event.data;

    // Spec Protocol: { type: 'a2ui_action', action: '...', data: ... }
    if (data && data.type === 'a2ui_action') {
      const {action, data: actionData} = data;
      this.dispatchAgentAction(action, actionData);
    }
  };

  // tslint:disable-next-line:no-any Params are untyped postMessage data.
  private dispatchAgentAction(actionName: string, params: any) {
    const context: NonNullable<Action['context']> = [];
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string') {
          context.push({key, value: {literalString: value}});
        } else if (typeof value === 'number') {
          context.push({key, value: {literalNumber: value}});
        } else if (typeof value === 'boolean') {
          context.push({key, value: {literalBoolean: value}});
        }
      }
    }

    const action: Action = {
      name: actionName,
      context,
    };

    const eventPayload = {
      eventType: 'a2ui.action' as const,
      action,
      sourceComponentId: this.id,
      dataContextPath: this.dataContextPath,
      sourceComponent: this.component,
    };

    this.dispatchEvent(new StateEvent<'a2ui.action'>(eventPayload));
  }
}
