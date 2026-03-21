const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Printing functions
    printReceipt: (receipt) => ipcRenderer.invoke('print-receipt', receipt),
    printRefundReceipt: (receipt) => ipcRenderer.invoke('print-refund-receipt', receipt),

    // Printer management
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    getPrintDiagnostics: () => ipcRenderer.invoke('get-print-diagnostics'),
    getSelectedPrinter: () => ipcRenderer.invoke('get-selected-printer'),
    setSelectedPrinter: (printerName) => ipcRenderer.invoke('set-selected-printer', printerName),

    // Device auth token persistence
    getDeviceAuthToken: () => ipcRenderer.invoke('device-auth:get-token'),
    setDeviceAuthToken: (token) => ipcRenderer.invoke('device-auth:set-token', token),
    clearDeviceAuthToken: () => ipcRenderer.invoke('device-auth:clear-token'),

    // Platform detection
    isElectron: true,
});
