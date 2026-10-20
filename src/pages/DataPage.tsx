import { useRef, useState, useSyncExternalStore } from 'react';
import { Confirm, Icon, download, toast, useData } from '../components/ui.tsx';
import { exportWorkbook } from '../lib/exporter.ts';
import { emptyData, isValidData, replaceAll, undo } from '../lib/store.ts';
import { getAuthState, getConflictBackup, setNewPassword, signOut, subscribeAuth, syncNow } from '../lib/sync.ts';

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function DataPage() {
  const data = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<unknown>(null);
  const [wipe, setWipe] = useState(false);
  const conflict = getConflictBackup();

  const exportAll = async () => {
    const bytes = await exportWorkbook(data);
    download(`Puntenboek ${stamp()}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Gegevens</h1>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Exporteren</h2></div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted">
            Download alle puntenboeken als één Excel-bestand: één tabblad per klas en vak, met een werkende percentageformule.
            Dat bestand kan je later ook opnieuw importeren.
          </p>
          <div className="actions">
            <button className="btn primary" onClick={exportAll} disabled={!data.gradebooks.length}>
              <Icon name="download" /> Alles naar Excel
            </button>
            <button className="btn" onClick={() => download(`klasbeheer-backup ${stamp()}.json`, JSON.stringify(data, null, 1), 'application/json')}>
              <Icon name="download" /> Volledige back-up (.json)
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" /> Back-up terugzetten
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const d = JSON.parse(await f.text());
                  if (!isValidData(d)) throw new Error();
                  setRestore(d);
                } catch {
                  toast('Dit is geen geldige Klasbeheer-back-up.');
                }
              }}
            />
          </div>
        </div>
      </section>

      <AccountPanel />

      {conflict && (
        <section className="panel">
          <div className="panel-head"><h2>Reservekopie na synchronisatie</h2></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="muted">
              Toen dezelfde gegevens op twee toestellen tegelijk gewijzigd werden, bleef de recentste versie behouden.
              De andere versie (van {new Date(conflict.savedAt).toLocaleString('nl-BE')}) staat hier nog als reservekopie.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => download(`klasbeheer-reservekopie ${stamp()}.json`, JSON.stringify(conflict.data, null, 1), 'application/json')}>
                Reservekopie downloaden
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Alles wissen</h2></div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted">Verwijdert alle klassen, leerlingen en punten, ook online. Maak eerst een back-up.</p>
          <div><button className="btn danger" onClick={() => setWipe(true)}>Alle gegevens wissen</button></div>
        </div>
      </section>

      {restore !== null && (
        <Confirm
          title="Back-up terugzetten?"
          text="Alle huidige gegevens worden vervangen door de gegevens uit de back-up."
          confirmLabel="Back-up terugzetten"
          danger
          onClose={() => setRestore(null)}
          onConfirm={() => {
            replaceAll({ ...(restore as ReturnType<typeof emptyData>), updatedAt: new Date().toISOString() }, { local: true });
            toast('Back-up teruggezet', { label: 'Ongedaan maken', run: undo });
          }}
        />
      )}
      {wipe && (
        <Confirm
          title="Alle gegevens wissen?"
          text={`${data.classes.length} klassen en ${data.gradebooks.length} puntenboeken worden gewist.`}
          confirmLabel="Alles wissen"
          danger
          onClose={() => setWipe(false)}
          onConfirm={() => {
            replaceAll({ ...emptyData(), updatedAt: new Date().toISOString() }, { local: true });
            toast('Alle gegevens gewist', { label: 'Ongedaan maken', run: undo });
          }}
        />
      )}
    </div>
  );
}

function AccountPanel() {
  const auth = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Account</h2>
        <span className="small muted">
          <span className={`sync-dot ${auth.status === 'ok' ? 'on' : auth.status === 'fout' ? 'err' : ''}`} />
          {auth.status === 'bezig' && 'Bezig met opslaan…'}
          {auth.status === 'ok' && `Online bewaard${auth.lastSync ? ` om ${new Date(auth.lastSync).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          {auth.status === 'fout' && 'Opslaan mislukt'}
        </span>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>
          Aangemeld als <strong>{auth.email}</strong>.{' '}
          {auth.remember
            ? 'Je blijft aangemeld op dit toestel; de gegevens worden ook in deze browser bewaard.'
            : 'Bij het sluiten van de browser of na 30 minuten zonder activiteit word je afgemeld en worden de gegevens uit deze browser gewist.'}
        </p>
        {auth.error && <div className="note bad">{auth.error}</div>}
        <div className="actions">
          <button className="btn" disabled={auth.status === 'bezig'} onClick={() => syncNow()}>Nu opslaan</button>
          <button className="btn" onClick={() => signOut()}>Afmelden</button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            try {
              await setNewPassword(pw);
              setPw('');
              setPw2('');
              setMsg({ ok: true, text: 'Je wachtwoord is gewijzigd.' });
            } catch (err) {
              setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
            } finally {
              setBusy(false);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}
        >
          <h3>Wachtwoord wijzigen</h3>
          <div className="row">
            <label className="field"><span>Nieuw wachtwoord (min. 10 tekens)</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label className="field"><span>Herhaal</span><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
            <button className="btn" disabled={busy || pw.length < 10 || pw !== pw2}>Wachtwoord wijzigen</button>
          </div>
          {msg && <div className={`note ${msg.ok ? '' : 'bad'}`}>{msg.text}</div>}
        </form>
      </div>
    </section>
  );
}
