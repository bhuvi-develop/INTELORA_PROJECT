import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { AuthSession, LoginCredentials } from '@/types';
import { AuthContext, type AuthContextValue } from '@/context/contexts';
import { findDirectoryUser } from '@/services/directory';
import { DEMO_CREDENTIALS } from '@/services/directory';

/* ───────────────────────────────────────────────────────────────────────────
 * Authentication — BYPASSED.
 *
 * There is no sign-in surface at present: the application opens straight onto
 * the dashboard with a standing operator session. The context shape is unchanged
 * so the profile menu, settings and audit copy keep working, and so restoring
 * real authentication later means re-enabling the gate rather than rewriting the
 * components that consume it.
 *
 * To restore: drop `BYPASS`, reinstate the login route, and put the credential
 * check back in `login`. Nothing downstream of this file needs to change.
 * ─────────────────────────────────────────────────────────────────────────── */

const BYPASS = true;

/** Standing session used while authentication is bypassed. */
const bypassSession = (): AuthSession => {
  const user = findDirectoryUser(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
  if (!user) throw new Error('Directory is missing the default operator account.');

  return {
    // Not a credential: no gate is checking it while the bypass is active.
    token: 'bypass',
    refreshToken: 'bypass',
    expiresAt: Number.MAX_SAFE_INTEGER,
    user,
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(() => (BYPASS ? bypassSession() : null));

  /* Kept on the context so consumers need no conditionals. Both are inert while
   * the bypass is active — signing out of a bypassed session would strand the
   * user on a route with nothing to authenticate against. */
  const login = useCallback(async (_credentials: LoginCredentials) => {
    setSession(bypassSession());
  }, []);

  const logout = useCallback(async () => {
    /* Intentionally a no-op under bypass. */
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: true,
      isAuthenticating: false,
      error: null,
      login,
      logout,
      clearError: () => undefined,
    }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
