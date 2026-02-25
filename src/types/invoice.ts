export type InvoiceRecipientType = 'customer' | 'vendor';
export type InvoiceStatus = 'unpaid' | 'paid';

export interface InvoiceEmailItem {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    consignorName?: string;
}

export interface InvoiceEmailData {
    invoiceId: string;
    date: Date;
    items: InvoiceEmailItem[];
    subtotal: number;
    tax: number;
    total: number;
    recipientName: string;
    recipientType: InvoiceRecipientType;
    note?: string;
}
