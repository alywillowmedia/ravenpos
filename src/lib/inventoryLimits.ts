export const PRODUCT_TITLE_MAX_LENGTH = 75;

export function limitProductTitle(value: string): string {
    return value.slice(0, PRODUCT_TITLE_MAX_LENGTH);
}

export function getSheetLabelTitleFontSize(title: string): number {
    const length = title.trim().length;
    if (length > 55) return 7;
    if (length > 36) return 8;
    return 9;
}
