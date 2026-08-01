/* ───────────────────────────────────────────────────────────────────────────
 * Application-level contracts.
 *
 * The asset and telemetry domain lives in `@/engine/types`, which the engine
 * owns. This file carries only identity, session and generic UI contracts.
 * ─────────────────────────────────────────────────────────────────────────── */

export type UserRole = 'administrator' | 'reliability-engineer' | 'operations' | 'analyst';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  organisation: string;
  initials: string;
  lastLoginAt: string;
}

export interface AuthSession {
  token: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  severity: 'Info' | 'Warning' | 'Major' | 'Critical';
  at: number;
  read: boolean;
  href: string;
}

/* ─── Generic UI contracts ───────────────────────────────────────────────── */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export interface ColumnMeta {
  align?: 'left' | 'right' | 'center';
  width?: string;
  numeric?: boolean;
}

/** Trend direction for delta indicators. */
export type TrendDirection = 'up' | 'down' | 'flat';

/**
 * Generic chart datum. Charts are domain-agnostic: they take a category label
 * plus arbitrary numeric keys, so the same component renders telemetry, energy
 * or effectiveness without knowing what it is plotting.
 */
export interface SeriesPoint {
  t?: number;
  label: string;
  [metric: string]: number | string | undefined;
}

/** Window selector used by the live telemetry views. */
export type LiveWindow = '5m' | '15m' | '30m';

export interface GrafanaPanelConfig {
  dashboard: string;
  panelId: number;
  title?: string;
  from?: string;
  to?: string;
  refresh?: string;
  orgId?: number;
  theme?: 'dark' | 'light';
  kiosk?: string;
  variables?: Record<string, string | number | string[] | undefined>;
}
