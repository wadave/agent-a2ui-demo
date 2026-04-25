import 'google3/third_party/javascript/material/web/icon/icon';
import 'google3/third_party/javascript/material/web/iconbutton/icon-button';

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators';
import {createRef, ref, Ref} from 'lit/directives/ref';

import {styles as dialogStyles} from './demo-dialog.css';

/**
 * Shared dialog component for A2UI demos.
 */
@customElement('demo-dialog')
export class DemoDialog extends LitElement {
  @property({type: String}) dialogTitle = '';
  @property({type: Boolean}) open = false;

  private dialogRef: Ref<HTMLDialogElement> = createRef();

  override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('open')) {
      if (this.open && this.dialogRef.value) {
        if (!this.dialogRef.value.open) {
          this.dialogRef.value.showModal();
        }
      } else if (!this.open && this.dialogRef.value) {
        if (this.dialogRef.value.open) {
          this.dialogRef.value.close();
        }
      }
    }
  }

  private handleClose() {
    this.open = false;
    this.dispatchEvent(
        new CustomEvent('close', {bubbles: true, composed: true}));
  }

  static override styles = [dialogStyles];

  override render() {
    return html`
      <dialog ${ref(this.dialogRef)} @close=${this.handleClose}>
        <div class="dialog-container">
          <div class="dialog-header">
            <h2 class="dialog-title">${this.dialogTitle}</h2>
            <div class="dialog-actions">
               <slot name="actions"></slot>
               <md-icon-button @click=${this.handleClose} title="Close">
                 <md-icon>close</md-icon>
               </md-icon-button>
            </div>
          </div>
          <div class="dialog-content">
             <slot></slot>
          </div>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'demo-dialog': DemoDialog;
  }
}
