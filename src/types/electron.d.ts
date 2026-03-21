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
    mode?: 'native' | 'fallback';
    driver?: string | null;
    warning?: string;
}

interface PrintDiagnostics {
    mode: 'native' | 'fallback';
    driver: string | null;
    reason: string | null;
}

interface ElectronAPI {
    // Printing functions
    printReceipt: (receipt: ReceiptData) => Promise<PrintResult>;
    printRefundReceipt: (receipt: RefundReceiptData) => Promise<PrintResult>;

    // Printer management
    getPrinters: () => Promise<PrinterInfo[]>;
    getPrintDiagnostics: () => Promise<PrintDiagnostics>;
    getSelectedPrinter: () => Promise<string | null>;
    setSelectedPrinter: (printerName: string | null) => Promise<{ success: boolean }>;

    // Device auth token persistence
    getDeviceAuthToken: () => Promise<string | null>;
    setDeviceAuthToken: (token: string) => Promise<{ success: boolean }>;
    clearDeviceAuthToken: () => Promise<{ success: boolean }>;

    // Platform detection
    isElectron: boolean;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
