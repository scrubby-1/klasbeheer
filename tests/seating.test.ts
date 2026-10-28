// Test van het klasplan: node --experimental-strip-types tests/seating.test.ts
import assert from 'node:assert/strict';
import { createPlan, moveStudent, normalizePlan, reflowPlan, splitName } from '../src/lib/seating.ts';
import type { SchoolClass } from '../src/lib/types.ts';

const mk = (n: number): SchoolClass => ({
  id: 'c',
  name: 'b4X',
  createdAt: '',
  students: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, name: `Naam${i + 1} Voornaam${i + 1}`, nr: i + 1 })),
});

// 1. per 2, 3 banken per rij: 7 leerlingen -> 2 rijen, volgorde op nummer
const cls = mk(7);
let plan = createPlan(cls, 'duo', 3);
assert.equal(plan.rows, 2);
assert.equal(plan.seats['0-0-0'], 's1');
assert.equal(plan.seats['0-0-1'], 's2');
assert.equal(plan.seats['1-0-0'], 's7');

// 2. wisselen
plan = moveStudent(plan, 's1', '1-0-0');
assert.equal(plan.seats['1-0-0'], 's1');
assert.equal(plan.seats['0-0-0'], 's7');
// naar lege plaats
plan = moveStudent(plan, 's2', '1-2-1');
assert.equal(plan.seats['0-0-1'], undefined);
assert.equal(plan.seats['1-2-1'], 's2');

// 3. nieuwe leerlingen: eerst vrije plaatsen, dan een extra rij; vaste plaatsen blijven
cls.students.push(...Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, name: `Nieuw${i} X`, nr: 20 + i })));
let r = normalizePlan(plan, cls);
assert.ok(r.changed);
assert.equal(r.plan.seats['1-0-0'], 's1', 'vaste plaats blijft');
assert.equal(r.plan.seats['0-0-1'], 'n0', 'eerste vrije plaats');
assert.equal(r.plan.rows, 3, 'klas groeit met een rij');
assert.equal(Object.keys(r.plan.seats).length, 13);
plan = r.plan;

// 4. gearchiveerde leerling maakt plaats vrij
cls.students.find((s) => s.id === 's3')!.archived = true;
r = normalizePlan(plan, cls);
assert.ok(!Object.values(r.plan.seats).includes('s3'));
assert.equal(normalizePlan(r.plan, cls).changed, false, 'stabiel');
plan = r.plan;

// 5. omschakelen naar apart, 4 banken: volgorde behouden
const before = Object.entries(plan.seats).sort().map(([, v]) => v);
const apart = reflowPlan(plan, cls, 'apart', 4);
assert.equal(apart.rows, 3);
assert.equal(Object.keys(apart.seats).length, 12);
assert.ok(Object.keys(apart.seats).every((k) => k.endsWith('-0')));
void before;

// 6. namen
assert.deepEqual(splitName('Van den Broeck Juliette'), { first: 'Juliette', last: 'Van den Broeck' });
assert.deepEqual(splitName('Neel, Faith'), { first: 'Faith', last: 'Neel' });

console.log('Klasplan: alle controles geslaagd.');
