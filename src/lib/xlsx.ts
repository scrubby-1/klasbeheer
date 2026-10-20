// Minimale .xlsx-lezer en -schrijver (zonder externe Excel-bibliotheek, enkel JSZip).
import JSZip from 'jszip';

export type CellValue = number | string | null;

export interface Cell {
  v: CellValue;
  f?: string; // formule (zonder "=")
}

export interface SheetGrid {
  name: string;
  hidden: boolean;
  /** cells[row][col], 1-gebaseerd */
  cells: Map<number, Map<number, Cell>>;
  maxRow: number;
  maxCol: number;
}

/* ---------------- hulpfuncties ---------------- */

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function decode(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}

function textOf(xml: string): string {
  // alle <t>-stukken, zonder fonetische hulp (<rPh>)
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decode(m[1]);
  return out;
}

/** Rekent eenvoudige formules uit zoals "(10/16)*5" wanneer er geen opgeslagen waarde is. */
export function evalSimpleFormula(f: string): number | null {
  const t = f.trim();
  if (!/^[\d\s.+\-*/()]+$/.test(t)) return null;
  try {
    const v = Function(`"use strict"; return (${t});`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function resolvePath(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ('xl/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

/* ---------------- lezen ---------------- */

export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<SheetGrid[]> {
  const zip = await JSZip.loadAsync(input);
  const read = async (p: string) => (await zip.file(p)?.async('string')) ?? '';

  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('Dit is geen geldig Excel-bestand (.xlsx).');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    relMap.set(a.Id, a.Target);
  }

  const shared: string[] = [];
  const ssXml = await read('xl/sharedStrings.xml');
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(m[1] ? textOf(m[1]) : '');

  const sheets: SheetGrid[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    const rid = a['r:id'] ?? Object.entries(a).find(([k]) => k.endsWith(':id'))?.[1];
    const target = rid ? relMap.get(rid) : undefined;
    if (!target) continue;
    const xml = await read(resolvePath(target));
    sheets.push(parseSheet(a.name ?? 'Blad', a.state === 'hidden' || a.state === 'veryHidden', xml, shared));
  }
  return sheets;
}

function parseSheet(name: string, hidden: boolean, xml: string, shared: string[]): SheetGrid {
  const cells = new Map<number, Map<number, Cell>>();
  let maxRow = 0, maxCol = 0;
  const data = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] ?? '';
  let rowIdx = 0;
  for (const rm of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ra = attrs(rm[1]);
    rowIdx = ra.r ? Number(ra.r) : rowIdx + 1;
    const inner = rm[2] ?? '';
    let colIdx = 0;
    for (const cm of inner.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = attrs(cm[1]);
      let r = rowIdx;
      if (ca.r) {
        const mm = ca.r.match(/^([A-Z]+)(\d+)$/i);
        if (mm) {
          colIdx = colToNum(mm[1]);
          r = Number(mm[2]);
        } else colIdx++;
      } else colIdx++;
      const body = cm[2] ?? '';
      const fMatch = body.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
      const f = fMatch ? decode(fMatch[1]) : undefined;
      const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      const raw = vMatch ? decode(vMatch[1]) : undefined;
      let v: CellValue = null;
      switch (ca.t) {
        case 's':
          v = raw !== undefined ? shared[Number(raw)] ?? '' : null;
          break;
        case 'inlineStr':
          v = textOf(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
          break;
        case 'str':
          v = raw ?? null;
          break;
        case 'b':
        case 'e':
          v = null;
          break;
        default:
          v = raw !== undefined && raw !== '' ? Number(raw) : null;
          if (typeof v === 'number' && Number.isNaN(v)) v = null;
      }
      if (v === null && f) v = evalSimpleFormula(f);
      if (typeof v === 'string' && v.trim() === '') v = null;
      if (v === null && !f) continue;
      if (!cells.has(r)) cells.set(r, new Map());
      cells.get(r)!.set(colIdx, { v, f });
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, colIdx);
    }
  }
  return { name, hidden, cells, maxRow, maxCol };
}

export function cellAt(g: SheetGrid, r: number, c: number): Cell | undefined {
  return g.cells.get(r)?.get(c);
}

/* ---------------- schrijven ---------------- */

export type OutCell =
  | { t: 'n'; v: number; s?: number }
  | { t: 's'; v: string; s?: number }
  | { t: 'f'; f: string; v?: number | string; s?: number }
  | null;

export interface OutSheet {
  name: string;
  rows: OutCell[][];
  colWidths?: number[];
  freeze?: { row: number; col: number };
}

/** Stijlen: 0 normaal, 1 vet, 2 percentage, 3 vet + grijze achtergrond, 4 getal met 2 decimalen */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4EDE9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="9" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Standaard" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sh: OutSheet): string {
  const rows = sh.rows
    .map((row, ri) => {
      const r = ri + 1;
      const cells = row
        .map((c, ci) => {
          if (!c) return '';
          const ref = `${numToCol(ci + 1)}${r}`;
          const s = c.s ? ` s="${c.s}"` : '';
          if (c.t === 'n') return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
          if (c.t === 's') return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
          const cached =
            c.v === undefined ? '' : typeof c.v === 'number' ? `<v>${c.v}</v>` : `<v>${esc(c.v)}</v>`;
          const t = typeof c.v === 'string' ? ' t="str"' : '';
          return `<c r="${ref}"${s}${t}><f>${esc(c.f)}</f>${cached}</c>`;
        })
        .join('');
      return `<row r="${r}">${cells}</row>`;
    })
    .join('');
  const cols = sh.colWidths?.length
    ? `<cols>${sh.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = sh.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sh.freeze.col}" ySplit="${sh.freeze.row}" topLeftCell="${numToCol(sh.freeze.col + 1)}${sh.freeze.row + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

export function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Blad';
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) {
    const suffix = ` (${i++})`;
    n = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(n.toLowerCase());
  return n;
}

export async function writeXlsx(sheets: OutSheet[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, used));
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
