import type { AuthSession } from '@/types';
import { env } from '@/config/env';

/* Session persistence lives outside React so the axios interceptor can read the
 * bearer token without importing context and creating a cycle. */

type Listener = (session: AuthSession | null) => void;

let current: AuthSession | null = null;
const listeners = new Set<Listener>();

const read = (): AuthSession | null => {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = store.getItem(env.session.storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed?.token && parsed.expiresAt > Date.now()) return parsed;
      store.removeItem(env.session.storageKey);
    } catch {
      store.removeItem(env.session.storageKey);
    }
  }
  return null;
};

current = read();

export const tokenStore = {
  get(): AuthSession | null {
    return current;
  },

  getToken(): string | null {
    return current?.token ?? null;
  },

  set(session: AuthSession, persist: boolean): void {
    current = session;
    const target = persist ? window.localStorage : window.sessionStorage;
    const other = persist ? window.sessionStorage : window.localStorage;
    try {
      other.removeItem(env.session.storageKey);
      target.setItem(env.session.storageKey, JSON.stringify(session));
    } catch {
      /* Storage quota or private mode — the in-memory session still works. */
    }
    listeners.forEach((listener) => listener(session));
  },

  clear(): void {
    current = null;
    try {
      window.localStorage.removeItem(env.session.storageKey);
      window.sessionStorage.removeItem(env.session.storageKey);
    } catch {
      /* ignore */
    }
    listeners.forEach((listener) => listener(null));
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
