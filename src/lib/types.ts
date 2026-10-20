/** Een score is een getal (punten), een code (bv. "A" = afwezig, telt niet mee) of leeg (null = niet ingevuld, telt niet mee). */
export type Score = number | string | null;

export interface Student {
  id: string;
  name: string;
  nr?: number | null;
  note?: string;
  archived?: boolean;
}

export interface SchoolClass {
  id: string;
  name: string;
  titularis?: string;
  students: Student[];
  createdAt: string;
}

export interface Evaluation {
  id: string;
  name: string;
  max: number;
  date?: string; // ISO yyyy-mm-dd
  type?: string; // toets, taak, permanente evaluatie ...
  note?: string;
  createdAt: string;
}

export interface Gradebook {
  id: string;
  classId: string;
  subject: string;
  evaluations: Evaluation[];
  /** scores[evaluationId][studentId] */
  scores: Record<string, Record<string, Score>>;
  createdAt: string;
}

export interface AppData {
  version: 1;
  classes: SchoolClass[];
  gradebooks: Gradebook[];
  updatedAt: string;
}

export const EVALUATION_TYPES = ['Toets', 'Taak', 'Opdracht', 'Permanente evaluatie', 'Examen', 'Andere'];
