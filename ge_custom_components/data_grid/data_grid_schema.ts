/**
 * Column type options for data grid schema
 */
export type ColumnType = string;

/**
 * Schema definition for a data grid column
 */
export interface ColumnSchema {
  name: string;
  displayName?: string;
  category?: string;
  type?: string;
  format?: string;       // optional formatting hint
  valueFormat?: string;  // excel-style value format
}

/**
 * Complete schema definition for data grid
 */
export interface DataGridSchema {
  fields: ColumnSchema[];
}
