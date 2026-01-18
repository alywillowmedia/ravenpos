import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import type { Item } from '../../types';
import { formatCurrency } from '../../lib/utils';

interface LabelItem extends Item {
    printQuantity?: number;
}

interface LabelSheetProps {
    items: LabelItem[];
}

// Avery 5160: 30 labels per sheet (3 columns x 10 rows)
const LABELS_PER_SHEET = 30;
const COLS = 3;
const ROWS = 10;

export function LabelSheet({ items }: LabelSheetProps) {
    // Expand items by printQuantity if provided, otherwise use quantity (each gets a label, up to 100 max)
    const expandedItems: LabelItem[] = [];
    for (const item of items) {
        const count = Math.min(item.printQuantity ?? item.quantity, 100);
        for (let i = 0; i < count; i++) {
            expandedItems.push(item);
        }
    }

    // Split into sheets
    const sheets: LabelItem[][] = [];
    for (let i = 0; i < expandedItems.length; i += LABELS_PER_SHEET) {
        sheets.push(expandedItems.slice(i, i + LABELS_PER_SHEET));
    }

    return (
        <div className="print-container">
            {sheets.map((sheetItems, sheetIndex) => (
                <div
                    key={sheetIndex}
                    className="avery-sheet"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                        gap: '0',
                        width: '8.5in',
                        height: '11in',
                        padding: '0.5in 0.1875in',
                        pageBreakAfter: sheetIndex < sheets.length - 1 ? 'always' : 'auto',
                        boxSizing: 'border-box',
                    }}
                >
                    {Array.from({ length: LABELS_PER_SHEET }).map((_, i) => {
                        const item = sheetItems[i];
                        return (
                            <div
                                key={i}
                                style={{
                                    width: '2.625in',
                                    height: '1in',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    boxSizing: 'border-box',
                                }}
                            >
                                {item && <BarcodeLabel item={item} />}
                            </div>
                        );
                    })}
                </div>
            ))}

            <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          .print-container {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
        </div>
    );
}

interface BarcodeLabelProps {
    item: LabelItem;
}

function BarcodeLabel({ item }: BarcodeLabelProps) {
    const barcodeRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (barcodeRef.current) {
            JsBarcode(barcodeRef.current, item.sku, {
                format: 'CODE128',
                width: 1.5,
                height: 30,
                displayValue: false,
                margin: 0,
            });
        }
    }, [item.sku]);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                padding: '4px 8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                fontFamily: 'Inter, system-ui, sans-serif',
                boxSizing: 'border-box',
            }}
        >
            {/* Item name + variant */}
            <div style={{ overflow: 'hidden' }}>
                <div
                    style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {item.name}
                </div>
                {item.variant && (
                    <div
                        style={{
                            fontSize: '8px',
                            color: '#666',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {item.variant}
                    </div>
                )}
            </div>

            {/* Barcode */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <svg ref={barcodeRef} />
            </div>

            {/* SKU and Price */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <span
                    style={{
                        fontSize: '7px',
                        fontFamily: 'monospace',
                        color: '#666',
                    }}
                >
                    {item.sku}
                </span>
                <span
                    style={{
                        fontSize: '12px',
                        fontWeight: 700,
                    }}
                >
                    {formatCurrency(Number(item.price))}
                </span>
            </div>
        </div>
    );
}
