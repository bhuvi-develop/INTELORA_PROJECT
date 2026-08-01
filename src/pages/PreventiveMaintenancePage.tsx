import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  RotateCcw,
} from 'lucide-react';
import type { PreventiveTask, TaskPriority, TaskStatus } from '@/engine/types';
import { TASK_PRIORITY_RANK, TASK_PRIORITY_TONE } from '@/engine/derive';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { deviceDetailPath } from '@/routes/paths';
import { useEngineControl, usePreventiveTasks, useSnapshot } from '@/engine/store';
import { formatDate, formatNumber, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { BarTrend } from '@/components/charts';
import { DataTable, Pagination, TableToolbar, type FilterDef } from '@/components/data';
import {
  DeviceIdentity,
  MetaStat,
  PageHeader,
  PriorityBadge,
  RankList,
  StatTile,
  TaskStatusBadge,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Preventive maintenance.
 *
 * Scheduled work only — no prediction, no AI. Priority is the one thing that
 * moves: it is recomputed each tick from the task's due date and the device's
 * current condition band, so a task on a device that has just degraded rises
 * without anyone editing it.
 *
 * Completing a task records it to the activity journal and rolls the schedule
 * forward by its interval, which is what a real CMMS does.
 * ─────────────────────────────────────────────────────────────────────────── */

const STATUS_OPTIONS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Due', label: 'Due soon' },
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'Completed', label: 'Completed' },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority | 'all'; label: string }> = [
  { value: 'all', label: 'All priorities' },
  { value: 'Critical', label: 'Critical' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
];

const PAGE_SIZES = [10, 25, 50, 100];
const DAY_MS = 86_400_000;

export const PreventiveMaintenancePage = () => {
  const toast = useToast();
  const { density } = useUI();
  const tasks = usePreventiveTasks();
  const { at } = useSnapshot();
  const { completeTask, reopenTask } = useEngineControl();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const debouncedSearch = useDebounce(search, 240);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (status !== 'all' && task.status !== status) return false;
        if (priority !== 'all' && task.priority !== priority) return false;
        if (category !== 'all' && task.category !== category) return false;
        if (needle.length > 0) {
          const haystack = `${task.assetId} ${task.assetName} ${task.taskName} ${task.category}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      // Overdue first, then by priority, then by due date.
      .sort((a, b) => {
        const aOpen = a.completed ? 1 : 0;
        const bOpen = b.completed ? 1 : 0;
        if (aOpen !== bOpen) return aOpen - bOpen;
        const rank = TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority];
        if (rank !== 0) return rank;
        return a.dueDate - b.dueDate;
      });
  }, [tasks, debouncedSearch, status, priority, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const stats = useMemo(() => {
    const open = tasks.filter((task) => !task.completed);
    return {
      total: tasks.length,
      overdue: tasks.filter((task) => task.status === 'Overdue').length,
      due: tasks.filter((task) => task.status === 'Due').length,
      scheduled: tasks.filter((task) => task.status === 'Scheduled').length,
      completed: tasks.filter((task) => task.completed).length,
      critical: open.filter((task) => task.priority === 'Critical').length,
      compliance: tasks.length === 0 ? 100 : ((tasks.length - open.filter((t) => t.status === 'Overdue').length) / tasks.length) * 100,
    };
  }, [tasks]);

  /* Next 8 weeks of scheduled work — the planning view. */
  const workload = useMemo(() => {
    const weeks = 8;
    return Array.from({ length: weeks }, (_, index) => {
      const from = at + index * 7 * DAY_MS;
      const to = from + 7 * DAY_MS;
      const inWeek = tasks.filter((task) => !task.completed && task.dueDate >= from && task.dueDate < to);
      return {
        label: index === 0 ? 'This week' : `Week ${index + 1}`,
        critical: inWeek.filter((task) => task.priority === 'Critical').length,
        high: inWeek.filter((task) => task.priority === 'High').length,
        medium: inWeek.filter((task) => task.priority === 'Medium').length,
        low: inWeek.filter((task) => task.priority === 'Low').length,
      };
    });
  }, [tasks, at]);

  const columns = useMemo<Array<ColumnDef<PreventiveTask, unknown>>>(
    () => [
      {
        id: 'taskName',
        header: 'Task name',
        accessorFn: (row) => row.taskName,
        enableSorting: true,
        meta: { width: '17rem' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-fg">{row.original.taskName}</p>
            <p className="mt-0.5 text-[10.5px] text-fg-dim">
              Every {row.original.intervalDays} days · {row.original.id}
            </p>
          </div>
        ),
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '17rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.assetId}
            assetName={row.original.assetName}
            meta={row.original.category}
          />
        ),
      },
      {
        id: 'dueDate',
        header: 'Due date',
        accessorFn: (row) => row.dueDate,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => {
          const days = Math.round((row.original.dueDate - at) / DAY_MS);
          return (
            <div className="text-right">
              <p className="text-[12px] font-medium tabular-nums text-fg">{formatDate(row.original.dueDate)}</p>
              <p className="mt-0.5 text-[10.5px] tabular-nums text-fg-dim">
                {row.original.completed
                  ? 'next cycle'
                  : days < 0
                    ? `${Math.abs(days)} d overdue`
                    : days === 0
                      ? 'today'
                      : `in ${days} d`}
              </p>
            </div>
          );
        },
      },
      {
        id: 'priority',
        header: 'Priority',
        accessorFn: (row) => TASK_PRIORITY_RANK[row.priority],
        enableSorting: true,
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
      },
      {
        id: 'completed',
        header: 'Completed',
        accessorFn: (row) => row.completedAt ?? 0,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-[11.5px] text-fg-dim">
            {row.original.completedAt ? formatRelative(row.original.completedAt) : '—'}
          </span>
        ),
      },
      {
        id: 'action',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.completed ? (
            <Button
              variant="ghost"
              size="xs"
              icon={RotateCcw}
              onClick={(event) => {
                event.stopPropagation();
                reopenTask(row.original.id);
                toast.info('Task reopened', `${row.original.taskName} returned to the schedule.`);
              }}
            >
              Reopen
            </Button>
          ) : (
            <Button
              variant="subtle"
              size="xs"
              icon={CheckCircle2}
              onClick={(event) => {
                event.stopPropagation();
                completeTask(row.original.id);
                toast.success(
                  'Task completed',
                  `${row.original.taskName} signed off and rescheduled in ${row.original.intervalDays} days.`,
                );
              }}
            >
              Complete
            </Button>
          ),
      },
    ],
    [at, completeTask, reopenTask, toast],
  );

  const filters: FilterDef[] = [
    {
      key: 'status',
      label: 'State',
      value: status,
      options: STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      onChange: (value) => {
        setStatus(value as TaskStatus | 'all');
        setPage(1);
      },
    },
    {
      key: 'priority',
      label: 'Priority',
      value: priority,
      options: PRIORITY_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      onChange: (value) => {
        setPriority(value as TaskPriority | 'all');
        setPage(1);
      },
    },
    {
      key: 'category',
      label: 'Category',
      value: category,
      options: [
        { value: 'all', label: 'All categories' },
        ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
      ],
      onChange: (value) => {
        setCategory(value);
        setPage(1);
      },
    },
  ];

  const activeFilterCount = [status, priority, category].filter((value) => value !== 'all').length;

  const reset = useCallback(() => {
    setSearch('');
    setStatus('all');
    setPriority('all');
    setCategory('all');
    setPage(1);
  }, []);

  const exportColumns: Array<ReportColumn<PreventiveTask>> = [
    { header: 'Task ID', value: (row) => row.id },
    { header: 'Task Name', value: (row) => row.taskName },
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Category', value: (row) => row.category },
    { header: 'Due Date', value: (row) => formatDate(row.dueDate) },
    { header: 'Priority', value: (row) => row.priority },
    { header: 'Status', value: (row) => row.status },
    { header: 'Completed', value: (row) => (row.completedAt ? formatDate(row.completedAt) : '') },
    { header: 'Interval (days)', value: (row) => row.intervalDays, numeric: true },
  ];

  const runExport = () => {
    if (filtered.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no tasks.');
      return;
    }
    void exportReport(exportFormat, filtered, exportColumns, {
      filename: 'intelora_preventive_schedule',
      title: 'Preventive Maintenance Schedule',
      subtitle: `${filtered.length} tasks`,
      generatedAt: at,
      notes: [`${stats.overdue} overdue, ${stats.due} due within seven days`],
    });
    toast.success('Export started', `${filtered.length} tasks to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.preventive.title}
        subtitle={MODULE_TITLES.preventive.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={CalendarCheck}>
              {stats.total} scheduled tasks
            </Badge>
            {stats.overdue > 0 ? (
              <Badge tone="critical" size="sm" icon={AlertTriangle}>
                {stats.overdue} overdue
              </Badge>
            ) : (
              <Badge tone="good" size="sm" icon={CheckCircle2}>
                Schedule current
              </Badge>
            )}
            {stats.due > 0 ? (
              <Badge tone="warning" size="sm" icon={Clock}>
                {stats.due} due within 7 days
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Schedule compliance" value={`${formatNumber(stats.compliance, 1)}%`} />
            <MetaStat label="Critical priority" value={formatNumber(stats.critical)} />
            <MetaStat label="Scheduled ahead" value={formatNumber(stats.scheduled)} />
            <MetaStat label="Completed" value={formatNumber(stats.completed)} />
          </>
        }
        actions={
          <>
            <Select
              size="sm"
              aria-label="Export format"
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'excel', label: 'Excel' },
                { value: 'pdf', label: 'PDF' },
              ]}
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as ReportFormat)}
              containerClassName="w-24"
            />
            <Button variant="primary" size="sm" icon={Download} onClick={runExport}>
              Export
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Overdue"
          value={formatNumber(stats.overdue)}
          caption="Past due — the origin of most unplanned downtime"
          icon={AlertTriangle}
          accent={stats.overdue > 0 ? STATUS_COLOR.critical : STATUS_COLOR.good}
        />
        <StatTile
          label="Due within 7 days"
          value={formatNumber(stats.due)}
          caption="Next week's committed workload"
          icon={Clock}
          accent={STATUS_COLOR.warning}
        />
        <StatTile
          label="Scheduled ahead"
          value={formatNumber(stats.scheduled)}
          caption="Beyond the seven-day window"
          icon={CalendarClock}
          accent={SERIES[0]}
        />
        <StatTile
          label="Schedule compliance"
          value={formatNumber(stats.compliance, 1)}
          unit="%"
          caption={`${stats.completed} task${stats.completed === 1 ? '' : 's'} signed off`}
          icon={CheckCircle2}
          accent={stats.compliance >= 90 ? STATUS_COLOR.good : STATUS_COLOR.warning}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <BarTrend
          title="Forward workload"
          subtitle="Open tasks per week, stacked by priority"
          eyebrow="Planning"
          icon={CalendarClock}
          data={workload}
          series={[
            { key: 'critical', name: 'Critical', color: TASK_PRIORITY_TONE.Critical.color, decimals: 0 },
            { key: 'high', name: 'High', color: TASK_PRIORITY_TONE.High.color, decimals: 0 },
            { key: 'medium', name: 'Medium', color: TASK_PRIORITY_TONE.Medium.color, decimals: 0 },
            { key: 'low', name: 'Low', color: SERIES[0], decimals: 0 },
          ]}
          height={280}
          stacked
          footnote="Priority is recomputed each tick from the due date and the device's current condition band, so a task on a degrading device rises without being edited."
        />

        <RankList
          title="Most attention needed"
          subtitle="Open tasks ranked by priority then how far past due"
          eyebrow="Act now"
          icon={AlertTriangle}
          items={filtered
            .filter((task) => !task.completed)
            .slice(0, 8)
            .map((task) => {
              const days = Math.round((task.dueDate - at) / DAY_MS);
              return {
                id: task.id,
                title: task.taskName,
                tag: task.assetId,
                subtitle: `${task.assetName} · ${task.category}`,
                value: days < 0 ? `${Math.abs(days)} d late` : `in ${days} d`,
                trailing: <PriorityBadge priority={task.priority} />,
                href: deviceDetailPath(task.assetId),
              };
            })}
          emptyTitle="No open tasks"
        />
      </div>

      <DataTable<PreventiveTask>
        data={paged}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        minWidth="92rem"
        emptyIcon={CalendarCheck}
        emptyTitle="No tasks match the current filters"
        emptyDescription="Clear a filter or widen the search term. Every device carries a schedule derived from its category."
        toolbar={
          <TableToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search task, device or category…"
            filters={filters}
            activeFilterCount={activeFilterCount}
            onReset={reset}
          />
        }
        footer={
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={filtered.length}
            noun="tasks"
            pageSizeOptions={PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />

      <p className="text-[11px] leading-relaxed text-fg-dim">
        Completing a task records it to the operational activity journal and rolls its next occurrence forward by the
        interval. This module carries scheduled work only — condition-based prediction lives in Predictive Maintenance and
        recommended actions in Prescriptive Maintenance.
      </p>
    </div>
  );
};
