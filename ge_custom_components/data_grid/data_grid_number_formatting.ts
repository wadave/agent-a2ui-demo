import * as ssf from 'malloy_ssf';

import {ColumnSchema, ColumnType} from './data_grid_schema';
import {extractCurrencySymbol, getDatePrecisionLevel, isCurrencyType, isDateType, isExcelError, isNumericType, isPercentageType, isTimestampType, parseNumericTimestamp, parseNumericValue,} from './data_grid_type_utilities';

/**
 * Analysis of a column in a data grid
 */
export interface ColumnAnalysis {
  isNumeric: boolean;
  optimalDecimals: number;
  maxIntegerDigits: number;
  // tslint:disable-next-line:no-any
  originalValues: any[];
  type?: ColumnType;
  datePrecision?: string;
  currencySymbols?: Set<string>;
  valueFormat?: string;
}

/**
 * Service for analyzing and formatting numeric values in a data grid.
 */
export class NumberFormattingService {
  private readonly NUMERIC_THRESHOLD = 0.5;
  private readonly MAX_DEFAULT_DECIMALS = 4;
  private userLocale: string = navigator.language || 'en-US';

  // tslint:disable-next-line:no-any
  analyzeColumn(columnData: any[], schema?: ColumnSchema): ColumnAnalysis {
    // Only apply type-specific analysis when a schema is explicitly provided
    if (schema?.type) {
      return this.analyzeColumnWithSchema(columnData, schema);
    }

    // With no schema, return minimal analysis with original values only
    // No type inference, no formatting
    return {
      isNumeric: false,
      optimalDecimals: 0,
      maxIntegerDigits: 0,
      originalValues: columnData,
      // Explicitly no type when schema is missing
      type: undefined,
    };
  }

  private analyzeColumnWithSchema(
      // tslint:disable-next-line:no-any
      columnData: any[],
      schema: ColumnSchema,
      ): ColumnAnalysis {
    // Always respect the schema's type definitions
    const isNumeric = Boolean(schema.type && isNumericType(schema.type));
    const isDate = Boolean(schema.type && isDateType(schema.type));
    const isCurrency = Boolean(schema.type && isCurrencyType(schema.type));

    let optimalDecimals = 0;
    let maxIntegerDigits = 0;
    let datePrecision = undefined;
    const currencySymbols = new Set<string>();

    if (isNumeric || isCurrency) {
      const filteredData = columnData.filter(
          (val) => val !== null && val !== undefined && val !== '',
      );

      // Collect currency symbols if this is a currency column
      if (isCurrency) {
        for (const val of filteredData) {
          if (typeof val === 'string') {
            const symbol = extractCurrencySymbol(val);
            if (symbol) {
              currencySymbols.add(symbol);
            }
          }
        }
      }

      const cleanedNumbers = filteredData.map((val) => parseNumericValue(val));
      const validValues = cleanedNumbers.filter((val) => !isNaN(val));

      if (validValues.length > 0) {
        optimalDecimals = this.calculateOptimalDecimals(validValues);
        maxIntegerDigits = this.calculateMaxIntegerDigits(validValues);
      }
    }

    if (isDate) {
      datePrecision = schema.type && getDatePrecisionLevel(schema.type);
    }

    return {
      isNumeric,
      optimalDecimals,
      maxIntegerDigits,
      originalValues: columnData,
      type: schema.type,
      datePrecision,
      currencySymbols: currencySymbols.size > 0 ? currencySymbols : undefined,
      valueFormat: schema.valueFormat,
    };
  }

  private createEmptyAnalysis(): ColumnAnalysis {
    return {
      isNumeric: false,
      optimalDecimals: 0,
      maxIntegerDigits: 0,
      originalValues: [],
      valueFormat: undefined,
    };
  }

  private calculateOptimalDecimals(numericValues: number[]): number {
    const validValues = numericValues.filter((val) => !isNaN(val));
    if (validValues.length === 0) return 0;

    const rawMaxDecimals = Math.min(
        this.computeMaxDecimalPlaces(validValues),
        this.MAX_DEFAULT_DECIMALS,
    );
    if (rawMaxDecimals === 0) return 0;

    const minVal = Math.min(...validValues);
    const maxVal = Math.max(...validValues);
    const range = maxVal - minVal;
    if (range === 0) return rawMaxDecimals;

    const rangeLog = Math.log10(range);

    return Math.max(0, rawMaxDecimals - Math.floor(rangeLog));
  }

  private computeMaxDecimalPlaces(values: number[]): number {
    let maxDp = 0;
    for (const v of values) {
      const strVal = v.toString();
      const idx = strVal.indexOf('.');
      if (idx >= 0) {
        maxDp = Math.max(maxDp, strVal.length - idx - 1);
      }
    }
    return maxDp;
  }

  private calculateMaxIntegerDigits(numericValues: number[]): number {
    return Math.max(
        ...numericValues.map((val) => {
          const strVal = Math.abs(val).toString();
          return strVal.includes('.') ? strVal.split('.')[0].length :
                                        strVal.length;
        }),
    );
  }

  // tslint:disable-next-line:no-any
  formatValue(value: any, analysis: ColumnAnalysis): string {
    if (value === null || value === undefined || value === '' ||
        value === 'null') {
      return '∅';
    }

    if (typeof value === 'string' && isExcelError(value)) {
      return value;
    }

    if (analysis.type) {
      return this.formatValueByType(value, analysis);
    }

    return String(value);
  }

  // tslint:disable-next-line:no-any
  formatValueByType(value: any, analysis: ColumnAnalysis): string {
    if (value === null || value === undefined || value === '' ||
        value === 'null') {
      return '∅';
    }

    const type = analysis.type;
    if (!type) return String(value);

    if (analysis.valueFormat &&
        (isNumericType(type) || isCurrencyType(type) ||
         isPercentageType(type) ||
         (isDateType(type) && !isTimestampType(type)))) {
      const numericValue = parseNumericValue(value);
      if (!isNaN(numericValue)) {
        try {
          return ssf.format(analysis.valueFormat, numericValue);
        } catch (e) {
          console.error(
              `Failed to format ${value} with valueFormat ${
                  analysis.valueFormat}`,
          );
        }
      }
    }

    if (analysis.valueFormat && isTimestampType(type)) {
      const date = parseNumericTimestamp(value);
      if (date) {
        try {
          // SSF expects Excel date number format.
          // The date number is number of days since 1/1/1900 for Excel.
          // JS date is ms since 1/1/1970.
          // 25569.0 is Jan 1 1970 in Excel date format.
          const excelDate = date.getTime() / 86400000 + 25569;
          return ssf.format(analysis.valueFormat, excelDate);
        } catch (e) {
          console.error(
              `Failed to format ${value} with valueFormat ${
                  analysis.valueFormat}`,
          );
        }
      }
    }

    // Handle specific types based on schema only
    if (isCurrencyType(type)) {
      return this.formatCurrency(value, analysis);
    }

    if (isPercentageType(type)) {
      return this.formatPercentage(value, analysis.optimalDecimals);
    }

    if (isNumericType(type)) {
      return this.formatNumeric(value, analysis.optimalDecimals);
    }

    if (isTimestampType(type)) {
      return this.formatTimestampByPrecision(
          value,
          analysis.datePrecision || 'minute',
      );
    }

    // All other date types are returned as strings
    return String(value);
  }

  // tslint:disable-next-line:no-any
  formatCurrency(value: any, analysis: ColumnAnalysis): string {
    // Pass through original string values that already have currency symbols
    if (typeof value === 'string') {
      const extractedSymbol = extractCurrencySymbol(value);
      if (extractedSymbol) {
        return value;
      }
    }

    // For values without currency symbols, just return them as strings
    // This avoids any risk of misleading currency formatting
    return String(value);
  }

  // tslint:disable-next-line:no-any
  formatNumeric(value: any, decimals = 2): string {
    const num = parseNumericValue(value);
    if (!isNaN(num)) {
      return new Intl
          .NumberFormat(this.userLocale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
          .format(num);
    }

    return String(value);
  }

  // tslint:disable-next-line:no-any
  formatPercentage(value: any, decimals = 2): string {
    // If it already has a % sign, preserve it exactly
    if (typeof value === 'string' && value.trim().endsWith('%')) {
      return value;
    }

    // For all other values, just return them as strings
    // This avoids any risk of misleading percentage formatting
    return String(value);
  }

  // tslint:disable-next-line:no-any
  formatTimestampByPrecision(value: any, precision: string): string {
    // Parse only numeric timestamps and scientific notation
    // This matches how Vega would interpret these values
    const date = parseNumericTimestamp(value);
    if (!date) return String(value);

    let dateTimeFormat: Intl.DateTimeFormatOptions;

    switch (precision) {
      case 'year':
        dateTimeFormat = {year: 'numeric', timeZone: 'UTC'};
        break;
      case 'quarter':
        const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
        return `Q${quarter} ${date.getUTCFullYear()}`;
      case 'month':
        dateTimeFormat = {year: 'numeric', month: 'short', timeZone: 'UTC'};
        break;
      case 'week':
        dateTimeFormat = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        };
        break;
      case 'day':
        dateTimeFormat = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        };
        break;
      case 'hour':
        dateTimeFormat = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          timeZone: 'UTC',
          hour12: false,
        };
        break;
      case 'minute':
        dateTimeFormat = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
          hour12: false,
        };
        break;
      case 'second':
        dateTimeFormat = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'UTC',
          hour12: false,
        };
        break;
      default:
        dateTimeFormat = {year: 'numeric', month: 'short', day: 'numeric'};
    }

    return new Intl.DateTimeFormat(this.userLocale, dateTimeFormat)
        .format(
            date,
        );
  }

  // tslint:disable-next-line:no-any
  getOriginalValueForTitle(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    return String(value);
  }

  setUserLocale(locale: string): void {
    this.userLocale = locale;
  }
}
