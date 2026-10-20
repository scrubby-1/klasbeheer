import { useState } from 'react';
import { Confirm, Dialog, Icon, Pct, go, toast, useData } from '../components/ui.tsx';
import { gradebookStats, sortStudents, studentResult } from '../lib/calc.ts';
import {
  addClass, addGradebook, addStudents, deleteClass, deleteStudent, undo, updateClass, updateStudent,
} from '../lib/store.ts';
import type { SchoolClass, Student } from '../lib/types.ts';

export function NewClassDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [tit, setTit] = useState('');
  const [subject, setSubject] = useState('');
  const [students, setStudents] = useState('');
  const save = () => {
    if (!name.trim()) return;
    const id = addClass(name, tit.trim());
    const names = students.split(/\r?\n/).map((s) => s.replace(/^\s*\d+[.)\t ]+/, '').trim()).filter(Boolean);
    if (names.length) addStudents(id, names);
    if (subject.trim()) addGradebook(id, subject);
    onClose();
    go(`klas/${id}`);
  };
  return (
    <Dialog
      title="Nieuwe klas"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Annuleren</button>
          <button className="btn primary" disabled={!name.trim()} onClick={save}>Klas aanmaken</button>
        </>
      }
    >
      <div className="row">
        <label className="field">
          <span>Naam van de klas</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. b4BOa" />
        </label>
        <label className="field">
          <span>Eerste vak (optioneel)</span>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="bv. Labo" />
        </label>
      </div>
      <label className="field">
        <span>Klastitularis (optioneel)</span>
        <input className="input" value={tit} onChange={(e) => setTit(e.target.value)} />
      </label>
      <label className="field">
        <span>Leerlingen, één per regel (optioneel)</span>
        <textarea className="input" value={students} onChange={(e) => setStudents(e.target.value)} placeholder={'Peeters An\nJanssens Bo'} />
      </label>
    </Dialog>
  );
}

export function ClassPage({ id }: { id: string }) {
  const data = useData();
  const cls = data.classes.find((c) => c.id === id);
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Student | null>(null);
  const [editClass, setEditClass] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [del, setDel] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (!cls) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Deze klas bestaat niet meer</h2>
          <a className="btn" href="#/">Naar het overzicht</a>
        </div>
      </div>
    );
  }
  const gbs = data.gradebooks.filter((g) => g.classId === id).sort((a, b) => a.subject.localeCompare(b.subject, 'nl'));
  const all = sortStudents(cls.students);
  const archivedCount = all.filter((s) => s.archived).length;
  const students = all.filter((s) => showArchived || !s.archived);

  const createGb = () => {
    if (!newSubject.trim()) return;
    const gid = addGradebook(id, newSubject);
    setNewSubject('');
    go(`puntenboek/${gid}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><a href="#/">Overzicht</a></div>
          <h1>{cls.name}</h1>
          {cls.titularis && <p className="muted" style={{ marginTop: 6 }}>Klastitularis: {cls.titularis}</p>}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" /> Leerlingen toevoegen
          </button>
          <button className="btn ghost" onClick={() => setEditClass(true)}>Klas bewerken</button>
          <button className="btn ghost danger" onClick={() => setDel(true)}>Verwijderen</button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Vakken</h2>
          <form
            className="actions"
            onSubmit={(e) => {
              e.preventDefault();
              createGb();
            }}
          >
            <input className="input" style={{ width: 200 }} placeholder="Nieuw vak, bv. Labo" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} aria-label="Naam van het nieuwe vak" />
            <button className="btn" disabled={!newSubject.trim()}>Vak toevoegen</button>
          </form>
        </div>
        {gbs.length === 0 ? (
          <p className="panel-body muted">Nog geen vakken. Voeg een vak toe om een puntenboek te starten.</p>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Vak</th>
                  <th className="r">Evaluaties</th>
                  <th className="r">Gemiddelde</th>
                  <th className="r">Onder 50%</th>
                  <th className="r">Nog in te vullen</th>
                </tr>
              </thead>
              <tbody>
                {gbs.map((g) => {
                  const s = gradebookStats(g, cls);
                  return (
                    <tr key={g.id} className="clickable" onClick={() => go(`puntenboek/${g.id}`)}>
                      <td><a href={`#/puntenboek/${g.id}`} onClick={(e) => e.stopPropagation()}><strong>{g.subject}</strong></a></td>
                      <td className="r num">{g.evaluations.length}</td>
                      <td className="r"><Pct value={s.avgPct} /></td>
                      <td className="r num">{s.below50 ? <span className="tag bad">{s.below50}</span> : 0}</td>
                      <td className="r num">{s.missingCells || '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Leerlingen <span className="muted small">({all.length - archivedCount})</span></h2>
          {archivedCount > 0 && (
            <label className="check small">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Toon {archivedCount} gearchiveerde
            </label>
          )}
        </div>
        {students.length === 0 ? (
          <div className="empty">
            <p>Nog geen leerlingen in deze klas.</p>
            <button className="btn primary" onClick={() => setAddOpen(true)}>Leerlingen toevoegen</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Nr.</th>
                  <th>Leerling</th>
                  {gbs.map((g) => (
                    <th key={g.id} className="r">{g.subject}</th>
                  ))}
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className={`clickable${s.archived ? ' archived' : ''}`} onClick={() => go(`leerling/${id}/${s.id}`)}>
                    <td className="num faint">{s.nr ?? ''}</td>
                    <td>
                      <a href={`#/leerling/${id}/${s.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--ink)' }}>{s.name}</a>
                      {s.archived && <span className="tag" style={{ marginLeft: 8 }}>gearchiveerd</span>}
                    </td>
                    {gbs.map((g) => (
                      <td key={g.id} className="r"><Pct value={studentResult(g, s.id).pct} /></td>
                    ))}
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" aria-label={`${s.name} bewerken`} onClick={() => setEdit(s)}>
                        <Icon name="edit" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {addOpen && <AddStudentsDialog cls={cls} onClose={() => setAddOpen(false)} />}
      {edit && <EditStudentDialog cls={cls} st={edit} onClose={() => setEdit(null)} />}
      {editClass && <EditClassDialog cls={cls} onClose={() => setEditClass(false)} />}
      {del && (
        <Confirm
          title={`Klas ${cls.name} verwijderen?`}
          text={`De klas, ${cls.students.length} leerlingen en ${gbs.length} puntenboeken met alle punten worden verwijderd.`}
          confirmLabel="Klas verwijderen"
          danger
          onClose={() => setDel(false)}
          onConfirm={() => {
            deleteClass(cls.id);
            go('');
            toast('Klas verwijderd', { label: 'Ongedaan maken', run: undo });
          }}
        />
      )}
    </div>
  );
}

function AddStudentsDialog({ cls, onClose }: { cls: SchoolClass; onClose: () => void }) {
  const [text, setText] = useState('');
  const names = text.split(/\r?\n/).map((s) => s.replace(/^\s*\d+[.)\t ]+/, '').trim()).filter(Boolean);
  return (
    <Dialog
      title={`Leerlingen toevoegen aan ${cls.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Annuleren</button>
          <button
            className="btn primary"
            disabled={!names.length}
            onClick={() => {
              addStudents(cls.id, names);
              toast(`${names.length} leerling(en) toegevoegd`);
              onClose();
            }}
          >
            {names.length > 1 ? `${names.length} leerlingen toevoegen` : 'Leerling toevoegen'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Eén naam per regel. Je kan een kolom uit Excel of Smartschool plakken.</span>
        <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Peeters An\nJanssens Bo'} />
      </label>
    </Dialog>
  );
}

function EditStudentDialog({ cls, st, onClose }: { cls: SchoolClass; st: Student; onClose: () => void }) {
  const [name, setName] = useState(st.name);
  const [nr, setNr] = useState(st.nr != null ? String(st.nr) : '');
  const [note, setNote] = useState(st.note ?? '');
  const [confirm, setConfirm] = useState(false);
  const save = () => {
    updateStudent(cls.id, st.id, { name: name.trim() || st.name, nr: nr.trim() ? Number(nr) : null, note: note.trim() || undefined });
    onClose();
  };
  return (
    <Dialog
      title="Leerling bewerken"
      onClose={onClose}
      footer={
        <>
          {!confirm ? (
            <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setConfirm(true)}>Verwijderen</button>
          ) : (
            <button
              className="btn danger solid"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                deleteStudent(cls.id, st.id);
                toast(`${st.name} verwijderd`, { label: 'Ongedaan maken', run: undo });
                onClose();
              }}
            >
              Leerling en punten verwijderen
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              updateStudent(cls.id, st.id, { archived: !st.archived });
              toast(st.archived ? `${st.name} is terug actief` : `${st.name} gearchiveerd (telt niet meer mee, punten blijven bewaard)`);
              onClose();
            }}
          >
            {st.archived ? 'Terug actief maken' : 'Archiveren'}
          </button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </>
      }
    >
      <div className="row">
        <label className="field" style={{ flex: '0 0 90px' }}>
          <span>Nr.</span>
          <input className="input num" inputMode="numeric" value={nr} onChange={(e) => setNr(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span>Naam</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Notitie</span>
        <textarea className="input" style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="small muted">Archiveer een leerling die de klas verlaten heeft: de punten blijven bewaard, maar de leerling verdwijnt uit de puntenboeken.</p>
    </Dialog>
  );
}

function EditClassDialog({ cls, onClose }: { cls: SchoolClass; onClose: () => void }) {
  const [name, setName] = useState(cls.name);
  const [tit, setTit] = useState(cls.titularis ?? '');
  return (
    <Dialog
      title="Klas bewerken"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Annuleren</button>
          <button
            className="btn primary"
            onClick={() => {
              updateClass(cls.id, { name: name.trim() || cls.name, titularis: tit.trim() });
              onClose();
            }}
          >
            Opslaan
          </button>
        </>
      }
    >
      <label className="field"><span>Naam</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Klastitularis</span><input className="input" value={tit} onChange={(e) => setTit(e.target.value)} /></label>
    </Dialog>
  );
}
