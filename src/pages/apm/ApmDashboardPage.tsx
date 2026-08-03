import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Boxes,
  CircleDollarSign,
  Clock3,
  Crosshair,
  FileText,
  Gauge,
  HeartPulse,
  Layers,
  ShieldAlert,
  Timer,
  TrendingDown,
  Wrench,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { MODULE_TITLES } from '@/config/navigation';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetaStat, PageHeader, SectionHeader } from '@/components/common';
import { ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { useApmBacklog, useApmEffectiveness, useApmOverview } from '@/hooks/useApm';
import { ApmSectionCard } from './ApmPageShell';
import { money, orDash } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * APM — the module overview.
 *
 * Navigation, not a dashboard. The KPI row says how the estate is doing at a
 * glance; everything past it is a way in. A module landing page that also draws
 * every chart is a page competing with the nine it links to, and the nine
 * always win because they have room to qualify what they show.
 *
 * APM sits between Predictive Maintenance and OEE in the MIKOS chain. It
 * detects nothing and predicts nothing: it consumes what AD and PdM published,
 * aggregates devices into assets, applies the criticality model, and publishes
 * maintenance decisions and reliability figures OEE reads downstream.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ApmDashboardPage = () => {
  const overview = useApmOverview();
  const backlogQuery = useApmBacklog();
  const effectivenessQuery = useApmEffectiveness();

  const loading = overview.isPending;
  const scope = overview.data?.scope;
  const health = overview.data?.fleet_health;
  const reliability = overview.data?.fleet_reliability;
  const economics = effectivenessQuery.data?.economics;
  const backlog = backlogQuery.data?.backlog;
  const effectiveness = effectivenessQuery.data?.effectiveness;

  const kpis = useMemo<ApmKpiCardProps[]>(
    () => [
      {
        label: 'Asset health index',
        value: health?.mean_index === undefined ? null : orDash(health.mean_index, 1),
        unit: '%',
        accent: SERIES[0],
        icon: HeartPulse,
        meter: health?.mean_index === undefined ? undefined : { value: health.mean_index },
        caption: `Weighted ${orDash(health?.weighted_index, 1, '%')} by criticality`,
        explainer:
          "APM's composite index: the PdM condition score derated by open anomaly pressure from AD and by the asset's duty.",
        loading,
      },
      {
        label: 'Availability',
        value: reliability?.availability_pct === undefined ? null : orDash(reliability.availability_pct, 2),
        unit: '%',
        accent: STATUS_COLOR.good,
        icon: BadgeCheck,
        meter:
          reliability?.availability_pct === undefined ? undefined : { value: reliability.availability_pct },
        caption: `Inherent ${orDash(reliability?.inherent_availability_pct, 2, '%')}`,
        loading,
      },
      {
        label: 'MTBF',
        value: reliability?.mtbf_sample ? orDash(reliability.mtbf_hours, 1) : null,
        unit: 'h',
        accent: SERIES[2],
        icon: Timer,
        caption: reliability?.mtbf_sample
          ? `${reliability.mtbf_sample} closed interval(s)`
          : 'No closed interval yet',
        loading,
      },
      {
        label: 'MTTR',
        value: reliability?.mttr_sample ? orDash(reliability.mttr_minutes, 1) : null,
        unit: 'min',
        accent: SERIES[3],
        icon: Clock3,
        caption: reliability?.mttr_sample
          ? `${reliability.mttr_sample} restored event(s)`
          : 'Nothing restored yet',
        loading,
      },
      {
        label: 'Downtime',
        value:
          reliability?.total_downtime_hours === undefined
            ? null
            : orDash(reliability.total_downtime_hours, 1),
        unit: 'h',
        accent: STATUS_COLOR.warning,
        icon: TrendingDown,
        caption: `${reliability?.total_failures ?? 0} failure event(s)`,
        loading,
      },
      {
        label: 'Failure rate',
        value:
          reliability?.failure_rate_per_1000h === undefined
            ? null
            : orDash(reliability.failure_rate_per_1000h, 2),
        unit: '/1000h',
        accent: STATUS_COLOR.critical,
        tone: reliability?.rate_credible === false ? 'neutral' : 'bad',
        icon: AlertTriangle,
        caption:
          reliability?.rate_credible === false ? 'Sample too small to be credible' : 'Per thousand operating hours',
        loading,
      },
      {
        label: 'Maintenance cost',
        value: economics?.committed_spend === undefined ? null : money(economics.committed_spend),
        accent: '#B45309',
        icon: CircleDollarSign,
        caption: `Planned share ${orDash((economics?.planned_spend_ratio ?? 0) * 100, 1, '%')}`,
        explainer: 'Committed spend. Risk exposure is a separate figure and is deliberately not added to it.',
        loading: effectivenessQuery.isPending,
      },
      {
        label: 'Backlog',
        value: backlog?.total === undefined ? null : String(backlog.total),
        unit: 'orders',
        accent: SERIES[6],
        icon: Layers,
        caption:
          backlog?.weeks_of_work === undefined
            ? 'Outstanding work'
            : `${orDash(backlog.weeks_of_work, 1)} weeks at crew capacity`,
        loading: backlogQuery.isPending,
      },
      {
        label: 'Active assets',
        value: scope?.assets === undefined ? null : String(scope.assets),
        accent: SERIES[2],
        icon: Boxes,
        caption: `Utilisation ${orDash(scope?.utilisation_pct, 1, '%')}`,
        loading,
      },
      {
        label: 'Critical assets',
        value: scope?.assets_at_risk === undefined ? null : String(scope.assets_at_risk),
        accent: STATUS_COLOR.critical,
        tone: (scope?.assets_at_risk ?? 0) > 0 ? 'bad' : 'good',
        icon: ShieldAlert,
        caption: `Mean risk ${orDash(scope?.mean_risk, 1)}`,
        loading,
      },
      {
        label: 'Work orders',
        value: scope?.open_work_orders === undefined ? null : String(scope.open_work_orders),
        unit: 'open',
        accent: SERIES[1],
        icon: Wrench,
        caption:
          effectiveness?.score === undefined
            ? 'Raised from recommended actions'
            : `Effectiveness ${orDash(effectiveness.score, 0)}/100`,
        loading,
      },
      {
        label: 'Cost exposure',
        value: scope?.cost_exposure === undefined ? null : money(scope.cost_exposure),
        accent: STATUS_COLOR.warning,
        icon: Activity,
        caption: 'Probability times consequence, not yet a cost',
        explainer:
          'What the estate stands to lose if nothing is actioned. Kept apart from committed spend on every page.',
        loading,
      },
    ],
    [health, reliability, economics, backlog, effectiveness, scope, loading, backlogQuery.isPending, effectivenessQuery.isPending],
  );

  /* Each section carries at most three figures — enough to decide whether to
   * open it, and deliberately not enough to be a second dashboard. */
  const sections = [
    {
      key: 'health',
      title: 'Asset Health',
      description:
        'The composite index across the estate, and how far it sits from the raw PdM condition score it was built on.',
      to: PATHS.apmHealth,
      icon: HeartPulse,
      accent: SERIES[0],
      figures: [
        { label: 'Mean index', value: orDash(health?.mean_index, 1, '%') },
        { label: 'Impaired', value: String(health?.operationally_impaired ?? 0) },
        { label: 'Below floor', value: String(health?.below_floor ?? 0) },
      ],
    },
    {
      key: 'reliability',
      title: 'Reliability',
      description:
        'MTBF, MTTR and failure rate with censored records excluded, plus where unreliability concentrates by class and band.',
      to: PATHS.apmReliability,
      icon: Timer,
      accent: SERIES[2],
      figures: [
        { label: 'MTBF', value: reliability?.mtbf_sample ? orDash(reliability.mtbf_hours, 1, ' h') : '—' },
        { label: 'MTTR', value: reliability?.mttr_sample ? orDash(reliability.mttr_minutes, 1, ' m') : '—' },
        { label: 'Failures', value: String(reliability?.total_failures ?? 0) },
      ],
    },
    {
      key: 'availability',
      title: 'Availability',
      description:
        'Operational against inherent availability, and the downtime that separates them — the gap a maintenance organisation can actually move.',
      to: PATHS.apmAvailability,
      icon: BadgeCheck,
      accent: STATUS_COLOR.good,
      figures: [
        { label: 'Operational', value: orDash(reliability?.availability_pct, 2, '%') },
        { label: 'Inherent', value: orDash(reliability?.inherent_availability_pct, 2, '%') },
        { label: 'Downtime', value: orDash(reliability?.total_downtime_hours, 1, ' h') },
      ],
    },
    {
      key: 'maintenance',
      title: 'Maintenance',
      description:
        'Whether the programme is working — planned ratio, schedule compliance, rework and completion, each against its own target.',
      to: PATHS.apmMaintenance,
      icon: Gauge,
      accent: SERIES[4],
      figures: [
        { label: 'Effectiveness', value: orDash(effectiveness?.score, 0, '/100') },
        { label: 'Planned', value: orDash((effectiveness?.planned_ratio ?? 0) * 100, 1, '%') },
        { label: 'Backlog', value: String(backlog?.total ?? 0) },
      ],
    },
    {
      key: 'criticality',
      title: 'Criticality',
      description:
        'Safety, production impact, replacement cost, lead time and redundancy on one radar — and the risk matrix that ranks the queue.',
      to: PATHS.apmCriticality,
      icon: Crosshair,
      accent: SERIES[4],
      figures: [
        { label: 'Mean score', value: orDash(scope?.mean_criticality, 1) },
        { label: 'Mean risk', value: orDash(scope?.mean_risk, 1) },
        { label: 'At risk', value: String(scope?.assets_at_risk ?? 0) },
      ],
    },
    {
      key: 'cost',
      title: 'Cost',
      description:
        'Committed spend and risk exposure kept apart — one is money gone, the other is money at stake if nothing is actioned.',
      to: PATHS.apmCost,
      icon: CircleDollarSign,
      accent: '#B45309',
      figures: [
        { label: 'Committed', value: money(economics?.committed_spend) },
        { label: 'Exposure', value: money(economics?.total_exposure) },
        { label: 'Return', value: orDash(economics?.roi, 2, '×') },
      ],
    },
    {
      key: 'workorders',
      title: 'Work Orders',
      description:
        'The queue APM raised from each recommended action, with the origin that caused it and whether it was planned or forced.',
      to: PATHS.apmWorkOrders,
      icon: Wrench,
      accent: SERIES[1],
      figures: [
        { label: 'Open', value: String(backlog?.total ?? 0) },
        { label: 'Overdue', value: String(backlog?.overdue ?? 0) },
        { label: 'Unassigned', value: String(backlog?.unassigned ?? 0) },
      ],
    },
    {
      key: 'assets',
      title: 'Asset Management',
      description:
        'The register itself — every asset, every derived figure, searchable, sortable and exportable on one table.',
      to: PATHS.apmAssets,
      icon: Boxes,
      accent: SERIES[3],
      figures: [
        { label: 'Assets', value: String(scope?.assets ?? 0) },
        { label: 'Open WOs', value: String(scope?.open_work_orders ?? 0) },
        { label: 'Utilisation', value: orDash(scope?.utilisation_pct, 1, '%') },
      ],
    },
    {
      key: 'reports',
      title: 'Reports',
      description:
        'Take the records out as CSV, Excel or PDF — and see the typed contract APM publishes for the OEE module downstream.',
      to: PATHS.apmReports,
      icon: FileText,
      accent: SERIES[6],
      figures: [],
    },
  ];

  if (overview.isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={MODULE_TITLES.apm?.title ?? 'Asset Performance Management'}
          subtitle="Decision and maintenance intelligence"
        />
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="APM analytics unavailable"
            description="The APM engine did not answer. It derives its view from Anomaly Detection and Predictive Maintenance outputs, so it stays empty rather than showing figures it could not compute."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.apm?.title ?? 'Asset Performance Management'}
        subtitle="Predictions turned into maintenance decisions — health, reliability, cost and the work queue that follows from them."
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Gauge}>
              {scope?.assets ?? 0} assets in scope
            </Badge>
            <Badge tone="neutral" size="sm">
              consumes AD + PdM
            </Badge>
            <Badge tone="neutral" size="sm">
              publishes to OEE
            </Badge>
          </>
        }
        meta={
          <>
            <MetaStat label="Mean condition" value={orDash(scope?.mean_health, 1, '%')} />
            <MetaStat label="Cost exposure" value={money(scope?.cost_exposure)} />
            <MetaStat label="Downtime cost" value={money(scope?.downtime_cost)} />
          </>
        }
      />

      <ApmKpiGrid items={kpis} />

      <SectionHeader
        title="Analytics"
        subtitle="Each section opens a page with its own filters, charts and exportable register."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <ApmSectionCard
            key={section.key}
            title={section.title}
            description={section.description}
            to={section.to}
            icon={section.icon}
            accent={section.accent}
            figures={section.figures}
          />
        ))}
      </div>
    </div>
  );
};
