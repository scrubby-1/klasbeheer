import { useEffect, useMemo, useRef, useState } from 'react';
import { Confirm, Dialog, Icon, Pct, download, go, toast, useData } from '../components/ui.tsx';
import { EvaluationDialog } from '../components/EvaluationDialog.tsx';
import {
  activeStudents, evalStats, fmtDate, fmtNum, fmtPct, fmtScore, getScore, isNum, parseScoreInput, sortStudents, studentResult,
} from '../lib/calc.ts';
import { deleteGradebook, moveEvaluation, setScore, setScores, updateGradebook, undo } from '../lib/store.ts';
import { exportWorkbook } from '../lib/exporter.ts';
import type { Evaluation, Gradebook, Score, Student } from '../lib/types.ts';

type SortKey = 'nr' | 'naam' | 'pct';

export function GradebookPage({ id, focusEval }: { id: string; focusEval?: string }) {
  const data = useData();
  const gb = data.gradebooks.find((g) => g.id === id);
  const cls = gb ? data.classes.find((c) => c.id === gb.classId) : undefined;
  const [sort, setSort] = useState<SortKey>('nr');
  const [editing, setEditing] = useState<Evaluation | 'new' | null>(null);
  const [rename, setRename] = useState(false);
  const [del, setDel] = useState(false);

  // De volgorde op resultaat wordt enkel berekend bij het kiezen van de sortering,
  // zodat rijen niet verspringen terwijl je punten invult.
  const gbRef = useRef(gb);
  gbRef.current = gb;
  const students = useMemo(() => {
    const list = sortStudents(activeStudents(cls));
    const g = gbRef.current;
    if (!g) return list;
    if (sort === 'naam') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    if (sort === 'pct')
      return [...list].sort((a, b) => (studentResult(g, a.id).pct ?? 2) - (studentResult(g, b.id).pct ?? 2));
    return list;
  }, [cls, sort, id]);

  useEffect(() => {
    if (!focusEval) return;
    const el = document.querySelector<HTMLInputElement>(`input[data-ev="${focusEval}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
    el?.focus();
  }, [focusEval]);

  if (!gb || !cls) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Dit puntenboek bestaat niet meer</h2>
          <a className="btn" href="#/">Naar het overzicht</a>
        </div>
      </div>
    );
  }

  const exportThis = async () => {
    const bytes = await exportWorkbook(data, [gb.id]);
    download(`${cls.name} ${gb.subject}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">
            <a href={`#/klas/${cls.id}`}>{cls.name}</a>
          </div>
          <h1>
            {cls.name} · {gb.subject}
          </h1>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Evaluatie toevoegen
          </button>
          <button className="btn" onClick={exportThis}>
            <Icon name="download" /> Excel
          </button>
          <button className="btn ghost" onClick={() => setRename(true)}>
            Vak hernoemen
          </button>
          <button className="btn ghost danger" onClick={() => setDel(true)}>
            Verwijderen
          </button>
        </div>
      </div>

      {gb.evaluations.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <h2>Nog geen evaluaties</h2>
            <p>Voeg een evaluatie toe met een naam en het maximum. Daarna typ je de punten rechtstreeks in de tabel.</p>
            <button className="btn primary" onClick={() => setEditing('new')}>
              <Icon name="plus" /> Evaluatie toevoegen
            </button>
          </div>
        </div>
      ) : students.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <h2>Deze klas heeft nog geen leerlingen</h2>
            <a className="btn primary" href={`#/klas/${cls.id}`}>Leerlingen toevoegen</a>
          </div>
        </div>
      ) : (
        <>
          <div className="filters small muted">
            <span>Sorteren:</span>
            <div className="seg">
              {(['nr', 'naam', 'pct'] as SortKey[]).map((k) => (
                <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
                  {k === 'nr' ? 'Nummer' : k === 'naam' ? 'Naam' : 'Resultaat'}
                </button>
              ))}
            </div>
            <span style={{ marginLeft: 'auto' }}>
              Leeg of een code (A = afwezig, Z = ziek …) telt niet mee. Een 0 telt wel mee.
            </span>
          </div>
          <ScoreGrid gb={gb} students={students} focusEval={focusEval} onEditEval={setEditing} />
        </>
      )}

      {editing && (
        <EvaluationDialog
          gbId={gb.id}
          evaluation={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(_, evId) => {
            if (editing === 'new')
              setTimeout(() => {
                const el = document.querySelector<HTMLInputElement>(`input[data-ev="${evId}"]`);
                el?.scrollIntoView({ block: 'nearest', inline: 'center' });
                el?.focus();
              }, 50);
          }}
        />
      )}
      {rename && <RenameDialog gb={gb} onClose={() => setRename(false)} />}
      {del && (
        <Confirm
          title="Puntenboek verwijderen?"
          text={`Het puntenboek ${cls.name} · ${gb.subject} met ${gb.evaluations.length} evaluaties en alle punten wordt verwijderd. De leerlingen van de klas blijven bestaan.`}
          confirmLabel="Puntenboek verwijderen"
          danger
          onClose={() => setDel(false)}
          onConfirm={() => {
            deleteGradebook(gb.id);
            go(`klas/${cls.id}`);
            toast('Puntenboek verwijderd', { label: 'Ongedaan maken', run: undo });
          }}
        />
      )}
    </div>
  );
}

function RenameDialog({ gb, onClose }: { gb: Gradebook; onClose: () => void }) {
  const [v, setV] = useState(gb.subject);
  const save = () => {
    if (v.trim()) updateGradebook(gb.id, { subject: v.trim() });
    onClose();
  };
  return (
    <Dialog
      title="Vak hernoemen"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Annuleren</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </>
      }
    >
      <label className="field">
        <span>Naam van het vak</span>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
    </Dialog>
  );
}

/* ---------------- het raster ---------------- */

function ScoreGrid(props: { gb: Gradebook; students: Student[]; focusEval?: string; onEditEval: (e: Evaluation) => void }) {
  const { gb, students } = props;
  const evs = gb.evaluations;
  const tableRef = useRef<HTMLTableElement>(null);

  const focusCell = (r: number, c: number) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };

  /** Plakt een blok uit Excel. Geeft de nieuwe waarde van het startvak terug (of undefined bij een gewone plak). */
  const onPaste = (r: number, c: number, e: React.ClipboardEvent<HTMLInputElement>): Score | undefined => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return undefined; // gewone plak in één vak
    e.preventDefault();
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const entries: { evId: string; studentId: string; score: Score }[] = [];
    rows.forEach((cols, i) =>
      cols.forEach((val, j) => {
        const st = students[r + i];
        const ev = evs[c + j];
        if (st && ev) entries.push({ evId: ev.id, studentId: st.id, score: parseScoreInput(val) });
      }),
    );
    setScores(gb.id, entries);
    toast(`${entries.length} punten geplakt`, { label: 'Ongedaan maken', run: undo });
    return parseScoreInput(rows[0]?.[0] ?? '');
  };

  return (
    <div className="grid-wrap">
      <table className="grid" ref={tableRef}>
        <thead>
          <tr>
            <th className="sticky namecell" style={{ textAlign: 'left', verticalAlign: 'bottom', paddingBottom: 8 }}>
              <span className="small muted">{students.length} leerlingen</span>
            </th>
            {evs.map((ev, i) => (
              <th key={ev.id} className={`ev-head${props.focusEval === ev.id ? ' focus' : ''}`}>
                <button onClick={() => props.onEditEval(ev)} title="Evaluatie bewerken">
                  <div className="ev-name">{ev.name}</div>
                  <div className="ev-meta num">
                    op {fmtNum(ev.max)}
                    {ev.date ? ` · ${fmtDate(ev.date)}` : ''}
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                  <button className="icon-btn" style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-3)', padding: '0 2px', visibility: i === 0 ? 'hidden' : 'visible' }} aria-label="Naar links" onClick={() => moveEvaluation(gb.id, ev.id, -1)}>
                    <Icon name="left" size={14} />
                  </button>
                  <button className="icon-btn" style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-3)', padding: '0 2px', visibility: i === evs.length - 1 ? 'hidden' : 'visible' }} aria-label="Naar rechts" onClick={() => moveEvaluation(gb.id, ev.id, 1)}>
                    <Icon name="right" size={14} />
                  </button>
                </div>
              </th>
            ))}
            <th className="total" style={{ textAlign: 'right', padding: '8px 12px' }}>
              <div className="ev-name">Totaal</div>
              <div className="ev-meta">ingevulde evaluaties</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, r) => {
            const res = studentResult(gb, st.id);
            return (
              <tr key={st.id}>
                <td className="sticky namecell">
                  <a href={`#/leerling/${gb.classId}/${st.id}`}>
                    <span className="nr">{st.nr ?? ''}</span>
                    <span>{st.name}</span>
                  </a>
                </td>
                {evs.map((ev, c) => (
                  <ScoreCell
                    key={ev.id}
                    gb={gb}
                    ev={ev}
                    st={st}
                    r={r}
                    c={c}
                    rows={students.length}
                    cols={evs.length}
                    focusCell={focusCell}
                    onPaste={onPaste}
                  />
                ))}
                <td className="total">
                  <Pct value={res.pct} />
                  <span className="pts num">{res.max ? `${fmtNum(res.got)} / ${fmtNum(res.max)}` : 'nog niets'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky namecell" style={{ textAlign: 'left' }}>
              <strong>Gemiddelde</strong> <span className="faint small">· ingevuld</span>
            </td>
            {evs.map((ev) => {
              const s = evalStats(gb, ev, students);
              return (
                <td key={ev.id}>
                  <Pct value={s.avgPct} />
                  <div className="faint num" style={{ fontSize: 12 }}>
                    {s.entered + s.codes}/{s.total}
                  </div>
                </td>
              );
            })}
            <td className="total">
              <Pct
                value={(() => {
                  const v = students.map((s) => studentResult(gb, s.id).pct).filter((x): x is number => x !== null);
                  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
                })()}
              />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ScoreCell(props: {
  gb: Gradebook;
  ev: Evaluation;
  st: Student;
  r: number;
  c: number;
  rows: number;
  cols: number;
  focusCell: (r: number, c: number) => void;
  onPaste: (r: number, c: number, e: React.ClipboardEvent<HTMLInputElement>) => Score | undefined;
}) {
  const { gb, ev, st, r, c } = props;
  const score = getScore(gb, ev.id, st.id);
  const [text, setText] = useState(fmtScore(score));
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setText(fmtScore(score));
  }, [score, focused]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    // Ongewijzigd (bv. 3,125 dat als 3,13 getoond wordt): niets aanpassen.
    if (text === fmtScore(score)) return;
    const v = parseScoreInput(text);
    setScore(gb.id, ev.id, st.id, v);
    setText(fmtScore(v));
  };

  const current = focused ? parseScoreInput(text) : score;
  const cls = [
    'score',
    isNum(current) && ev.max > 0 && current / ev.max < 0.5 ? 'low' : '',
    typeof current === 'string' ? 'code' : '',
    isNum(current) && current > ev.max ? 'over' : '',
  ].join(' ');

  return (
    <td className={cls}>
      <input
        aria-label={`${st.name}, ${ev.name}, op ${fmtNum(ev.max)}`}
        title={isNum(current) && current > ev.max ? `Meer dan het maximum (${fmtNum(ev.max)})` : isNum(current) ? fmtPct(current / ev.max) : undefined}
        data-r={r}
        data-c={c}
        data-ev={ev.id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onPaste={(e) => {
          const v = props.onPaste(r, c, e);
          if (v !== undefined) {
            // het vak toont meteen de geplakte waarde, zodat het verlaten ervan niets overschrijft
            setText(fmtScore(v));
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
          const atEnd = el.selectionStart === el.value.length;
          const all = el.selectionStart === 0 && el.selectionEnd === el.value.length;
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            commit();
            if (e.key === 'Enter' && e.shiftKey) props.focusCell(Math.max(0, r - 1), c);
            else if (r < props.rows - 1) props.focusCell(r + 1, c);
            else el.blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            commit();
            props.focusCell(Math.max(0, r - 1), c);
          } else if (e.key === 'ArrowRight' && (atEnd || all) && c < props.cols - 1) {
            e.preventDefault();
            commit();
            props.focusCell(r, c + 1);
          } else if (e.key === 'ArrowLeft' && (atStart || all) && c > 0) {
            e.preventDefault();
            commit();
            props.focusCell(r, c - 1);
          } else if (e.key === 'Escape') {
            cancelled.current = true;
            setText(fmtScore(score));
            el.blur();
          }
        }}
      />
    </td>
  );
}
