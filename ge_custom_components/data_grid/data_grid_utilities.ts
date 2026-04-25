import {ColumnSchema} from './data_grid_schema';
import {isAlphanumericId, isCurrencyType, isDateType, isExcelError, isNumericType, isPercentageType, parseNumericValue,} from './data_grid_type_utilities';

/**
 * Utility function to compare table values for sorting.
 */
export function compareTableValues(
    a: unknown,
    b: unknown,
    isAsc: boolean,
    schema?: ColumnSchema,
    ): number {
  // If schema is provided, ALWAYS use type-specific comparison
  // and don't try to guess the type
  if (schema?.type) {
    return compareByType(a, b, isAsc, schema.type);
  }

  // Handle null/undefined values
  if (a === null || a === undefined || a === '' || a === 'null') {
    return b === null || b === undefined || b === '' || b === 'null' ?
        0 :
        -1 * (isAsc ? 1 : -1);
  }
  if (b === null || b === undefined || b === '' || b === 'null') {
    return 1 * (isAsc ? 1 : -1);
  }

  if ((typeof a === 'string' && isExcelError(a)) ||
      (typeof b === 'string' && isExcelError(b))) {
    if (typeof a === 'string' && isExcelError(a) && typeof b === 'string' &&
        isExcelError(b)) {
      return a.localeCompare(b) * (isAsc ? 1 : -1);
    }
    if (typeof a === 'string' && isExcelError(a)) return 1 * (isAsc ? 1 : -1);
    return -1 * (isAsc ? 1 : -1);
  }

  // Handle alphanumeric IDs as strings, not as numbers
  if ((typeof a === 'string' && isAlphanumericId(a)) ||
      (typeof b === 'string' && isAlphanumericId(b))) {
    return String(a).localeCompare(String(b)) * (isAsc ? 1 : -1);
  }

  // Convert any numeric value in scientific notation to a number for comparison
  let numA = a;
  let numB = b;

  if (typeof a === 'string' && /^-?\d*\.?\d+[eE][-+]?\d+$/.test(a.trim())) {
    numA = parseNumericValue(a);
  }

  if (typeof b === 'string' && /^-?\d*\.?\d+[eE][-+]?\d+$/.test(b.trim())) {
    numB = parseNumericValue(b);
  }

  if (typeof numA === 'number' && typeof numB === 'number') {
    return (numA - numB) * (isAsc ? 1 : -1);
  }

  const parsedA = parseNumericValue(numA);
  const parsedB = parseNumericValue(numB);
  if (!isNaN(parsedA) && !isNaN(parsedB)) {
    return (parsedA - parsedB) * (isAsc ? 1 : -1);
  }

  return String(a).localeCompare(String(b)) * (isAsc ? 1 : -1);
}

/**
 * Compare values based on their type
 */
export function compareByType(
    a: unknown,
    b: unknown,
    isAsc: boolean,
    type: string,
    ): number {
  const direction = isAsc ? 1 : -1;

  if (a === null || a === undefined || a === '' || a === 'null') {
    return b === null || b === undefined || b === '' || b === 'null' ?
        0 :
        -1 * direction;
  }
  if (b === null || b === undefined || b === '' || b === 'null') {
    return 1 * direction;
  }

  if ((typeof a === 'string' && isExcelError(a)) ||
      (typeof b === 'string' && isExcelError(b))) {
    if (typeof a === 'string' && isExcelError(a) && typeof b === 'string' &&
        isExcelError(b)) {
      return a.localeCompare(b) * direction;
    }
    if (typeof a === 'string' && isExcelError(a)) return 1 * direction;
    return -1 * direction;
  }

  // Treat alphanumeric IDs as strings
  if ((typeof a === 'string' && isAlphanumericId(a)) ||
      (typeof b === 'string' && isAlphanumericId(b))) {
    return compareString(a, b) * direction;
  }

  if (isNumericType(type) || isCurrencyType(type) || isPercentageType(type)) {
    return compareNumeric(a, b) * direction;
  }

  if (isDateType(type)) {
    return compareDate(a, b) * direction;
  }

  return compareString(a, b) * direction;
}

/**
 * Compare numeric values
 */
export function compareNumeric(a: unknown, b: unknown): number {
  const numA = parseNumericValue(a);
  const numB = parseNumericValue(b);

  if (isNaN(numA) && isNaN(numB)) return 0;
  if (isNaN(numA)) return -1;
  if (isNaN(numB)) return 1;

  return numA - numB;
}

/**
 * Compare date values
 */
export function compareDate(a: unknown, b: unknown): number {
  // Handle null/undefined cases first
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  // For actual Date objects, compare directly
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Try to convert to Date objects for comparison
  try {
    // tslint:disable-next-line:no-any
    const dateA = a instanceof Date ? a : new Date(a as any);
    // tslint:disable-next-line:no-any
    const dateB = b instanceof Date ? b : new Date(b as any);

    // Check if both dates are valid
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return dateA.getTime() - dateB.getTime();
    }
  } catch (e) {
    // If date conversion fails, fall back to string comparison
  }

  // For all other cases, fall back to string comparison
  return String(a).localeCompare(String(b));
}

/**
 * Compare string values
 */
export function compareString(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b));
}
