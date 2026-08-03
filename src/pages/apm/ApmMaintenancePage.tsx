import { useMemo } from 'react';
import { Activity, CalendarClock, ClipboardList, Gauge, Layers, PieChart, Repeat, Wrench } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { BarTrend, DonutSplit } from '@/components/charts';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/common';
import { ApmKpiGrid, ApmWorkOrderTable, type ApmKpiCardProps } from '@/components/apm';
import { useApmBacklog, useApmEffectiveness } from '@/hooks/useApm';
import { ApmPageShell } from './ApmPageShell';
import { money, orDash } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Maintenance analytics.
 *
 * Whether the programme is working, rather than what is in the queue — the
 * queue itself is on the Work Orders page.
 *
 * Effectiveness is reported as five named components against their own targets
 * as well as a composite. A single effectiveness percentage nobody can
 * decompose is a figure nobody trusts, and rightly: planned ratio and rework
 * rate fail for completely different reasons and are fixed by different people.
 * ─────────────────────────────────────────────────────────────────────────── */

const COMPONENT_LABEL: Record<string, string> = {
  planned_ratio: 'Planned ratio',
  schedule_compliance: 'Schedule compliance',
  rework_rate: 'Rework rate',
  mttr_minutes: 'Restore time',
  completion_rate: 'Completion rate',
};

export const ApmMaintenancePage = () => {
  const effectivenessQuery = useApmEffectiveness();
  const backlogQuery = useApmBacklog();

  const effectiveness = effectivenessQuery.data?.effectiveness;
  const targets = effectivenessQuery.data?.targets;
  const economics = effectivenessQuery.data?.economics;
  const backlog = backlogQuery.data?.backlog;
  const orders = useMemo(() => backlogQuery.data?.work_orders ?? [], [backlogQuery.data]);

  const loading = effectivenessQuery.isPending || backlogQuery.isPending;

  const kpis = useMemo<ApmKpiCardProps[]>(
    () => [
      {
        label: 'Programme effectiveness',
        value: effectiveness?.score === undefined ? null : orDash(effectiveness.score, 0),
        unit: '/100',
        accent: SERIES[0],
        icon: Gauge,
        meter: effectiveness?.score === undefined ? undefined : { value: effectiveness.score },
        caption: `Composite of five components over ${effectiveness?.sample ?? 0} order(s)`,
        explainer:
          'Each component is scored against its own target and reported separately below. The composite is a summary, not the finding.',
        loading,
      },
      {
        label: 'Planned ratio',
        value:
          effectiveness?.planned_ratio === undefined
            ? null
            : orDash(effectiveness.planned_ratio * 100, 1),
        unit: '%',
        accent: STATUS_COLOR.good,
        icon: CalendarClock,
        target: targets?.planned_ratio ? `${orDash(targets.planned_ratio * 100, 0)}%` : undefined,
        meter:
          effectiveness?.planned_ratio === undefined
            ? undefined
            : {
                value: effectiveness.planned_ratio * 100,
                target: targets?.planned_ratio ? targets.planned_ratio * 100 : undefined,
              },
        caption: 'Share of completed work that was scheduled rather than forced',
        loading,
      },
      {
        label: 'Schedule compliance',
        value:
          effectiveness?.schedule_compliance === undefined
            ? null
            : orDash(effectiveness.schedule_compliance * 100, 1),
        unit: '%',
        accent: SERIES[2],
        icon: ClipboardList,
        target: targets?.schedule_compliance ? `${orDash(targets.schedule_compliance * 100, 0)}%` : undefined,
        caption: 'Completed on or before the due date',
        loading,
      },
      {
        label: 'Rework rate',
        value:
          effectiveness?.rework_rate === undefined ? null : orDash(effectiveness.rework_rate * 100, 1),
        unit: '%',
        accent: STATUS_COLOR.critical,
        tone:
          effectiveness?.rework_rate !== undefined &&
          targets?.rework_rate !== undefined &&
          effectiveness.rework_rate > targets.rework_rate
            ? 'bad'
            : 'good',
        icon: Repeat,
        target: targets?.rework_rate ? `${orDash(targets.rework_rate * 100, 0)}%` : undefined,
        caption: 'Signed-off work that came back',
        explainer: 'The one component where lower is better. Rework is work paid for twice.',
        loading,
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
            : `${orDash(backlog.weeks_of_work, 1)} weeks at crew capacity · ${money(backlog.cost)}`,
        loading,
      },
      {
        label: 'Reactive spend',
        value: economics?.reactive_spend === undefined ? null : money(economics.reactive_spend),
        accent: STATUS_COLOR.warning,
        icon: Wrench,
        caption: `Against ${money(economics?.planned_spend)} planned`,
        loading,
      },
    ],
    [effectiveness, targets, economics, backlog, loading],
  );

  /** Each component's attainment against its own target, 0–1 from the engine. */
  const components = useMemo(
    () =>
      Object.entries(effectiveness?.components ?? {}).map(([key, value]) => ({
        label: COMPONENT_LABEL[key] ?? key,
        value: Math.round(value * 1000) / 10,
      })),
    [effectiveness],
  );

  const plannedSplit = useMemo(() => {
    const planned = orders.filter((order) => order.planned).length;
    const reactive = orders.length - planned;
    return [
      { key: 'planned', name: 'Planned', value: planned, color: STATUS_COLOR.good },
      { key: 'reactive', name: 'Reactive', value: reactive, color: STATUS_COLOR.critical },
    ].filter((slice) => slice.value > 0);
  }, [orders]);

  const ageing = useMemo(
    () => [
      { label: 'Due soon', count: backlog?.due_soon ?? 0 },
      { label: 'Overdue', count: backlog?.overdue ?? 0 },
      { label: 'Aged over 30d', count: backlog?.aged_over_30d ?? 0 },
      { label: 'Awaiting approval', count: backlog?.awaiting_approval ?? 0 },
      { label: 'Unassigned', count: backlog?.unassigned ?? 0 },
    ],
    [backlog],
  );

  return (
    <ApmPageShell
      title="Maintenance Analytics"
      subtitle="Whether the maintenance programme is working — five components, each against its own target."
      crumb="Maintenance"
      loading={loading}
      error={effectivenessQuery.isError}
    >
      <ApmKpiGrid items={kpis} columns={6} />

      <SectionHeader
        title="Programme effectiveness"
        subtitle="The composite decomposed — the components fail for different reasons and are fixed by different people"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {components.length > 0 ? (
          <BarTrend
            title="Attainment by component"
            subtitle="Each component scored against its own target, 100% is on target"
            eyebrow="Effectiveness"
            icon={Gauge}
            data={components}
            series={[{ key: 'value', name: 'Attainment', color: SERIES[0], unit: '%', decimals: 1 }]}
            layout="horizontal"
            height={Math.max(220, components.length * 46)}
            categoryWidth={168}
            references={[{ value: 100, label: 'On target', color: STATUS_COLOR.good }]}
            footnote="Attainment rather than raw value, so a rework rate where lower is better and a planned ratio where higher is better can honestly share one axis."
          />
        ) : (
          <Card>
            <CardHeader title="Attainment by component" subtitle="Scored against target" eyebrow="Effectiveness" icon={Gauge} />
            <div className="mt-4">
              <EmptyState icon={Gauge} title="Not enough closed work" description="Effectiveness needs completed orders to score against. Nothing has closed in this window." compact />
            </div>
          </Card>
        )}

        {plannedSplit.length > 0 ? (
          <DonutSplit
            title="Planned against reactive"
            subtitle="The open queue by how each order was raised"
            eyebrow="Origin"
            icon={PieChart}
            data={plannedSplit}
            height={216}
            centerValue={String(orders.length)}
            centerLabel="open orders"
            footnote="A queue dominated by reactive work means the estate is setting the schedule. Planned work is cheaper per hour and is scheduled around production; reactive work is neither."
          />
        ) : null}
      </div>

      <BarTrend
        title="Backlog ageing"
        subtitle="Where the outstanding work is stuck"
        eyebrow="Backlog"
        icon={Activity}
        data={ageing}
        series={[{ key: 'count', name: 'Open orders', color: SERIES[6], decimals: 0 }]}
        height={260}
        footnote={`Mean age ${orDash(backlog?.mean_age_days, 1, ' d')}, oldest ${orDash(backlog?.oldest_age_days, 1, ' d')}. Awaiting-approval and unassigned are the two states that turn into overdue, and both are administrative rather than technical.`}
      />

      <SectionHeader title="Open work" subtitle="The queue behind the figures above" />

      <ApmWorkOrderTable
        orders={orders}
        title="Outstanding work orders"
        subtitle="Every open order, newest priority first"
        exportName="intelora_apm_maintenance"
      />
    </ApmPageShell>
  );
};
