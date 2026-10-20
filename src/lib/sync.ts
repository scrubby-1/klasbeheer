// Optionele synchronisatie via Supabase (rechtstreeks via de REST-API, zonder extra bibliotheek).
// Alle gegevens van één leerkracht worden als één JSON-document bewaard in de tabel klasbeheer_data,
// beveiligd met Row Level Security: enkel de ingelogde gebruiker kan zijn eigen rij lezen of schrijven.
import type { AppData } from './types.ts';
import { getData, isValidData, onLocalChange, replaceAll } from './store.ts';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

const CFG_KEY = 'klasbeheer:supabase';
const SESSION_KEY = 'klasbeheer:session';
const META_KEY = 'klasbeheer:sync-meta';
const CONFLICT_KEY = 'klasbeheer:conflict-backup';

export interface SyncConfig { url: string; anonKey: string; fromBuild: boolean }
interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } }
interface Meta { lastSynced: string | null; dirty: boolean }

export type SyncStatus = 'uit' | 'afgemeld' | 'bezig' | 'ok' | 'fout';
export interface SyncState { status: SyncStatus; email?: string; lastSync?: string; error?: string; configured: boolean; fromBuild: boolean }

const ls = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

export function getConfig(): SyncConfig | null {
  const url = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '';
  const key = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '';
  if (url && key) return { url: url.replace(/\/+$/, ''), anonKey: key, fromBuild: true };
  const saved = ls.get<{ url: string; anonKey: string }>(CFG_KEY);
  if (saved?.url && saved.anonKey) return { url: saved.url.replace(/\/+$/, ''), anonKey: saved.anonKey, fromBuild: false };
  return null;
}

export function saveConfig(url: string, anonKey: string | null) {
  ls.set(CFG_KEY, url && anonKey ? { url: url.trim(), anonKey: anonKey.trim() } : null);
  emit();
}

let session: Session | null = ls.get<Session>(SESSION_KEY);
let meta: Meta = ls.get<Meta>(META_KEY) ?? { lastSynced: null, dirty: false };
let state: SyncState = computeState('ok');
const listeners = new Set<() => void>();

function computeState(status: SyncStatus, error?: string): SyncState {
  const cfg = getConfig();
  if (!cfg) return { status: 'uit', configured: false, fromBuild: false };
  if (!session) return { status: 'afgemeld', configured: true, fromBuild: cfg.fromBuild, error };
  return { status, email: session.user.email, lastSync: meta.lastSynced ?? undefined, error, configured: true, fromBuild: cfg.fromBuild };
}

function emit(status?: SyncStatus, error?: string) {
  state = computeState(status ?? (state.status === 'uit' || state.status === 'afgemeld' ? 'ok' : state.status), error);
  listeners.forEach((l) => l());
}

export function getSyncState() {
  return state;
}
export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function saveMeta() {
  ls.set(META_KEY, meta);
}

async function authFetch(path: string, body: unknown) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Synchronisatie is niet ingesteld.');
  const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(translateError(json.error_description || json.msg || json.message || `Fout ${res.status}`));
  return json;
}

function translateError(m: string): string {
  if (/invalid login/i.test(m)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/email not confirmed/i.test(m)) return 'Bevestig eerst je e-mailadres via de link in de mail die je kreeg.';
  if (/already registered/i.test(m)) return 'Er bestaat al een account met dit e-mailadres. Meld je aan.';
  if (/password should be/i.test(m)) return 'Kies een wachtwoord van minstens 6 tekens.';
  return m;
}

function setSession(json: { access_token: string; refresh_token: string; expires_in: number; user: Session['user'] }) {
  session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
    user: { id: json.user.id, email: json.user.email },
  };
  ls.set(SESSION_KEY, session);
}

async function token(): Promise<string> {
  if (!session) throw new Error('Niet aangemeld.');
  if (Date.now() > session.expires_at) {
    try {
      setSession(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
    } catch (e) {
      session = null;
      ls.set(SESSION_KEY, null);
      emit();
      throw e;
    }
  }
  return session!.access_token;
}

async function rest(method: string, query: string, body?: unknown, prefer?: string) {
  const cfg = getConfig()!;
  const res = await fetch(`${cfg.url}/rest/v1/klasbeheer_data${query}`, {
    method,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    if (j?.code === '42P01' || /does not exist/i.test(j?.message ?? ''))
      throw new Error('De tabel klasbeheer_data bestaat nog niet. Voer supabase/schema.sql uit in Supabase.');
    throw new Error(j?.message || `Serverfout ${res.status}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function signIn(email: string, password: string) {
  setSession(await authFetch('token?grant_type=password', { email, password }));
  meta = { lastSynced: null, dirty: false };
  saveMeta();
  emit('bezig');
  await syncNow(true);
}

export async function signUp(email: string, password: string): Promise<'ingelogd' | 'bevestigen'> {
  const json = await authFetch('signup', { email, password });
  if (json.access_token) {
    setSession(json);
    meta = { lastSynced: null, dirty: false };
    saveMeta();
    await syncNow(true);
    return 'ingelogd';
  }
  return 'bevestigen';
}

export async function signOut() {
  const cfg = getConfig();
  if (cfg && session) {
    fetch(`${cfg.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
  }
  session = null;
  ls.set(SESSION_KEY, null);
  meta = { lastSynced: null, dirty: false };
  saveMeta();
  emit();
}

let busy = false;
let again = false;

/** Haalt de online versie op en stuurt lokale wijzigingen door. */
export async function syncNow(firstLogin = false): Promise<void> {
  if (!getConfig() || !session) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  emit('bezig');
  try {
    const rows = (await rest('GET', `?select=data,updated_at&user_id=eq.${session.user.id}`)) as { data: AppData; updated_at: string }[];
    const remote = rows?.[0];
    const local = getData();
    const localEmpty = !local.classes.length && !local.gradebooks.length;
    const remoteChanged = remote && remote.updated_at !== meta.lastSynced;

    if (remote && isValidData(remote.data) && remoteChanged) {
      if (meta.dirty && !localEmpty && !firstLogin) {
        // Beide kanten gewijzigd: de recentste wint, de andere versie wordt als reservekopie bewaard.
        if (remote.data.updatedAt > local.updatedAt) {
          ls.set(CONFLICT_KEY, { savedAt: new Date().toISOString(), data: local });
          replaceAll(remote.data);
          meta.dirty = false;
        } else {
          ls.set(CONFLICT_KEY, { savedAt: new Date().toISOString(), data: remote.data });
        }
      } else if (firstLogin && !localEmpty && remote.data.updatedAt < local.updatedAt) {
        // Eerste aanmelding met lokale gegevens die nieuwer zijn: lokaal behouden en online bijwerken.
        ls.set(CONFLICT_KEY, { savedAt: new Date().toISOString(), data: remote.data });
        meta.dirty = true;
      } else {
        if (!localEmpty && firstLogin) ls.set(CONFLICT_KEY, { savedAt: new Date().toISOString(), data: local });
        replaceAll(remote.data);
        meta.dirty = false;
      }
      if (!meta.dirty) meta.lastSynced = remote.updated_at;
    }
    if (!remote) meta.dirty = !localEmpty || meta.dirty;

    if (meta.dirty) {
      const d = getData();
      const updated_at = new Date().toISOString();
      await rest('POST', '', { user_id: session!.user.id, data: d, updated_at }, 'resolution=merge-duplicates,return=minimal');
      meta.lastSynced = updated_at;
      meta.dirty = false;
    }
    saveMeta();
    emit('ok');
  } catch (e) {
    emit('fout', e instanceof Error ? e.message : String(e));
  } finally {
    busy = false;
    if (again) {
      again = false;
      setTimeout(() => syncNow(), 200);
    }
  }
}

export function getConflictBackup(): { savedAt: string; data: AppData } | null {
  return ls.get(CONFLICT_KEY);
}

let timer: number | undefined;
export function startSync() {
  onLocalChange(() => {
    meta.dirty = true;
    saveMeta();
    if (!getConfig() || !session) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => syncNow(), 1500);
  });
  if (getConfig() && session) syncNow();
  window.addEventListener('focus', () => syncNow());
  window.addEventListener('online', () => syncNow());
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 60_000);
  emit();
}
