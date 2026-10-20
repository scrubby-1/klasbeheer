import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getData, subscribe } from '../lib/store.ts';
import { fmtPct, pctTone } from '../lib/calc.ts';
import type { Student } from '../lib/types.ts';

export function useData() {
  return useSyncExternalStore(subscribe, getData, getData);
}

/* ---------- routering via #hash ---------- */
export function useRoute(): string[] {
  const get = () => (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = '#/' + path.replace(/^\/+/, '');
}

/* ---------- toasts ---------- */
type ToastMsg = { text: string; action?: { label: string; run: () => void } };
let pushToast: (t: ToastMsg) => void = () => {};
export function toast(text: string, action?: ToastMsg['action']) {
  pushToast({ text, action });
}
export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>();
  useEffect(() => {
    pushToast = (t) => {
      setMsg(t);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMsg(null), t.action ? 7000 : 3500);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      <span>{msg.text}</span>
      {msg.action && (
        <button
          onClick={() => {
            msg.action!.run();
            setMsg(null);
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  );
}

/* ---------- dialoog ---------- */
export function Dialog(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button.primary');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`dialog${props.wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <div className="dialog-head">
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} aria-label="Sluiten">
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">{props.children}</div>
        {props.footer && <div className="dialog-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Confirm(props: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn ghost" onClick={props.onClose}>
            Annuleren
          </button>
          <button
            className={`btn ${props.danger ? 'danger solid' : 'primary'}`}
            onClick={() => {
              props.onConfirm();
              props.onClose();
            }}
          >
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p>{props.text}</p>
    </Dialog>
  );
}

/* ---------- kleine bouwstenen ---------- */
export function Pct({ value, digits = 0 }: { value: number | null | undefined; digits?: number }) {
  return <span className={`pct ${pctTone(value)}`}>{fmtPct(value, digits)}</span>;
}

export function Strip({ values, avg }: { values: (number | null)[]; avg: number | null }) {
  const vals = values.filter((v): v is number => v !== null);
  return (
    <div className="strip" aria-label={`Spreiding van ${vals.length} resultaten, gemiddelde ${fmtPct(avg)}`} role="img">
      <div className="axis" />
      <div className="half" title="50%" />
      {vals.map((v, i) => (
        <span key={i} className={`dot${v < 0.5 ? ' bad' : ''}`} style={{ left: `${Math.max(0, Math.min(1, v)) * 100}%` }} title={fmtPct(v)} />
      ))}
      {avg !== null && <span className="avg" style={{ left: `${Math.max(0, Math.min(1, avg)) * 100}%` }} title={`Gemiddelde ${fmtPct(avg)}`} />}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress" title={fmtPct(value)}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function StudentName({ s }: { s: Student }) {
  return <>{s.name}</>;
}

export function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const paths: Record<string, string> = {
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  trash: 'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  archive: 'M4 7h16v3H4zM6 10v9h12v-9M10 14h4',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
};
export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
