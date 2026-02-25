import type { CartItem, Invoice, InvoiceItem } from '../types';
import type { InvoiceEmailData, InvoiceEmailItem } from '../types/invoice';

export function createInvoiceEmailDataFromCart(invoice: Invoice, cartItems: CartItem[]): InvoiceEmailData {
    const items: InvoiceEmailItem[] = cartItems.map((cartItem) => ({
        name: cartItem.item.name + (cartItem.item.variant_summary ? ` - ${cartItem.item.variant_summary}` : ''),
        quantity: cartItem.quantity,
        price: Number(cartItem.item.price),
        lineTotal: cartItem.discount ? cartItem.discountedLineTotal : cartItem.lineTotal,
        consignorName: cartItem.item.consignor?.name ?? 'Unknown Vendor',
    }));

    return {
        invoiceId: invoice.id,
        date: new Date(invoice.created_at),
        items,
        subtotal: Number(invoice.subtotal),
        tax: Number(invoice.tax_amount),
        total: Number(invoice.total),
        recipientName: invoice.recipient_name,
        recipientType: invoice.recipient_type,
        note: invoice.notes || undefined,
    };
}

export function createInvoiceEmailDataFromItems(invoice: Invoice, items: InvoiceItem[]): InvoiceEmailData {
    const emailItems: InvoiceEmailItem[] = items.map((item) => ({
        name: item.name,
        quantity: Number(item.quantity),
        price: Number(item.price),
        lineTotal: Number(item.line_total),
        consignorName: item.consignor?.name ?? 'Unknown Vendor',
    }));

    return {
        invoiceId: invoice.id,
        date: new Date(invoice.created_at),
        items: emailItems,
        subtotal: Number(invoice.subtotal),
        tax: Number(invoice.tax_amount),
        total: Number(invoice.total),
        recipientName: invoice.recipient_name,
        recipientType: invoice.recipient_type,
        note: invoice.notes || undefined,
    };
}
