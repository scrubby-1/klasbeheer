import type { AppData, Evaluation, Gradebook, SchoolClass, Score, Student } from './types.ts';

export function isNum(s: Score | undefined): s is number {
  return typeof s === 'number' && Number.isFinite(s);
}

export function getScore(gb: Gradebook, evalId: string, studentId: string): Score {
  const v = gb.scores[evalId]?.[studentId];
  return v === undefined ? null : v;
}

export interface Result {
  got: number;
  max: number;
  count: number;
  pct: number | null;
}

/**
 * Percentage van een leerling binnen een puntenboek.
 * Enkel evaluaties met een ingevuld getal tellen mee (zelfde regel als in het Excel-puntenboek):
 * som van de behaalde punten / som van de maxima van die evaluaties.
 */
export function studentResult(gb: Gradebook, studentId: string, evaluations: Evaluation[] = gb.evaluations): Result {
  let got = 0;
  let max = 0;
  let count = 0;
  for (const e of evaluations) {
    const s = getScore(gb, e.id, studentId);
    if (isNum(s) && e.max > 0) {
      got += s;
      max += e.max;
      count++;
    }
  }
  return { got, max, count, pct: max > 0 ? got / max : null };
}

export interface EvalStats {
  entered: number; // aantal getallen
  codes: number; // aantal codes (A, Z, ...)
  missing: number; // leeg
  total: number; // actieve leerlingen
  avgPct: number | null;
  avgPoints: number | null;
  minPct: number | null;
  maxPct: number | null;
  below50: number;
  overMax: number;
}

export function activeStudents(cls: SchoolClass | undefined): Student[] {
  return (cls?.students ?? []).filter((s) => !s.archived);
}

export function evalStats(gb: Gradebook, ev: Evaluation, students: Student[]): EvalStats {
  let entered = 0, codes = 0, missing = 0, sum = 0, below50 = 0, overMax = 0;
  let min: number | null = null, mx: number | null = null;
  for (const st of students) {
    const s = getScore(gb, ev.id, st.id);
    if (isNum(s)) {
      entered++;
      sum += s;
      const p = ev.max > 0 ? s / ev.max : 0;
      if (p < 0.5) below50++;
      if (s > ev.max) overMax++;
      min = min === null ? p : Math.min(min, p);
      mx = mx === null ? p : Math.max(mx, p);
    } else if (typeof s === 'string' && s.trim()) codes++;
    else missing++;
  }
  const avgPoints = entered ? sum / entered : null;
  return {
    entered, codes, missing, total: students.length,
    avgPoints,
    avgPct: avgPoints !== null && ev.max > 0 ? avgPoints / ev.max : null,
    minPct: min, maxPct: mx, below50, overMax,
  };
}

export interface GradebookStats {
  avgPct: number | null;
  pcts: { student: Student; pct: number | null }[];
  below50: number;
  missingCells: number;
}

export function gradebookStats(gb: Gradebook, cls: SchoolClass | undefined): GradebookStats {
  const students = activeStudents(cls);
  const pcts = students.map((student) => ({ student, pct: studentResult(gb, student.id).pct }));
  const vals = pcts.map((p) => p.pct).filter((p): p is number => p !== null);
  let missingCells = 0;
  for (const ev of gb.evaluations) for (const st of students) {
    const s = getScore(gb, ev.id, st.id);
    if (s === null || s === '') missingCells++;
  }
  return {
    avgPct: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    pcts,
    below50: vals.filter((v) => v < 0.5).length,
    missingCells,
  };
}

/* ---------- invoer & weergave ---------- */

/** Zet tekst uit een invulcel om naar een score. "7,5" -> 7.5, "" -> null, "a" -> "A". */
export function parseScoreInput(raw: string): Score {
  const t = raw.trim();
  if (!t) return null;
  const n = t.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(n) || /^-?\.\d+$/.test(n)) return Number(n);
  return t.toUpperCase().slice(0, 6);
}

const numFmt = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 });
export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '' : numFmt.format(Math.round(n * 100) / 100);
}

export function fmtScore(s: Score): string {
  if (isNum(s)) return fmtNum(s);
  return s ?? '';
}

export function fmtPct(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '–';
  return `${(p * 100).toLocaleString('nl-BE', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

export function pctTone(p: number | null | undefined): 'bad' | 'warn' | 'ok' | 'none' {
  if (p === null || p === undefined) return 'none';
  if (p < 0.5) return 'bad';
  if (p < 0.6) return 'warn';
  return 'ok';
}

export function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function normName(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const an = a.nr ?? Number.MAX_SAFE_INTEGER;
    const bn = b.nr ?? Number.MAX_SAFE_INTEGER;
    return an - bn || a.name.localeCompare(b.name, 'nl');
  });
}

export function sortClasses(classes: SchoolClass[]): SchoolClass[] {
  return [...classes].sort((a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true }));
}

export function classOf(data: AppData, gb: Gradebook): SchoolClass | undefined {
  return data.classes.find((c) => c.id === gb.classId);
}

export function gradebookLabel(data: AppData, gb: Gradebook): string {
  const c = classOf(data, gb);
  return `${c?.name ?? '?'} · ${gb.subject}`;
}
