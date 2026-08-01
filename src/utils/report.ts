import { APP } from '@/config/env';

/* ───────────────────────────────────────────────────────────────────────────
 * Report export.
 *
 * One column definition drives all three formats, so a CSV, a spreadsheet and
 * a PDF of the same report always carry the same columns in the same order.
 * ─────────────────────────────────────────────────────────────────────────── */

export type ReportFormat = 'csv' | 'excel' | 'pdf';

export interface ReportColumn<T> {
  header: string;
  value: (row: T) => string | number;
  /** Right-align in the PDF and mark as numeric in the spreadsheet. */
  numeric?: boolean;
  /** Column width hint for the PDF, in millimetres. */
  width?: number;
}

export interface ReportMeta {
  /** File name stem — the extension is added per format. */
  filename: string;
  title: string;
  subtitle?: string;
  /** Rendered in the PDF header and the spreadsheet metadata block. */
  generatedAt?: number;
  /** Short summary lines rendered above the table. */
  notes?: string[];
}

const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const stampFilename = (stem: string, extension: string): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}`;
  return `${stem}_${stamp}.${extension}`;
};

/* ─── CSV ────────────────────────────────────────────────────────────────── */

const BOM = '﻿';

const csvCell = (value: string | number): string => {
  const raw = String(value ?? '');
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export const buildCsv = <T>(rows: readonly T[], columns: ReadonlyArray<ReportColumn<T>>): string => {
  const head = columns.map((column) => csvCell(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(','));
  return [head, ...body].join('\r\n');
};

const exportCsv = <T>(rows: readonly T[], columns: ReadonlyArray<ReportColumn<T>>, meta: ReportMeta): void => {
  const blob = new Blob([`${BOM}${buildCsv(rows, columns)}`], { type: 'text/csv;charset=utf-8;' });
  download(blob, stampFilename(meta.filename, 'csv'));
};

/* ─── Excel ──────────────────────────────────────────────────────────────── */

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * SpreadsheetML 2003 — a genuine Excel workbook format that Excel, LibreOffice
 * and Google Sheets all open natively, with typed cells, a frozen header row and
 * autofilter. Produced without a bundled spreadsheet library, so the export adds
 * nothing to the application payload.
 */
export const buildExcel = <T>(
  rows: readonly T[],
  columns: ReadonlyArray<ReportColumn<T>>,
  meta: ReportMeta,
): string => {
  const sheetName = xmlEscape(meta.title.slice(0, 30) || 'Report');

  const headerCells = columns
    .map((column) => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${xmlEscape(column.header)}</Data></Cell>`)
    .join('');

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = column.value(row);
          if (column.numeric && typeof value === 'number' && Number.isFinite(value)) {
            return `<Cell ss:StyleID="sNum"><Data ss:Type="Number">${value}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${xmlEscape(String(value ?? ''))}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  const columnDefs = columns
    .map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${Math.max(70, column.header.length * 8 + 28)}"/>`)
    .join('');

  const titleRow = `<Row ss:Height="22"><Cell ss:StyleID="sTitle" ss:MergeAcross="${Math.max(
    0,
    columns.length - 1,
  )}"><Data ss:Type="String">${xmlEscape(meta.title)}</Data></Cell></Row>`;

  const metaLines = [
    meta.subtitle ?? '',
    `${APP.name} ${APP.tagline} · generated ${new Date(meta.generatedAt ?? Date.now()).toLocaleString('en-GB')}`,
    ...(meta.notes ?? []),
  ].filter(Boolean);

  const metaRows = metaLines
    .map(
      (line) =>
        `<Row><Cell ss:StyleID="sMeta" ss:MergeAcross="${Math.max(0, columns.length - 1)}"><Data ss:Type="String">${xmlEscape(
          line,
        )}</Data></Cell></Row>`,
    )
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${xmlEscape(meta.title)}</Title>
  <Author>${APP.name}</Author>
  <Company>${APP.vendor}</Company>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="sTitle"><Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#1C5CAB"/></Style>
  <Style ss:ID="sMeta"><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#666666"/></Style>
  <Style ss:ID="sHead">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2A78D6" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1C5CAB"/></Borders>
  </Style>
  <Style ss:ID="sNum"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="General"/></Style>
 </Styles>
 <Worksheet ss:Name="${sheetName}">
  <Table ss:ExpandedColumnCount="${columns.length}" ss:ExpandedRowCount="${rows.length + metaLines.length + 3}" x:FullColumns="1" x:FullRows="1">
   ${columnDefs}
   ${titleRow}
   ${metaRows}
   <Row/>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>${metaLines.length + 3}</SplitHorizontal>
   <TopRowBottomPane>${metaLines.length + 3}</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R${metaLines.length + 3}C1:R${metaLines.length + 3}C${columns.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`;
};

const exportExcel = <T>(rows: readonly T[], columns: ReadonlyArray<ReportColumn<T>>, meta: ReportMeta): void => {
  const blob = new Blob([buildExcel(rows, columns, meta)], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  download(blob, stampFilename(meta.filename, 'xls'));
};

/* ─── PDF ────────────────────────────────────────────────────────────────── */

/**
 * jsPDF is loaded on demand so the report engine stays out of the main bundle —
 * most sessions never export a PDF.
 */
const exportPdf = async <T>(
  rows: readonly T[],
  columns: ReadonlyArray<ReportColumn<T>>,
  meta: ReportMeta,
): Promise<void> => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (autoTableModule.default ?? autoTableModule) as unknown as (
    doc: unknown,
    options: Record<string, unknown>,
  ) => void;

  // Landscape for wide tables, portrait when the report is narrow.
  const orientation = columns.length > 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date(meta.generatedAt ?? Date.now());

  doc.setFillColor(11, 15, 26);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(APP.name, 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 185, 210);
  doc.text(APP.tagline.toUpperCase(), 14, 17.5);

  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(meta.title, pageWidth - 14, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 185, 210);
  doc.text(generatedAt.toLocaleString('en-GB'), pageWidth - 14, 17.5, { align: 'right' });

  let cursor = 34;
  doc.setTextColor(60, 60, 60);

  if (meta.subtitle) {
    doc.setFontSize(9);
    doc.text(meta.subtitle, 14, cursor);
    cursor += 5;
  }

  if (meta.notes?.length) {
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    for (const note of meta.notes) {
      doc.text(`• ${note}`, 14, cursor);
      cursor += 4.2;
    }
    cursor += 1;
  }

  autoTable(doc, {
    startY: cursor,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => String(column.value(row) ?? ''))),
    styles: { fontSize: 7.2, cellPadding: 1.7, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [42, 120, 214], textColor: 255, fontStyle: 'bold', fontSize: 7.4 },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    columnStyles: columns.reduce<Record<number, Record<string, unknown>>>((acc, column, index) => {
      acc[index] = {
        halign: column.numeric ? 'right' : 'left',
        ...(column.width ? { cellWidth: column.width } : {}),
      };
      return acc;
    }, {}),
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: () => {
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `${APP.vendor} · ${APP.name} v${APP.version} · ${rows.length} records`,
        14,
        height - 8,
      );
      const page = doc.getNumberOfPages();
      doc.text(`Page ${page}`, pageWidth - 14, height - 8, { align: 'right' });
    },
  });

  doc.save(stampFilename(meta.filename, 'pdf'));
};

/* ─── Entry point ────────────────────────────────────────────────────────── */

export const exportReport = async <T>(
  format: ReportFormat,
  rows: readonly T[],
  columns: ReadonlyArray<ReportColumn<T>>,
  meta: ReportMeta,
): Promise<void> => {
  if (format === 'csv') return exportCsv(rows, columns, meta);
  if (format === 'excel') return exportExcel(rows, columns, meta);
  return exportPdf(rows, columns, meta);
};
