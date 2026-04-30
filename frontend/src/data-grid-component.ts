import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { z } from "zod";
import {
  A2uiController,
  A2uiLitElement,
  basicCatalog,
  type LitComponentApi,
} from "@a2ui/lit/v0_9";

const FieldSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  type: z.string().optional(),
});

const DataGridSchema = z.object({
  rowData: z.array(z.record(z.any())),
  schema: z.object({ fields: z.array(FieldSchema) }),
  maxHeight: z.number().optional(),
});

const DataGridApi = {
  name: "DataGrid",
  schema: DataGridSchema,
};

@customElement("a2ui-data-grid")
export class A2uiDataGrid extends A2uiLitElement<typeof DataGridApi> {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .wrap {
      width: 100%;
      overflow-y: auto;
      border: 1px solid var(--ge-border-color, #dadce0);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-family: inherit;
      font-size: 13px;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--ge-border-color, #dadce0);
    }
    th {
      background-color: var(--ge-background-secondary, #f8f9fa);
      font-weight: 500;
      cursor: pointer;
      user-select: none;
    }
    th:hover {
      background-color: var(--ge-background-hover, #f1f3f4);
    }
    tr:hover {
      background-color: var(--ge-background-hover, #f8f9fa);
    }
    .currency-neg {
      color: #c5221f;
    }
    img {
      max-height: 24px;
      width: auto;
    }
  `;

  protected createController(): A2uiController<typeof DataGridApi> {
    return new A2uiController(this, DataGridApi);
  }

  static override properties = {
    sortKey: { state: true },
    sortDir: { state: true },
  };

  private sortKey: string | null = null;
  private sortDir: "asc" | "desc" = "asc";

  #toRows(val: unknown): Record<string, unknown>[] {
    if (val == null) return [];
    if (Array.isArray(val)) return val;
    if (val instanceof Map) return [...val.values()] as Record<string, unknown>[];
    if (typeof val === "object") return Object.values(val) as Record<string, unknown>[];
    return [];
  }

  #formatValue(value: unknown, type?: string) {
    if (value == null) return "";

    switch (type) {
      case "currency": {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(num));
        return num < 0 ? html`<span class="currency-neg">-${formatted}</span>` : formatted;
      }
      case "percentage": {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return (num * 100).toFixed(1) + "%";
      }
      case "integer": {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
      }
      case "number": {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return num.toFixed(2);
      }
      case "date":
      case "timestamp":
      case "datetime": {
        const date = new Date(String(value));
        return isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
      }
      case "image":
        return html`<img src="${String(value)}" />`;
      default:
        return String(value);
    }
  }

  #onSort(key: string) {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortKey = key;
      this.sortDir = "asc";
    }
  }

  override render() {
    const props = this.controller.props;
    if (!props) return nothing;

    const fields = props.schema.fields;
    let rows = this.#toRows(props.rowData);

    if (this.sortKey) {
      rows = [...rows].sort((a, b) => {
        const valA = a[this.sortKey!];
        const valB = b[this.sortKey!];

        if (valA === valB) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        const comparison = valA < valB ? -1 : 1;
        return this.sortDir === "asc" ? comparison : -comparison;
      });
    }

    const maxHeight = props.maxHeight ?? 296;

    return html`
      <div class="wrap" style="max-height: ${maxHeight}px">
        <table>
          <thead>
            <tr>
              ${fields.map(field => html`
                <th @click="${() => this.#onSort(field.name)}">
                  ${field.displayName ?? field.name}
                  ${this.sortKey === field.name ? (this.sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => html`
              <tr>
                ${fields.map(field => html`
                  <td>${this.#formatValue(row[field.name], field.type)}</td>
                `)}
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }
}

export const A2uiDataGridComponent: LitComponentApi = {
  ...DataGridApi,
  tagName: "a2ui-data-grid",
};

basicCatalog.components.set(A2uiDataGridComponent.name, A2uiDataGridComponent);
