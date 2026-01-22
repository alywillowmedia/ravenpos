const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { printReceipt, printRefundReceipt, getPrinters, getSelectedPrinter, setSelectedPrinter } = require('./printing.cjs');

// Keep a global reference of the window object
let mainWindow;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, '../public/icon.png'),
        titleBarStyle: 'default',
        show: false, // Don't show until ready
    });

    // Load the app
    if (isDev) {
        // Development: load from Vite dev server
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Production: load the built files
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers for printing
ipcMain.handle('print-receipt', async (event, receipt) => {
    return await printReceipt(receipt);
});

ipcMain.handle('print-refund-receipt', async (event, receipt) => {
    return await printRefundReceipt(receipt);
});

ipcMain.handle('get-printers', async () => {
    return await getPrinters();
});

ipcMain.handle('get-selected-printer', async () => {
    return getSelectedPrinter();
});

ipcMain.handle('set-selected-printer', async (event, printerName) => {
    return setSelectedPrinter(printerName);
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
