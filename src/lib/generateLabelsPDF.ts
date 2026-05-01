import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import type { Item } from '../types';

// Avery 5160 specifications (in inches, converted to points: 1 inch = 72 points)
const INCH = 72;
const AVERY_5160 = {
    pageWidth: 8.5 * INCH,
    pageHeight: 11 * INCH,
    labelWidth: 2.625 * INCH,
    labelHeight: 1 * INCH,
    topMargin: 0.5 * INCH,
    sideMargin: 0.1875 * INCH,
    horizontalGap: 0.125 * INCH,
    verticalGap: 0,
    columns: 3,
    rows: 10,
    labelsPerPage: 30,
};

interface LabelItem extends Item {
    printQuantity?: number;
}

export type LabelLayout = 'price' | 'shelf';

export interface GenerateLabelsPDFOptions {
    layout?: LabelLayout;
}

/**
 * Generate barcode as data URL
 */
function generateBarcodeDataUrl(sku: string): string {
    const canvas = document.createElement('canvas');
    try {
        JsBarcode(canvas, sku, {
            format: 'CODE128',
            width: 1.5,
            height: 35,
            displayValue: false,
            margin: 0,
        });
        return canvas.toDataURL('image/png');
    } catch {
        // If barcode generation fails, return empty
        return '';
    }
}

/**
 * Format price as currency
 */
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
}

/**
 * Generate a PDF of Avery 5160 labels and open it
 */
export function generateLabelsPDF(items: LabelItem[], options: GenerateLabelsPDFOptions = {}): void {
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
    });

    // Expand items by their print quantity
    const expandedItems: LabelItem[] = [];
    for (const item of items) {
        const count = Math.min(item.printQuantity ?? item.quantity, 100);
        for (let i = 0; i < count; i++) {
            expandedItems.push(item);
        }
    }

    if (expandedItems.length === 0) {
        throw new Error('No labels to print');
    }

    // Calculate grid positions
    const { labelWidth, labelHeight, topMargin, sideMargin, horizontalGap, columns, labelsPerPage } = AVERY_5160;

    let currentPage = 0;

    expandedItems.forEach((item, index) => {
        const pageIndex = Math.floor(index / labelsPerPage);
        const positionOnPage = index % labelsPerPage;
        const col = positionOnPage % columns;
        const row = Math.floor(positionOnPage / columns);

        // Add new page if needed
        if (pageIndex > currentPage) {
            pdf.addPage();
            currentPage = pageIndex;
        }

        // Calculate label position
        const x = sideMargin + col * (labelWidth + horizontalGap);
        const y = topMargin + row * labelHeight;

        // Draw label content
        if (options.layout === 'shelf') {
            drawShelfLabel(pdf, item, x, y, labelWidth, labelHeight);
        } else {
            drawLabel(pdf, item, x, y, labelWidth, labelHeight);
        }
    });

    // Open PDF in new tab
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
}

/**
 * Draw a single label at the specified position
 */
function drawLabel(
    pdf: jsPDF,
    item: LabelItem,
    x: number,
    y: number,
    width: number,
    height: number
): void {
    const padding = 5;
    const innerX = x + padding;
    const innerY = y + padding;
    const innerWidth = width - padding * 2;
    const halfWidth = width / 2;

    // Set default font
    pdf.setFont('helvetica');

    // Row 1: Vendor name (top left, small, muted)
    const consignor = item.consignor as { consignor_number?: string; name?: string } | undefined;
    const vendorText = consignor?.name || consignor?.consignor_number || '';
    if (vendorText) {
        pdf.setFontSize(6);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(120);
        const vendor = truncateText(pdf, vendorText, halfWidth - padding);
        pdf.text(vendor, innerX, innerY + 6);
        pdf.setTextColor(0);
    }

    // Row 1: Price (top right, bold, prominent)
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    const price = formatCurrency(Number(item.price));
    const priceWidth = pdf.getTextWidth(price);
    pdf.text(price, x + width - padding - priceWidth, innerY + 7);

    // Row 2: Item name (bold, larger) - LEFT SIDE
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    const name = truncateText(pdf, item.name, innerWidth);
    pdf.text(name, innerX, innerY + 17);

    // Row 2.5: Variant/Summary (if exists, smaller, gray) - LEFT SIDE with top padding
    let variantOffset = 0;
    if (item.variant_summary) {
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100);
        const variant = truncateText(pdf, item.variant_summary, halfWidth - padding);
        pdf.text(variant, innerX, innerY + 26); // Increased from 24 to 26 for top padding
        pdf.setTextColor(0);
        variantOffset = 8; // Increased from 6 to 8
    }

    // Row 3: Barcode (LEFT ALIGNED, same as item title)
    const barcodeDataUrl = generateBarcodeDataUrl(item.sku);
    if (barcodeDataUrl) {
        const barcodeWidth = 90;
        const barcodeHeight = 15; // Reduced from 18 to 15
        const barcodeX = innerX; // Left aligned with item name
        const barcodeY = innerY + 26 + variantOffset;
        try {
            pdf.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
        } catch {
            // Silently fail if image can't be added
        }

        // Row 4: SKU (left aligned below barcode, monospace, small)
        pdf.setFontSize(7);
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(80);
        pdf.text(item.sku, barcodeX, barcodeY + barcodeHeight + 8);
        pdf.setTextColor(0);

        // RIGHT SIDE: Other Details underneath price
        const rightX = x + halfWidth + padding + 8; // Moved further right
        let detailsY = innerY + 16;
        const maxDetailWidth = halfWidth - padding * 2 - 8; // Adjusted for rightX shift

        // Other Details 1 (right side) with bullet and wrapping
        if (item.other_details_1) {
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(80);
            
            // Add bullet point
            pdf.text('•', rightX, detailsY);
            
            // Wrap text if needed
            const detail1Lines = pdf.splitTextToSize(item.other_details_1, maxDetailWidth - 5);
            pdf.text(detail1Lines, rightX + 5, detailsY);
            detailsY += (detail1Lines.length * 7) + 5; // Increased spacing from +3 to +5
            pdf.setTextColor(0);
        }

        // Other Details 2 (right side) with bullet and wrapping
        if (item.other_details_2) {
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(80);
            
            // Add bullet point
            pdf.text('•', rightX, detailsY);
            
            // Wrap text if needed
            const detail2Lines = pdf.splitTextToSize(item.other_details_2, maxDetailWidth - 5);
            pdf.text(detail2Lines, rightX + 5, detailsY);
            pdf.setTextColor(0);
        }
    } else {
        // No barcode - just show SKU left aligned
        pdf.setFontSize(8);
        pdf.setFont('courier', 'normal');
        pdf.text(item.sku, innerX, y + height - 10);
    }
}

function buildShelfDescription(item: LabelItem): string {
    return [
        item.variant_summary,
        item.other_details_1,
        item.other_details_2,
    ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(' • ');
}

function drawShelfLabel(
    pdf: jsPDF,
    item: LabelItem,
    x: number,
    y: number,
    width: number,
    height: number
): void {
    const padding = 5;
    const innerX = x + padding;
    const innerY = y + padding;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const titleHeight = 34;
    const bottomY = innerY + titleHeight;
    const descriptionWidth = innerWidth * 0.66;
    const priceX = innerX + descriptionWidth + 4;
    const priceWidth = innerWidth - descriptionWidth - 4;
    const bottomHeight = innerHeight - titleHeight;

    pdf.setDrawColor(0);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x + 2, y + 2, width - 4, height - 4, 4, 4);

    pdf.setLineWidth(0.45);
    pdf.line(innerX, bottomY, x + width - padding, bottomY);
    pdf.line(priceX - 4, bottomY, priceX - 4, y + height - padding);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(0);
    const titleLines = pdf.splitTextToSize(item.name.toUpperCase(), innerWidth);
    pdf.text(titleLines.slice(0, 2), innerX, innerY + 14, {
        baseline: 'alphabetic',
        lineHeightFactor: 0.88,
    });

    const description = buildShelfDescription(item);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(65);
    if (description) {
        const descriptionLines = pdf.splitTextToSize(description, descriptionWidth - 2);
        pdf.text(descriptionLines.slice(0, 3), innerX, bottomY + 10, {
            baseline: 'alphabetic',
            lineHeightFactor: 1.05,
        });
    } else if (item.category) {
        pdf.text(truncateText(pdf, item.category, descriptionWidth - 2), innerX, bottomY + 10);
    }

    pdf.setDrawColor(0);
    pdf.setLineWidth(0.55);
    pdf.roundedRect(priceX, bottomY + 5, priceWidth, bottomHeight - 9, 3, 3);

    const price = formatCurrency(Number(item.price));
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(price.length > 7 ? 11 : 13);
    pdf.setTextColor(0);
    const priceWidthText = pdf.getTextWidth(price);
    pdf.text(
        price,
        priceX + Math.max(3, (priceWidth - priceWidthText) / 2),
        bottomY + bottomHeight / 2 + 5
    );
}

/**
 * Truncate text to fit within a given width
 */
function truncateText(pdf: jsPDF, text: string, maxWidth: number): string {
    if (pdf.getTextWidth(text) <= maxWidth) {
        return text;
    }

    let truncated = text;
    while (truncated.length > 0 && pdf.getTextWidth(truncated + '...') > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

/**
 * Download the PDF instead of opening it
 */
export function downloadLabelsPDF(
    items: LabelItem[],
    filename: string = 'labels.pdf',
    options: GenerateLabelsPDFOptions = {}
): void {
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
    });

    // Expand items by their print quantity
    const expandedItems: LabelItem[] = [];
    for (const item of items) {
        const count = Math.min(item.printQuantity ?? item.quantity, 100);
        for (let i = 0; i < count; i++) {
            expandedItems.push(item);
        }
    }

    if (expandedItems.length === 0) {
        throw new Error('No labels to print');
    }

    const { labelWidth, labelHeight, topMargin, sideMargin, horizontalGap, columns, labelsPerPage } = AVERY_5160;

    let currentPage = 0;

    expandedItems.forEach((item, index) => {
        const pageIndex = Math.floor(index / labelsPerPage);
        const positionOnPage = index % labelsPerPage;
        const col = positionOnPage % columns;
        const row = Math.floor(positionOnPage / columns);

        if (pageIndex > currentPage) {
            pdf.addPage();
            currentPage = pageIndex;
        }

        const x = sideMargin + col * (labelWidth + horizontalGap);
        const y = topMargin + row * labelHeight;

        if (options.layout === 'shelf') {
            drawShelfLabel(pdf, item, x, y, labelWidth, labelHeight);
        } else {
            drawLabel(pdf, item, x, y, labelWidth, labelHeight);
        }
    });

    pdf.save(filename);
}
