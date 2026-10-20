// Exporteert puntenboeken naar Excel, in een opmaak die de import opnieuw herkent.
import { activeStudents, classOf, isNum, sortClasses, sortStudents, studentResult } from './calc.ts';
import type { AppData, Gradebook } from './types.ts';
import { numToCol, writeXlsx, type OutCell, type OutSheet } from './xlsx.ts';

export function gradebookSheet(data: AppData, gb: Gradebook): OutSheet {
  const cls = classOf(data, gb);
  const students = sortStudents(activeStudents(cls));
  const evs = gb.evaluations;
  const first = 'C';
  const last = numToCol(2 + Math.max(evs.length, 1));
  const header: OutCell[] = [
    { t: 's', v: 'Nr.', s: 3 },
    { t: 's', v: 'Leerling', s: 3 },
    ...evs.map((e): OutCell => ({ t: 's', v: e.name, s: 3 })),
    { t: 's', v: 'Totaal %', s: 3 },
  ];
  const maxRow: OutCell[] = [
    { t: 's', v: 'Totaal', s: 1 },
    { t: 's', v: cls?.titularis ? `Klastitularis(sen): ${cls.titularis}` : '', s: 1 },
    ...evs.map((e): OutCell => ({ t: 'n', v: e.max, s: 1 })),
    null,
  ];
  const rows: OutCell[][] = [header, maxRow];
  students.forEach((st, i) => {
    const r = i + 3;
    const res = studentResult(gb, st.id);
    const range = `${first}${r}:${last}${r}`;
    const row: OutCell[] = [
      st.nr != null ? { t: 'n', v: st.nr } : null,
      { t: 's', v: st.name },
      ...evs.map((e): OutCell => {
        const s = gb.scores[e.id]?.[st.id];
        if (isNum(s)) return { t: 'n', v: s, s: 4 };
        if (typeof s === 'string' && s) return { t: 's', v: s };
        return null;
      }),
      {
        t: 'f',
        f: `IF(COUNT(${range})=0,"",SUM(${range})/SUMPRODUCT(--ISNUMBER(${range}),$${first}$2:$${last}$2))`,
        v: res.pct ?? '',
        s: 2,
      },
    ];
    rows.push(row);
  });
  rows.push([{ t: 's', v: `Aantal leerlingen: ${students.length}` }]);
  return {
    name: `${cls?.name ?? 'Klas'} ${gb.subject}`,
    rows,
    colWidths: [6, 32, ...evs.map((e) => Math.min(28, Math.max(10, e.name.length + 2))), 11],
    freeze: { row: 2, col: 2 },
  };
}

export async function exportWorkbook(data: AppData, gradebookIds?: string[]): Promise<Uint8Array> {
  const order = sortClasses(data.classes).map((c) => c.id);
  const gbs = data.gradebooks
    .filter((g) => !gradebookIds || gradebookIds.includes(g.id))
    .sort((a, b) => order.indexOf(a.classId) - order.indexOf(b.classId) || a.subject.localeCompare(b.subject, 'nl'));
  return writeXlsx(gbs.map((g) => gradebookSheet(data, g)));
}
