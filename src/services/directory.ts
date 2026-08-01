import type { User, UserRole } from '@/types';
import { initialsOf } from '@/utils/format';

/* ───────────────────────────────────────────────────────────────────────────
 * Demonstration identity directory.
 *
 * Replace with the organisation's identity provider in production — the auth
 * service contract does not change when this file is removed.
 * ─────────────────────────────────────────────────────────────────────────── */

const ROLE_LABEL: Record<UserRole, string> = {
  administrator: 'Platform Administrator',
  'reliability-engineer': 'Reliability Engineer',
  operations: 'Operations Manager',
  analyst: 'Performance Analyst',
};

interface DirectoryEntry {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

const DIRECTORY: DirectoryEntry[] = [
  { email: 'admin@intelora.io', password: 'Intelora#2026', name: 'Amara Okonkwo', role: 'administrator' },
  {
    email: 'reliability@intelora.io',
    password: 'Intelora#2026',
    name: 'Sven Lindqvist',
    role: 'reliability-engineer',
  },
  { email: 'operations@intelora.io', password: 'Intelora#2026', name: 'Rhea Deshpande', role: 'operations' },
  { email: 'analyst@intelora.io', password: 'Intelora#2026', name: 'Hana Nakamura', role: 'analyst' },
];

export const DEMO_CREDENTIALS = {
  email: DIRECTORY[0].email,
  password: DIRECTORY[0].password,
} as const;

const toUser = (entry: DirectoryEntry): User => ({
  id: `usr-${entry.email.split('@')[0]}`,
  name: entry.name,
  email: entry.email,
  role: entry.role,
  roleLabel: ROLE_LABEL[entry.role],
  organisation: 'Intelora Industrial Systems',
  initials: initialsOf(entry.name),
  lastLoginAt: new Date(Date.now() - 18 * 3_600_000).toISOString(),
});

export const findDirectoryUser = (email: string, password: string): User | null => {
  const entry = DIRECTORY.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
  if (!entry || entry.password !== password) return null;
  return toUser(entry);
};
