import 'google3/third_party/javascript/material/web/textfield/outlined-text-field';
import 'google3/third_party/javascript/material/web/select/outlined-select';
import 'google3/third_party/javascript/material/web/select/select-option';
import 'google3/third_party/javascript/material/web/icon/icon';

import * as Events from 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/events/events.js';
import type {Action} from 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/types/components.js';
import {Root} from 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/ui/root.js';
import {html, PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';

import {styles} from './product-selection.css';


/**
 * Column metadata for the table.
 */
export declare interface ColumnMetadata {
  key: string;
  label: string;
  type: 'string'|'date'|'number'|'decimal'|'picklist';
  editable?: boolean;
  options?: string[];
}

/**
 * Product selection component.
 */
@customElement('a2ui-product-selection')
export class ProductSelection extends Root {
  static override styles = [...Root.styles, styles];

  @property({type: Array}) columns: ColumnMetadata[] = [];
  @property({type: Array}) rows: Array<Record<string, any>> = [];
  @property({type: String}) productTableTitle = 'Product Selection';
  @property({type: String}) confirmLabel = 'Confirm';
  @property({type: String}) cancelLabel = 'Cancel';
  @property() onConfirm: Action|null = null;
  @property() onCancel: Action|null = null;

  @state() private editedRows: Array<Record<string, any>> = [];

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('rows')) {
      this.editedRows =
          JSON.parse(JSON.stringify(this.rows)) as Array<Record<string, any>>;
    }
  }

  private handleInputChange(rowIndex: number, key: string, value: any) {
    this.editedRows[rowIndex][key] = value;
    this.requestUpdate();
  }

  private onConfirmClick() {
    if (this.onConfirm) {
      const evt = new Events.StateEvent<'a2ui.action'>({
        eventType: 'a2ui.action',
        action: this.onConfirm,
        dataContextPath: this.dataContextPath,
        sourceComponentId: this.id,
        sourceComponent: this.component,
      });
      // @ts-expect-error Custom data not in framework type but needed for agent
      evt.payload.data = {rows: this.editedRows};
      this.dispatchEvent(evt);
    }
  }

  private onCancelClick() {
    if (this.onCancel) {
      const evt = new Events.StateEvent<'a2ui.action'>({
        eventType: 'a2ui.action',
        action: this.onCancel,
        dataContextPath: this.dataContextPath,
        sourceComponentId: this.id,
        sourceComponent: this.component,
      });
      this.dispatchEvent(evt);
    } else {
      this.editedRows =
          JSON.parse(JSON.stringify(this.rows)) as Array<Record<string, any>>;
      this.requestUpdate();
    }
  }

  private renderField(
      col: ColumnMetadata, row: Record<string, any>, rowIndex: number) {
    if (col.type === 'picklist') {
      if (col.editable === true) {
        return html`
          <div class="field-item">
            <md-outlined-select
              label="${col.label}"
              .value="${row[col.key] || ''}"
              @change="${
            (e: any) =>
                this.handleInputChange(rowIndex, col.key, e.target.value)}"
            >
              ${(col.options || []).map(opt => html`
                <md-select-option value="${opt}">
                  <div slot="headline">${opt}</div>
                </md-select-option>
              `)}
            </md-outlined-select>
          </div>
        `;
      } else {
        return html`
          <div class="field-item">
            <div class="field-label">${col.label}</div>
            <div class="field-value">${row[col.key] || ''}</div>
          </div>
        `;
      }
    }

    if (col.editable === true) {
      return html`
        <div class="field-item">
          <md-outlined-text-field
            label="${col.label}"
            .value="${row[col.key] || ''}"
            type="${
          col.type === 'number' || col.type === 'decimal' ? 'number' :
          col.type === 'date' ? 'date' :
                                'text'}"
            @input="${
          (e: any) => this.handleInputChange(
              rowIndex, col.key,
              e.target.value === '' ?
                  null :
                  col.type === 'number' ?
                  (isNaN(parseInt(e.target.value, 10)) ?
                       null :
                       parseInt(e.target.value, 10)) :
                  col.type === 'decimal' ?
                  (isNaN(parseFloat(e.target.value)) ?
                       null :
                       parseFloat(e.target.value)) :
                  e.target.value)}"
          ></md-outlined-text-field>
        </div>
      `;
    }

    // Render as read-only if editable is not true
    return html`
      <div class="field-item">
        <div class="field-label">${col.label}</div>
        <div class="field-value">${row[col.key] || ''}</div>
      </div>
    `;
  }

  private renderProductCard(row: Record<string, any>, rowIndex: number) {
    return html`
      <div class="product-card">
        <div class="product-card-header">
          <span class="product-name">${
        row['Product'] || row['name'] || 'Unknown Product'}</span>
          <md-icon class="more-icon">more_vert</md-icon>
        </div>
        <div class="product-card-fields">
          ${this.columns.map(col => this.renderField(col, row, rowIndex))}
        </div>
      </div>
    `;
  }

  override render() {
    return html`
      <div class="product-selection-container">
        <div class="product-cards-list">
          ${
        this.editedRows.map(
            (row, rowIndex) => this.renderProductCard(row, rowIndex))}
          ${
        this.editedRows.length === 0 ?
            html`<div class="empty-state">No products selected</div>` :
            ''}
        </div>

        <div class="button-footer">
          <button class="cancel-btn" @click="${this.onCancelClick}">${
        this.cancelLabel}</button>
          <button class="confirm-btn" @click="${this.onConfirmClick}">${
        this.confirmLabel}</button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-product-selection': ProductSelection;
  }
}
