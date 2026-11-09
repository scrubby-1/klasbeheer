// Aanmelden en synchroniseren via Supabase (rechtstreeks via de REST-API, zonder extra bibliotheek).
//
// Beveiliging in het kort:
// - Zonder aanmelding toont de app niets en laadt ze geen gegevens.
// - Alle gegevens van de leerkracht staan als één JSON-document in de tabel klasbeheer_data.
//   Row Level Security in de database laat enkel de eigenaar lezen of schrijven, en enkel als
//   zijn e-mailadres op de toegangslijst klasbeheer_beheerders staat (zie supabase/schema.sql).
// - Registreren kan niet vanuit de app; accounts maak je zelf aan in Supabase.
// - Bij afmelden wordt de lokale kopie gewist. Op een gedeelde computer wordt niets blijvend
//   bewaard en word je na 30 minuten zonder activiteit automatisch afgemeld.
import type { AppData } from './types.ts';
import { clearLocal, getData, isValidData, onLocalChange, openLocalCache, replaceAll } from './store.ts';
import { makeDemoData } from './demo.ts';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

const SESSION_KEY = 'klasbeheer:session';
const META_KEY = 'klasbeheer:sync-meta';
const CONFLICT_KEY = 'klasbeheer:conflict-backup';
const IDLE_MINUTES = 30;
const DEMO_KEY = 'klasbeheer:demo';

interface Config { url: string; anonKey: string }
interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  remember: boolean;
  user: { id: string; email?: string };
}
interface Meta { lastSynced: string | null; dirty: boolean }

export type Phase = 'niet-ingesteld' | 'afgemeld' | 'herstel' | 'laden' | 'klaar' | 'demo';
export type SyncStatus = 'bezig' | 'ok' | 'fout';
export interface AuthState {
  phase: Phase;
  email?: string;
  remember?: boolean;
  status: SyncStatus;
  lastSync?: string;
  error?: string;
  notice?: string;
}

/* ---------------- hulp ---------------- */

function store(remember: boolean): Storage | null {
  try {
    return remember ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}
function readJson<T>(s: Storage | null, k: string): T | null {
  try {
    const v = s?.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(s: Storage | null, k: string, v: unknown) {
  try {
    if (v === null) s?.removeItem(k);
    else s?.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
function removeEverywhere(k: string) {
  writeJson(store(true), k, null);
  writeJson(store(false), k, null);
}

export function getConfig(): Config | null {
  const url = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '';
  const key = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '';
  return url && key ? { url: url.replace(/\/+$/, ''), anonKey: key } : null;
}

/* ---------------- toestand ---------------- */

let session: Session | null = readJson<Session>(store(true), SESSION_KEY) ?? readJson<Session>(store(false), SESSION_KEY);
let meta: Meta = { lastSynced: null, dirty: false };
let state: AuthState = { phase: 'afgemeld', status: 'ok' };
const listeners = new Set<() => void>();

function set(patch: Partial<AuthState>) {
  state = { ...state, ...patch, email: session?.user.email, remember: session?.remember };
  listeners.forEach((l) => l());
}
export function getAuthState() {
  return state;
}
export function subscribeAuth(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function saveSession() {
  removeEverywhere(SESSION_KEY);
  if (session) writeJson(store(session.remember), SESSION_KEY, session);
}
function saveMeta() {
  if (session) writeJson(store(session.remember), META_KEY, meta);
}

/* ---------------- Supabase-aanroepen ---------------- */

function translateError(m: string): string {
  if (/invalid login|invalid_grant|invalid credentials/i.test(m)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/email not confirmed/i.test(m)) return 'Dit account is nog niet bevestigd. Bevestig het in Supabase (Authentication > Users).';
  if (/password should be|weak password|at least/i.test(m)) return 'Kies een sterker wachtwoord van minstens 10 tekens.';
  if (/same.*password|different from the old/i.test(m)) return 'Het nieuwe wachtwoord moet verschillen van het oude.';
  if (/rate limit|too many/i.test(m)) return 'Te veel pogingen. Wacht even en probeer opnieuw.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Geen verbinding met de server. Controleer je internetverbinding.';
  return m;
}

async function authCall(method: string, path: string, body?: unknown, accessToken?: string) {
  const cfg = getConfig();
  if (!cfg) throw new Error('De app is nog niet gekoppeld aan Supabase.');
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: cfg.anonKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(translateError(e instanceof Error ? e.message : String(e)));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(translateError(json.error_description || json.msg || json.message || `Fout ${res.status}`)), { status: res.status });
  return json;
}

function startSession(json: { access_token: string; refresh_token: string; expires_in: number; user?: Session['user'] }, remember: boolean, user?: Session['user']) {
  const u = json.user ?? user!;
  session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (Number(json.expires_in || 3600) - 60) * 1000,
    remember,
    user: { id: u.id, email: u.email },
  };
  saveSession();
}

class AuthLost extends Error {}

async function token(): Promise<string> {
  if (!session) throw new AuthLost('Niet aangemeld.');
  if (Date.now() > session.expires_at) {
    try {
      const json = await authCall('POST', 'token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      startSession(json, session.remember);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        // sessie ingetrokken of verlopen: opnieuw aanmelden
        endSession('Je sessie is verlopen. Meld je opnieuw aan.');
        throw new AuthLost('Sessie verlopen.');
      }
      throw e;
    }
  }
  return session!.access_token;
}

async function rest(method: string, query: string, body?: unknown, prefer?: string) {
  const cfg = getConfig()!;
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/rest/v1/klasbeheer_data${query}`, {
      method,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${await token()}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof AuthLost) throw e;
    throw new Error(translateError(e instanceof Error ? e.message : String(e)));
  }
  if (res.status === 401) {
    endSession('Je sessie is verlopen. Meld je opnieuw aan.');
    throw new AuthLost('Sessie verlopen.');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    if (j?.code === '42P01' || /does not exist|schema cache/i.test(j?.message ?? ''))
      throw new Error('De tabel klasbeheer_data bestaat nog niet. Voer supabase/schema.sql uit in Supabase.');
    if (j?.code === '42501' || /row-level security/i.test(j?.message ?? ''))
      throw new Error('Geen toegang: je e-mailadres staat niet op de toegangslijst (tabel klasbeheer_beheerders).');
    throw new Error(j?.message || `Serverfout ${res.status}`);
  }
  if (res.status === 204 || res.status === 201) return null;
  return res.json().catch(() => null);
}

/* ---------------- aanmelden / afmelden ---------------- */

export async function signIn(email: string, password: string, remember: boolean) {
  const json = await authCall('POST', 'token?grant_type=password', { email: email.trim(), password });
  writeJson(store(false), DEMO_KEY, null);
  clearLocal();
  removeEverywhere(META_KEY);
  removeEverywhere(CONFLICT_KEY);
  startSession(json, remember);
  await enterApp();
  // Gegevens uit de versie zonder aanmelding: enkel overnemen als er online nog niets staat.
  if (legacy && session) {
    const d = getData();
    if (!d.classes.length && !d.gradebooks.length && state.status === 'ok') replaceAll({ ...legacy, updatedAt: new Date().toISOString() }, { local: true });
    legacy = null;
  }
}

let legacy: AppData | null = null;

/** Gegevens die de vroegere versie (zonder aanmelding) in deze browser bewaarde, eenmalig overnemen. */
function takeLegacyData() {
  try {
    const raw = localStorage.getItem('klasbeheer:data:v1');
    const d = raw ? JSON.parse(raw) : null;
    if (isValidData(d) && (d.classes.length || d.gradebooks.length)) legacy = d;
  } catch {
    /* ignore */
  }
  // De oude kopie blijft staan tot ze na het aanmelden online bewaard is (signIn wist ze dan).
  removeEverywhere('klasbeheer:supabase');
}

/** Afmelden: sessie beëindigen en alle lokale gegevens van dit toestel wissen. */
export async function signOut(notice?: string) {
  // eerst nog openstaande wijzigingen doorsturen
  if (session && meta.dirty) {
    try {
      await syncNow();
    } catch {
      /* ignore */
    }
  }
  const s = session;
  if (s) authCall('POST', 'logout?scope=local', undefined, s.access_token).catch(() => {});
  endSession(notice);
}

function endSession(notice?: string) {
  session = null;
  removeEverywhere(SESSION_KEY);
  removeEverywhere(META_KEY);
  removeEverywhere(CONFLICT_KEY);
  meta = { lastSynced: null, dirty: false };
  clearLocal();
  set({ phase: getConfig() ? 'afgemeld' : 'niet-ingesteld', status: 'ok', error: undefined, lastSync: undefined, notice });
}

export async function requestPasswordReset(email: string) {
  const redirect = encodeURIComponent(location.origin + location.pathname);
  await authCall('POST', `recover?redirect_to=${redirect}`, { email: email.trim() });
}

let recovery: { access_token: string; refresh_token: string; expires_in: number } | null = null;

export async function setNewPassword(password: string) {
  if (recovery) {
    const user = await authCall('GET', 'user', undefined, recovery.access_token);
    await authCall('PUT', 'user', { password }, recovery.access_token);
    clearLocal();
    startSession(recovery, false, user);
    recovery = null;
    await enterApp();
  } else {
    await authCall('PUT', 'user', { password }, await token());
  }
}

export function cancelRecovery() {
  recovery = null;
  set({ phase: 'afgemeld' });
}

/** Vraagt aan de database of dit account op de toegangslijst staat. */
async function checkAccess(): Promise<'ja' | 'nee' | 'onbekend'> {
  const cfg = getConfig()!;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/klasbeheer_heeft_toegang`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status === 401) return 'nee';
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 404 || /could not find|does not exist|schema cache/i.test(j?.message ?? ''))
        throw new Error('De database is nog niet ingesteld. Voer supabase/schema.sql uit in Supabase.');
      return 'onbekend';
    }
    return (await res.json()) === true ? 'ja' : 'nee';
  } catch (e) {
    if (e instanceof AuthLost) return 'nee';
    if (e instanceof Error && /schema\.sql/.test(e.message)) throw e;
    return 'onbekend'; // bv. offline: verder met de lokale kopie
  }
}

async function enterApp() {
  if (!session) return;
  let access: Awaited<ReturnType<typeof checkAccess>>;
  try {
    access = await checkAccess();
  } catch (e) {
    endSession(e instanceof Error ? e.message : String(e));
    return;
  }
  if (!session) return;
  if (access === 'nee') {
    const email = session.user.email;
    if (session) authCall('POST', 'logout?scope=local', undefined, session.access_token).catch(() => {});
    endSession(`Het account ${email ?? ''} heeft geen toegang tot deze gegevens.`);
    return;
  }
  openLocalCache(session.remember ? 'local' : 'session');
  meta = readJson<Meta>(store(session.remember), META_KEY) ?? { lastSynced: null, dirty: false };
  const hasCache = getData().classes.length > 0 || getData().gradebooks.length > 0;
  set({ phase: hasCache ? 'klaar' : 'laden', error: undefined, notice: undefined });
  resetIdle();
  await syncNow();
  if (session) set({ phase: 'klaar' });
}

/* ---------------- synchroniseren ---------------- */

let busy = false;
let again = false;

/** Haalt de online versie op en stuurt lokale wijzigingen door. */
export async function syncNow(): Promise<void> {
  if (!getConfig() || !session) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  set({ status: 'bezig' });
  try {
    const rows = (await rest('GET', `?select=data,updated_at&user_id=eq.${session.user.id}`)) as { data: AppData; updated_at: string }[];
    const remote = rows?.[0];
    const local = getData();
    const localEmpty = !local.classes.length && !local.gradebooks.length;
    const remoteChanged = remote && remote.updated_at !== meta.lastSynced;

    if (remote && isValidData(remote.data) && remoteChanged) {
      if (meta.dirty && !localEmpty) {
        // Beide kanten gewijzigd: de recentste wint, de andere versie blijft als reservekopie.
        const backup = (d: AppData) => writeJson(store(session!.remember), CONFLICT_KEY, { savedAt: new Date().toISOString(), data: d });
        if (remote.data.updatedAt > local.updatedAt) {
          backup(local);
          replaceAll(remote.data);
          meta.dirty = false;
        } else backup(remote.data);
      } else {
        replaceAll(remote.data);
        meta.dirty = false;
      }
      if (!meta.dirty) meta.lastSynced = remote.updated_at;
    }
    if (!remote && !localEmpty) meta.dirty = true;

    if (meta.dirty) {
      const updated_at = new Date().toISOString();
      await rest('POST', '', { user_id: session!.user.id, data: getData(), updated_at }, 'resolution=merge-duplicates,return=minimal');
      meta.lastSynced = updated_at;
      meta.dirty = false;
    }
    saveMeta();
    set({ status: 'ok', error: undefined, lastSync: meta.lastSynced ?? undefined });
  } catch (e) {
    if (!(e instanceof AuthLost)) set({ status: 'fout', error: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
    if (again) {
      again = false;
      setTimeout(() => syncNow(), 200);
    }
  }
}

export function getConflictBackup(): { savedAt: string; data: AppData } | null {
  return session ? readJson(store(session.remember), CONFLICT_KEY) : null;
}

/* ---------------- demoversie ---------------- */
// De demo draait volledig in de browser met fictieve gegevens. Er is geen sessie, dus er wordt
// nooit iets naar Supabase gestuurd of opgehaald; de gegevens verdwijnen bij het sluiten van het tabblad.

export function startDemo(fresh = true) {
  if (session) return; // nooit mengen met echte gegevens
  window.clearTimeout(idleTimer);
  if (fresh) {
    clearLocal();
    openLocalCache('session');
    replaceAll(makeDemoData());
  } else openLocalCache('session');
  writeJson(store(false), DEMO_KEY, true);
  set({ phase: 'demo', status: 'ok', error: undefined, notice: undefined });
}

export function resetDemo() {
  if (state.phase === 'demo') startDemo(true);
}

export function leaveDemo() {
  writeJson(store(false), DEMO_KEY, null);
  clearLocal();
  history.replaceState(null, '', location.pathname);
  set({ phase: getConfig() ? 'afgemeld' : 'niet-ingesteld' });
}

function demoRequested(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) {
    history.replaceState(null, '', location.pathname + location.hash);
    return true;
  }
  return false;
}

/* ---------------- opstarten ---------------- */

function readRecoveryFromUrl(): boolean {
  const h = location.hash;
  if (!/access_token=/.test(h)) {
    if (/error_description=/.test(h)) {
      const p = new URLSearchParams(h.replace(/^#\/?/, ''));
      history.replaceState(null, '', location.pathname);
      set({ notice: `De link werkt niet meer: ${p.get('error_description')}. Vraag een nieuwe aan.` });
    }
    return false;
  }
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  history.replaceState(null, '', location.pathname); // tokens niet in de adresbalk laten staan
  if (p.get('type') !== 'recovery' && p.get('type') !== 'invite') return false;
  recovery = {
    access_token: p.get('access_token') ?? '',
    refresh_token: p.get('refresh_token') ?? '',
    expires_in: Number(p.get('expires_in') ?? 3600),
  };
  return !!recovery.access_token;
}

let syncTimer: number | undefined;
let idleTimer: number | undefined;

function resetIdle() {
  window.clearTimeout(idleTimer);
  if (!session || session.remember) return;
  idleTimer = window.setTimeout(() => {
    if (session && !session.remember) signOut(`Je werd afgemeld na ${IDLE_MINUTES} minuten zonder activiteit.`);
  }, IDLE_MINUTES * 60_000);
}

export function startAuth() {
  onLocalChange(() => {
    if (!session) return;
    meta.dirty = true;
    saveMeta();
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => syncNow(), 1200);
  });
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
  window.addEventListener('focus', () => state.phase === 'klaar' && syncNow());
  window.addEventListener('online', () => state.phase === 'klaar' && syncNow());
  window.addEventListener('beforeunload', (e) => {
    if (session && meta.dirty) {
      syncNow();
      e.preventDefault();
    }
  });
  setInterval(() => {
    if (state.phase === 'klaar' && document.visibilityState === 'visible') syncNow();
  }, 60_000);

  const wantsDemo = demoRequested();
  if (!session && (wantsDemo || readJson<boolean>(store(false), DEMO_KEY))) {
    startDemo(wantsDemo || !readJson<boolean>(store(false), DEMO_KEY));
    return;
  }
  if (!getConfig()) {
    set({ phase: 'niet-ingesteld' });
    return;
  }
  if (readRecoveryFromUrl()) {
    set({ phase: 'herstel' });
    return;
  }
  if (session) {
    resetIdle();
    enterApp();
  } else {
    takeLegacyData();
    set({ phase: 'afgemeld' });
  }
}
