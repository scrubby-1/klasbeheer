import { useRef, useState } from 'react';
import { Icon, go, toast, useData } from '../components/ui.tsx';
import { applyImport, parseWorkbook, type MergeMode, type ParsedSheet } from '../lib/importer.ts';
import { fmtNum, fmtPct, fmtScore, isNum, normName } from '../lib/calc.ts';
import { undo, update } from '../lib/store.ts';

export function ImportPage() {
  const data = useData();
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState<MergeMode>('merge');
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setBusy(true);
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error('Kies een Excel-bestand met de extensie .xlsx. Een ouder .xls-bestand sla je eerst op als .xlsx in Excel.');
      const parsed = await parseWorkbook(await f.arrayBuffer());
      if (!parsed.some((s) => s.students.length)) throw new Error('In dit bestand werden geen leerlingen gevonden. Zet de namen in kolom B, met de punten rechts ervan.');
      setSheets(parsed);
      setFileName(f.name);
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSheets(null);
    } finally {
      setBusy(false);
    }
  };

  const patch = (i: number, fn: (s: ParsedSheet) => void) => {
    setSheets((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next[i]);
      return next;
    });
  };

  const included = sheets?.filter((s) => s.include) ?? [];
  const missingMax = included.some((s) => s.evaluations.some((e) => !(e.max ?? e.suggestedMax) || (e.max ?? e.suggestedMax)! <= 0));

  const run = () => {
    if (!sheets) return;
    let summary = { classesCreated: 0, studentsAdded: 0, gradebooksCreated: 0, gradebooksUpdated: 0, scores: 0 };
    update((d) => {
      summary = applyImport(d, sheets, mode);
    });
    toast(
      `Geïmporteerd: ${summary.scores} punten, ${summary.gradebooksCreated + summary.gradebooksUpdated} puntenboeken, ${summary.studentsAdded} nieuwe leerlingen`,
      { label: 'Ongedaan maken', run: undo },
    );
    setSheets(null);
    go('');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Puntenboek importeren</h1>
          <p className="muted" style={{ marginTop: 6, maxWidth: 680 }}>
            Elk tabblad wordt een klas met een vak. De rij &lsquo;Totaal&rsquo; levert de maxima, elke kolom met punten wordt een evaluatie.
            Kolommen met een percentage of formule voor het totaal worden overgeslagen: dat rekent de app zelf uit.
          </p>
        </div>
      </div>

      {!sheets && (
        <>
          <div
            className={`dropzone${over ? ' over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              readFile(e.dataTransfer.files[0]);
            }}
          >
            <Icon name="upload" size={28} />
            <strong>{busy ? 'Bestand lezen…' : 'Sleep je puntenboek (.xlsx) hierheen of klik om te kiezen'}</strong>
            <span className="small muted">Het bestand wordt enkel in je browser gelezen.</span>
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => readFile(e.target.files?.[0])} />
          </div>
          {error && <div className="note bad">{error}</div>}
        </>
      )}

      {sheets && (
        <>
          <div className="note">
            <strong>{fileName}</strong>: {sheets.length} tabbladen gevonden. Controleer de klas, het vak en de maxima, en klik dan op importeren.
          </div>

          {sheets.map((s, i) => {
            const existingClass = data.classes.find((c) => normName(c.name) === normName(s.className));
            const existingGb = existingClass && data.gradebooks.find((g) => g.classId === existingClass.id && normName(g.subject) === normName(s.subject));
            const scoreCount = s.students.reduce((n, st) => n + st.scores.filter((x) => x !== null).length, 0);
            return (
              <div className={`sheet-card${s.include ? '' : ' off'}`} key={i}>
                <div className="sheet-card-head">
                  <label className="check">
                    <input type="checkbox" checked={s.include} onChange={(e) => patch(i, (x) => (x.include = e.target.checked))} />
                    <span className="faint small">Tabblad</span> <strong>{s.sheetName}</strong>
                  </label>
                  <span className="small muted">
                    {s.students.length} leerlingen · {s.evaluations.length} evaluaties · {scoreCount} punten
                  </span>
                  <span style={{ marginLeft: 'auto' }} className="small">
                    {existingGb ? <span className="tag warn">bestaand puntenboek: wordt {mode === 'merge' ? 'aangevuld' : 'vervangen'}</span>
                      : existingClass ? <span className="tag">bestaande klas, nieuw vak</span>
                      : <span className="tag">nieuwe klas</span>}
                  </span>
                </div>
                {s.include && (
                  <div className="sheet-card-body">
                    <div className="row">
                      <label className="field">
                        <span>Klas</span>
                        <input className="input" value={s.className} onChange={(e) => patch(i, (x) => (x.className = e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Vak</span>
                        <input className="input" value={s.subject} onChange={(e) => patch(i, (x) => (x.subject = e.target.value))} />
                      </label>
                    </div>
                    {s.warnings.map((w) => (
                      <div className="note warn" key={w}>{w}</div>
                    ))}
                    {s.evaluations.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="ev-edit small muted"><span>Kolom</span><span>Evaluatie</span><span>Maximum</span><span>Gemiddelde</span></div>
                        {s.evaluations.map((e, j) => {
                          const max = e.max ?? e.suggestedMax;
                          const nums = s.students.map((st) => st.scores[j]).filter(isNum);
                          const avg = nums.length && max ? nums.reduce((a, b) => a + b, 0) / nums.length / max : null;
                          return (
                            <div className="ev-edit" key={j}>
                              <span className="faint num">{e.col}</span>
                              <input className="input" value={e.name} onChange={(ev) => patch(i, (x) => (x.evaluations[j].name = ev.target.value))} aria-label={`Naam evaluatie kolom ${e.col}`} />
                              <input
                                className="input num"
                                inputMode="decimal"
                                style={e.max === null ? { borderColor: 'var(--warn)' } : undefined}
                                defaultValue={fmtNum(max)}
                                onBlur={(ev) => {
                                  const n = Number(ev.target.value.replace(',', '.'));
                                  patch(i, (x) => (x.evaluations[j].max = Number.isFinite(n) ? n : null));
                                }}
                                aria-label={`Maximum evaluatie kolom ${e.col}`}
                              />
                              <span className="small muted num">{nums.length} ingevuld · {fmtPct(avg)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div>
                      <button className="btn small ghost" onClick={() => setOpen(open === i ? null : i)}>
                        {open === i ? 'Verberg leerlingen' : `Toon ${s.students.length} leerlingen`}
                      </button>
                    </div>
                    {open === i && (
                      <div className="table-wrap">
                        <table className="list preview-table">
                          <thead>
                            <tr>
                              <th>Nr.</th>
                              <th>Leerling</th>
                              {s.evaluations.map((e) => <th key={e.col} className="r">{e.name}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {s.students.map((st) => (
                              <tr key={st.row}>
                                <td className="faint num">{st.nr ?? ''}</td>
                                <td>{st.name}</td>
                                {st.scores.map((x, j) => <td key={j} className="r num">{x === null ? <span className="faint">·</span> : fmtScore(x)}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="panel">
            <div className="panel-body" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="field">
                <span>Als een puntenboek al bestaat</span>
                <div className="seg">
                  <button className={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')}>Aanvullen</button>
                  <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>Vervangen</button>
                </div>
              </div>
              <p className="small muted" style={{ flex: '1 1 260px' }}>
                Aanvullen: evaluaties met dezelfde naam krijgen de punten uit het bestand, andere evaluaties blijven staan.
                Vervangen: de evaluaties van dat puntenboek worden eerst gewist. Leerlingen worden op naam herkend.
              </p>
              <div className="actions">
                <button className="btn ghost" onClick={() => setSheets(null)}>Ander bestand</button>
                <button className="btn primary" disabled={!included.length || missingMax} onClick={run}>
                  {included.length} tabblad{included.length === 1 ? '' : 'en'} importeren
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
