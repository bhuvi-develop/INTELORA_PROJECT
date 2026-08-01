import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  Archive,
  ArrowRight,
  BarChart3,
  Cog,
  Gauge,
  MonitorSmartphone,
  ShieldAlert,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { SERIES } from '@/config/viz';
import { useFleetKpis } from '@/engine/store';
import { cn } from '@/lib/cn';
import { SectionHeader } from '@/components/common/PageHeader';

/* ───────────────────────────────────────────────────────────────────────────
 * Quick navigation.
 *
 * The cockpit is the hub, so each card is a drill-down into the module that owns
 * the detail. Live counts sit on the cards that have one, which is what makes
 * this navigation rather than decoration.
 * ─────────────────────────────────────────────────────────────────────────── */

interface NavCard {
  key: string;
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  /** Categorical slot index — resolved to a hue at render time so the accent
   *  follows the active theme rather than freezing to the dark palette. */
  slot: number;
  counter?: 'anomalies' | 'critical' | 'tasks' | 'devices';
}

const CARDS: NavCard[] = [
  {
    key: 'devices',
    label: 'Asset Management',
    description: 'Register, identity and connectivity for every device',
    to: PATHS.devices,
    icon: MonitorSmartphone,
    slot: 0,
    counter: 'devices',
  },
  {
    key: 'anomaly',
    label: 'AI Anomaly Detection',
    description: 'Threshold breaches raised from the live stream',
    to: PATHS.anomaly,
    icon: ShieldAlert,
    slot: 1,
    counter: 'anomalies',
  },
  {
    key: 'predictive',
    label: 'Predictive Maintenance',
    description: 'Failure probability, remaining life and confidence',
    to: PATHS.predictive,
    icon: Waypoints,
    slot: 3,
    counter: 'critical',
  },
  {
    key: 'apm',
    label: 'Asset Performance',
    description: 'Fleet ranking, availability and performance score',
    to: PATHS.apm,
    icon: Activity,
    slot: 2,
  },
  {
    key: 'oee',
    label: 'Equipment Effectiveness',
    description: 'Availability, performance and quality with trend',
    to: PATHS.oee,
    icon: Gauge,
    slot: 6,
  },
  {
    key: 'analytics',
    label: 'Grafana Analytics',
    description: 'Historical time-series and long-term energy analysis',
    to: PATHS.telemetry,
    icon: BarChart3,
    slot: 4,
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Archived records exportable to PDF, Excel and CSV',
    to: PATHS.reports,
    icon: Archive,
    slot: 0,
  },
  {
    key: 'admin',
    label: 'Administration',
    description: 'Workspace, thresholds, simulation and integrations',
    to: PATHS.settings,
    icon: Cog,
    slot: 5,
    counter: 'tasks',
  },
];

export const QuickNavGrid = ({ className }: { className?: string }) => {
  const kpis = useFleetKpis();

  const counterFor = (card: NavCard): { value: number; label: string } | null => {
    switch (card.counter) {
      case 'devices':
        return { value: kpis.totalAssets, label: 'devices' };
      case 'anomalies':
        return { value: kpis.activeAnomalies, label: 'active' };
      case 'critical':
        return { value: kpis.criticalAssets, label: 'critical' };
      case 'tasks':
        return { value: kpis.tasksOverdue, label: 'overdue' };
      default:
        return null;
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <SectionHeader
        title="Modules"
        subtitle="Drill down from the cockpit summary into the module that owns the detail"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card, index) => {
          const Icon = card.icon;
          const counter = counterFor(card);
          /* Resolved here rather than in the card table, so it re-reads the
             palette whenever the theme changes. */
          const accent = SERIES[card.slot] ?? SERIES[0];

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={card.to}
                className="group panel relative flex h-full flex-col overflow-hidden p-4 transition-all duration-200 ease-enterprise hover:-translate-y-0.5 hover:border-overlay/[0.14] hover:shadow-raised"
              >
                {/* Accent wash revealed on hover. */}
                <span
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(120% 80% at 0% 0%, ${accent}14, transparent 70%)`,
                  }}
                  aria-hidden
                />

                <div className="relative flex items-start justify-between gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.08] transition-transform duration-200 group-hover:scale-105"
                    style={{ backgroundColor: `${accent}1A`, color: accent }}
                  >
                    <Icon size={16} aria-hidden />
                  </span>

                  {counter && counter.value > 0 ? (
                    <span className="shrink-0 rounded-md bg-overlay/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-soft ring-1 ring-inset ring-overlay/10">
                      {counter.value} {counter.label}
                    </span>
                  ) : null}
                </div>

                <p className="relative mt-3 text-[12.5px] font-semibold text-fg">{card.label}</p>
                <p className="relative mt-1 flex-1 text-[11px] leading-relaxed text-fg-dim">{card.description}</p>

                <span className="relative mt-3 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  Open module
                  <ArrowRight size={11} aria-hidden />
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
