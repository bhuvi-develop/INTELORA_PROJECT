import { useMemo, useState } from 'react';
import { CheckCheck, ClipboardList, Hourglass, PieChart, PlayCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { Select } from '@/components/ui/Select';
import { BarTrend, DonutSplit } from '@/components/charts';
import { SectionHeader } from '@/components/common';
import { ApmKpiGrid, ApmWorkOrderTable, type ApmKpiCardProps } from '@/components/apm';
import { useApmBacklog } from '@/hooks/useApm';
import { ApmPageShell } from './ApmPageShell';
import { ALL, money, orDash } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Work order management.
 *
 * The queue is APM's write surface on the estate — where a prediction stops
 * being a number and becomes an instruction with a priority, an owner and a
 * due date. Nothing on this page raises or closes an order; that lifecycle
 * lives behind the engine's POST routes and is not a read view's business.
 *
 * The backlog endpoint is the source rather than the work-order list endpoint,
 * because it returns the open queue and the sizing block together — the count
 * and the weeks-of-work it represents always agree.
 * ─────────────────────────────────────────────────────────────────────────── */

const STATUSES = ['Open', 'Approved', 'Assigned', 'In Progress', 'Completed', 'Verified'];

const STATUS_COLOURS: Record<string, string> = {
  Open: STATUS_COLOR.warning,
  Approved: SERIES[0],
  Assigned: SERIES[2],
  'In Progress': SERIES[4],
  Completed: STATUS_COLOR.good,
  Verified: SERIES[6],
};

export const ApmWorkOrdersPage = () => {
  const query = useApmBacklog();
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);

  const all = useMemo(() => query.data?.work_orders ?? [], [query.data]);
  const backlog = query.data?.backlog;

  const orders = useMemo(
    () =>
      all.filter((order) => {
        if (status !== ALL && order.status !== status) return false;
        if (priority !== ALL && order.priority !== priority) return false;
        return true;
      }),
    [all, status, priority],
  );

  const priorities = useMemo(
    () => [...new Set(all.map((order) => order.priority).filter(Boolean))] as string[],
    [all],
  );

  const kpis = useMemo<ApmKpiCardProps[]>(() => {
    const count = (predicate: (status: string) => boolean) =>
      all.filter((order) => predicate(order.status)).length;

    return [
      {
        label: 'Open',
        value: String(count((s) => s === 'Open')),
        accent: STATUS_COLOR.warning,
        icon: ClipboardList,
        caption: 'Raised, not yet approved or assigned',
        loading: query.isPending,
      },
      {
        label: 'Assigned',
        value: String(count((s) => s === 'Assigned' || s === 'Approved')),
        accent: SERIES[0],
        icon: UserCheck,
        caption: 'Approved and owned, work not started',
        loading: query.isPending,
      },
      {
        label: 'In progress',
        value: String(count((s) => s === 'In Progress')),
        accent: SERIES[4],
        icon: PlayCircle,
        caption: 'Being worked now',
        loading: query.isPending,
      },
      {
        label: 'Completed',
        value: String(count((s) => s === 'Completed')),
        accent: STATUS_COLOR.good,
        icon: CheckCheck,
        caption: 'Work finished, awaiting sign-off',
        loading: query.isPending,
      },
      {
        label: 'Verified',
        value: String(count((s) => s === 'Verified')),
        accent: SERIES[6],
        icon: ShieldCheck,
        caption: 'Signed off and closed',
        loading: query.isPending,
      },
      {
        label: 'Overdue',
        value: backlog?.overdue === undefined ? null : String(backlog.overdue),
        accent: STATUS_COLOR.critical,
        tone: (backlog?.overdue ?? 0) > 0 ? 'bad' : 'good',
        icon: Hourglass,
        caption: `${backlog?.unassigned ?? 0} unassigned · ${backlog?.awaiting_approval ?? 0} awaiting approval`,
        explainer: 'Open orders past their due date. Unassigned and awaiting-approval are the two states that produce them.',
        loading: query.isPending,
      },
    ];
  }, [all, backlog, query.isPending]);

  const byStatus = useMemo(
    () =>
      STATUSES.map((entry) => ({
        key: entry,
        name: entry,
        value: all.filter((order) => order.status === entry).length,
        color: STATUS_COLOURS[entry] ?? SERIES[0],
      })).filter((slice) => slice.value > 0),
    [all],
  );

  const byPriority = useMemo(
    () =>
      Object.entries(backlog?.by_priority ?? {}).map(([label, value]) => ({
        label,
        count: value,
      })),
    [backlog],
  );

  const byType = useMemo(
    () =>
      Object.entries(backlog?.by_type ?? {}).map(([label, value]) => ({
        label,
        count: value,
      })),
    [backlog],
  );

  return (
    <ApmPageShell
      title="Work Order Management"
      subtitle="The maintenance queue APM raised from each asset's recommended action — with the origin that caused it."
      crumb="Work Orders"
      loading={query.isPending}
      error={query.isError}
      activeFilterCount={[status, priority].filter((value) => value !== ALL).length}
      onResetFilters={() => {
        setStatus(ALL);
        setPriority(ALL);
      }}
      filters={
        <>
          <Select
            size="sm"
            label="Status"
            options={[{ value: ALL, label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            containerClassName="w-44"
          />
          <Select
            size="sm"
            label="Priority"
            options={[{ value: ALL, label: 'All priorities' }, ...priorities.map((p) => ({ value: p, label: p }))]}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            containerClassName="w-44"
          />
        </>
      }
      filterNote="The KPI row counts the whole open queue; the charts and table below follow the filters. Raising, assigning and signing off an order are engine actions and are not offered from a read view."
    >
      <ApmKpiGrid items={kpis} columns={6} />

      <SectionHeader
        title="Queue composition"
        subtitle="Where the work sits, what kind it is and how urgent"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {byStatus.length > 0 ? (
          <DonutSplit
            title="Work orders by status"
            subtitle="The whole queue by lifecycle state"
            eyebrow="Status"
            icon={PieChart}
            data={byStatus}
            height={216}
            centerValue={String(all.length)}
            centerLabel="work orders"
            footnote="Open and Assigned accumulating while In Progress stays flat is a capacity problem, not a detection problem — the estate is raising work faster than the crew can start it."
          />
        ) : null}

        {byPriority.length > 0 ? (
          <BarTrend
            title="Backlog by priority"
            subtitle="Outstanding work weighted by how urgent it is"
            eyebrow="Priority"
            icon={ClipboardList}
            data={byPriority}
            series={[{ key: 'count', name: 'Open orders', color: STATUS_COLOR.warning, decimals: 0 }]}
            layout="horizontal"
            height={Math.max(200, byPriority.length * 44)}
            categoryWidth={128}
            footnote="Priority is APM's own score, derived from criticality against condition. A backlog that is mostly low priority is healthy; one weighted to the top is a queue that is already late."
          />
        ) : null}
      </div>

      {byType.length > 0 ? (
        <BarTrend
          title="Backlog by work type"
          subtitle="What kind of work is outstanding"
          eyebrow="Type"
          icon={ClipboardList}
          data={byType}
          series={[{ key: 'count', name: 'Open orders', color: SERIES[2], decimals: 0 }]}
          layout="horizontal"
          height={Math.max(200, byType.length * 44)}
          categoryWidth={148}
          footnote={`Sized at ${orDash(backlog?.labour_hours, 1, ' h')} of labour and ${money(backlog?.cost)} — ${orDash(backlog?.weeks_of_work, 1)} weeks at the configured crew capacity.`}
        />
      ) : null}

      <SectionHeader title="Queue" subtitle="Every work order in the current selection" />

      <ApmWorkOrderTable
        orders={orders}
        title="Work order queue"
        subtitle="Sorted, searchable and exportable — origin and planned/reactive carried through"
        exportName="intelora_apm_work_orders"
      />
    </ApmPageShell>
  );
};
