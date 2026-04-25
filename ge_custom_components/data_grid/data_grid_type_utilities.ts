import {ColumnType} from './data_grid_schema';

/**
 * Utility functions for working with data types in the data grid
 */

/**
 * Get normalized type (lowercase for comparison)
 */
export function normalizeType(type: ColumnType): string {
  return type.toLowerCase();
}

/**
 * Check if a column type is numeric
 */
export function isNumericType(type: ColumnType): boolean {
  const normalizedType = normalizeType(type);
  return [
    // Standard SQL/Database types
    'integer',
    'int64',
    'smallint',
    'bigint',
    'float',
    'float64',
    'double',
    'decimal',
    'numeric',
    'number',
    // BigQuery specific
    'int',
    'tinyint',
    'byteint',
    'bignumeric',
    // Vega specific
    'quantitative',
    // Looker specific
    'count',
    'count_distinct',
    'sum',
    'average',
    'median',
    'max',
    'min',
    'variance',
    'standard_deviation',
    'running_total',
    'percentile',
    'ratio',
    'general',
    'scientific',
    // Excel specific
    'general_number',
    'number',
    'scientific',
  ].includes(normalizedType);
}

/**
 * Check if a column type is a currency type
 */
export function isCurrencyType(type: ColumnType): boolean {
  const normalizedType = normalizeType(type);
  return ['currency', 'money', 'usd', 'eur', 'gbp', 'jpy'].includes(
      normalizedType,
  );
}

/**
 * Check if a column type is a percentage type
 */
export function isPercentageType(type: ColumnType): boolean {
  const normalizedType = normalizeType(type);
  return ['percentage', 'percent', 'pct'].includes(normalizedType);
}

/**
 * Check if a column type is a date/time type
 */
export function isDateType(type: ColumnType): boolean {
  const normalizedType = normalizeType(type);
  return [
    // Standard types
    'date',
    'datetime',
    'timestamp',
    'time',
    // Precision-specific types
    'date_year',
    'date_quarter',
    'date_month',
    'date_week',
    'date_day',
    'date_hour',
    'date_minute',
    'date_second',
    // BigQuery specific
    'datetime',
    'timestamp',
    'date',
    'time',
    // Looker specific
    'date',
    'date_time',
    'date_date',
    'date_week',
    'date_month',
    'date_quarter',
    'date_year',
    // Vega specific
    'temporal',
    // Excel specific
    'date',
    'time',
    'custom_date',
  ].includes(normalizedType);
}

/**
 * Check if a column type is a timestamp specifically
 */
export function isTimestampType(type: ColumnType): boolean {
  const normalizedType = normalizeType(type);
  return ['timestamp'].includes(normalizedType);
}

/**
 * Get date precision level for a date type
 */
export function getDatePrecisionLevel(type: ColumnType): string {
  const normalizedType = normalizeType(type);

  if (normalizedType === 'date_year') return 'year';
  if (normalizedType === 'date_quarter') return 'quarter';
  if (normalizedType === 'date_month') return 'month';
  if (normalizedType === 'date_week') return 'week';
  if (normalizedType === 'date_day') return 'day';
  if (normalizedType === 'date_hour') return 'hour';
  if (normalizedType === 'date_minute') return 'minute';
  if (normalizedType === 'date_second') return 'second';

  // For timestamp and datetime, default to minute precision to show more
  // information
  if (normalizedType === 'timestamp' || normalizedType === 'datetime') {
    return 'minute';
  }

  // Regular date defaults to day precision
  if (normalizedType === 'date') return 'day';

  return 'day';
}

/**
 * Check if a value is alphanumeric ID (contains both letters and numbers)
 */
export function isAlphanumericId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmedValue = value.trim();
  return (
      /^[a-zA-Z0-9]+$/.test(trimmedValue) && /[a-zA-Z]/.test(trimmedValue) &&
      /\d/.test(trimmedValue));
}

/**
 * Extract currency symbol from a string value
 */
export function extractCurrencySymbol(value: string): string|null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.startsWith('-') && trimmed.length > 1) {
    const withoutMinus = trimmed.substring(1);
    const symbol = extractCurrencySymbol(withoutMinus);
    return symbol ? `-${symbol}` : null;
  }

  const match = trimmed.match(/^([^\d\s+.]+)(.*)/);
  return match ? match[1] : null;
}

/**
 * Clean a string for numeric parsing
 */
export function cleanNumericString(value: string): string {
  if (!value) return '';

  let cleanedVal = value.trim();

  // Handle scientific notation as-is
  if (/^-?\d*\.?\d+[eE][-+]?\d+$/.test(cleanedVal)) {
    return cleanedVal;
  }

  // Skip alphanumeric IDs
  if (isAlphanumericId(cleanedVal)) {
    return cleanedVal;
  }

  // Extract and preserve currency symbol if present
  const currencySymbol = extractCurrencySymbol(cleanedVal);
  if (currencySymbol) {
    cleanedVal = cleanedVal.substring(currencySymbol.length).trim();
  }

  // Extract and preserve percentage sign if present
  const hasPercentage = cleanedVal.endsWith('%');
  if (hasPercentage) {
    cleanedVal = cleanedVal.slice(0, -1).trim();
  }

  // Remove whitespace
  cleanedVal = cleanedVal.replace(/\s/g, '');

  // Detect number format based on the positions of commas and periods
  const lastCommaIndex = cleanedVal.lastIndexOf(',');
  const lastPeriodIndex = cleanedVal.lastIndexOf('.');

  // If both comma and period exist
  if (lastCommaIndex >= 0 && lastPeriodIndex >= 0) {
    // European format: 1.234,56 (comma is decimal separator, period is
    // thousands)
    if (lastCommaIndex > lastPeriodIndex) {
      // Replace all periods (thousands separators)
      cleanedVal = cleanedVal.replace(/\./g, '');
      // Replace comma (decimal separator) with period
      cleanedVal = cleanedVal.replace(',', '.');
    }
    // US format: 1,234.56 (period is decimal separator, comma is thousands)
    else {
      // Replace all commas (thousands separators)
      cleanedVal = cleanedVal.replace(/,/g, '');
    }
  }
  // Only comma exists
  else if (lastCommaIndex >= 0) {
    // Determine if the comma is a decimal separator or thousands separator
    const digitsAfterComma = cleanedVal.length - lastCommaIndex - 1;

    if (digitsAfterComma === 3) {
      // Three digits after comma: likely a thousands separator (US format)
      cleanedVal = cleanedVal.replace(/,/g, '');
    } else if (digitsAfterComma <= 2) {
      // One or two digits after comma: likely a decimal separator (European
      // format)
      cleanedVal = cleanedVal.replace(',', '.');
    } else {
      // More than three digits: need to check pattern
      // If multiple commas with 3-digit spacing, it's US format
      if (/,\d{3}(,\d{3})*$/.test(cleanedVal)) {
        cleanedVal = cleanedVal.replace(/,/g, '');
      } else {
        // Can't determine reliably, default to treating as decimal
        cleanedVal = cleanedVal.replace(',', '.');
      }
    }
  }

  return cleanedVal;
}

/**
 * Convert a value to a number
 */
export function parseNumericValue(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return NaN;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    // Skip alphanumeric IDs
    if (isAlphanumericId(value)) {
      return NaN;
    }

    if (/^-?\d*\.?\d+[eE][-+]?\d+$/.test(value.trim())) {
      return Number(value);
    }

    // Preserve percentage values - don't divide by 100
    if (value.trim().endsWith('%')) {
      const numericPart = value.trim().slice(0, -1).trim();
      return Number(cleanNumericString(numericPart));
    }

    const result = Number(cleanNumericString(value));
    return Number.isNaN(result) ? NaN : result;
  }

  return NaN;
}

function timestampToDate(value: number): Date|null {
  // If timestamp magnitude has 10 or less digits (abs(value) < 10^10), assume
  // it's in seconds. Otherwise, assume milliseconds. This correctly handles s
  // timestamps up to 10^10-1 (year 2286), and ms timestamps from 10^10 upwards
  // (April 1970). It fails for ms timestamps for Jan-Apr 1970 if they are
  // passed as numbers with magnitude < 10^10, as they will be treated as
  // seconds and multiplied by 1000.
  const inMilliseconds =
      value >= -9999999999 && value <= 9999999999 ? value * 1000 : value;
  const date = new Date(inMilliseconds);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a value as a numeric timestamp (milliseconds)
 * Only works with unambiguous numeric timestamp values
 */
export function parseNumericTimestamp(value: unknown): Date|null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Handle numeric timestamps - both seconds and milliseconds
  if (typeof value === 'number') {
    return timestampToDate(value);
  }

  // Handle string numeric timestamps (both seconds and milliseconds)
  if (typeof value === 'string') {
    // Scientific notation
    if (/^-?\d*\.?\d+[eE][-+]?\d+$/.test(value.trim())) {
      const timestamp = parseNumericValue(value);
      if (!isNaN(timestamp)) {
        return timestampToDate(timestamp);
      }
    }

    // Check for plain number strings that could be Unix timestamps
    if (/^\d+$/.test(value.trim())) {
      const timestamp = parseNumericValue(value);
      if (!isNaN(timestamp)) {
        return timestampToDate(timestamp);
      }
    }
  }

  return null;
}

/**
 * Check if a string is a valid Excel error value
 */
export function isExcelError(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const excelErrors = [
    '#N/A',
    '#DIV/0!',
    '#VALUE!',
    '#REF!',
    '#NAME?',
    '#NUM!',
    '#NULL!',
  ];
  return excelErrors.includes(value.trim());
}
