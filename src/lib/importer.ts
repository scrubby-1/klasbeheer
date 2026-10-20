// Herkent puntenboeken in een Excel-bestand: één tabblad = één klas + vak.
import { cellAt, numToCol, readXlsx, type SheetGrid } from './xlsx.ts';
import { normName } from './calc.ts';
import type { AppData, Gradebook, Score } from './types.ts';
import { now, uid } from './store.ts';

export interface ParsedEvaluation {
  col: string;
  name: string;
  max: number | null;
  suggestedMax: number;
}

export interface ParsedStudent {
  row: number;
  nr: number | null;
  name: string;
  scores: Score[]; // zelfde volgorde als evaluations
}

export interface ParsedSheet {
  sheetName: string;
  className: string;
  subject: string;
  titularis: string;
  evaluations: ParsedEvaluation[];
  students: ParsedStudent[];
  warnings: string[];
  skippedColumns: string[];
  include: boolean;
}

const LABEL = /^(leerling(en)?|naam|totaal|totalen|maximum|max\.?|nr\.?|nummer|klaslijst.*|klastitularis.*|aantal leerlingen.*)$/i;
const GENERIC = /^kolom\s*\d+$/i;
const PCT_HEADER = /(totaal|%|percent|gemiddelde|trimester|resultaat)/i;
const MAX_LABEL = /^(totaal|max\.?|maximum|op)$/i;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function isStudentName(g: SheetGrid, r: number, nameCol: number): string | null {
  const b = str(cellAt(g, r, nameCol)?.v);
  if (b && !LABEL.test(b)) return b;
  if (!b) {
    // naam soms in kolom A (bv. een leerling die later toegevoegd werd)
    const a = cellAt(g, r, 1)?.v;
    const at = str(a);
    if (at && !LABEL.test(at) && !/^\d+$/.test(at) && !/^klas/i.test(at) && !/^aantal/i.test(at)) {
      // enkel als er ook punten op de rij staan
      for (let c = nameCol + 1; c <= g.maxCol; c++) if (typeof cellAt(g, r, c)?.v === 'number') return at;
    }
  }
  return null;
}

function splitSheetName(sheet: string, klaslijst: string): { className: string; subject: string } {
  const name = sheet.trim();
  const fromList = klaslijst.replace(/^klaslijst\s*/i, '').trim();
  let className = '';
  let subject = '';
  if (fromList && name.toLowerCase().startsWith(fromList.toLowerCase())) {
    className = fromList;
    subject = name.slice(fromList.length).trim();
  } else {
    const [first, ...rest] = name.split(/\s+/);
    className = fromList || first;
    subject = fromList ? name : rest.join(' ');
    if (fromList && name.toLowerCase() === fromList.toLowerCase()) subject = '';
  }
  subject = subject.replace(/^[-–_\s]+/, '');
  // "LAbo" -> "Labo"
  subject = subject
    .split(/\s+/)
    .map((w) => (/^[A-Z]{2}[a-z]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
  return { className, subject: subject || 'Algemeen' };
}

export function parseSheet(g: SheetGrid): ParsedSheet {
  const warnings: string[] = [];
  let titularis = '';
  let klaslijst = '';
  let nameCol = 2;

  // kolom met "Leerling" in de koppen
  for (let r = 1; r <= Math.min(g.maxRow, 10); r++) {
    for (let c = 1; c <= g.maxCol; c++) {
      const t = str(cellAt(g, r, c)?.v);
      if (/^klastitularis/i.test(t)) titularis = t.replace(/^klastitularis(\(sen\))?\s*:?\s*/i, '');
      if (/^klaslijst/i.test(t)) klaslijst = t;
      if (/^(leerling|naam)$/i.test(t) && c <= 3) nameCol = c;
    }
  }

  const studentRows: { r: number; name: string }[] = [];
  for (let r = 1; r <= g.maxRow; r++) {
    const n = isStudentName(g, r, nameCol);
    if (n) studentRows.push({ r, name: n });
  }
  const firstStudent = studentRows[0]?.r ?? g.maxRow + 1;

  // rij met de maxima: label "Totaal" boven de eerste leerling, anders de rij met de meeste getallen
  let maxRow: number | null = null;
  for (let r = firstStudent - 1; r >= 1 && maxRow === null; r--) {
    for (let c = 1; c <= nameCol; c++) {
      if (MAX_LABEL.test(str(cellAt(g, r, c)?.v))) {
        maxRow = r;
        break;
      }
    }
  }
  if (maxRow === null) {
    let best = 0;
    for (let r = 1; r < firstStudent; r++) {
      let n = 0;
      for (let c = nameCol + 1; c <= g.maxCol; c++) if (typeof cellAt(g, r, c)?.v === 'number' && !cellAt(g, r, c)?.f?.includes(':')) n++;
      if (n > best) {
        best = n;
        maxRow = r;
      }
    }
  }

  // percentage-/totaalkolommen herkennen en overslaan
  const isPctCol = (c: number) => {
    for (const { r } of studentRows) {
      const f = cellAt(g, r, c)?.f;
      if (f && /[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+|\[#This Row\]|SUM|SOM/i.test(f)) return true;
    }
    for (let r = 1; r < firstStudent; r++) {
      if (r === maxRow) continue;
      const t = str(cellAt(g, r, c)?.v);
      if (t && PCT_HEADER.test(t) && !GENERIC.test(t)) {
        // een kolom "Totaal" zonder maximum en zonder ingevulde getallen = de percentagekolom
        const hasMax = maxRow !== null && typeof cellAt(g, maxRow, c)?.v === 'number';
        if (!hasMax) return true;
      }
    }
    return false;
  };

  const evaluations: ParsedEvaluation[] = [];
  const evalCols: number[] = [];
  const skippedColumns: string[] = [];
  let unnamed = 0;
  for (let c = nameCol + 1; c <= g.maxCol; c++) {
    const maxCell = maxRow !== null ? cellAt(g, maxRow, c) : undefined;
    const max = typeof maxCell?.v === 'number' && !maxCell.f?.includes(':') ? maxCell.v : null;
    let hasData = false;
    let highest = 0;
    for (const { r } of studentRows) {
      const v = cellAt(g, r, c)?.v;
      if (typeof v === 'number') {
        hasData = true;
        highest = Math.max(highest, v);
      } else if (str(v)) hasData = true;
    }
    if (max === null && !hasData) continue;
    if (isPctCol(c)) {
      skippedColumns.push(numToCol(c));
      continue;
    }
    // naam: dichtst bij de gegevens, niet generiek
    let name = '';
    for (let r = firstStudent - 1; r >= 1; r--) {
      if (r === maxRow) continue;
      const t = str(cellAt(g, r, c)?.v);
      if (t && !GENERIC.test(t) && !LABEL.test(t) && !/^klas/i.test(t)) {
        name = t;
        break;
      }
    }
    if (!name) {
      unnamed++;
      name = `Evaluatie ${evaluations.length + 1}`;
    }
    const suggested = max ?? (highest > 0 ? (highest <= 1 ? 1 : highest <= 5 ? 5 : Math.ceil(highest / 10) * 10) : 10);
    evaluations.push({ col: numToCol(c), name, max, suggestedMax: suggested });
    evalCols.push(c);
  }

  if (maxRow === null && evaluations.length) warnings.push('Geen rij met maxima gevonden: vul het maximum per evaluatie zelf in.');
  else if (evaluations.some((e) => e.max === null)) warnings.push('Niet elke evaluatie heeft een maximum: vul het ontbrekende maximum in.');
  if (unnamed) warnings.push(`${unnamed} evaluatie(s) zonder titel kregen een voorlopige naam.`);

  const students: ParsedStudent[] = studentRows.map(({ r, name }) => {
    const a = cellAt(g, r, 1)?.v;
    const nr = typeof a === 'number' ? a : /^\d+$/.test(str(a)) ? Number(str(a)) : null;
    const scores = evalCols.map((c): Score => {
      const v = cellAt(g, r, c)?.v;
      if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
      const t = str(v);
      return t ? t.toUpperCase().slice(0, 6) : null;
    });
    return { row: r, nr, name, scores };
  });

  const { className, subject } = splitSheetName(g.name, klaslijst);
  return {
    sheetName: g.name,
    className,
    subject,
    titularis,
    evaluations,
    students,
    warnings,
    skippedColumns,
    include: students.length > 0,
  };
}

export async function parseWorkbook(buf: ArrayBuffer | Uint8Array): Promise<ParsedSheet[]> {
  const grids = await readXlsx(buf);
  return grids.filter((g) => !g.hidden).map(parseSheet);
}

export type MergeMode = 'merge' | 'replace';

export interface ImportSummary {
  classesCreated: number;
  studentsAdded: number;
  gradebooksCreated: number;
  gradebooksUpdated: number;
  scores: number;
}

/** Voegt de geparste tabbladen toe aan de gegevens (muteert d). */
export function applyImport(d: AppData, sheets: ParsedSheet[], mode: MergeMode): ImportSummary {
  const sum: ImportSummary = { classesCreated: 0, studentsAdded: 0, gradebooksCreated: 0, gradebooksUpdated: 0, scores: 0 };
  for (const sh of sheets.filter((s) => s.include)) {
    let cls = d.classes.find((c) => normName(c.name) === normName(sh.className));
    if (!cls) {
      cls = { id: uid(), name: sh.className.trim(), titularis: sh.titularis, students: [], createdAt: now() };
      d.classes.push(cls);
      sum.classesCreated++;
    } else if (!cls.titularis && sh.titularis) cls.titularis = sh.titularis;

    const ids = sh.students.map((ps) => {
      let st = cls!.students.find((s) => normName(s.name) === normName(ps.name));
      if (!st) {
        st = { id: uid(), name: ps.name, nr: ps.nr };
        cls!.students.push(st);
        sum.studentsAdded++;
      } else if (st.nr == null && ps.nr != null) st.nr = ps.nr;
      return st.id;
    });

    let gb: Gradebook | undefined = d.gradebooks.find(
      (g) => g.classId === cls!.id && normName(g.subject) === normName(sh.subject),
    );
    if (gb && mode === 'replace') {
      gb.evaluations = [];
      gb.scores = {};
    }
    if (!gb) {
      gb = { id: uid(), classId: cls.id, subject: sh.subject.trim() || 'Algemeen', evaluations: [], scores: {}, createdAt: now() };
      d.gradebooks.push(gb);
      sum.gradebooksCreated++;
    } else sum.gradebooksUpdated++;

    sh.evaluations.forEach((pe, i) => {
      const max = pe.max ?? pe.suggestedMax;
      let ev = gb!.evaluations.find((e) => normName(e.name) === normName(pe.name));
      if (!ev) {
        ev = { id: uid(), name: pe.name, max, createdAt: now() };
        gb!.evaluations.push(ev);
      } else ev.max = max;
      const bucket = (gb!.scores[ev.id] ??= {});
      sh.students.forEach((ps, si) => {
        const s = ps.scores[i];
        if (s !== null && s !== undefined) {
          bucket[ids[si]] = s;
          sum.scores++;
        }
      });
    });
  }
  return sum;
}
