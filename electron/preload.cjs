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

    // Offline cash sales queue
    enqueueOfflineSale: (payload) => ipcRenderer.invoke('offline-sales:enqueue', payload),
    listOfflineSales: () => ipcRenderer.invoke('offline-sales:list'),
    updateOfflineSale: (queueId, patch) => ipcRenderer.invoke('offline-sales:update', queueId, patch),
    removeOfflineSale: (queueId) => ipcRenderer.invoke('offline-sales:remove', queueId),
    getOfflineSalesStatus: () => ipcRenderer.invoke('offline-sales:get-status'),

    // Platform detection
    isElectron: true,
});
