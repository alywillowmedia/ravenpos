import type { ReceiptData } from '../../types/receipt';

interface ReceiptTemplateProps {
    receipt: ReceiptData;
}

/**
 * Receipt template styled to look like thermal printer output
 * Width: 80mm (302px at 96dpi)
 * Font: Courier New (monospace for authentic thermal look)
 */
export function ReceiptTemplate({ receipt }: ReceiptTemplateProps) {
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }) + ' ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatCurrency = (amount: number) => {
        return '$' + amount.toFixed(2);
    };

    return (
        <div style={{
            width: '302px', // 80mm at 96dpi
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '12px',
            lineHeight: '1.4',
            backgroundColor: '#fff',
            color: '#000',
            padding: '16px',
            boxSizing: 'border-box',
        }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    letterSpacing: '2px',
                }}>
                    RAVENLIA
                </div>
                <div style={{
                    borderBottom: '1px dashed #000',
                    margin: '8px 0',
                }} />
                <div style={{ fontSize: '11px' }}>
                    {formatDate(receipt.date)}
                </div>
                <div style={{ fontSize: '10px', marginTop: '4px' }}>
                    Transaction: #{receipt.transactionId.slice(0, 8).toUpperCase()}
                </div>
            </div>

            {/* Separator */}
            <div style={{
                borderBottom: '1px dashed #000',
                margin: '8px 0',
            }} />

            {/* Items */}
            <div style={{ marginBottom: '12px' }}>
                {receipt.items.map((item, index) => (
                    <div key={index} style={{ marginBottom: '8px' }}>
                        {/* Item name */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontWeight: 'normal',
                        }}>
                            <span style={{
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                paddingRight: '8px',
                            }}>
                                {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}
                            </span>
                            <span style={{ whiteSpace: 'nowrap' }}>
                                {formatCurrency(item.lineTotal)}
                            </span>
                        </div>
                        {/* Item details */}
                        <div style={{
                            fontSize: '10px',
                            color: '#666',
                            paddingLeft: '8px',
                        }}>
                            {item.quantity > 1 && (
                                <div>@ {formatCurrency(item.price)} each</div>
                            )}
                            <div>Vendor: {item.consignorName}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Separator */}
            <div style={{
                borderBottom: '1px dashed #000',
                margin: '8px 0',
            }} />

            {/* Totals */}
            <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(receipt.subtotal)}</span>
                </div>
                {receipt.tax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tax</span>
                        <span>{formatCurrency(receipt.tax)}</span>
                    </div>
                )}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    marginTop: '4px',
                    paddingTop: '4px',
                    borderTop: '1px solid #000',
                }}>
                    <span>TOTAL</span>
                    <span>{formatCurrency(receipt.total)}</span>
                </div>
            </div>

            {/* Payment Info */}
            <div style={{
                borderBottom: '1px dashed #000',
                margin: '8px 0',
            }} />

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Payment</span>
                    <span>{receipt.paymentMethod.toUpperCase()}</span>
                </div>
                {receipt.paymentMethod === 'cash' && receipt.cashTendered !== undefined && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Cash</span>
                            <span>{formatCurrency(receipt.cashTendered)}</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontWeight: 'bold',
                        }}>
                            <span>Change</span>
                            <span>{formatCurrency(receipt.changeGiven ?? 0)}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div style={{
                borderBottom: '1px dashed #000',
                margin: '12px 0 8px 0',
            }} />

            <div style={{
                textAlign: 'center',
                fontSize: '11px',
            }}>
                <div style={{ marginBottom: '4px' }}>
                    Thank you for shopping at Ravenlia!
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>
                    Keep receipt for returns
                </div>
            </div>
        </div>
    );
}
