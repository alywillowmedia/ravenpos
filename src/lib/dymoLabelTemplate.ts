import type { Item } from '../types';
import { formatCurrency } from './utils';
import { getAppliedCompareAtPrice } from './itemPricing';

/**
 * DYMO label object names used by the template below.
 * These names should be referenced in DYMO Connect Framework `setObjectText`.
 */
export interface DymoLabelObjectData {
    VENDOR: string;
    COMPARE_AT_PRICE: string;
    PRICE: string;
    NAME: string;
    VARIANT: string;
    SKU: string;
    DETAILS: string;
    BARCODE: string;
}

export interface DymoLabelItem extends Item {
    printQuantity?: number;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function trimTo(value: string, max: number): string {
    if (value.length <= max) return value;
    if (max <= 3) return value.slice(0, max);
    return `${value.slice(0, max - 3)}...`;
}

/**
 * Maps a RavenPOS inventory item into the DYMO template object fields.
 * Character limits are tuned to the 30252 template size and mirror sheet-label intent.
 */
export function createDymoLabelObjectData(item: Item): DymoLabelObjectData {
    const consignor = item.consignor as { consignor_number?: string; name?: string } | undefined;
    const vendor = consignor?.name || consignor?.consignor_number || '';
    const compareAtPrice = getAppliedCompareAtPrice(item);

    const detailLines: string[] = [];
    if (item.other_details_1?.trim()) detailLines.push(`- ${item.other_details_1.trim()}`);
    if (item.other_details_2?.trim()) detailLines.push(`- ${item.other_details_2.trim()}`);

    return {
        VENDOR: trimTo(vendor, 38),
        COMPARE_AT_PRICE: compareAtPrice !== null ? formatCurrency(compareAtPrice) : '',
        PRICE: formatCurrency(Number(item.price)),
        NAME: trimTo(item.name, 42),
        VARIANT: trimTo(item.variant_summary?.trim() || '', 40),
        SKU: trimTo(item.sku, 40),
        DETAILS: trimTo(detailLines.join('\n'), 120),
        BARCODE: trimTo(item.sku, 48),
    };
}

function xmlTextElement(
    value: string,
    fontFamily: string,
    fontSize: number,
    isBold = false,
    isStrikeout = false
): string {
    return `
      <StyledText>
        <Element>
          <String>${escapeXml(value)}</String>
          <Attributes>
            <Font Family="${fontFamily}" Size="${fontSize}" Bold="${isBold ? 'True' : 'False'}" Italic="False" Underline="False" Strikeout="${isStrikeout ? 'True' : 'False'}" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>`;
}

/**
 * Generates a DYMO `.label` XML template (30252 Address, landscape).
 * Layout matches the current RavenPOS sheet-label hierarchy:
 * vendor + price at top, name/variant, barcode + sku, right-side details.
 */
export function buildDymo30252TemplateXml(defaults: Partial<DymoLabelObjectData> = {}): string {
    const data: DymoLabelObjectData = {
        VENDOR: defaults.VENDOR ?? 'Vendor',
        COMPARE_AT_PRICE: defaults.COMPARE_AT_PRICE ?? '',
        PRICE: defaults.PRICE ?? '$0.00',
        NAME: defaults.NAME ?? 'Item Name',
        VARIANT: defaults.VARIANT ?? '',
        SKU: defaults.SKU ?? 'SKU00000',
        DETAILS: defaults.DETAILS ?? '',
        BARCODE: defaults.BARCODE ?? 'SKU00000',
    };

    return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30252 Address</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="1581" Height="5040" Rx="180" Ry="180" />
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>VENDOR</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.VENDOR, 'Arial', 8)}
    </TextObject>
    <Bounds X="90" Y="45" Width="2400" Height="220" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>COMPARE_AT_PRICE</Name>
      <ForeColor Alpha="255" Red="110" Green="110" Blue="110" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Right</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.COMPARE_AT_PRICE, 'Arial', 8, false, true)}
    </TextObject>
    <Bounds X="2920" Y="50" Width="760" Height="220" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>PRICE</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Right</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.PRICE, 'Arial', 15, true)}
    </TextObject>
    <Bounds X="3680" Y="30" Width="1240" Height="320" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>NAME</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.NAME, 'Arial', 11, true)}
    </TextObject>
    <Bounds X="90" Y="330" Width="3600" Height="280" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>VARIANT</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.VARIANT, 'Arial', 8)}
    </TextObject>
    <Bounds X="90" Y="615" Width="2500" Height="220" />
  </ObjectInfo>
  <ObjectInfo>
    <BarcodeObject>
      <Name>BARCODE</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="255" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapeXml(data.BARCODE)}</Text>
      <Type>Code128Auto</Type>
      <Size>Small</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <QuietZonesPadding Left="0" Right="0" Top="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="90" Y="860" Width="2450" Height="380" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>SKU</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.SKU, 'Courier New', 8)}
    </TextObject>
    <Bounds X="90" Y="1250" Width="2450" Height="180" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>DETAILS</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>None</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>${xmlTextElement(data.DETAILS, 'Arial', 7)}
    </TextObject>
    <Bounds X="2720" Y="430" Width="2180" Height="1020" />
  </ObjectInfo>
</DieCutLabel>
`;
}

export function downloadDymo30252Template(sampleItem?: Item): void {
    const defaults = sampleItem ? createDymoLabelObjectData(sampleItem) : undefined;
    const xml = buildDymo30252TemplateXml(defaults);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ravenpos-30252-template.label';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function expandToDymoRows(items: DymoLabelItem[]): DymoLabelObjectData[] {
    const rows: DymoLabelObjectData[] = [];
    for (const item of items) {
        const count = Math.max(0, Math.min(item.printQuantity ?? item.quantity, 100));
        const data = createDymoLabelObjectData(item);
        for (let i = 0; i < count; i++) {
            rows.push(data);
        }
    }
    return rows;
}

function escapeCsv(value: string): string {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
}

export function buildDymoPrintDataCsv(items: DymoLabelItem[]): string {
    const rows = expandToDymoRows(items);
    const header = ['VENDOR', 'COMPARE_AT_PRICE', 'PRICE', 'NAME', 'VARIANT', 'SKU', 'DETAILS', 'BARCODE'];
    const lines = [header.join(',')];

    for (const row of rows) {
        lines.push([
            row.VENDOR,
            row.COMPARE_AT_PRICE,
            row.PRICE,
            row.NAME,
            row.VARIANT,
            row.SKU,
            row.DETAILS,
            row.BARCODE,
        ].map(escapeCsv).join(','));
    }

    return lines.join('\n');
}

function downloadTextFile(filename: string, mimeType: string, contents: string): void {
    const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Downloads:
 * 1) The DYMO .label template
 * 2) A CSV print data file expanded by print quantity (one row per label)
 */
export function downloadDymo30252PrintPack(items: DymoLabelItem[]): { rowCount: number } {
    const printableItems = items.filter((item) => (item.printQuantity ?? item.quantity) > 0);
    const rows = expandToDymoRows(printableItems);
    if (rows.length === 0) {
        throw new Error('No labels to print');
    }

    downloadTextFile(
        'ravenpos-30252-template.label',
        'application/xml',
        buildDymo30252TemplateXml(rows[0])
    );
    downloadTextFile(
        'ravenpos-30252-print-data.csv',
        'text/csv',
        buildDymoPrintDataCsv(printableItems)
    );

    return { rowCount: rows.length };
}

export function downloadDymo30252TemplateForItems(items: DymoLabelItem[]): void {
    const printableItems = items.filter((item) => (item.printQuantity ?? item.quantity) > 0);
    const seed = printableItems[0];
    if (!seed) {
        throw new Error('No labels to print');
    }

    const data = createDymoLabelObjectData(seed);
    downloadTextFile(
        'ravenpos-30252-template.label',
        'text/plain',
        buildDymo30252TemplateXml(data)
    );
}

export function downloadDymoPrintDataCsvFile(items: DymoLabelItem[]): { rowCount: number } {
    const printableItems = items.filter((item) => (item.printQuantity ?? item.quantity) > 0);
    const rows = expandToDymoRows(printableItems);
    if (rows.length === 0) {
        throw new Error('No labels to print');
    }

    downloadTextFile(
        'ravenpos-30252-print-data.csv',
        'text/csv',
        buildDymoPrintDataCsv(printableItems)
    );
    return { rowCount: rows.length };
}
