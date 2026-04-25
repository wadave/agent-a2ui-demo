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
import {RenderedSafeContentFrame, SafeContentFrame} from 'google3/javascript/security/safe_content_frame/v2/index';
import {css, html, nothing, PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {when} from 'lit/directives/when.js';

import {StateEvent} from '../../../events/events';
import type {Action} from '../../../types/components';
import type {StringValue} from '../../../types/primitives';
import {iframeEnabledContext} from '../../context/allowlist';
import {Root} from '../../root';
import {extractStringValue} from '../../utils/utils';

import {securityErrorStyles, securityErrorTemplate} from './shared/security-error';

/**
 * The required CSP meta tag pattern. The HTML content must include a meta tag
 * with `http-equiv="Content-Security-Policy"` and `content="connect-src
 * 'none'"` to be rendered. The attributes may appear in any order, and
 * additional attributes (e.g. `id`, `class`) may be present on the tag.
 */
const REQUIRED_CSP_PATTERN = new RegExp(
    '<meta\\s+' +
        '(?=[^>]*http-equiv\\s*=\\s*["\']Content-Security-Policy["\'])' +
        '(?=[^>]*content\\s*=\\s*["\'][^">]*connect-src\\s+\'none\'[^">]*["\'])' +
        '[^>]*/?>',
    'i');

/**
 * A custom component that renders HTML content in a sandboxed iframe via
 * SafeContentFrame. The HTML content must include a Content-Security-Policy
 * meta tag with the directive `connect-src 'none'` to be rendered.
 */
@customElement('a2ui-web-frame-srcdoc')
export class WebFrameSrcdoc extends Root {
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

  @property({type: Object}) htmlContent: StringValue|undefined = undefined;

  @property({type: Number}) height: number|undefined = undefined;

  @consume({context: iframeEnabledContext, subscribe: true})
  iframeEnabled = true;

  // --- Internal State ---

  @query('.scf-container') private readonly scfContainerEl?: HTMLDivElement;

  private safeContentFrame?: SafeContentFrame;
  private renderedSafeContentFrame?: RenderedSafeContentFrame;

  @state() private cspBlocked = true;

  /**
   * Checks whether the given HTML string contains a Content-Security-Policy
   * meta tag with the directive `connect-src 'none'`.
   */
  static hasRequiredCsp(htmlContent: string): boolean {
    return REQUIRED_CSP_PATTERN.test(htmlContent);
  }

  /**
   * Computes `cspBlocked` reactively before render. This ensures the render
   * template always reflects the correct state without imperative DOM
   * manipulation of display styles.
   */
  override willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);

    if (changedProperties.has('htmlContent')) {
      this.cspBlocked = this.computeCspBlocked();
    }
  }

  /**
   * Determines whether CSP blocks rendering based on the current htmlContent
   * property. HTML content must include the required CSP meta tag.
   */
  private computeCspBlocked(): boolean {
    const htmlContent = extractStringValue(
        this.htmlContent ?? null,
        this.component,
        this.processor,
        this.surfaceId,
    );
    if (htmlContent) return !WebFrameSrcdoc.hasRequiredCsp(htmlContent);

    // No content provided — block by default.
    return true;
  }

  /**
   * After render, populate the scf-container with the appropriate iframe
   * content. This runs only when the container is in the DOM (i.e. when
   * `cspBlocked` is false).
   */
  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    if (changedProperties.has('iframeEnabled')) {
      this.style.display = this.iframeEnabled ? '' : 'none';
    }

    if (changedProperties.has('htmlContent')) {
      this.populateFrame();
    }
  }

  /**
   * Populates the scf-container with iframe content via SafeContentFrame.
   * Only called after render, so the container is guaranteed to exist when
   * `cspBlocked` is false.
   */
  private async populateFrame() {
    // Tear down previous content.
    this.teardownFrame();

    if (this.cspBlocked || !this.scfContainerEl) return;

    const htmlContent = extractStringValue(
        this.htmlContent ?? null,
        this.component,
        this.processor,
        this.surfaceId,
    );

    if (htmlContent) {
      this.safeContentFrame = new SafeContentFrame('a2ui-web-frame-srcdoc');
      this.renderedSafeContentFrame = await this.safeContentFrame.renderHtml(
          htmlContent, this.scfContainerEl);
    }
  }

  /** Cleans up any previously created safe content frame. */
  private teardownFrame() {
    if (this.safeContentFrame) {
      this.safeContentFrame = undefined;
      this.renderedSafeContentFrame = undefined;
    }
    if (this.scfContainerEl) {
      this.scfContainerEl.textContent = '';
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
        ${when(this.cspBlocked, () => securityErrorTemplate(), () => html`
          <div class="scf-container" style="flex-grow: 1; width: 100%;"></div>
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
    if (this.safeContentFrame && this.renderedSafeContentFrame) {
      if (event.source !== this.safeContentFrame.shimIframe.contentWindow ||
          event.origin !== this.renderedSafeContentFrame.origin) {
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
