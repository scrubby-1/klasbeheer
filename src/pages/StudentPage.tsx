import { useState } from 'react';
import { Pct, useData } from '../components/ui.tsx';
import { fmtDate, fmtNum, fmtScore, getScore, isNum, sortStudents, studentResult } from '../lib/calc.ts';
import { updateStudent } from '../lib/store.ts';

export function StudentPage({ classId, studentId }: { classId: string; studentId: string }) {
  const data = useData();
  const cls = data.classes.find((c) => c.id === classId);
  const st = cls?.students.find((s) => s.id === studentId);
  const [note, setNote] = useState<string | null>(null);

  if (!cls || !st) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Deze leerling bestaat niet meer</h2>
          <a className="btn" href="#/">Naar het overzicht</a>
        </div>
      </div>
    );
  }
  const gbs = data.gradebooks.filter((g) => g.classId === classId).sort((a, b) => a.subject.localeCompare(b.subject, 'nl'));
  const list = sortStudents(cls.students.filter((s) => !s.archived));
  const idx = list.findIndex((s) => s.id === st.id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={`#/klas/${cls.id}`}>{cls.name}</a></div>
          <h1>{st.name}</h1>
          {st.archived && <p className="muted" style={{ marginTop: 6 }}>Gearchiveerd: telt niet mee in de puntenboeken.</p>}
        </div>
        <div className="actions">
          {prev && <a className="btn ghost" href={`#/leerling/${cls.id}/${prev.id}`}>Vorige leerling</a>}
          {next && <a className="btn ghost" href={`#/leerling/${cls.id}/${next.id}`}>Volgende leerling</a>}
        </div>
      </div>

      {gbs.length === 0 && <p className="muted">Deze klas heeft nog geen puntenboek.</p>}

      {gbs.map((g) => {
        const res = studentResult(g, st.id);
        return (
          <section className="panel" key={g.id}>
            <div className="panel-head">
              <h2><a href={`#/puntenboek/${g.id}`} style={{ color: 'var(--ink)' }}>{g.subject}</a></h2>
              <span>
                <Pct value={res.pct} />{' '}
                <span className="small muted num">
                  {res.max ? `${fmtNum(res.got)} / ${fmtNum(res.max)} · ${res.count} van ${g.evaluations.length} evaluaties` : 'nog geen punten'}
                </span>
              </span>
            </div>
            {g.evaluations.length > 0 && (
              <div className="table-wrap">
                <table className="list">
                  <thead>
                    <tr>
                      <th>Evaluatie</th>
                      <th>Datum</th>
                      <th className="r">Punten</th>
                      <th className="r">Max</th>
                      <th className="r">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.evaluations.map((ev) => {
                      const s = getScore(g, ev.id, st.id);
                      return (
                        <tr key={ev.id}>
                          <td>{ev.name}</td>
                          <td className="muted small">{fmtDate(ev.date)}</td>
                          <td className="r num">{s === null ? <span className="faint">niet ingevuld</span> : isNum(s) ? fmtScore(s) : <span className="tag">{s} · telt niet mee</span>}</td>
                          <td className="r num faint">{fmtNum(ev.max)}</td>
                          <td className="r">{isNum(s) ? <Pct value={s / ev.max} /> : <span className="faint">–</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <section className="panel">
        <div className="panel-head"><h2>Notitie</h2></div>
        <div className="panel-body">
          <textarea
            className="input"
            style={{ minHeight: 90 }}
            placeholder="Bv. afspraken, attesten, opvolging…"
            value={note ?? st.note ?? ''}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== null && note !== (st.note ?? '')) updateStudent(cls.id, st.id, { note: note.trim() || undefined });
              setNote(null);
            }}
          />
        </div>
      </section>
    </div>
  );
}
