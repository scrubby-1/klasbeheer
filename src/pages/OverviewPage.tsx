import { useState } from 'react';
import { Icon, Pct, Progress, Strip, useData } from '../components/ui.tsx';
import { EvaluationDialog } from '../components/EvaluationDialog.tsx';
import { NewClassDialog } from './ClassPage.tsx';
import {
  activeStudents, evalStats, fmtDate, fmtPct, gradebookStats, sortClasses, studentResult,
} from '../lib/calc.ts';

export function OverviewPage() {
  const data = useData();
  const [newEval, setNewEval] = useState(false);
  const [newClass, setNewClass] = useState(false);
  const classes = sortClasses(data.classes);

  if (!classes.length) {
    return (
      <div className="page">
        <div className="panel" style={{ marginTop: 40 }}>
          <div className="empty" style={{ padding: '56px 24px' }}>
            <h1>Je klassen en punten op één plaats</h1>
            <p style={{ maxWidth: 520 }}>
              Importeer je bestaande Excel-puntenboek: elk tabblad wordt een klas met een vak, en de punten en maxima worden
              overgenomen. Je kan ook met een lege klas beginnen.
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <a className="btn primary" href="#/import">
                <Icon name="upload" /> Puntenboek importeren
              </a>
              <button className="btn" onClick={() => setNewClass(true)}>
                <Icon name="plus" /> Klas aanmaken
              </button>
            </div>
          </div>
        </div>
        {newClass && <NewClassDialog onClose={() => setNewClass(false)} />}
      </div>
    );
  }

  const studentsTotal = classes.reduce((n, c) => n + activeStudents(c).length, 0);
  const evCount = data.gradebooks.reduce((n, g) => n + g.evaluations.length, 0);
  let missing = 0;
  const recent: { gbId: string; classId: string; className: string; subject: string; evId: string; name: string; date?: string; createdAt: string; filled: number; avg: number | null }[] = [];
  for (const gb of data.gradebooks) {
    const cls = data.classes.find((c) => c.id === gb.classId);
    const sts = activeStudents(cls);
    for (const ev of gb.evaluations) {
      const s = evalStats(gb, ev, sts);
      missing += s.missing;
      recent.push({
        gbId: gb.id, classId: gb.classId, className: cls?.name ?? '?', subject: gb.subject, evId: ev.id, name: ev.name,
        date: ev.date, createdAt: ev.createdAt, filled: s.total ? (s.entered + s.codes) / s.total : 0, avg: s.avgPct,
      });
    }
  }
  recent.sort((a, b) => (b.date ?? b.createdAt.slice(0, 10)).localeCompare(a.date ?? a.createdAt.slice(0, 10)) || b.createdAt.localeCompare(a.createdAt));
  const incomplete = recent.filter((r) => r.filled < 1);

  // leerlingen onder 50% in minstens één vak
  const attention: { classId: string; className: string; studentId: string; name: string; items: { subject: string; pct: number; gbId: string }[] }[] = [];
  for (const cls of classes) {
    for (const st of activeStudents(cls)) {
      const items = data.gradebooks
        .filter((g) => g.classId === cls.id)
        .map((g) => ({ subject: g.subject, pct: studentResult(g, st.id).pct, gbId: g.id }))
        .filter((x): x is { subject: string; pct: number; gbId: string } => x.pct !== null && x.pct < 0.5);
      if (items.length) attention.push({ classId: cls.id, className: cls.name, studentId: st.id, name: st.name, items });
    }
  }
  attention.sort((a, b) => Math.min(...a.items.map((i) => i.pct)) - Math.min(...b.items.map((i) => i.pct)));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Overzicht</h1>
        <div className="actions">
          <button className="btn primary" onClick={() => setNewEval(true)} disabled={!data.gradebooks.length}>
            <Icon name="plus" /> Nieuwe evaluatie
          </button>
          <a className="btn" href="#/import">
            <Icon name="upload" /> Importeren
          </a>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="v">{classes.length}</div><div className="l">klassen</div></div>
        <div className="stat"><div className="v">{studentsTotal}</div><div className="l">leerlingen</div></div>
        <div className="stat"><div className="v">{evCount}</div><div className="l">evaluaties</div></div>
        <div className="stat">
          <div className="v" style={{ color: missing ? 'var(--warn)' : undefined }}>{missing}</div>
          <div className="l">punten nog niet ingevuld</div>
        </div>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>Klassen en vakken</h2>
            <span className="small muted">elke stip is een leerling · rood is onder 50% · streep is het gemiddelde</span>
          </div>
          <div>
            {classes.map((cls) => {
              const gbs = data.gradebooks.filter((g) => g.classId === cls.id).sort((a, b) => a.subject.localeCompare(b.subject, 'nl'));
              return (
                <div className="class-block" key={cls.id}>
                  <div className="class-block-head">
                    <a href={`#/klas/${cls.id}`}>{cls.name}</a>
                    <span className="small muted">{activeStudents(cls).length} leerlingen</span>
                  </div>
                  {gbs.length === 0 && <p className="small faint">Nog geen vak. Open de klas om een puntenboek toe te voegen.</p>}
                  {gbs.map((g) => {
                    const st = gradebookStats(g, cls);
                    return (
                      <a className="gb-line" key={g.id} href={`#/puntenboek/${g.id}`}>
                        <span className="gb-name">
                          {g.subject}{' '}
                          <span className="faint small">· {g.evaluations.length} eval.</span>
                        </span>
                        <Strip values={st.pcts.map((p) => p.pct)} avg={st.avgPct} />
                        <Pct value={st.avgPct} />
                      </a>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <section className="panel">
            <div className="panel-head">
              <h2>Nog in te vullen</h2>
              <a className="small" href="#/evaluaties">Alle evaluaties</a>
            </div>
            {incomplete.length === 0 ? (
              <p className="panel-body muted">Alle punten zijn ingevuld.</p>
            ) : (
              incomplete.slice(0, 6).map((r) => (
                <a className="attn-item" key={r.evId} href={`#/puntenboek/${r.gbId}/${r.evId}`}>
                  <span>
                    <strong>{r.name}</strong>
                    <span className="small muted"> · {r.className} {r.subject}{r.date ? ` · ${fmtDate(r.date)}` : ''}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="small num">
                    <Progress value={r.filled} /> {fmtPct(r.filled)}
                  </span>
                </a>
              ))
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Onder 50%</h2>
              <span className="small muted">{attention.length} leerlingen</span>
            </div>
            {attention.length === 0 ? (
              <p className="panel-body muted">Geen enkele leerling staat onder 50%.</p>
            ) : (
              attention.slice(0, 12).map((a) => (
                <a className="attn-item" key={a.studentId} href={`#/leerling/${a.classId}/${a.studentId}`}>
                  <span>
                    {a.name} <span className="small muted">· {a.className}</span>
                  </span>
                  <span className="small" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {a.items.map((i) => (
                      <span className="tag bad" key={i.gbId}>
                        {i.subject} {fmtPct(i.pct)}
                      </span>
                    ))}
                  </span>
                </a>
              ))
            )}
          </section>
        </div>
      </div>

      {newEval && <EvaluationDialog onClose={() => setNewEval(false)} onSaved={(gb, ev) => (location.hash = `#/puntenboek/${gb}/${ev}`)} />}
    </div>
  );
}
