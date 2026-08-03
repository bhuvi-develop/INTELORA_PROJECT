import {
  Activity,
  CalendarDays,
  ClipboardList,
  Cpu,
  FileDown,
  Gauge,
  Lightbulb,
  Timer,
  type LucideIcon,
} from 'lucide-react';

/* ───────────────────────────────────────────────────────────────────────────
 * The eight workspaces.
 *
 * The module has one landing state — a launcher hub — and eight isolated
 * workspaces behind it. There is no tab bar: a workspace is entered from the
 * hub and left through the breadcrumb, so at any moment exactly one context is
 * on screen.
 *
 * `question` is the budget test. Every chart and table inside a workspace has
 * to help answer that one sentence; anything that does not belongs in a
 * different workspace, or in a different module.
 * ─────────────────────────────────────────────────────────────────────────── */

export type WorkspaceId =
  | 'rul'
  | 'probability'
  | 'components'
  | 'preventive'
  | 'prescriptive'
  | 'queue'
  | 'analytics'
  | 'reports';

export interface WorkspaceDef {
  id: WorkspaceId;
  /** Card and breadcrumb label. */
  label: string;
  /** Sub-title on the launcher card. */
  discipline: string;
  icon: LucideIcon;
  question: string;
  /** Single line under the metric on the launcher card. */
  summary: string;
}

export const WORKSPACES: WorkspaceDef[] = [
  {
    id: 'rul',
    label: 'Remaining Useful Life',
    discipline: 'RUL Engine',
    icon: Timer,
    question: 'When will this component fail?',
    summary: 'Time to end of life for every tracked component',
  },
  {
    id: 'probability',
    label: 'Failure Probability',
    discipline: 'Risk Scoring',
    icon: Gauge,
    question: 'What is the probability of failure?',
    summary: 'Likelihood inside the 30-day horizon, ranked by exposure',
  },
  {
    id: 'components',
    label: 'Component Health',
    discipline: 'Multi-Asset Wear Analytics',
    icon: Cpu,
    question: 'Which components are degrading?',
    summary: 'Wear across the fleet, by part type and by device',
  },
  {
    id: 'preventive',
    label: 'Preventive Maintenance',
    discipline: 'Calendar & Schedule',
    icon: CalendarDays,
    question: 'What maintenance should be scheduled?',
    summary: 'Calendar work falling due across the estate',
  },
  {
    id: 'prescriptive',
    label: 'Prescriptive Maintenance',
    discipline: 'Decision Engine',
    icon: Lightbulb,
    question: 'What is the recommended action?',
    summary: 'Recommended intervention per device, by urgency',
    description: 'Auto-generated repair protocols mapped to predicted failure modes',
  },
  {
    id: 'queue',
    label: 'Maintenance Queue',
    discipline: 'Prioritised Work Backlog',
    icon: ClipboardList,
    question: 'What is the prioritised work order queue?',
    summary: 'Every component in the order it needs attention',
  },
  {
    id: 'analytics',
    label: 'Prediction Analytics',
    discipline: 'Model Performance & Trends',
    icon: Activity,
    question: 'How is the prediction model behaving?',
    summary: 'Confidence, estimator mix and published trend',
  },
  {
    id: 'reports',
    label: 'Historical Reports',
    discipline: 'Export & Archival',
    icon: FileDown,
    question: 'Give me the record set.',
    summary: 'Prediction archive, exported for planning or audit',
  },
];

export const workspaceById = (id: WorkspaceId): WorkspaceDef =>
  WORKSPACES.find((entry) => entry.id === id) ?? WORKSPACES[0];
