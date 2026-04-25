import {Root} from 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/ui/root.js';
import {html, PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {repeat} from 'lit/directives/repeat.js';
import {styleMap} from 'lit/directives/style-map.js';

import {styles} from './data-grid.css';
import {ColumnAnalysis, NumberFormattingService,} from './data_grid_number_formatting';
import {ColumnSchema, type DataGridSchema} from './data_grid_schema';
import {isNumericType} from './data_grid_type_utilities';
import {compareTableValues} from './data_grid_utilities';

/**
 * List of domains that are allowed to be used for images.
 */
export const ALLOWLIST_DOMAINS_FOR_IMAGES = [
  'https://storage.googleapis.com/cloud-samples-data',
];

/**
 * Retrieves the schema for a given column name from the schema map.
 * It handles cases where the column name in the data might use spaces
 * while the schema uses dots (e.g., "User Feedback" vs "User.Feedback").
 */
function getSchemaForColumnName(
    columnName: string,
    schemaColumnMap?: Map<string, ColumnSchema>|null,
    ): ColumnSchema|undefined {
  return (
      schemaColumnMap?.get(columnName) ||
      schemaColumnMap?.get(columnName.replaceAll(' ', '.')));
}

/**
 * Data grid component.
 */
@customElement('a2ui-data-grid')
export class DataGrid extends Root {
  static override styles = [...Root.styles, styles];

  // tslint:disable-next-line:no-any
  @property({type: Array}) rowData: any[] = [];
  @property({type: Number}) maxHeight = 296;
  @property({type: Object}) schema?: DataGridSchema;

  @state() displayedColumns: string[] = [];
  // tslint:disable-next-line:no-any
  @state() sortedData: any[] = [];
  @state() columnAnalyses: Map<string, ColumnAnalysis> = new Map();
  @state() hoveredColumn: string|null = null;
  @state() indexColumnWidth = 60;
  @state() gridTemplateColumns = '';
  @state()
  sortState: {active: string; direction: 'asc' | 'desc' | ''} = {
    active: '',
    direction: '',
  };

  // Map for quick schema column lookup
  readonly schemaColumnMap: Map<string, ColumnSchema> = new Map();
  readonly schemaColumnIndexesMap: Map<string, number> = new Map();

  private readonly numberFormattingService = new NumberFormattingService();

  imageRegex =
      /^!\[(.*?)\]\((https?:\/\/[^?#]*?\.(?:png|jpg|jpeg)(?:[?#]\S*)?)\)$|^(https?:\/\/[^?#]*?\.(?:png|jpg|jpeg)(?:[?#]\S*)?)$/i;

  get isSortable(): boolean {
    return this.rowData.length > 1;
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('schema')) {
      this.prepareSchemaColumnMap();
    }
    if (changedProperties.has('rowData') || changedProperties.has('schema')) {
      this.initializeColumns();
      this.sortedData = [...this.rowData];
      this.analyzeColumns();
      this.applySort();
      this.updateGridTemplateColumns();
    }
  }

  private prepareSchemaColumnMap(): void {
    this.schemaColumnMap.clear();
    this.schemaColumnIndexesMap.clear();
    if (this.schema?.fields) {
      for (let i = 0; i < this.schema.fields.length; i++) {
        const field = this.schema.fields[i];
        this.schemaColumnIndexesMap.set(field.name, i);
        this.schemaColumnMap.set(field.name, field);
        // sometimes column name comes with '.' instead of '_'
        const fieldNameAllUnderscores = field.name?.replace(/\./g, '_');
        if (fieldNameAllUnderscores !== field.name) {
          this.schemaColumnMap.set(fieldNameAllUnderscores, field);
          this.schemaColumnIndexesMap.set(fieldNameAllUnderscores, i);
        }
      }
    }
  }

  getSchemaForColumn(columnName: string): ColumnSchema|undefined {
    return getSchemaForColumnName(columnName, this.schemaColumnMap);
  }

  updateGridTemplateColumns(): void {
    let template = `${this.indexColumnWidth}px`;
    if (this.displayedColumns.length > 0) {
      for (const col of this.displayedColumns) {
        template += ` minmax(120px, 1fr)`;
      }
    }
    this.gridTemplateColumns = template;
  }

  onSortButtonClick(column: string): void {
    if (!this.isSortable) {
      return;
    }
    if (this.sortState.active === column) {
      if (this.sortState.direction === 'asc') {
        this.sortState.direction = 'desc';
      } else if (this.sortState.direction === 'desc') {
        this.sortState.direction = '';
      } else {
        this.sortState.direction = 'asc';
      }
    } else {
      this.sortState.active = column;
      this.sortState.direction = 'asc';
    }
    this.applySort();
    this.requestUpdate();
  }

  onColumnMouseEnter(columnName: string): void {
    this.hoveredColumn = columnName;
  }

  onColumnMouseLeave(): void {
    this.hoveredColumn = null;
  }

  isColumnHovered(columnName: string): boolean {
    return this.hoveredColumn === columnName;
  }

  isNumericColumn(columnName: string): boolean {
    const schema = this.getSchemaForColumn(columnName);
    if (schema?.type) {
      return isNumericType(schema.type);
    }
    const analysis = this.columnAnalyses.get(columnName);
    if (analysis && analysis.type) {
      return isNumericType(analysis.type);
    }
    return false;
  }

  // tslint:disable-next-line:no-any
  formatCellValue(value: any, columnName: string): string {
    if (value === null || value === undefined || value === '' ||
        value === 'null') {
      return '∅';
    }
    const analysis = this.columnAnalyses.get(columnName);
    if (!analysis || !analysis.type) {
      return String(value);
    }
    return this.numberFormattingService.formatValue(value, analysis);
  }

  // tslint:disable-next-line:no-any
  getCellTitle(value: any, columnName: string): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (value.uri) {
      return value.uri;
    }
    return String(value);
  }

  analyzeColumns(): void {
    if (!this.rowData?.length || !this.displayedColumns?.length) {
      this.columnAnalyses.clear();
      return;
    }
    this.columnAnalyses.clear();
    for (const column of this.displayedColumns) {
      const columnData = this.rowData.map((row) => row[column]);
      const schema = this.getSchemaForColumn(column);
      const analysis = this.numberFormattingService.analyzeColumn(
          columnData,
          schema,
      );
      this.columnAnalyses.set(column, analysis);
    }
  }

  initializeColumns(): void {
    if (this.rowData && this.rowData.length > 0) {
      // Derive columns from the first row to maintain a consistent order,
      // then add any other columns from subsequent rows.
      const firstRowKeys = Object.keys(this.rowData[0]);
      const allKeys = new Set(firstRowKeys);
      for (let i = 1; i < this.rowData.length; i++) {
        for (const key of Object.keys(this.rowData[i])) {
          allKeys.add(key);
        }
      }
      const otherKeys = Array.from(allKeys).filter(
          (key) => !firstRowKeys.includes(key),
      );
      this.displayedColumns = [...firstRowKeys, ...otherKeys];
    } else {
      this.displayedColumns = [];
    }
    // Sort the columns in order they present in schema.
    if (this.schemaColumnIndexesMap.size > 0) {
      this.displayedColumns = this.displayedColumns.sort((a, b) => {
        const aIndex = this.schemaColumnIndexesMap.get(a) ?? Infinity;
        const bIndex = this.schemaColumnIndexesMap.get(b) ?? Infinity;
        return aIndex - bIndex;
      });
    }
  }

  applySort(): void {
    if (!this.sortState.active || this.sortState.direction === '') {
      this.sortedData = [...this.rowData];
      return;
    }
    const {active, direction} = this.sortState;
    const isAsc = direction === 'asc';
    const schema = this.getSchemaForColumn(active);
    this.sortedData = [...this.rowData].sort(
        (a, b) => compareTableValues(a[active], b[active], isAsc, schema),
    );
  }

  // tslint:disable-next-line:no-any
  parseMarkdownImage(value: any): {alt: string; src: string}|null {
    if (typeof value !== 'string') {
      return null;
    }
    const match = value.match(this.imageRegex);
    if (!match) return null;

    if (match[2] !== undefined) {
      // Markdown match
      const src = match[2];
      if (ALLOWLIST_DOMAINS_FOR_IMAGES.some(
              (prefix) => src.startsWith(prefix))) {
        return {alt: match[1], src};
      }
    } else {
      // URL match
      const src = match[0];
      if (ALLOWLIST_DOMAINS_FOR_IMAGES.some(
              (prefix) => src.startsWith(prefix))) {
        return {alt: '', src};
      }
    }
    return null;
  }

  headerCellText(col: string): string {
    const schema = getSchemaForColumnName(col, this.schemaColumnMap);
    return schema?.displayName || col;
  }

  headerCellTitle(col: string): string {
    const schema = getSchemaForColumnName(col, this.schemaColumnMap);
    const displayName = schema?.displayName;

    if (displayName && displayName !== col) {
      return `${displayName} (${col})`;
    }
    return col;
  }

  renderSortIcon(col: string) {
    if (this.sortState.active === col && this.sortState.direction === 'asc') {
      return '↑';
    } else if (
        this.sortState.active === col && this.sortState.direction === 'desc') {
      return '↓';
    } else {
      return '↕';
    }
  }

  override render() {
    const headerStyles = styleMap({
      'grid-template-columns': this.gridTemplateColumns,
    });
    const bodyStyles = styleMap({
      'height': `${this.maxHeight - 40}px`,
    });
    const rowStyles = styleMap({
      'grid-template-columns': this.gridTemplateColumns,
    });

    return html`
      <div class="table-container" role="grid">
        <div
          class="header-container"
          style=${headerStyles}
          role="rowgroup"
        >
          <div
            class="header-cell index-column"
            role="columnheader"
          ></div>
          ${
        repeat(
            this.displayedColumns,
            (col) => col,
            (col) => html`
            <div
              class=${classMap({
              'header-cell': true,
              'number-column': this.isNumericColumn(col),
              'sortable-header': this.isSortable,
              'active-sort': this.isSortable && this.sortState.active === col &&
                  this.sortState.direction !== '',
            })}
              title=${this.headerCellTitle(col)}
              @mouseenter=${() => this.onColumnMouseEnter(col)}
              @mouseleave=${() => this.onColumnMouseLeave()}
              role="columnheader"
            >
              <span class="header-cell-text">${this.headerCellText(col)}</span>
              ${
                this.isSortable ? html`
                        <button
                          type="button"
                          class="sort-icon-button"
                          aria-label="Sort by ${this.headerCellText(col)}"
                          @click=${() => this.onSortButtonClick(col)}
                        >
                          ${this.renderSortIcon(col)}
                        </button>
                      ` :
                                  ''}
            </div>
          `,
            )}
        </div>
        <div
          class="body-viewport"
          style=${bodyStyles}
        >
          <div class="data-grid-body" role="rowgroup">
            ${
        this.sortedData.length > 0 ?
            repeat(
                this.sortedData,
                (row, index) => index,
                (row, i) => {
                  return html`
                      <div
                        class="data-row"
                        style=${rowStyles}
                        role="row"
                      >
                        <div class="cell index-column" role="gridcell">
                          ${i + 1}
                        </div>
                        ${
                      repeat(
                          this.displayedColumns,
                          (col) => col,
                          (col) => {
                            const image = this.parseMarkdownImage(row[col]);
                            return html`
                            <div
                              class=${classMap({
                              'cell': true,
                              'hovered-column': this.isColumnHovered(col),
                              'number-column': this.isNumericColumn(col),
                            })}
                              @mouseenter=${() => this.onColumnMouseEnter(col)}
                              @mouseleave=${() => this.onColumnMouseLeave()}
                              title=${this.getCellTitle(row[col], col)}
                              role="gridcell"
                            >
                              ${
                                image ?
                                    html`<img src="${image.src}" alt="${
                                        image.alt}" />` :
                                    html`${
                                        this.formatCellValue(row[col], col)}`}
                            </div>
                          `;
                          },
                          )}
                      </div>
                    `;
                },
                ) :
            html`<div class="no-data-placeholder" role="status" aria-live="polite"> No data available </div>`}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-data-grid': DataGrid;
  }
}
