import { useRef, useState, useSyncExternalStore } from 'react';
import { Confirm, Icon, download, toast, useData } from '../components/ui.tsx';
import { exportWorkbook } from '../lib/exporter.ts';
import { emptyData, isValidData, replaceAll, undo } from '../lib/store.ts';
import {
  getConfig, getConflictBackup, getSyncState, saveConfig, signIn, signOut, signUp, subscribeSync, syncNow,
} from '../lib/sync.ts';

export function useSync() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function DataPage() {
  const data = useData();
  const sync = useSync();
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

      <SyncPanel />

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
          <p className="muted">Verwijdert alle klassen, leerlingen en punten uit deze browser{sync.email ? ' en uit je online opslag' : ''}. Maak eerst een back-up.</p>
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

function SyncPanel() {
  const sync = useSync();
  const cfg = getConfig();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(cfg && !cfg.fromBuild ? cfg.url : '');
  const [key, setKey] = useState(cfg && !cfg.fromBuild ? cfg.anonKey : '');

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Online synchroniseren</h2>
        <span className="small muted">
          <span className={`sync-dot ${sync.status === 'ok' ? 'on' : sync.status === 'fout' ? 'err' : ''}`} />
          {sync.status === 'uit' && 'Niet ingesteld: gegevens staan enkel in deze browser'}
          {sync.status === 'afgemeld' && 'Niet aangemeld'}
          {sync.status === 'bezig' && 'Bezig met synchroniseren…'}
          {sync.status === 'ok' && `Gesynchroniseerd${sync.lastSync ? ` om ${new Date(sync.lastSync).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          {sync.status === 'fout' && 'Synchroniseren mislukt'}
        </span>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!sync.configured && (
          <>
            <p className="muted">
              Zonder synchronisatie bewaart de app alles in deze browser op dit toestel. Wil je dezelfde gegevens op school en thuis,
              koppel dan een gratis Supabase-project (zie README in de GitHub-repository). Vul hieronder de Project URL en de
              publieke anon key in, of zet ze als SUPABASE_URL en SUPABASE_ANON_KEY in Vercel.
            </p>
            <div className="row">
              <label className="field"><span>Project URL</span><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
              <label className="field"><span>Anon key</span><input className="input" value={key} onChange={(e) => setKey(e.target.value)} /></label>
              <button className="btn" disabled={!/^https:\/\/.+/.test(url) || key.length < 20} onClick={() => saveConfig(url, key)}>Koppelen</button>
            </div>
          </>
        )}

        {sync.configured && !sync.email && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(() => signIn(email, pw));
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <p className="muted">Meld je aan om je gegevens online te bewaren en op al je toestellen te gebruiken.</p>
            <div className="row">
              <label className="field"><span>E-mailadres</span><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="field"><span>Wachtwoord</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            </div>
            <div className="actions">
              <button className="btn primary" disabled={busy || !email || !pw}>Aanmelden</button>
              <button
                type="button"
                className="btn"
                disabled={busy || !email || pw.length < 6}
                onClick={() =>
                  act(async () => {
                    const r = await signUp(email, pw);
                    setMsg(r === 'bevestigen' ? 'Account aangemaakt. Bevestig je e-mailadres via de mail en meld je daarna aan.' : '');
                  })
                }
              >
                Account aanmaken
              </button>
              {!sync.fromBuild && (
                <button type="button" className="btn ghost" onClick={() => saveConfig('', null)}>Koppeling verwijderen</button>
              )}
            </div>
          </form>
        )}

        {sync.email && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p>Aangemeld als <strong>{sync.email}</strong>. Elke wijziging wordt na enkele seconden online bewaard.</p>
            <div className="actions">
              <button className="btn" disabled={sync.status === 'bezig'} onClick={() => syncNow()}>Nu synchroniseren</button>
              <button className="btn ghost" onClick={() => signOut()}>Afmelden</button>
            </div>
          </div>
        )}
        {(msg || sync.error) && <div className={`note ${sync.error && !msg ? 'bad' : ''}`}>{msg || sync.error}</div>}
      </div>
    </section>
  );
}
