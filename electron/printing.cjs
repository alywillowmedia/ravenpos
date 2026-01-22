const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const Store = require('electron-store');

// Persistent storage for printer settings
const store = new Store({
    name: 'printer-settings',
    defaults: {
        selectedPrinter: null, // null = auto-detect
    }
});

// Get list of available printers
async function getPrinters() {
    try {
        // Use Electron's built-in printer enumeration
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            const printers = await win.webContents.getPrintersAsync();
            return printers.map(p => ({
                name: p.name,
                displayName: p.displayName || p.name,
                isDefault: p.isDefault,
                status: p.status,
            }));
        }
        return [];
    } catch (error) {
        console.error('Error getting printers:', error);
        return [];
    }
}

// Get the currently selected printer
function getSelectedPrinter() {
    return store.get('selectedPrinter');
}

// Set the selected printer
function setSelectedPrinter(printerName) {
    store.set('selectedPrinter', printerName);
    return { success: true };
}

// Find the best printer to use
async function findPrinter() {
    const selected = getSelectedPrinter();
    const printers = await getPrinters();

    if (printers.length === 0) {
        return null;
    }

    // If a printer is selected and exists, use it
    if (selected) {
        const found = printers.find(p => p.name === selected);
        if (found) return found.name;
    }

    // Auto-detect: prefer printers with "receipt", "thermal", "pos" in name
    const receiptPrinter = printers.find(p =>
        /receipt|thermal|pos|star|epson|citizen/i.test(p.name)
    );
    if (receiptPrinter) return receiptPrinter.name;

    // Fall back to default printer
    const defaultPrinter = printers.find(p => p.isDefault);
    if (defaultPrinter) return defaultPrinter.name;

    // Last resort: first available printer
    return printers[0]?.name || null;
}

// Format currency
function formatCurrency(amount) {
    return '$' + Number(amount).toFixed(2);
}

// Format date
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }) + ' ' + d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

// Print a receipt using ESC/POS commands
async function printReceipt(receipt) {
    try {
        const printerName = await findPrinter();

        if (!printerName) {
            return { success: false, error: 'No printer found. Please connect a receipt printer.' };
        }

        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON, // Works for most ESC/POS printers
            interface: `printer:${printerName}`,
            characterSet: CharacterSet.PC437_USA,
            removeSpecialCharacters: false,
            lineCharacter: '-',
            width: 48, // 80mm paper width in characters
        });

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            return { success: false, error: `Printer "${printerName}" is not connected.` };
        }

        // Header
        printer.alignCenter();
        printer.bold(true);
        printer.setTextSize(1, 1);
        printer.println('RAVENLIA');
        printer.bold(false);
        printer.setTextNormal();
        printer.drawLine();
        printer.println(formatDate(receipt.date));
        printer.setTextSize(0, 0);
        printer.println(`Transaction: #${receipt.transactionId.slice(0, 8).toUpperCase()}`);
        printer.drawLine();

        // Items
        printer.alignLeft();
        for (const item of receipt.items) {
            const name = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
            const price = formatCurrency(item.lineTotal);

            // Truncate name if too long
            const maxNameLen = 48 - price.length - 2;
            const displayName = name.length > maxNameLen ? name.slice(0, maxNameLen - 2) + '..' : name;

            printer.tableCustom([
                { text: displayName, align: 'LEFT', width: 0.75 },
                { text: price, align: 'RIGHT', width: 0.25 },
            ]);

            if (item.quantity > 1) {
                printer.println(`  @ ${formatCurrency(item.price)} each`);
            }
            printer.println(`  Vendor: ${item.consignorName}`);
        }

        printer.drawLine();

        // Totals
        printer.tableCustom([
            { text: 'Subtotal', align: 'LEFT', width: 0.6 },
            { text: formatCurrency(receipt.subtotal), align: 'RIGHT', width: 0.4 },
        ]);

        if (receipt.tax > 0) {
            printer.tableCustom([
                { text: 'Tax', align: 'LEFT', width: 0.6 },
                { text: formatCurrency(receipt.tax), align: 'RIGHT', width: 0.4 },
            ]);
        }

        printer.bold(true);
        printer.tableCustom([
            { text: 'TOTAL', align: 'LEFT', width: 0.6 },
            { text: formatCurrency(receipt.total), align: 'RIGHT', width: 0.4 },
        ]);
        printer.bold(false);

        printer.drawLine();

        // Payment
        printer.tableCustom([
            { text: 'Payment', align: 'LEFT', width: 0.6 },
            { text: receipt.paymentMethod.toUpperCase(), align: 'RIGHT', width: 0.4 },
        ]);

        if (receipt.paymentMethod === 'cash' && receipt.cashTendered !== undefined) {
            printer.tableCustom([
                { text: 'Cash', align: 'LEFT', width: 0.6 },
                { text: formatCurrency(receipt.cashTendered), align: 'RIGHT', width: 0.4 },
            ]);
            printer.bold(true);
            printer.tableCustom([
                { text: 'Change', align: 'LEFT', width: 0.6 },
                { text: formatCurrency(receipt.changeGiven || 0), align: 'RIGHT', width: 0.4 },
            ]);
            printer.bold(false);
        }

        printer.drawLine();

        // Footer
        printer.alignCenter();
        printer.println('Thank you for shopping at Ravenlia!');
        printer.setTextSize(0, 0);
        printer.println('Keep receipt for returns');

        // Cut paper
        printer.newLine();
        printer.newLine();
        printer.cut();

        // Execute print
        await printer.execute();

        return { success: true };
    } catch (error) {
        console.error('Print error:', error);
        return { success: false, error: error.message || 'Print failed' };
    }
}

// Print a refund receipt
async function printRefundReceipt(receipt) {
    try {
        const printerName = await findPrinter();

        if (!printerName) {
            return { success: false, error: 'No printer found. Please connect a receipt printer.' };
        }

        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: `printer:${printerName}`,
            characterSet: CharacterSet.PC437_USA,
            removeSpecialCharacters: false,
            lineCharacter: '-',
            width: 48,
        });

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            return { success: false, error: `Printer "${printerName}" is not connected.` };
        }

        // Header
        printer.alignCenter();
        printer.bold(true);
        printer.setTextSize(1, 1);
        printer.println('RAVENLIA');
        printer.invert(true);
        printer.println(' *** REFUND *** ');
        printer.invert(false);
        printer.bold(false);
        printer.setTextNormal();
        printer.drawLine();
        printer.println(formatDate(receipt.date));
        printer.setTextSize(0, 0);
        printer.println(`Refund ID: #${receipt.refundId.slice(0, 8).toUpperCase()}`);
        printer.println(`(Original: #${receipt.originalTransactionId.slice(0, 8).toUpperCase()})`);
        printer.drawLine();

        // Items
        printer.alignLeft();
        printer.println('REFUNDED ITEMS:');
        for (const item of receipt.items) {
            const name = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
            const price = `-${formatCurrency(item.lineTotal)}`;

            const maxNameLen = 48 - price.length - 2;
            const displayName = name.length > maxNameLen ? name.slice(0, maxNameLen - 2) + '..' : name;

            printer.tableCustom([
                { text: displayName, align: 'LEFT', width: 0.75 },
                { text: price, align: 'RIGHT', width: 0.25 },
            ]);

            printer.println(`  ${item.restocked ? '↻ Restocked' : 'Not restocked'}`);
        }

        printer.drawLine();

        // Total
        printer.bold(true);
        printer.tableCustom([
            { text: 'REFUND TOTAL', align: 'LEFT', width: 0.6 },
            { text: `-${formatCurrency(receipt.refundAmount)}`, align: 'RIGHT', width: 0.4 },
        ]);
        printer.bold(false);

        printer.drawLine();

        // Payment method
        printer.tableCustom([
            { text: 'Refund Method', align: 'LEFT', width: 0.6 },
            { text: receipt.paymentMethod.toUpperCase(), align: 'RIGHT', width: 0.4 },
        ]);

        if (receipt.stripeRefundId) {
            printer.setTextSize(0, 0);
            printer.println(`Stripe ID: ${receipt.stripeRefundId}`);
        }

        printer.drawLine();

        // Footer
        printer.alignCenter();
        if (receipt.paymentMethod === 'card') {
            printer.println('Card refunds may take 5-10');
            printer.println('business days to appear.');
            printer.newLine();
        }
        printer.println('Thank you for shopping at Ravenlia!');

        // Cut paper
        printer.newLine();
        printer.newLine();
        printer.cut();

        await printer.execute();

        return { success: true };
    } catch (error) {
        console.error('Print refund error:', error);
        return { success: false, error: error.message || 'Print failed' };
    }
}

module.exports = {
    printReceipt,
    printRefundReceipt,
    getPrinters,
    getSelectedPrinter,
    setSelectedPrinter,
};
