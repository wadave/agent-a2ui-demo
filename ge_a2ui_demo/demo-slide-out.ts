import 'google3/third_party/javascript/material/web/icon/icon';

import {html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators';

import {styles as slideOutStyles} from './demo-slide-out.css';

/**
 * Slide-out notification component.
 */
@customElement('demo-slide-out')
export class DemoSlideOut extends LitElement {
  @property({type: String}) message = '';
  @property({type: Boolean, reflect: true}) open = false;

  private closeTimeout?: number;

  static override styles = [slideOutStyles];

  show(message: string, durationMs = 3000) {
    this.message = message;
    this.open = true;

    if (this.closeTimeout) {
      window.clearTimeout(this.closeTimeout);
    }

    this.closeTimeout = window.setTimeout(() => {
      this.open = false;
    }, durationMs);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.closeTimeout) {
      window.clearTimeout(this.closeTimeout);
    }
  }

  override render() {
    return html`
      <md-icon class="icon">info</md-icon>
      <span class="message">${this.message}</span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-slide-out': DemoSlideOut;
  }
}
