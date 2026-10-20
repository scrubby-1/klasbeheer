import { useState } from 'react';
import { Icon, Pct, Progress, go, useData } from '../components/ui.tsx';
import { EvaluationDialog } from '../components/EvaluationDialog.tsx';
import { activeStudents, evalStats, fmtDate, fmtNum, normName, sortClasses } from '../lib/calc.ts';
import { EVALUATION_TYPES } from '../lib/types.ts';

type SortKey = 'date' | 'class' | 'name' | 'avg' | 'filled';

export function EvaluationsPage() {
  const data = useData();
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('date');
  const [asc, setAsc] = useState(false);
  const [newEval, setNewEval] = useState(false);

  const classes = sortClasses(data.classes);
  const subjects = [...new Set(data.gradebooks.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, 'nl'));

  const rows = data.gradebooks.flatMap((gb) => {
    const cls = data.classes.find((c) => c.id === gb.classId);
    const sts = activeStudents(cls);
    return gb.evaluations.map((ev, i) => {
      const s = evalStats(gb, ev, sts);
      return { gb, cls, ev, s, order: i, filled: s.total ? (s.entered + s.codes) / s.total : 0 };
    });
  });

  const filtered = rows
    .filter((r) => !classId || r.gb.classId === classId)
    .filter((r) => !subject || r.gb.subject === subject)
    .filter((r) => !type || (r.ev.type ?? '') === type)
    .filter((r) => !onlyOpen || r.filled < 1)
    .filter((r) => !q || normName(`${r.ev.name} ${r.cls?.name} ${r.gb.subject}`).includes(normName(q)));

  const dateKey = (r: (typeof rows)[number]) => r.ev.date ?? r.ev.createdAt.slice(0, 10);
  const byClass = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    (a.cls?.name ?? '').localeCompare(b.cls?.name ?? '', 'nl', { numeric: true }) || a.gb.subject.localeCompare(b.gb.subject, 'nl') || a.order - b.order;
  filtered.sort((a, b) => {
    let d = 0;
    if (sort === 'date') d = dateKey(a).localeCompare(dateKey(b));
    if (sort === 'class') d = byClass(a, b);
    if (sort === 'name') d = a.ev.name.localeCompare(b.ev.name, 'nl', { numeric: true });
    if (sort === 'avg') d = (a.s.avgPct ?? -1) - (b.s.avgPct ?? -1);
    if (sort === 'filled') d = a.filled - b.filled;
    return (asc ? d : -d) || byClass(a, b);
  });

  const th = (key: SortKey, label: string, r = false) => (
    <th
      className={`sortable${r ? ' r' : ''}`}
      onClick={() => {
        if (sort === key) setAsc(!asc);
        else {
          setSort(key);
          setAsc(key === 'class' || key === 'name');
        }
      }}
      aria-sort={sort === key ? (asc ? 'ascending' : 'descending') : 'none'}
    >
      {label} {sort === key ? (asc ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Evaluaties</h1>
          <p className="muted" style={{ marginTop: 6 }}>Alle evaluaties van al je klassen en vakken in één lijst.</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setNewEval(true)} disabled={!data.gradebooks.length}>
            <Icon name="plus" /> Nieuwe evaluatie
          </button>
        </div>
      </div>

      <div className="filters">
        <input className="input search" placeholder="Zoek op evaluatie, klas of vak" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Zoeken" />
        <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Klas">
          <option value="">Alle klassen</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Vak">
          <option value="">Alle vakken</option>
          {subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Soort">
          <option value="">Alle soorten</option>
          {EVALUATION_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="check small">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Enkel onvolledig ingevuld
        </label>
      </div>

      <section className="panel">
        {filtered.length === 0 ? (
          <div className="empty">
            <p>{rows.length ? 'Geen evaluaties gevonden met deze filters.' : 'Nog geen evaluaties. Importeer een puntenboek of voeg een evaluatie toe.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  {th('date', 'Datum')}
                  {th('class', 'Klas · vak')}
                  {th('name', 'Evaluatie')}
                  <th className="r">Max</th>
                  {th('filled', 'Ingevuld', true)}
                  {th('avg', 'Gemiddelde', true)}
                  <th className="r">Onder 50%</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ gb, cls, ev, s, filled }) => (
                  <tr key={ev.id} className="clickable" onClick={() => go(`puntenboek/${gb.id}/${ev.id}`)}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{ev.date ? fmtDate(ev.date) : <span className="faint">geen datum</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><strong>{cls?.name}</strong> <span className="muted">{gb.subject}</span></td>
                    <td>
                      <a href={`#/puntenboek/${gb.id}/${ev.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--ink)' }}>{ev.name}</a>
                      {ev.type && <span className="tag" style={{ marginLeft: 8 }}>{ev.type}</span>}
                    </td>
                    <td className="r num">{fmtNum(ev.max)}</td>
                    <td className="r">
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }} className="num small">
                        <Progress value={filled} /> {s.entered + s.codes}/{s.total}
                      </span>
                    </td>
                    <td className="r"><Pct value={s.avgPct} /></td>
                    <td className="r num">{s.below50 ? <span className="tag bad">{s.below50}</span> : s.entered ? 0 : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {newEval && <EvaluationDialog onClose={() => setNewEval(false)} onSaved={(gb, ev) => go(`puntenboek/${gb}/${ev}`)} />}
    </div>
  );
}
