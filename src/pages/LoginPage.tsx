import { useState, type ReactNode } from 'react';
import { cancelRecovery, requestPasswordReset, setNewPassword, signIn, type AuthState } from '../lib/sync.ts';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4f43" strokeWidth="2.6" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h8" /><circle cx="18" cy="17" r="2.4" fill="#d8453a" stroke="none" /></svg>
          </span>
          <span className="brand-name">Klasbeheer</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NotConfiguredPage() {
  return (
    <Shell>
      <h1>Nog niet gekoppeld</h1>
      <p className="muted">
        Deze app werkt enkel met een account. Voeg in Vercel bij Settings → Environment Variables de waarden
        <code> SUPABASE_URL</code> en <code>SUPABASE_ANON_KEY</code> toe en publiceer opnieuw (Redeploy). De stappen staan in de README.
      </p>
    </Shell>
  );
}

export function LoginPage({ auth }: { auth: AuthState }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'reset' | 'sent'>('login');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await signIn(email, pw, remember);
      else {
        await requestPasswordReset(email);
        setMode('sent');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'sent') {
    return (
      <Shell>
        <h1>Kijk in je mailbox</h1>
        <p className="muted">Als er een account bestaat voor {email}, krijg je een mail met een link om een nieuw wachtwoord in te stellen.</p>
        <button className="btn" onClick={() => setMode('login')}>Terug naar aanmelden</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1>{mode === 'login' ? 'Aanmelden' : 'Wachtwoord vergeten'}</h1>
      {auth.notice && <div className="note warn">{auth.notice}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <label className="field">
          <span>E-mailadres</span>
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        {mode === 'login' && (
          <>
            <label className="field">
              <span>Wachtwoord</span>
              <input className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label className="check small">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Aangemeld blijven op dit toestel (enkel op je eigen computer)
            </label>
          </>
        )}
        {error && <div className="note bad">{error}</div>}
        <button className="btn primary" style={{ justifyContent: 'center' }} disabled={busy || !email || (mode === 'login' && !pw)}>
          {busy ? 'Even geduld…' : mode === 'login' ? 'Aanmelden' : 'Herstellink versturen'}
        </button>
      </form>
      <button className="linkish" onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(''); }}>
        {mode === 'login' ? 'Wachtwoord vergeten?' : 'Terug naar aanmelden'}
      </button>
      {mode === 'login' && (
        <p className="small faint">Zonder &lsquo;aangemeld blijven&rsquo; word je afgemeld wanneer je de browser sluit of na 30 minuten zonder activiteit.</p>
      )}
    </Shell>
  );
}

export function NewPasswordPage() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const problem = pw.length > 0 && pw.length < 10 ? 'Gebruik minstens 10 tekens.' : pw2 && pw !== pw2 ? 'De twee wachtwoorden zijn niet gelijk.' : '';
  return (
    <Shell>
      <h1>Nieuw wachtwoord</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await setNewPassword(pw);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <label className="field"><span>Nieuw wachtwoord</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        <label className="field"><span>Herhaal het wachtwoord</span><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {(problem || error) && <div className={`note ${error ? 'bad' : 'warn'}`}>{error || problem}</div>}
        <button className="btn primary" style={{ justifyContent: 'center' }} disabled={busy || pw.length < 10 || pw !== pw2}>Wachtwoord opslaan en aanmelden</button>
      </form>
      <button className="linkish" onClick={cancelRecovery}>Annuleren</button>
    </Shell>
  );
}

export function LoadingPage() {
  return (
    <Shell>
      <p className="muted">Je gegevens worden opgehaald…</p>
    </Shell>
  );
}
