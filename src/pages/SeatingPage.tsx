import { useEffect, useMemo, useRef, useState } from 'react';
import { Confirm, Icon, toast, useData } from '../components/ui.tsx';
import { fmtPct, pctTone, studentResult } from '../lib/calc.ts';
import {
  MAX_DESKS, createPlan, lastUsedRow, moveStudent, normalizePlan, orderInPlan, reflowPlan, seatKey, seatableStudents, seatsPerDesk,
  shuffled, splitName, fillPlan,
} from '../lib/seating.ts';
import { setSeating, undo } from '../lib/store.ts';
import type { SchoolClass, SeatingMode, SeatingPlan, Student } from '../lib/types.ts';

export function ClassTabs({ cls, active }: { cls: SchoolClass; active: 'klas' | 'plan' }) {
  return (
    <nav className="tabs" aria-label={`Onderdelen van ${cls.name}`}>
      <a href={`#/klas/${cls.id}`} className={active === 'klas' ? 'on' : ''} aria-current={active === 'klas' ? 'page' : undefined}>
        Leerlingen en vakken
      </a>
      <a href={`#/klas/${cls.id}/plan`} className={active === 'plan' ? 'on' : ''} aria-current={active === 'plan' ? 'page' : undefined}>
        Klasplan
      </a>
    </nav>
  );
}

export function SeatingPage({ id }: { id: string }) {
  const data = useData();
  const cls = data.classes.find((c) => c.id === id);

  // Een plan van een ander toestel of uit een oude versie meteen in orde brengen.
  useEffect(() => {
    if (!cls?.seating) return;
    const r = normalizePlan(cls.seating, cls);
    if (r.changed) setSeating(cls.id, r.plan, { undoable: false });
  }, [cls]);

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

  return (
    <div className="page seating-page">
      <div className="page-head">
        <div>
          <div className="crumbs"><a href="#/">Overzicht</a></div>
          <h1>Klasplan {cls.name}</h1>
        </div>
      </div>
      <ClassTabs cls={cls} active="plan" />
      {cls.seating ? <Plan cls={cls} plan={cls.seating} /> : <Setup cls={cls} />}
    </div>
  );
}

/* ---------- eerste keer: apart of per 2 ---------- */

function Setup({ cls }: { cls: SchoolClass }) {
  const n = seatableStudents(cls).length;
  const [mode, setMode] = useState<SeatingMode>('duo');
  const [desks, setDesks] = useState(3);
  const perRow = desks * seatsPerDesk(mode);
  return (
    <section className="panel">
      <div className="panel-body setup">
        <h2>Hoe zitten de leerlingen?</h2>
        <p className="muted">
          Kies de opstelling van het lokaal. De {n} leerlingen krijgen een vaste plaats in volgorde van hun nummer; daarna kan je ze verslepen.
          Nieuwe leerlingen krijgen automatisch de eerste vrije plaats, en als het lokaal vol is komt er een rij bij.
        </p>
        <div className="setup-choices" role="radiogroup" aria-label="Opstelling">
          {(['apart', 'duo'] as SeatingMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={`setup-choice${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>
              <MiniRoom mode={m} />
              <strong>{m === 'apart' ? 'Apart' : 'Per 2'}</strong>
              <span className="small muted">{m === 'apart' ? 'één leerling per bank' : 'twee leerlingen per bank'}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <Stepper label="Banken per rij" value={desks} min={1} max={MAX_DESKS} onChange={setDesks} />
          <span className="small muted">
            {perRow} leerlingen per rij · {Math.max(1, Math.ceil(n / perRow))} rijen
          </span>
        </div>
        <div>
          <button className="btn primary" onClick={() => setSeating(cls.id, createPlan(cls, mode, desks))}>
            Klasplan maken
          </button>
        </div>
      </div>
    </section>
  );
}

function MiniRoom({ mode }: { mode: SeatingMode }) {
  const per = seatsPerDesk(mode);
  return (
    <svg width="120" height="64" viewBox="0 0 120 64" aria-hidden="true">
      <rect x="30" y="2" width="60" height="6" rx="2" fill="var(--board)" />
      {[0, 1].map((r) =>
        [0, 1, 2].map((c) => {
          const w = per === 2 ? 30 : 18;
          const gap = per === 2 ? 8 : 20;
          const x = 60 - (3 * w + 2 * gap) / 2 + c * (w + gap);
          return <rect key={`${r}${c}`} x={x} y={18 + r * 24} width={w} height={14} rx="3" fill="var(--desk)" stroke="var(--desk-edge)" />;
        }),
      )}
    </svg>
  );
}

function Stepper(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <span className="small">{props.label}</span>
      <button className="icon-btn" aria-label={`${props.label} min één`} disabled={props.value <= props.min} onClick={() => props.onChange(props.value - 1)}>−</button>
      <span className="num" aria-live="polite">{props.value}</span>
      <button className="icon-btn" aria-label={`${props.label} plus één`} disabled={props.value >= props.max} onClick={() => props.onChange(props.value + 1)}>+</button>
    </div>
  );
}

/* ---------- het plan ---------- */

type Overlay = '' | string; // '' = niets, anders puntenboek-id

function Plan({ cls, plan }: { cls: SchoolClass; plan: SeatingPlan }) {
  const data = useData();
  const students = useMemo(() => new Map(cls.students.map((s) => [s.id, s])), [cls.students]);
  const gbs = data.gradebooks.filter((g) => g.classId === cls.id).sort((a, b) => a.subject.localeCompare(b.subject, 'nl'));
  const [selected, setSelected] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('');
  const [ask, setAsk] = useState<null | { text: string; run: () => void }>(null);
  const [flip, setFlip] = useState(false);
  const per = seatsPerDesk(plan.mode);
  const rows = plan.rows;
  const count = Object.keys(plan.seats).length;
  const capacity = rows * plan.desksPerRow * per;
  const gb = gbs.find((g) => g.id === overlay);

  const save = (p: SeatingPlan, msg?: string) => {
    setSeating(cls.id, p);
    setSelected(null);
    if (msg) toast(msg, { label: 'Ongedaan maken', run: undo });
  };

  const move = (studentId: string, target: string) => save(moveStudent(plan, studentId, target));

  /* --- slepen met muis, pen of vinger --- */
  const drag = useRef<null | { id: string; el: HTMLElement; x: number; y: number; moved: boolean; ghost?: HTMLElement; over?: HTMLElement | null }>(null);

  useEffect(() => {
    const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.seat') ?? null;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      if (!d.moved) {
        d.moved = true;
        d.el.classList.add('dragging');
        const g = d.el.cloneNode(true) as HTMLElement;
        g.classList.remove('dragging', 'sel');
        g.classList.add('seat-ghost');
        g.style.width = `${d.el.getBoundingClientRect().width}px`;
        document.body.appendChild(g);
        d.ghost = g;
      }
      e.preventDefault();
      d.ghost!.style.left = `${e.clientX - d.ghost!.offsetWidth / 2}px`;
      d.ghost!.style.top = `${e.clientY - d.ghost!.offsetHeight / 2}px`;
      const t = targetAt(e.clientX, e.clientY);
      if (d.over && d.over !== t) d.over.classList.remove('over');
      t?.classList.add('over');
      d.over = t;
    };
    const end = (e: PointerEvent, cancel: boolean) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      d.ghost?.remove();
      d.el.classList.remove('dragging');
      d.over?.classList.remove('over');
      if (cancel || !d.moved) return;
      lastDrag.current = Date.now();
      const t = targetAt(e.clientX, e.clientY);
      if (t?.dataset.seat) moveRef.current(d.id, t.dataset.seat);
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);
  const lastDrag = useRef(0);
  const moveRef = useRef(move);
  moveRef.current = move;

  // tikken: leerling kiezen, dan de doelplaats
  const onSeatClick = (key: string, occupant?: string) => {
    if (drag.current?.moved || Date.now() - lastDrag.current < 120) return;
    if (selected) {
      if (selected === occupant) setSelected(null);
      else move(selected, key);
    } else if (occupant) setSelected(occupant);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reorder = (label: string, order: (list: Student[]) => Student[]) =>
    setAsk({
      text: `Alle leerlingen ${label} herverdelen? De huidige plaatsen gaan verloren (je kan dit ongedaan maken).`,
      run: () => save({ ...fillPlan(plan, order(seatableStudents(cls)), 1), updatedAt: plan.updatedAt }, 'Leerlingen herverdeeld'),
    });

  const changeLayout = (mode: SeatingMode, desks: number) => save(reflowPlan(plan, cls, mode, desks));

  const rowOrder = Array.from({ length: rows }, (_, i) => i);
  if (flip) rowOrder.reverse();
  const deskOrder = Array.from({ length: plan.desksPerRow }, (_, i) => i);
  if (flip) deskOrder.reverse();
  const seatOrderInDesk = Array.from({ length: per }, (_, i) => i);
  if (flip) seatOrderInDesk.reverse();

  let deskNr = 0;
  const deskNrs = new Map<string, number>();
  for (let r = 0; r < rows; r++) for (let c = 0; c < plan.desksPerRow; c++) deskNrs.set(`${r}-${c}`, ++deskNr);

  return (
    <>
      <div className="seat-tools no-print">
        <div className="seg" role="group" aria-label="Opstelling">
          <button className={plan.mode === 'apart' ? 'on' : ''} onClick={() => plan.mode !== 'apart' && changeLayout('apart', plan.desksPerRow)}>Apart</button>
          <button className={plan.mode === 'duo' ? 'on' : ''} onClick={() => plan.mode !== 'duo' && changeLayout('duo', plan.desksPerRow)}>Per 2</button>
        </div>
        <Stepper label="Banken per rij" value={plan.desksPerRow} min={1} max={MAX_DESKS} onChange={(n) => changeLayout(plan.mode, n)} />
        <div className="actions">
          <button className="btn small" onClick={() => save({ ...plan, rows: plan.rows + 1 })}>
            <Icon name="plus" size={15} /> Rij
          </button>
          <button
            className="btn small"
            disabled={rows <= 1 || lastUsedRow(plan) >= rows - 1}
            title={lastUsedRow(plan) >= rows - 1 ? 'De achterste rij is niet leeg' : undefined}
            onClick={() => save({ ...plan, rows: plan.rows - 1 })}
          >
            − Lege rij
          </button>
        </div>
        <div className="actions">
          <button className="btn small" onClick={() => reorder('op nummer', (l) => l)}>Op nummer</button>
          <button className="btn small" onClick={() => reorder('alfabetisch op voornaam', (l) => [...l].sort((a, b) => splitName(a.name).first.localeCompare(splitName(b.name).first, 'nl')))}>Op voornaam</button>
          <button className="btn small" onClick={() => reorder('willekeurig', (l) => shuffled(l))}>Willekeurig</button>
          <button className="btn small" onClick={() => reorder('zonder lege plaatsen tussenin', () => orderInPlan(plan, seatableStudents(cls)))}>Lege plaatsen opvullen</button>
        </div>
      </div>

      <div className="seat-tools no-print">
        <label className="field-inline small">
          Toon resultaat
          <select className="input" value={overlay} onChange={(e) => setOverlay(e.target.value)}>
            <option value="">niets</option>
            {gbs.map((g) => <option key={g.id} value={g.id}>{g.subject}</option>)}
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Bekijken vanaf achteraan
        </label>
        <span className="small muted" style={{ marginLeft: 'auto' }}>
          {count} leerlingen · {capacity} plaatsen · {capacity - count} vrij
        </span>
        <button className="btn small" onClick={() => window.print()}>Afdrukken</button>
      </div>

      <section className={`room${flip ? ' flipped' : ''}`} aria-label={`Klaslokaal ${cls.name}`}>
        <div className="print-title">Klasplan {cls.name}</div>
        {!flip && <div className="board">Bord</div>}
        {!flip && <div className="teacher-desk">Lessenaar</div>}
        <div className="desks" style={{ gridTemplateColumns: `repeat(${plan.desksPerRow}, minmax(${per === 2 ? 188 : 104}px, 1fr))` }}>
          {rowOrder.map((r) =>
            deskOrder.map((c) => (
              <div key={`${r}-${c}`} className={`desk${per === 2 ? ' duo' : ''}`}>
                <span className="desk-nr">{deskNrs.get(`${r}-${c}`)}</span>
                {seatOrderInDesk.map((s) => {
                  const key = seatKey(r, c, s);
                  const id = plan.seats[key];
                  const st = id ? students.get(id) : undefined;
                  const res = st && gb ? studentResult(gb, st.id) : null;
                  const nm = st ? splitName(st.name) : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-seat={key}
                      className={`seat${st ? '' : ' empty'}${selected && selected === id ? ' sel' : ''}${selected && selected !== id ? ' target' : ''}`}
                      aria-label={st ? `${st.name}, bank ${deskNrs.get(`${r}-${c}`)}${selected ? (selected === id ? ', gekozen' : ', hierheen verplaatsen') : ''}` : `Lege plaats, bank ${deskNrs.get(`${r}-${c}`)}`}
                      aria-pressed={selected === id && !!id}
                      onPointerDown={(e) => {
                        if (!id || e.button > 0) return;
                        drag.current = { id, el: e.currentTarget, x: e.clientX, y: e.clientY, moved: false };
                      }}
                      onClick={() => onSeatClick(key, id)}
                    >
                      {st && nm && (
                        <>
                          <span className="first">{nm.first}</span>
                          <span className="last">{nm.last}</span>
                          {res && <span className={`seat-pct pct ${pctTone(res.pct)}`}>{fmtPct(res.pct)}</span>}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            )),
          )}
        </div>
        {flip && <div className="teacher-desk" style={{ justifySelf: 'start' }}>Lessenaar</div>}
        {flip && <div className="board">Bord</div>}
      </section>

      <p className="small muted no-print" style={{ maxWidth: '75ch' }}>
        Sleep een leerling naar een andere plaats; zit daar al iemand, dan wisselen ze. Op een tablet of met het toetsenbord: kies eerst een leerling
        en daarna de nieuwe plaats. Nieuwe leerlingen krijgen automatisch de eerste vrije plaats; gearchiveerde leerlingen maken hun plaats vrij.
      </p>

      {ask && (
        <Confirm title="Herverdelen?" text={ask.text} confirmLabel="Herverdelen" onClose={() => setAsk(null)} onConfirm={ask.run} />
      )}
    </>
  );
}
