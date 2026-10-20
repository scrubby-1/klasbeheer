// Test van de Excel-import. Gebruik:
//   node --experimental-strip-types tests/import.test.ts pad/naar/Puntenboek.xlsx
// Zonder bestand wordt een kleine voorbeeld-xlsx gemaakt en terug ingelezen.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { applyImport, parseWorkbook } from '../src/lib/importer.ts';
import { exportWorkbook } from '../src/lib/exporter.ts';
import { emptyData } from '../src/lib/store.ts';
import { studentResult, fmtPct } from '../src/lib/calc.ts';
import { writeXlsx } from '../src/lib/xlsx.ts';

const file = process.argv[2];
let buf: Uint8Array;
if (file) {
  buf = readFileSync(file);
} else {
  buf = await writeXlsx([
    {
      name: 'b4X Labo',
      rows: [
        [{ t: 's', v: 'Klaslijst b4X' }, { t: 's', v: 'Leerling' }, { t: 's', v: 'Toets 1' }, { t: 's', v: 'Taak' }, { t: 's', v: 'Totaal' }],
        [{ t: 's', v: 'Totaal' }, null, { t: 'n', v: 20 }, { t: 'n', v: 10 }],
        [{ t: 's', v: '1' }, { t: 's', v: 'Peeters An' }, { t: 'n', v: 15 }, { t: 'n', v: 5 }, { t: 'f', f: 'SUM(C3:D3)/30' }],
        [{ t: 's', v: '2' }, { t: 's', v: 'Janssens Bo' }, null, { t: 'n', v: 8 }, { t: 'f', f: 'SUM(C4:D4)/30' }],
        [{ t: 's', v: 'Aantal leerlingen: 2' }],
      ],
    },
  ]);
}

const sheets = await parseWorkbook(buf);
for (const s of sheets) {
  console.log(`\n== ${s.sheetName} -> klas "${s.className}", vak "${s.subject}" (${s.students.length} lln, overgeslagen kolommen: ${s.skippedColumns.join(',') || '-'})`);
  for (const e of s.evaluations) console.log(`   ${e.col}: ${e.name} / ${e.max ?? '? (voorstel ' + e.suggestedMax + ')'}`);
  for (const w of s.warnings) console.log(`   ! ${w}`);
}

const data = emptyData();
const summary = applyImport(data, sheets, 'merge');
console.log('\nSamenvatting', summary);

for (const gb of data.gradebooks) {
  const cls = data.classes.find((c) => c.id === gb.classId)!;
  const line = cls.students.map((s) => `${s.name.split(' ')[0]} ${fmtPct(studentResult(gb, s.id).pct)}`).join(', ');
  console.log(`${cls.name} ${gb.subject}: ${line.slice(0, 160)}…`);
}

if (!file) {
  const gb = data.gradebooks[0];
  const [an, bo] = data.classes[0].students;
  assert.equal(studentResult(gb, an.id).pct, 20 / 30);
  assert.equal(studentResult(gb, bo.id).pct, 8 / 10, 'lege evaluatie telt niet mee');
}

// export -> import geeft dezelfde punten
const out = await exportWorkbook(data);
const again = emptyData();
applyImport(again, await parseWorkbook(out), 'merge');
assert.equal(again.gradebooks.length, data.gradebooks.length);
for (const gb of data.gradebooks) {
  const cls = data.classes.find((c) => c.id === gb.classId)!;
  const cls2 = again.classes.find((c) => c.name === cls.name)!;
  const gb2 = again.gradebooks.find((g) => g.classId === cls2.id && g.subject === gb.subject)!;
  assert.ok(gb2, `puntenboek ${cls.name} ${gb.subject} na export`);
  for (const st of cls.students) {
    const st2 = cls2.students.find((s) => s.name === st.name)!;
    const a = studentResult(gb, st.id).pct;
    const b = studentResult(gb2, st2.id).pct;
    assert.ok(a === b || (a !== null && b !== null && Math.abs(a - b) < 1e-9), `${st.name}: ${a} vs ${b}`);
  }
}
console.log('\nAlle controles geslaagd.');
