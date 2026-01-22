import type { ReceiptData, RefundReceiptData } from './receipt';

interface PrinterInfo {
    name: string;
    displayName: string;
    isDefault: boolean;
    status: number;
}

interface PrintResult {
    success: boolean;
    error?: string;
}

interface ElectronAPI {
    // Printing functions
    printReceipt: (receipt: ReceiptData) => Promise<PrintResult>;
    printRefundReceipt: (receipt: RefundReceiptData) => Promise<PrintResult>;

    // Printer management
    getPrinters: () => Promise<PrinterInfo[]>;
    getSelectedPrinter: () => Promise<string | null>;
    setSelectedPrinter: (printerName: string | null) => Promise<{ success: boolean }>;

    // Platform detection
    isElectron: boolean;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
