import { useState } from 'react';
import { Dialog, today, useData } from './ui.tsx';
import { EVALUATION_TYPES, type Evaluation } from '../lib/types.ts';
import { addEvaluation, deleteEvaluation, updateEvaluation } from '../lib/store.ts';
import { gradebookLabel, sortClasses } from '../lib/calc.ts';

/** Nieuwe evaluatie toevoegen of een bestaande bewerken. Zonder gbId kan je het puntenboek kiezen. */
export function EvaluationDialog(props: {
  gbId?: string;
  evaluation?: Evaluation;
  onClose: () => void;
  onSaved?: (gbId: string, evId: string) => void;
}) {
  const data = useData();
  const ev = props.evaluation;
  const [gbId, setGbId] = useState(props.gbId ?? '');
  const [name, setName] = useState(ev?.name ?? '');
  const [max, setMax] = useState(ev ? String(ev.max).replace('.', ',') : '20');
  const [date, setDate] = useState(ev?.date ?? today());
  const [type, setType] = useState(ev?.type ?? 'Toets');
  const [note, setNote] = useState(ev?.note ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  const maxNum = Number(max.replace(',', '.'));
  const valid = name.trim() && maxNum > 0 && gbId;
  const order = sortClasses(data.classes).map((c) => c.id);
  const gbs = [...data.gradebooks].sort(
    (a, b) => order.indexOf(a.classId) - order.indexOf(b.classId) || a.subject.localeCompare(b.subject, 'nl'),
  );

  const save = () => {
    if (!valid) return;
    const patch = { name: name.trim(), max: maxNum, date: date || undefined, type, note: note.trim() || undefined };
    if (ev) {
      updateEvaluation(gbId, ev.id, patch);
      props.onSaved?.(gbId, ev.id);
    } else {
      const id = addEvaluation(gbId, patch);
      props.onSaved?.(gbId, id);
    }
    props.onClose();
  };

  return (
    <Dialog
      title={ev ? 'Evaluatie bewerken' : 'Nieuwe evaluatie'}
      onClose={props.onClose}
      footer={
        <>
          {ev && !confirmDel && (
            <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDel(true)}>
              Verwijderen
            </button>
          )}
          {ev && confirmDel && (
            <button
              className="btn danger solid"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                deleteEvaluation(gbId, ev.id);
                props.onClose();
              }}
            >
              Ja, evaluatie en punten verwijderen
            </button>
          )}
          <button className="btn ghost" onClick={props.onClose}>
            Annuleren
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            {ev ? 'Opslaan' : 'Evaluatie toevoegen'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {!props.gbId && (
          <label className="field">
            <span>Klas en vak</span>
            <select className="input" value={gbId} onChange={(e) => setGbId(e.target.value)}>
              <option value="">Kies een puntenboek…</option>
              {gbs.map((g) => (
                <option key={g.id} value={g.id}>
                  {gradebookLabel(data, g)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Naam</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Toets Excel week 5" />
        </label>
        <div className="row">
          <label className="field">
            <span>Maximum (punten)</span>
            <input className="input num" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <label className="field">
            <span>Datum</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Soort</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {EVALUATION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Notitie (optioneel)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="bv. leerstof hoofdstuk 3" />
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
