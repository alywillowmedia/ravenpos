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
export function generateLabelsPDF(items: LabelItem[]): void {
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
        alert('No labels to print');
        return;
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
        drawLabel(pdf, item, x, y, labelWidth, labelHeight);
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
    const centerX = x + width / 2;

    // Set default font
    pdf.setFont('helvetica');

    // Row 1: Vendor name (top left, small, muted)
    const consignor = item.consignor as { consignor_number?: string; name?: string } | undefined;
    const vendorText = consignor?.name || consignor?.consignor_number || '';
    if (vendorText) {
        pdf.setFontSize(6);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(120);
        const vendor = truncateText(pdf, vendorText, innerWidth * 0.6);
        pdf.text(vendor, innerX, innerY + 6);
        pdf.setTextColor(0);
    }

    // Row 1: Price (top right, bold, prominent)
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    const price = formatCurrency(Number(item.price));
    const priceWidth = pdf.getTextWidth(price);
    pdf.text(price, x + width - padding - priceWidth, innerY + 7);

    // Row 2: Item name (bold, larger)
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    const name = truncateText(pdf, item.name, innerWidth);
    pdf.text(name, innerX, innerY + 17);

    // Row 2.5: Variant (if exists, smaller, gray)
    let variantOffset = 0;
    if (item.variant) {
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100);
        const variant = truncateText(pdf, item.variant, innerWidth);
        pdf.text(variant, innerX, innerY + 24);
        pdf.setTextColor(0);
        variantOffset = 6;
    }

    // Row 3: Barcode (centered, shorter height)
    const barcodeDataUrl = generateBarcodeDataUrl(item.sku);
    if (barcodeDataUrl) {
        const barcodeWidth = 90;
        const barcodeHeight = 18; // Shorter barcode
        const barcodeX = centerX - barcodeWidth / 2;
        const barcodeY = innerY + 26 + variantOffset;
        try {
            pdf.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
        } catch {
            // Silently fail if image can't be added
        }

        // Row 4: SKU (centered below barcode, monospace, small)
        pdf.setFontSize(7);
        pdf.setFont('courier', 'normal');
        pdf.setTextColor(80);
        const skuWidth = pdf.getTextWidth(item.sku);
        pdf.text(item.sku, centerX - skuWidth / 2, barcodeY + barcodeHeight + 8);
        pdf.setTextColor(0);
    } else {
        // No barcode - just show SKU centered
        pdf.setFontSize(8);
        pdf.setFont('courier', 'normal');
        const skuWidth = pdf.getTextWidth(item.sku);
        pdf.text(item.sku, centerX - skuWidth / 2, y + height - 10);
    }
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
export function downloadLabelsPDF(items: LabelItem[], filename: string = 'labels.pdf'): void {
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
        alert('No labels to print');
        return;
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

        drawLabel(pdf, item, x, y, labelWidth, labelHeight);
    });

    pdf.save(filename);
}
