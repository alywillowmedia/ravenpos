const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Printing functions
    printReceipt: (receipt) => ipcRenderer.invoke('print-receipt', receipt),
    printRefundReceipt: (receipt) => ipcRenderer.invoke('print-refund-receipt', receipt),

    // Printer management
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    getSelectedPrinter: () => ipcRenderer.invoke('get-selected-printer'),
    setSelectedPrinter: (printerName) => ipcRenderer.invoke('set-selected-printer', printerName),

    // Platform detection
    isElectron: true,
});
