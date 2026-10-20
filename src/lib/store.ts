import type { AppData, Evaluation, Gradebook, SchoolClass, Score, Student } from './types.ts';

const KEY = 'klasbeheer:data:v1';

/**
 * Waar de lokale kopie (cache) van de gegevens bewaard wordt.
 * - 'local': blijft op dit toestel (enkel bij "aangemeld blijven" op je eigen toestel)
 * - 'session': verdwijnt bij het sluiten van de browser (gedeelde computer)
 * - 'none': niets bewaren (niet aangemeld)
 * De gegevens worden pas geladen na het aanmelden, zie sync.ts.
 */
export type Persistence = 'local' | 'session' | 'none';
let persistence: Persistence = 'none';

function storage(): Storage | null {
  try {
    if (persistence === 'local') return localStorage;
    if (persistence === 'session') return sessionStorage;
  } catch {
    /* geen opslag beschikbaar */
  }
  return null;
}

export function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export const now = () => new Date().toISOString();

export function emptyData(): AppData {
  return { version: 1, classes: [], gradebooks: [], updatedAt: new Date(0).toISOString() };
}

export function isValidData(d: unknown): d is AppData {
  const x = d as AppData;
  return !!x && typeof x === 'object' && Array.isArray(x.classes) && Array.isArray(x.gradebooks);
}

let data: AppData = emptyData();
const listeners = new Set<() => void>();
const changeListeners = new Set<(d: AppData) => void>();
const history: AppData[] = [];

function persist() {
  try {
    storage()?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Kies waar de cache bewaard wordt en laad wat daar al staat. */
export function openLocalCache(p: Persistence) {
  persistence = p;
  try {
    // nooit een kopie op beide plaatsen
    if (p !== 'local') localStorage.removeItem(KEY);
    if (p !== 'session') sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  let loaded: AppData = emptyData();
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (isValidData(d)) loaded = d;
    }
  } catch {
    /* ignore */
  }
  data = loaded;
  history.length = 0;
  listeners.forEach((l) => l());
}

/** Wist alle gegevens uit het geheugen en uit de browser (bij afmelden). */
export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  persistence = 'none';
  data = emptyData();
  history.length = 0;
  listeners.forEach((l) => l());
}

export function getData(): AppData {
  return data;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Wordt opgeroepen bij elke wijziging door de gebruiker (voor synchronisatie). */
export function onLocalChange(fn: (d: AppData) => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function emit(local: boolean) {
  persist();
  listeners.forEach((l) => l());
  if (local) changeListeners.forEach((l) => l(data));
}

/** Wijzig de gegevens. De mutator krijgt een kopie die vrij aangepast mag worden. */
export function update(mutator: (d: AppData) => void, opts: { undoable?: boolean } = {}) {
  const next: AppData = structuredClone(data);
  mutator(next);
  next.updatedAt = now();
  if (opts.undoable !== false) {
    history.push(data);
    if (history.length > 50) history.shift();
  }
  data = next;
  emit(true);
}

export function canUndo() {
  return history.length > 0;
}

export function undo() {
  const prev = history.pop();
  if (!prev) return;
  data = { ...prev, updatedAt: now() };
  emit(true);
}

/** Vervang alle gegevens (bv. na synchronisatie of het terugzetten van een back-up). */
export function replaceAll(d: AppData, opts: { local?: boolean } = {}) {
  history.push(data);
  data = d;
  emit(!!opts.local);
}

/* ---------------- acties ---------------- */

export function addClass(name: string, titularis = ''): string {
  const id = uid();
  update((d) => {
    d.classes.push({ id, name: name.trim(), titularis, students: [], createdAt: now() });
  });
  return id;
}

export function updateClass(id: string, patch: Partial<Pick<SchoolClass, 'name' | 'titularis'>>) {
  update((d) => {
    const c = d.classes.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

export function deleteClass(id: string) {
  update((d) => {
    d.classes = d.classes.filter((c) => c.id !== id);
    d.gradebooks = d.gradebooks.filter((g) => g.classId !== id);
  });
}

export function addStudents(classId: string, names: string[]) {
  update((d) => {
    const c = d.classes.find((x) => x.id === classId);
    if (!c) return;
    let nr = Math.max(0, ...c.students.map((s) => s.nr ?? 0));
    for (const n of names) {
      const name = n.trim();
      if (!name) continue;
      c.students.push({ id: uid(), name, nr: ++nr });
    }
  });
}

export function updateStudent(classId: string, studentId: string, patch: Partial<Student>) {
  update((d) => {
    const s = d.classes.find((x) => x.id === classId)?.students.find((x) => x.id === studentId);
    if (s) Object.assign(s, patch);
  });
}

export function deleteStudent(classId: string, studentId: string) {
  update((d) => {
    const c = d.classes.find((x) => x.id === classId);
    if (!c) return;
    c.students = c.students.filter((s) => s.id !== studentId);
    for (const g of d.gradebooks.filter((g) => g.classId === classId)) {
      for (const evId of Object.keys(g.scores)) delete g.scores[evId][studentId];
    }
  });
}

export function addGradebook(classId: string, subject: string): string {
  const id = uid();
  update((d) => {
    d.gradebooks.push({ id, classId, subject: subject.trim() || 'Algemeen', evaluations: [], scores: {}, createdAt: now() });
  });
  return id;
}

export function updateGradebook(id: string, patch: Partial<Pick<Gradebook, 'subject'>>) {
  update((d) => {
    const g = d.gradebooks.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  });
}

export function deleteGradebook(id: string) {
  update((d) => {
    d.gradebooks = d.gradebooks.filter((g) => g.id !== id);
  });
}

export function addEvaluation(gbId: string, ev: Omit<Evaluation, 'id' | 'createdAt'>): string {
  const id = uid();
  update((d) => {
    const g = d.gradebooks.find((x) => x.id === gbId);
    if (!g) return;
    g.evaluations.push({ ...ev, id, createdAt: now() });
    g.scores[id] = {};
  });
  return id;
}

export function updateEvaluation(gbId: string, evId: string, patch: Partial<Evaluation>) {
  update((d) => {
    const e = d.gradebooks.find((x) => x.id === gbId)?.evaluations.find((x) => x.id === evId);
    if (e) Object.assign(e, patch);
  });
}

export function deleteEvaluation(gbId: string, evId: string) {
  update((d) => {
    const g = d.gradebooks.find((x) => x.id === gbId);
    if (!g) return;
    g.evaluations = g.evaluations.filter((e) => e.id !== evId);
    delete g.scores[evId];
  });
}

export function moveEvaluation(gbId: string, evId: string, dir: -1 | 1) {
  update((d) => {
    const g = d.gradebooks.find((x) => x.id === gbId);
    if (!g) return;
    const i = g.evaluations.findIndex((e) => e.id === evId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= g.evaluations.length) return;
    [g.evaluations[i], g.evaluations[j]] = [g.evaluations[j], g.evaluations[i]];
  });
}

export function setScores(gbId: string, entries: { evId: string; studentId: string; score: Score }[]) {
  if (!entries.length) return;
  update((d) => {
    const g = d.gradebooks.find((x) => x.id === gbId);
    if (!g) return;
    for (const { evId, studentId, score } of entries) {
      g.scores[evId] ??= {};
      if (score === null) delete g.scores[evId][studentId];
      else g.scores[evId][studentId] = score;
    }
  });
}

export function setScore(gbId: string, evId: string, studentId: string, score: Score) {
  const g = data.gradebooks.find((x) => x.id === gbId);
  const cur = g?.scores[evId]?.[studentId] ?? null;
  if (cur === score) return;
  update((d) => {
    const g2 = d.gradebooks.find((x) => x.id === gbId);
    if (!g2) return;
    g2.scores[evId] ??= {};
    if (score === null) delete g2.scores[evId][studentId];
    else g2.scores[evId][studentId] = score;
  });
}
