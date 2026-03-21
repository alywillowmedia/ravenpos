const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const { printReceipt, printRefundReceipt, getPrinters, getPrintDiagnostics, getSelectedPrinter, setSelectedPrinter } = require('./printing.cjs');

// Keep a global reference of the window object
let mainWindow;
let updateCheckInProgress = false;
let manualUpdateCheckPending = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const isPortableBuild = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
const deviceAuthStore = new Store({
    name: 'device-auth',
    defaults: {
        token: null,
    },
});

function getFocusedOrMainWindow() {
    return BrowserWindow.getFocusedWindow() || mainWindow || null;
}

function setupApplicationMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Check for Updates',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Shift+U' : 'Ctrl+Shift+U',
                    click: () => {
                        void checkForUpdates(true);
                    },
                },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function setupAutoUpdater() {
    if (isDev || isPortableBuild) {
        return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('error', (error) => {
        console.error('Auto-update error:', error);

        if (!manualUpdateCheckPending) {
            return;
        }

        manualUpdateCheckPending = false;
        const parentWindow = getFocusedOrMainWindow();
        dialog.showMessageBox(parentWindow, {
            type: 'error',
            title: 'Update Check Failed',
            message: 'Unable to check for updates right now.',
            detail: error?.message || String(error),
        }).catch(() => { });
    });

    autoUpdater.on('update-available', (info) => {
        const parentWindow = getFocusedOrMainWindow();
        dialog.showMessageBox(parentWindow, {
            type: 'info',
            title: 'Update Available',
            message: `Version ${info?.version || 'latest'} is available.`,
            detail: 'The update is downloading in the background and you will be prompted to restart once it is ready.',
        }).catch(() => { });
        manualUpdateCheckPending = false;
    });

    autoUpdater.on('update-not-available', () => {
        if (!manualUpdateCheckPending) {
            return;
        }

        manualUpdateCheckPending = false;
        const parentWindow = getFocusedOrMainWindow();
        dialog.showMessageBox(parentWindow, {
            type: 'info',
            title: 'No Updates Available',
            message: 'You are running the latest version of RavenPOS.',
        }).catch(() => { });
    });

    autoUpdater.on('update-downloaded', async (info) => {
        const parentWindow = getFocusedOrMainWindow();
        const result = await dialog.showMessageBox(parentWindow, {
            type: 'info',
            title: 'Update Ready',
            message: `Version ${info?.version || 'latest'} has been downloaded.`,
            detail: 'Restart RavenPOS now to install the update.',
            buttons: ['Restart Now', 'Later'],
            defaultId: 0,
            cancelId: 1,
        }).catch(() => ({ response: 1 }));

        if (result.response === 0) {
            setImmediate(() => {
                autoUpdater.quitAndInstall(false, true);
            });
        }
    });
}

async function checkForUpdates(isManualCheck = false) {
    if (isPortableBuild) {
        if (isManualCheck) {
            const parentWindow = getFocusedOrMainWindow();
            await dialog.showMessageBox(parentWindow, {
                type: 'info',
                title: 'Installer Updates Only',
                message: 'Auto-update is available for installed builds.',
                detail: 'Portable builds are updated manually by replacing the executable.',
            }).catch(() => { });
        }
        return;
    }

    if (isDev) {
        if (isManualCheck) {
            const parentWindow = getFocusedOrMainWindow();
            await dialog.showMessageBox(parentWindow, {
                type: 'info',
                title: 'Updates Disabled in Development',
                message: 'Update checks are only available in packaged builds.',
            }).catch(() => { });
        }
        return;
    }

    if (updateCheckInProgress) {
        return;
    }

    updateCheckInProgress = true;
    manualUpdateCheckPending = isManualCheck;

    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error('Failed to check for updates:', error);
        if (isManualCheck) {
            const parentWindow = getFocusedOrMainWindow();
            await dialog.showMessageBox(parentWindow, {
                type: 'error',
                title: 'Update Check Failed',
                message: 'Unable to check for updates right now.',
                detail: error?.message || String(error),
            }).catch(() => { });
            manualUpdateCheckPending = false;
        }
    } finally {
        updateCheckInProgress = false;
    }
}

function createWindow() {
    const iconPath = path.join(__dirname, '../public/icon.png');
    const hasIcon = fs.existsSync(iconPath);

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        autoHideMenuBar: false,
        menuBarVisible: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        ...(hasIcon ? { icon: iconPath } : {}),
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

ipcMain.handle('get-print-diagnostics', async () => {
    return getPrintDiagnostics();
});

ipcMain.handle('get-selected-printer', async () => {
    return getSelectedPrinter();
});

ipcMain.handle('set-selected-printer', async (event, printerName) => {
    return setSelectedPrinter(printerName);
});

// IPC handlers for durable device authorization token storage
ipcMain.handle('device-auth:get-token', async () => {
    return deviceAuthStore.get('token', null);
});

ipcMain.handle('device-auth:set-token', async (event, token) => {
    deviceAuthStore.set('token', token ?? null);
    return { success: true };
});

ipcMain.handle('device-auth:clear-token', async () => {
    deviceAuthStore.set('token', null);
    return { success: true };
});

// App lifecycle
app.whenReady().then(() => {
    setupApplicationMenu();
    setupAutoUpdater();
    createWindow();

    // Silent startup update check in production.
    void checkForUpdates(false);
});

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
