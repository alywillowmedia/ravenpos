import type { Item } from '../types';
import { buildDymo30252TemplateXml, createDymoLabelObjectData } from './dymoLabelTemplate';

type DymoRawPrinter = string | { name?: string; getName?: () => string };

interface DymoFramework {
    init: (ready: () => void, error?: (message?: string) => void) => void;
    isBrowserSupported?: () => boolean;
    getPrinters?: () => DymoRawPrinter[];
    openLabelXml?: (xml: string) => {
        setObjectText?: (name: string, value: string) => void;
        print?: (printerName: string) => void;
    };
}

interface DymoWindowShape {
    label?: {
        framework?: DymoFramework;
    };
}

export interface DymoWebAvailability {
    available: boolean;
    printers: string[];
    reason?: string;
}

export interface DymoDirectPrintResult {
    printerName: string;
    labelCount: number;
}

export interface DymoPrintableItem extends Item {
    printQuantity?: number;
}

const DYMO_FRAMEWORK_SCRIPT_URLS = [
    'https://labelwriter.com/software/dls/sdk/js/DYMO.Label.Framework.latest.js',
    'https://download.dymo.com/dymo/Software/SDK/JavaScript/DYMO.Label.Framework.latest.js',
];

let frameworkLoadPromise: Promise<DymoFramework> | null = null;

function getWindowDymoFramework(): DymoFramework | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const dymo = (window as Window & { dymo?: DymoWindowShape }).dymo;
    return dymo?.label?.framework ?? null;
}

function parsePrinterName(printer: DymoRawPrinter): string | null {
    if (typeof printer === 'string') {
        return printer.trim() || null;
    }

    if (typeof printer?.getName === 'function') {
        const value = printer.getName().trim();
        return value || null;
    }

    if (typeof printer?.name === 'string') {
        const value = printer.name.trim();
        return value || null;
    }

    return null;
}

function getFrameworkPrinters(framework: DymoFramework): string[] {
    if (typeof framework.getPrinters !== 'function') {
        return [];
    }

    const rawPrinters = framework.getPrinters();
    const names = rawPrinters.map(parsePrinterName).filter((value): value is string => Boolean(value));
    return Array.from(new Set(names));
}

function loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[data-dymo-framework-url="${url}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Failed to load script')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.dataset.dymoFrameworkUrl = url;
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`Unable to load DYMO framework from ${url}`));
        document.head.appendChild(script);
    });
}

function initFramework(framework: DymoFramework): Promise<void> {
    return new Promise((resolve, reject) => {
        let finished = false;
        const done = () => {
            if (!finished) {
                finished = true;
                resolve();
            }
        };
        const fail = (error?: string) => {
            if (!finished) {
                finished = true;
                reject(new Error(error || 'DYMO framework failed to initialize'));
            }
        };

        try {
            framework.init(done, fail);
        } catch (error) {
            reject(error instanceof Error ? error : new Error('DYMO framework failed to initialize'));
        }

        window.setTimeout(() => {
            if (!finished) {
                done();
            }
        }, 2500);
    });
}

async function ensureDymoFramework(): Promise<DymoFramework> {
    const existing = getWindowDymoFramework();
    if (existing) {
        await initFramework(existing);
        return existing;
    }

    if (!frameworkLoadPromise) {
        frameworkLoadPromise = (async () => {
            let lastError: Error | null = null;

            for (const url of DYMO_FRAMEWORK_SCRIPT_URLS) {
                try {
                    await loadScript(url);
                    const framework = getWindowDymoFramework();
                    if (!framework) {
                        throw new Error('DYMO framework script loaded, but no framework object was exposed');
                    }
                    await initFramework(framework);
                    return framework;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error('Failed loading DYMO framework');
                }
            }

            throw lastError ?? new Error('Failed to load DYMO framework');
        })().catch((error) => {
            frameworkLoadPromise = null;
            throw error;
        });
    }

    return frameworkLoadPromise;
}

function countLabels(items: DymoPrintableItem[]): number {
    let total = 0;
    for (const item of items) {
        const quantity = Math.max(0, item.printQuantity ?? 0);
        total += quantity;
    }
    return total;
}

function choosePrinter(printers: string[], preferredPrinterName?: string): string {
    if (printers.length === 0) {
        throw new Error('No DYMO printers detected.');
    }

    if (!preferredPrinterName) {
        return printers[0];
    }

    const directMatch = printers.find((name) => name === preferredPrinterName);
    if (directMatch) {
        return directMatch;
    }

    const caseInsensitive = printers.find((name) => name.toLowerCase() === preferredPrinterName.toLowerCase());
    if (caseInsensitive) {
        return caseInsensitive;
    }

    return printers[0];
}

export async function checkDymoWebAvailability(): Promise<DymoWebAvailability> {
    try {
        const framework = await ensureDymoFramework();

        if (framework.isBrowserSupported && !framework.isBrowserSupported()) {
            return {
                available: false,
                printers: [],
                reason: 'This browser is not supported by DYMO Web Service.',
            };
        }

        const printers = getFrameworkPrinters(framework);
        if (printers.length === 0) {
            return {
                available: false,
                printers,
                reason: 'DYMO Web Service is reachable, but no DYMO printers were found.',
            };
        }

        return {
            available: true,
            printers,
        };
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unable to connect to DYMO Web Service';
        return {
            available: false,
            printers: [],
            reason,
        };
    }
}

export async function printDymoLabelsDirect(
    items: DymoPrintableItem[],
    preferredPrinterName?: string
): Promise<DymoDirectPrintResult> {
    const printable = items.filter((item) => (item.printQuantity ?? 0) > 0);
    if (printable.length === 0) {
        throw new Error('No labels are queued to print.');
    }

    const framework = await ensureDymoFramework();
    const printers = getFrameworkPrinters(framework);
    const printerName = choosePrinter(printers, preferredPrinterName);

    if (typeof framework.openLabelXml !== 'function') {
        throw new Error('DYMO framework is missing label print APIs.');
    }

    const label = framework.openLabelXml(buildDymo30252TemplateXml());
    if (typeof label.setObjectText !== 'function' || typeof label.print !== 'function') {
        throw new Error('DYMO framework label object is missing required print methods.');
    }

    for (const item of printable) {
        const printQuantity = Math.max(0, item.printQuantity ?? 0);
        const data = createDymoLabelObjectData(item);
        for (let i = 0; i < printQuantity; i++) {
            label.setObjectText('VENDOR', data.VENDOR);
            label.setObjectText('PRICE', data.PRICE);
            label.setObjectText('NAME', data.NAME);
            label.setObjectText('VARIANT', data.VARIANT);
            label.setObjectText('SKU', data.SKU);
            label.setObjectText('DETAILS', data.DETAILS);
            label.setObjectText('BARCODE', data.BARCODE);
            label.print(printerName);
        }
    }

    return {
        printerName,
        labelCount: countLabels(printable),
    };
}
