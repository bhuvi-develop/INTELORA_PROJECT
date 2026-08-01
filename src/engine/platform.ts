/* ───────────────────────────────────────────────────────────────────────────
 * Platform service vocabulary.
 *
 * The cockpit reports the state of the services the product depends on —
 * FastAPI, PostgreSQL, the sensor engine, the AI engine and the ingest gateway.
 * Those states are measured by the backend and arrive with the dashboard
 * response; this module used to synthesise them and now only says how each one
 * is coloured.
 * ─────────────────────────────────────────────────────────────────────────── */

export type ServiceState = 'Operational' | 'Degraded' | 'Down';

export interface ServiceHealth {
  key: string;
  name: string;
  /** What this service does, for the hover tooltip. */
  role: string;
  state: ServiceState;
  /** Response or round-trip time in milliseconds, where meaningful. */
  latencyMs: number | null;
  uptimePct: number;
}

export const SERVICE_STATE_TONE: Record<ServiceState, { color: string; text: string; bg: string; ring: string }> = {
  Operational: {
    color: '#0CA30C',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-400/25',
  },
  Degraded: {
    color: '#FAB219',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-400/25',
  },
  Down: {
    color: '#D03B3B',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    ring: 'ring-rose-400/30',
  },
};
