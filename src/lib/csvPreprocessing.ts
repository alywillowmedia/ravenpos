/**
 * CSV Preprocessing utilities for Shopify exports
 * 
 * Shopify product exports have a quirk: when a product has multiple variants,
 * only the first row contains the product title - subsequent variant rows
 * leave the title blank. This utility fills in those blank titles using
 * the Handle column to group variants.
 */

export interface ShopifyCSVRow {
    [key: string]: string;
}

export interface PreprocessResult {
    /** Processed CSV data with titles filled in */
    data: ShopifyCSVRow[];
    /** Number of blank titles that were fixed */
    fixedCount: number;
    /** Number of unique products (handles) */
    productCount: number;
    /** Warnings about potential issues */
    warnings: string[];
}

/**
 * Get a column value case-insensitively
 */
function getColumnValue(row: ShopifyCSVRow, columnName: string): string {
    // Try exact match first
    if (row[columnName] !== undefined) {
        return row[columnName];
    }
    // Try lowercase match
    const lowerName = columnName.toLowerCase();
    for (const key of Object.keys(row)) {
        if (key.toLowerCase() === lowerName) {
            return row[key];
        }
    }
    return '';
}

/**
 * Set a column value, maintaining case from existing columns or defaulting to provided case
 */
function setColumnValue(row: ShopifyCSVRow, columnName: string, value: string): void {
    // Find the actual key used in the row
    const lowerName = columnName.toLowerCase();
    for (const key of Object.keys(row)) {
        if (key.toLowerCase() === lowerName) {
            row[key] = value;
            return;
        }
    }
    // If column doesn't exist, create it with provided case
    row[columnName] = value;
}

/**
 * Check if a CSV appears to be a Shopify export (has Handle column)
 */
export function detectShopifyCSV(headers: string[]): boolean {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    return lowerHeaders.includes('handle');
}

/**
 * Preprocess a Shopify CSV export to fill in blank variant titles
 * 
 * Shopify exports group variants under the same Handle, but only the first
 * row has the Title filled in. This function:
 * 1. Groups rows by Handle
 * 2. Finds the row with a non-empty Title in each group
 * 3. Copies that title to all rows in the group with blank titles
 * 
 * @param csvData - Raw parsed CSV data as array of objects
 * @returns PreprocessResult with processed data and summary statistics
 */
export function preprocessShopifyCSV(csvData: ShopifyCSVRow[]): PreprocessResult {
    const warnings: string[] = [];
    let fixedCount = 0;

    // Group rows by Handle
    const handleGroups = new Map<string, ShopifyCSVRow[]>();

    for (const row of csvData) {
        const handle = getColumnValue(row, 'Handle').trim();

        if (!handle) {
            // Rows without handles are kept as-is (might be a header issue)
            if (!handleGroups.has('__no_handle__')) {
                handleGroups.set('__no_handle__', []);
            }
            handleGroups.get('__no_handle__')!.push(row);
            continue;
        }

        if (!handleGroups.has(handle)) {
            handleGroups.set(handle, []);
        }
        handleGroups.get(handle)!.push(row);
    }

    // For each handle group, find the title and propagate it
    for (const [handle, rows] of handleGroups) {
        if (handle === '__no_handle__') {
            continue;
        }

        // Find the row with a non-empty title
        let productTitle = '';
        for (const row of rows) {
            const title = getColumnValue(row, 'Title').trim();
            if (title) {
                productTitle = title;
                break;
            }
        }

        if (!productTitle) {
            // All rows in this group have blank titles
            warnings.push(`Product with handle "${handle}" has no title`);
            continue;
        }

        // Fill blank titles for all rows in this group
        for (const row of rows) {
            const existingTitle = getColumnValue(row, 'Title').trim();
            if (!existingTitle) {
                setColumnValue(row, 'Title', productTitle);
                fixedCount++;
            }
        }
    }

    // Flatten the groups back to an array, preserving original order
    // by going through the original data
    const processedData = csvData;

    // Count unique products (excluding __no_handle__)
    const productCount = Array.from(handleGroups.keys()).filter(h => h !== '__no_handle__').length;

    return {
        data: processedData,
        fixedCount,
        productCount,
        warnings,
    };
}
