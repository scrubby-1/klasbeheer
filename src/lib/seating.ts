// Klasplan: vaste plaatsen per klas. Pure functies, zonder React.
import type { SchoolClass, SeatingMode, SeatingPlan, Student } from './types.ts';

export const MAX_DESKS = 10;

export const seatsPerDesk = (mode: SeatingMode) => (mode === 'duo' ? 2 : 1);
export const seatKey = (r: number, c: number, s: number) => `${r}-${c}-${s}`;

export function parseKey(k: string): [number, number, number] | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(k);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function clampDesks(n: number) {
  return Math.max(1, Math.min(MAX_DESKS, Math.round(n) || 1));
}

/** Leerlingen die een plaats moeten krijgen: niet gearchiveerd, op nummer gesorteerd. */
export function seatableStudents(cls: SchoolClass): Student[] {
  return cls.students
    .filter((s) => !s.archived)
    .sort((a, b) => (a.nr ?? 1e9) - (b.nr ?? 1e9) || a.name.localeCompare(b.name, 'nl'));
}

/** Alle zitplaatsen in leesvolgorde (rij per rij vanaf het bord, links naar rechts). */
export function seatOrder(plan: Pick<SeatingPlan, 'mode' | 'desksPerRow'>, rows: number): string[] {
  const out: string[] = [];
  const per = seatsPerDesk(plan.mode);
  for (let r = 0; r < rows; r++) for (let c = 0; c < plan.desksPerRow; c++) for (let s = 0; s < per; s++) out.push(seatKey(r, c, s));
  return out;
}

export function rowsNeeded(plan: Pick<SeatingPlan, 'mode' | 'desksPerRow'>, count: number) {
  return Math.max(1, Math.ceil(count / (plan.desksPerRow * seatsPerDesk(plan.mode))));
}

/** Leerlingen in de volgorde waarin ze nu zitten; wie nog geen plaats heeft, achteraan. */
export function orderInPlan(plan: SeatingPlan, students: Student[]): Student[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const seated = Object.entries(plan.seats)
    .map(([k, id]) => ({ p: parseKey(k), st: byId.get(id) }))
    .filter((x): x is { p: [number, number, number]; st: Student } => !!x.p && !!x.st)
    .sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1] || a.p[2] - b.p[2])
    .map((x) => x.st);
  const seen = new Set(seated.map((s) => s.id));
  return [...seated.filter((s, i) => seated.findIndex((t) => t.id === s.id) === i), ...students.filter((s) => !seen.has(s.id))];
}

/** Zet leerlingen in deze volgorde op de plaatsen, rij per rij. */
export function fillPlan(base: Pick<SeatingPlan, 'mode' | 'desksPerRow'>, ordered: Student[], minRows = 1): SeatingPlan {
  const rows = Math.max(minRows, rowsNeeded(base, ordered.length));
  const order = seatOrder(base, rows);
  const seats: Record<string, string> = {};
  ordered.forEach((st, i) => (seats[order[i]] = st.id));
  return { mode: base.mode, desksPerRow: clampDesks(base.desksPerRow), rows, seats };
}

export function createPlan(cls: SchoolClass, mode: SeatingMode, desksPerRow: number): SeatingPlan {
  return fillPlan({ mode, desksPerRow: clampDesks(desksPerRow) }, seatableStudents(cls));
}

/**
 * Houdt het plan in orde met de leerlingenlijst:
 * - plaatsen van verwijderde of gearchiveerde leerlingen komen vrij
 * - nieuwe leerlingen krijgen de eerste vrije plaats; is alles vol, dan komt er een rij bij
 * - bestaande leerlingen blijven op hun vaste plaats
 */
export function normalizePlan(plan: SeatingPlan, cls: SchoolClass): { plan: SeatingPlan; changed: boolean } {
  const students = seatableStudents(cls);
  const valid = new Set(students.map((s) => s.id));
  const per = seatsPerDesk(plan.mode);
  const desks = clampDesks(plan.desksPerRow);
  const seats: Record<string, string> = {};
  const placed = new Set<string>();
  let changed = desks !== plan.desksPerRow;
  let maxRow = -1;

  for (const [k, id] of Object.entries(plan.seats)) {
    const p = parseKey(k);
    if (!p || !valid.has(id) || placed.has(id) || p[1] >= desks || p[2] >= per) {
      changed = true;
      continue;
    }
    seats[k] = id;
    placed.add(id);
    maxRow = Math.max(maxRow, p[0]);
  }

  let rows = Math.max(1, plan.rows || 1, maxRow + 1);
  const unplaced = students.filter((s) => !placed.has(s.id));
  if (unplaced.length) {
    changed = true;
    let order = seatOrder({ mode: plan.mode, desksPerRow: desks }, rows).filter((k) => !seats[k]);
    for (const st of unplaced) {
      if (!order.length) {
        rows++;
        order = seatOrder({ mode: plan.mode, desksPerRow: desks }, rows).filter((k) => !seats[k]);
      }
      seats[order.shift()!] = st.id;
    }
  }
  if (rows !== plan.rows) changed = true;
  return { plan: { ...plan, desksPerRow: desks, rows, seats }, changed };
}

/** Andere opstelling (apart/per 2 of aantal banken): iedereen behoudt zijn volgorde. */
export function reflowPlan(plan: SeatingPlan, cls: SchoolClass, mode: SeatingMode, desksPerRow: number): SeatingPlan {
  return fillPlan({ mode, desksPerRow: clampDesks(desksPerRow) }, orderInPlan(plan, seatableStudents(cls)));
}

/** Verplaats een leerling naar een plaats; zit daar iemand, dan wisselen ze. */
export function moveStudent(plan: SeatingPlan, studentId: string, target: string): SeatingPlan {
  const seats = { ...plan.seats };
  const from = Object.keys(seats).find((k) => seats[k] === studentId);
  if (from === target) return plan;
  const other = seats[target];
  seats[target] = studentId;
  if (from) {
    if (other) seats[from] = other;
    else delete seats[from];
  }
  return { ...plan, seats };
}

export function lastUsedRow(plan: SeatingPlan): number {
  return Math.max(-1, ...Object.keys(plan.seats).map((k) => parseKey(k)?.[0] ?? -1));
}

/** Voor- en familienaam uit "Familienaam Voornaam" (of "Familienaam, Voornaam"). */
export function splitName(name: string): { first: string; last: string } {
  const t = name.trim();
  if (t.includes(',')) {
    const [last, first] = t.split(',', 2).map((x) => x.trim());
    return { first: first || last, last: first ? last : '' };
  }
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: t, last: '' };
  return { first: parts[parts.length - 1], last: parts.slice(0, -1).join(' ') };
}

export function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
