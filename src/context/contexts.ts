import { createContext } from 'react';
import type { AuthSession, LiveWindow, LoginCredentials, User } from '@/types';

/* Context objects live apart from their providers so hook modules can consume
 * them without importing component code (and without fast-refresh warnings). */

export interface AuthContextValue {
  session: AuthSession | null;
  user: User | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export type Density = 'comfortable' | 'compact';

/**
 * Presentation preferences only.
 *
 * Streaming state is deliberately absent: the engine owns whether the tick is
 * running, and the UI reads it through `useEngineControl`. Mirroring it here
 * would create a second source of truth for something the whole product keys
 * off, which is precisely what this build must not do.
 */
export interface UIContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (value: boolean) => void;
  density: Density;
  setDensity: (density: Density) => void;
  /** Rolling window shown by the live telemetry charts. */
  liveWindow: LiveWindow;
  setLiveWindow: (window: LiveWindow) => void;
}

export const UIContext = createContext<UIContextValue | null>(null);

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

export interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
