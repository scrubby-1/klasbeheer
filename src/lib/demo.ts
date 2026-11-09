// Fictieve gegevens voor de demoversie. Alle namen zijn verzonnen combinaties.
import type { AppData, Evaluation, Gradebook, SchoolClass, Score, Student } from './types.ts';
import { createPlan, fillPlan, seatableStudents } from './seating.ts';

// Vaste toevalsgenerator: elke demo start met dezelfde gegevens.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Anouk', 'Arne', 'Bram', 'Brent', 'Lien', 'Seppe', 'Emiel', 'Fien', 'Vic', 'Gilles', 'Hanne', 'Ilias', 'Jana', 'Jasper', 'Matteo',
  'Kobe', 'Laure', 'Tuur', 'Mila', 'Wiebe', 'Nina', 'Noor', 'Fleur', 'Pieter', 'Rune', 'Sara', 'Senne', 'Mauro', 'Thibo', 'Ward',
  'Yara', 'Zoë', 'Amira', 'Bilal', 'Ines', 'Youssef', 'Lena', 'Jules', 'Marthe', 'Robbe', 'Axel', 'Nore', 'Sofie', 'Wout', 'Elena',
  'Finn', 'Helena', 'Lowie', 'Margot', 'Oona',
];
const LAST = [
  'Aerts', 'Baeten', 'Bogaerts', 'Claes', 'Cools', 'De Backer', 'De Clercq', 'Gysels', 'Dewulf', 'Luyten', 'Geens', 'Goossens',
  'Hendrickx', 'Jacobs', 'Janssen', 'Kenis', 'Lambrechts', 'Leemans', 'Maes', 'Martens', 'Michiels', 'Mertens', 'Nijs', 'Moens',
  'Vanhoof', 'Renders', 'Sels', 'Ceulemans', 'Thijs', 'Wynants', 'Heylen', 'Vandenberghe', 'Verbruggen', 'Torfs',
  'Vermeulen', 'Wouters', 'Willems', 'Wuyts', 'Daems', 'Op de Beeck',
];

interface ClassSpec {
  name: string;
  titularis: string;
  size: number;
  seating?: { mode: 'apart' | 'duo'; desks: number };
  subjects: { subject: string; evals: [string, number, string, string][] }[]; // naam, max, datum, soort
}

const SPECS: ClassSpec[] = [
  {
    name: 'Demo 4A',
    titularis: 'Mevr. Demo',
    size: 19,
    seating: { mode: 'duo', desks: 3 },
    subjects: [
      {
        subject: 'Bedrijfseconomie',
        evals: [
          ['Toets marketingmix', 20, '2026-09-24', 'Toets'],
          ['Taak Business Model Canvas', 10, '2026-10-08', 'Taak'],
          ['Toets prijszetting', 25, '2026-10-22', 'Toets'],
          ['Permanente evaluatie okt', 5, '2026-10-31', 'Permanente evaluatie'],
          ['Toets distributie', 20, '2026-11-12', 'Toets'],
        ],
      },
      {
        subject: 'Excel',
        evals: [
          ['Opdracht celopmaak', 10, '2026-09-18', 'Opdracht'],
          ['Toets formules', 20, '2026-10-02', 'Toets'],
          ['Opdracht grafieken', 15, '2026-10-16', 'Opdracht'],
          ['Toets ALS-functie', 20, '2026-11-06', 'Toets'],
        ],
      },
    ],
  },
  {
    name: 'Demo 5B',
    titularis: 'Dhr. Voorbeeld',
    size: 15,
    seating: { mode: 'apart', desks: 4 },
    subjects: [
      {
        subject: 'Word',
        evals: [
          ['Opdracht stijlen', 10, '2026-09-23', 'Opdracht'],
          ['Landenwerkstuk deel 1', 20, '2026-10-14', 'Taak'],
          ['Toets inhoudsopgave', 15, '2026-10-28', 'Toets'],
        ],
      },
      {
        subject: 'Onthaal en sales',
        evals: [
          ['Rollenspel telefoon', 10, '2026-09-30', 'Permanente evaluatie'],
          ['Toets organogram', 20, '2026-10-21', 'Toets'],
          ['Verkoopgesprek', 20, '2026-11-10', 'Opdracht'],
        ],
      },
    ],
  },
  {
    name: 'Demo 6C',
    titularis: 'Mevr. Proef',
    size: 22,
    subjects: [
      {
        subject: 'AI',
        evals: [
          ['Taak prompts schrijven', 10, '2026-09-25', 'Taak'],
          ['Toets begrippen AI', 20, '2026-10-09', 'Toets'],
          ['Project chatbot', 30, '2026-10-30', 'Opdracht'],
          ['Reflectie ethiek', 10, '2026-11-13', 'Taak'],
        ],
      },
    ],
  },
];

const TODAY = '2026-11-09';

export function makeDemoData(): AppData {
  const r = rng(20261109);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  let n = 0;
  const id = (p: string) => `demo-${p}-${++n}`;
  const used = new Set<string>();
  const classes: SchoolClass[] = [];
  const gradebooks: Gradebook[] = [];
  const created = '2026-09-01T08:00:00.000Z';

  for (const spec of SPECS) {
    const students: Student[] = [];
    while (students.length < spec.size) {
      const name = `${pick(LAST)} ${pick(FIRST)}`;
      if (used.has(name)) continue;
      used.add(name);
      students.push({ id: id('s'), name, nr: 0 });
    }
    students.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    students.forEach((s, i) => (s.nr = i + 1));
    // één leerling die de klas verliet (gearchiveerd) en een notitie
    if (spec.size > 18) students[students.length - 2].archived = true;
    students[2].note = 'Fictieve notitie: krijgt extra tijd bij toetsen.';

    // "niveau" per leerling, zodat de resultaten realistisch spreiden
    const level = new Map(students.map((s) => [s.id, 0.35 + r() * 0.6]));
    const cls: SchoolClass = { id: id('c'), name: spec.name, titularis: spec.titularis, students, createdAt: created };

    for (const sub of spec.subjects) {
      const evaluations: Evaluation[] = [];
      const scores: Record<string, Record<string, Score>> = {};
      for (const [ename, max, date, type] of sub.evals) {
        const ev: Evaluation = { id: id('e'), name: ename, max, date, type, createdAt: `${date}T10:00:00.000Z` };
        evaluations.push(ev);
        const bucket: Record<string, Score> = {};
        const future = date > TODAY;
        const partly = !future && date >= '2026-11-01'; // recente toets: nog niet alles verbeterd
        for (const st of students) {
          if (future) continue;
          if (partly && r() < 0.45) continue;
          const x = r();
          if (x < 0.04) bucket[st.id] = 'A';
          else if (x < 0.06) bucket[st.id] = 'Z';
          else {
            const p = Math.max(0, Math.min(1, level.get(st.id)! + (r() - 0.5) * 0.3));
            const step = max >= 20 ? 0.5 : 1;
            bucket[st.id] = Math.round((p * max) / step) * step;
          }
        }
        scores[ev.id] = bucket;
      }
      gradebooks.push({ id: id('g'), classId: cls.id, subject: sub.subject, evaluations, scores, createdAt: created });
    }

    if (spec.seating) {
      const plan = createPlan(cls, spec.seating.mode, spec.seating.desks);
      // een paar leerlingen verplaatst, zodat het niet op nummer staat
      const order = seatableStudents(cls);
      [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
      cls.seating = { ...fillPlan(plan, order, plan.rows), updatedAt: created };
    }
    classes.push(cls);
  }

  return { version: 1, classes, gradebooks, updatedAt: new Date().toISOString() };
}
