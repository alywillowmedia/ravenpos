const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const Store = require('electron-store');
const { BrowserWindow } = require('electron');
const RECEIPT_COLUMNS = 32;
const RECEIPT_PAPER_WIDTH_MM = 58;

// Persistent storage for printer settings
const store = new Store({
    name: 'printer-settings',
    defaults: {
        selectedPrinter: null, // null = auto-detect
    }
});

let cachedDriver;

function getSystemPrinterDriver() {
    if (cachedDriver !== undefined) {
        return cachedDriver;
    }

    const candidates = ['electron-printer', 'printer'];
    for (const moduleName of candidates) {
        try {
            cachedDriver = require(moduleName);
            return cachedDriver;
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') {
                console.error(`Failed to load printer driver module "${moduleName}":`, error);
            }
        }
    }

    cachedDriver = null;
    return null;
}

function createThermalPrinter(printerName) {
    const driver = getSystemPrinterDriver();
    if (!driver) {
        throw new Error(
            'No system printer driver module installed. Install "electron-printer" (recommended) or "printer", then rebuild the app.'
        );
    }

    return new ThermalPrinter({
        type: PrinterTypes.EPSON, // Works for most ESC/POS printers
        interface: `printer:${printerName}`,
        driver,
        characterSet: CharacterSet.PC437_USA,
        removeSpecialCharacters: false,
        lineCharacter: '-',
        width: 48, // 80mm paper width in characters
    });
}

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

function formatCardLast4(last4) {
    if (!last4) return null;
    const digits = String(last4).replace(/\D/g, '').slice(-4);
    if (digits.length !== 4) return null;
    return `**** ${digits}`;
}

function padRight(value, width) {
    const text = String(value ?? '');
    if (text.length >= width) return text.slice(0, width);
    return text + ' '.repeat(width - text.length);
}

function padLeft(value, width) {
    const text = String(value ?? '');
    if (text.length >= width) return text.slice(0, width);
    return ' '.repeat(width - text.length) + text;
}

function lineItem(name, amount, width = RECEIPT_COLUMNS) {
    const price = String(amount);
    const nameWidth = Math.max(10, width - price.length - 1);
    return `${padRight(name, nameWidth)} ${padLeft(price, width - nameWidth - 1)}`;
}

function buildSaleReceiptText(receipt) {
    const lines = [];
    lines.push('RAVENLIA');
    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push(formatDate(receipt.date));
    lines.push(`Transaction: #${receipt.transactionId.slice(0, 8).toUpperCase()}`);
    lines.push('-'.repeat(RECEIPT_COLUMNS));

    for (const item of receipt.items) {
        const name = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
        lines.push(lineItem(name, formatCurrency(item.lineTotal)));
        if (item.quantity > 1) lines.push(`  @ ${formatCurrency(item.price)} each`);
        lines.push(`  Vendor: ${item.consignorName}`);
    }

    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push(lineItem('Subtotal', formatCurrency(receipt.subtotal)));
    if (receipt.tax > 0) lines.push(lineItem('Tax', formatCurrency(receipt.tax)));
    if (receipt.cardFeeAmount && receipt.cardFeeAmount > 0) {
        lines.push(lineItem('Card Fee', formatCurrency(receipt.cardFeeAmount)));
    }
    if (receipt.storeCreditUsed && receipt.storeCreditUsed > 0) {
        lines.push(lineItem('Store Credit', `-${formatCurrency(receipt.storeCreditUsed)}`));
    }
    lines.push(lineItem('TOTAL', formatCurrency(receipt.total)));
    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push(lineItem('Payment', receipt.paymentMethod.toUpperCase()));
    const maskedCard = formatCardLast4(receipt.cardLast4);
    if (receipt.paymentMethod === 'card' && maskedCard) {
        lines.push(lineItem('Card', maskedCard));
    }

    if (receipt.paymentMethod === 'cash' && receipt.cashTendered !== undefined) {
        lines.push(lineItem('Cash', formatCurrency(receipt.cashTendered)));
        lines.push(lineItem('Change', formatCurrency(receipt.changeGiven || 0)));
    }

    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push('Thank you for shopping at Ravenlia!');
    lines.push('');
    lines.push('Ravenlia — from the hands of artisans to the heart of community.');
    lines.push('');
    lines.push('Thanks for keeping it alive!');
    lines.push('-----');
    lines.push('Ravenlia.com');
    lines.push('All sales final. No returns.');
    lines.push('');
    lines.push('');
    return lines.join('\n');
}

function buildRefundReceiptText(receipt) {
    const lines = [];
    lines.push('RAVENLIA');
    lines.push('*** REFUND ***');
    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push(formatDate(receipt.date));
    lines.push(`Refund ID: #${receipt.refundId.slice(0, 8).toUpperCase()}`);
    lines.push(`(Original: #${receipt.originalTransactionId.slice(0, 8).toUpperCase()})`);
    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push('REFUNDED ITEMS:');

    for (const item of receipt.items) {
        const name = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
        lines.push(lineItem(name, `-${formatCurrency(item.lineTotal)}`));
        lines.push(`  ${item.restocked ? 'Restocked' : 'Not restocked'}`);
    }

    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push(lineItem('REFUND TOTAL', `-${formatCurrency(receipt.refundAmount)}`));
    lines.push('-'.repeat(RECEIPT_COLUMNS));
    lines.push(lineItem('Refund Method', receipt.paymentMethod.toUpperCase()));
    if (receipt.stripeRefundId) lines.push(`Stripe ID: ${receipt.stripeRefundId}`);
    lines.push('-'.repeat(RECEIPT_COLUMNS));

    if (receipt.paymentMethod === 'card') {
        lines.push('Card refunds may take 5-10');
        lines.push('business days to appear.');
        lines.push('');
    }
    lines.push('Thank you for shopping at Ravenlia!');
    lines.push('');
    lines.push('');
    return lines.join('\n');
}

function buildReceiptHtmlFromText(text) {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: ${RECEIPT_PAPER_WIDTH_MM}mm auto; margin: 1.5mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      pre {
        margin: 0;
        padding: 1.5mm;
        white-space: pre;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.25;
        color: #000;
      }
    </style>
  </head>
  <body><pre>${escaped}</pre></body>
</html>`;
}

async function printViaElectron(printerName, text) {
    const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: false }
    });

    try {
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildReceiptHtmlFromText(text))}`);
        const result = await new Promise((resolve) => {
            printWindow.webContents.print(
                {
                    silent: true,
                    deviceName: printerName,
                    printBackground: true
                },
                (success, failureReason) => {
                    if (success) resolve({ success: true });
                    else resolve({ success: false, error: failureReason || 'Print failed' });
                }
            );
        });
        return result;
    } finally {
        if (!printWindow.isDestroyed()) {
            printWindow.close();
        }
    }
}

// Print a receipt using ESC/POS commands
async function printReceipt(receipt) {
    try {
        const printerName = await findPrinter();

        if (!printerName) {
            return { success: false, error: 'No printer found. Please connect a receipt printer.' };
        }

        if (!getSystemPrinterDriver()) {
            return await printViaElectron(printerName, buildSaleReceiptText(receipt));
        }

        const printer = createThermalPrinter(printerName);

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

        if (receipt.cardFeeAmount && receipt.cardFeeAmount > 0) {
            printer.tableCustom([
                { text: 'Card Fee', align: 'LEFT', width: 0.6 },
                { text: formatCurrency(receipt.cardFeeAmount), align: 'RIGHT', width: 0.4 },
            ]);
        }

        if (receipt.storeCreditUsed && receipt.storeCreditUsed > 0) {
            printer.tableCustom([
                { text: 'Store Credit', align: 'LEFT', width: 0.6 },
                { text: `-${formatCurrency(receipt.storeCreditUsed)}`, align: 'RIGHT', width: 0.4 },
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
        const maskedCard = formatCardLast4(receipt.cardLast4);
        if (receipt.paymentMethod === 'card' && maskedCard) {
            printer.tableCustom([
                { text: 'Card', align: 'LEFT', width: 0.6 },
                { text: maskedCard, align: 'RIGHT', width: 0.4 },
            ]);
        }

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
        printer.println('');
        printer.println('Ravenlia — from the hands of artisans to the heart of community.');
        printer.println('');
        printer.println('Thanks for keeping it alive!');
        printer.println('-----');
        printer.println('Ravenlia.com');
        printer.setTextSize(0, 0);
        printer.println('All sales final. No returns.');

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

        if (!getSystemPrinterDriver()) {
            return await printViaElectron(printerName, buildRefundReceiptText(receipt));
        }

        const printer = createThermalPrinter(printerName);

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
