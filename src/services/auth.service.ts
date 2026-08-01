import type { AuthSession, LoginCredentials } from '@/types';
import { api, unwrap } from '@/lib/axios';
import { tokenStore } from '@/lib/tokenStore';

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const session = await api
      .post<AuthSession>('/auth/login', {
        email: credentials.email.trim(),
        password: credentials.password,
      })
      .then(unwrap);
    tokenStore.set(session, credentials.remember);
    return session;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      tokenStore.clear();
    }
  },

  async refresh(email: string): Promise<AuthSession> {
    const session = await api.post<AuthSession>('/auth/refresh', { email }).then(unwrap);
    tokenStore.set(session, true);
    return session;
  },

  current(): AuthSession | null {
    return tokenStore.get();
  },
};
