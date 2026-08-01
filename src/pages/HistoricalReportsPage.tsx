import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  CalendarCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Radio,
  ShieldAlert,
  Table2,
  Waypoints,
} from 'lucide-react';
import type { AnomalyRecord, DailyTelemetryRecord, PredictionHistoryRecord, PreventiveTask } from '@/engine/types';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES } from '@/config/viz';
import {
  useAnomalyJournal,
  useDailyRecords,
  usePredictionRecords,
  usePreventiveTasks,
  useSnapshot,
} from '@/engine/store';
import { formatDate, formatDateTime, formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { BarTrend } from '@/components/charts';
import { DataTable, Pagination, TableToolbar, type FilterDef } from '@/components/data';
import {
  AnomalyStatusBadge,
  DeviceIdentity,
  HealthValue,
  MetaStat,
  PageHeader,
  PriorityBadge,
  SeverityBadge,
  TaskStatusBadge,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Historical reports.
 *
 * Five archived record types over one shared export pipeline, so a CSV, a
 * spreadsheet and a PDF of the same report always carry the same columns in the
 * same order. Telemetry and prediction history are daily aggregates written when
 * the engine initialised; anomalies and maintenance are the live journals.
 * ─────────────────────────────────────────────────────────────────────────── */

type RecordSet = 'telemetry' | 'anomalies' | 'predictions' | 'preventive' | 'alerts';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All retained' },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]['value'];

const PAGE_SIZES = [10, 25, 50, 100];
const DAY_MS = 86_400_000;

const FORMAT_META: Array<{ value: ReportFormat; label: string; icon: typeof FileText; hint: string }> = [
  { value: 'pdf', label: 'PDF', icon: FileText, hint: 'Paginated document with header and footer' },
  { value: 'excel', label: 'Excel', icon: FileSpreadsheet, hint: 'Typed cells, frozen header, autofilter' },
  { value: 'csv', label: 'CSV', icon: Table2, hint: 'UTF-8 with BOM for spreadsheet import' },
];

export const HistoricalReportsPage = () => {
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const tasks = usePreventiveTasks();
  const { at } = useSnapshot();

  const [recordSet, setRecordSet] = useState<RecordSet>('telemetry');
  const [range, setRange] = useState<RangeValue>('30');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const debouncedSearch = useDebounce(search, 240);

  /* Archived aggregates are stable for the session, so they are read once. */
  const daily = useDailyRecords();
  const predictions = usePredictionRecords();

  const cutoff = range === 'all' ? 0 : at - Number(range) * DAY_MS;
  const needle = debouncedSearch.trim().toLowerCase();

  const matchesText = (haystack: string): boolean => needle.length === 0 || haystack.toLowerCase().includes(needle);

  const telemetryRows = useMemo(
    () =>
      daily.filter(
        (row) =>
          row.date >= cutoff &&
          (category === 'all' || row.category === category) &&
          matchesText(`${row.assetId} ${row.assetName} ${row.category}`),
      ),
    [daily, cutoff, category, needle],
  );

  const anomalyRows = useMemo(
    () =>
      journal.filter(
        (row) =>
          row.timestamp >= cutoff &&
          (category === 'all' || row.category === category) &&
          matchesText(`${row.code} ${row.assetId} ${row.assetName} ${row.title}`),
      ),
    [journal, cutoff, category, needle],
  );

  const predictionRows = useMemo(
    () =>
      predictions.filter(
        (row) => row.date >= cutoff && matchesText(`${row.assetId} ${row.assetName} ${row.component}`),
      ),
    [predictions, cutoff, needle],
  );

  const preventiveRows = useMemo(
    () =>
      tasks.filter(
        (row) =>
          (category === 'all' || row.category === category) &&
          matchesText(`${row.assetId} ${row.assetName} ${row.taskName}`),
      ),
    [tasks, category, needle],
  );

  const alertRows = useMemo(
    () => anomalyRows.filter((row) => row.severity === 'Critical' || row.severity === 'Major'),
    [anomalyRows],
  );

  const counts = {
    telemetry: telemetryRows.length,
    anomalies: anomalyRows.length,
    predictions: predictionRows.length,
    preventive: preventiveRows.length,
    alerts: alertRows.length,
  };

  /* ─── Column definitions, shared between table and export ────────────── */

  const telemetryColumns = useMemo<Array<ColumnDef<DailyTelemetryRecord, unknown>>>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row) => row.date,
        enableSorting: true,
        meta: { width: '8rem' },
        cell: ({ row }) => <span className="text-[12px] tabular-nums text-fg-soft">{formatDate(row.original.date)}</span>,
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
        id: 'avgPower',
        header: 'Avg power (W)',
        accessorFn: (row) => row.avgPower,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.avgPower, 1)}</span>,
      },
      {
        id: 'peakPower',
        header: 'Peak (W)',
        accessorFn: (row) => row.peakPower,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums text-fg-dim">{formatNumber(row.original.peakPower, 1)}</span>,
      },
      {
        id: 'energy',
        header: 'Energy (kWh)',
        accessorFn: (row) => row.energyKwh,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.energyKwh, 3)}</span>,
      },
      {
        id: 'temperature',
        header: 'Avg temp (°C)',
        accessorFn: (row) => row.avgTemperature,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.avgTemperature, 1)}</span>,
      },
      {
        id: 'health',
        header: 'Avg health',
        accessorFn: (row) => row.avgHealth,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <HealthValue health={row.original.avgHealth} />,
      },
      {
        id: 'uptime',
        header: 'Uptime',
        accessorFn: (row) => row.uptimePct,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums">{formatPercent(row.original.uptimePct, 2)}</span>,
      },
      {
        id: 'anomalies',
        header: 'Anomalies',
        accessorFn: (row) => row.anomalies,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span
            className={cn(
              'text-[12px] font-semibold tabular-nums',
              row.original.anomalies > 2 ? 'text-amber-300' : 'text-fg-soft',
            )}
          >
            {row.original.anomalies}
          </span>
        ),
      },
    ],
    [],
  );

  const anomalyColumns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(
    () => [
      {
        id: 'timestamp',
        header: 'Detected',
        accessorFn: (row) => row.timestamp,
        enableSorting: true,
        meta: { width: '11rem' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">{formatDateTime(row.original.timestamp)}</span>
        ),
      },
      {
        id: 'code',
        header: 'Code',
        accessorFn: (row) => row.code,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[11px] text-fg-soft">
            {row.original.code}
          </span>
        ),
      },
      {
        id: 'title',
        header: 'Title',
        accessorFn: (row) => row.title,
        enableSorting: true,
        meta: { width: '13rem' },
        cell: ({ row }) => <span className="text-[12.5px] font-medium text-fg">{row.original.title}</span>,
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '16rem' },
        cell: ({ row }) => (
          <DeviceIdentity assetId={row.original.assetId} assetName={row.original.assetName} meta={row.original.category} />
        ),
      },
      {
        id: 'severity',
        header: 'Severity',
        accessorFn: (row) => row.severity,
        enableSorting: true,
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} size="xs" />,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) => <AnomalyStatusBadge status={row.original.status} size="xs" />,
      },
      {
        id: 'reading',
        header: 'Observed / threshold',
        accessorFn: (row) => row.observed,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatNumber(row.original.observed, 2)} / {formatNumber(row.original.threshold, 2)} {row.original.unit}
          </span>
        ),
      },
    ],
    [],
  );

  const predictionColumns = useMemo<Array<ColumnDef<PredictionHistoryRecord, unknown>>>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row) => row.date,
        enableSorting: true,
        meta: { width: '8rem' },
        cell: ({ row }) => <span className="text-[12px] tabular-nums text-fg-soft">{formatDate(row.original.date)}</span>,
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '18rem' },
        cell: ({ row }) => <DeviceIdentity assetId={row.original.assetId} assetName={row.original.assetName} />,
      },
      {
        id: 'component',
        header: 'Component',
        accessorFn: (row) => row.component,
        enableSorting: true,
        meta: { width: '13rem' },
        cell: ({ row }) => <span className="text-[12px] font-medium text-fg">{row.original.component}</span>,
      },
      {
        id: 'probability',
        header: 'Failure probability',
        accessorFn: (row) => row.failureProbability,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatPercent(row.original.failureProbability * 100, 1)}</span>
        ),
      },
      {
        id: 'rul',
        header: 'Remaining life (d)',
        accessorFn: (row) => row.rulDays,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.rulDays, 0)}</span>,
      },
      {
        id: 'confidence',
        header: 'Confidence',
        accessorFn: (row) => row.confidence,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums text-fg-soft">{formatPercent(row.original.confidence * 100, 0)}</span>
        ),
      },
    ],
    [],
  );

  const preventiveColumns = useMemo<Array<ColumnDef<PreventiveTask, unknown>>>(
    () => [
      {
        id: 'taskName',
        header: 'Task',
        accessorFn: (row) => row.taskName,
        enableSorting: true,
        meta: { width: '16rem' },
        cell: ({ row }) => <span className="text-[12.5px] font-medium text-fg">{row.original.taskName}</span>,
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '17rem' },
        cell: ({ row }) => (
          <DeviceIdentity assetId={row.original.assetId} assetName={row.original.assetName} meta={row.original.category} />
        ),
      },
      {
        id: 'dueDate',
        header: 'Due',
        accessorFn: (row) => row.dueDate,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <span className="tabular-nums text-fg-soft">{formatDate(row.original.dueDate)}</span>,
      },
      {
        id: 'priority',
        header: 'Priority',
        accessorFn: (row) => row.priority,
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
        id: 'completedAt',
        header: 'Completed',
        accessorFn: (row) => row.completedAt ?? 0,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-[11.5px] text-fg-dim">
            {row.original.completedAt ? formatDate(row.original.completedAt) : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  /* ─── Export definitions per record set ──────────────────────────────── */

  const exportDefs: Record<
    RecordSet,
    { title: string; filename: string; rows: unknown[]; columns: Array<ReportColumn<never>> }
  > = {
    telemetry: {
      title: 'Telemetry History',
      filename: 'intelora_telemetry_history',
      rows: telemetryRows,
      columns: [
        { header: 'Date', value: (row: DailyTelemetryRecord) => formatDate(row.date) },
        { header: 'Asset ID', value: (row: DailyTelemetryRecord) => row.assetId },
        { header: 'Asset Name', value: (row: DailyTelemetryRecord) => row.assetName },
        { header: 'Category', value: (row: DailyTelemetryRecord) => row.category },
        { header: 'Avg Voltage (V)', value: (row: DailyTelemetryRecord) => row.avgVoltage, numeric: true },
        { header: 'Avg Current (A)', value: (row: DailyTelemetryRecord) => row.avgCurrent, numeric: true },
        { header: 'Avg Power (W)', value: (row: DailyTelemetryRecord) => row.avgPower, numeric: true },
        { header: 'Peak Power (W)', value: (row: DailyTelemetryRecord) => row.peakPower, numeric: true },
        { header: 'Energy (kWh)', value: (row: DailyTelemetryRecord) => row.energyKwh, numeric: true },
        { header: 'Avg Temp (C)', value: (row: DailyTelemetryRecord) => row.avgTemperature, numeric: true },
        { header: 'Peak Temp (C)', value: (row: DailyTelemetryRecord) => row.peakTemperature, numeric: true },
        { header: 'Avg Health', value: (row: DailyTelemetryRecord) => row.avgHealth, numeric: true },
        { header: 'Min Health', value: (row: DailyTelemetryRecord) => row.minHealth, numeric: true },
        { header: 'Uptime %', value: (row: DailyTelemetryRecord) => row.uptimePct, numeric: true },
        { header: 'Anomalies', value: (row: DailyTelemetryRecord) => row.anomalies, numeric: true },
      ] as unknown as Array<ReportColumn<never>>,
    },
    anomalies: {
      title: 'Anomaly History',
      filename: 'intelora_anomaly_history',
      rows: anomalyRows,
      columns: [
        { header: 'Detected', value: (row: AnomalyRecord) => formatDateTime(row.timestamp) },
        { header: 'Error Code', value: (row: AnomalyRecord) => row.code },
        { header: 'Title', value: (row: AnomalyRecord) => row.title },
        { header: 'Asset ID', value: (row: AnomalyRecord) => row.assetId },
        { header: 'Asset Name', value: (row: AnomalyRecord) => row.assetName },
        { header: 'Category', value: (row: AnomalyRecord) => row.category },
        { header: 'Severity', value: (row: AnomalyRecord) => row.severity },
        { header: 'Status', value: (row: AnomalyRecord) => row.status },
        { header: 'Observed', value: (row: AnomalyRecord) => row.observed, numeric: true },
        { header: 'Threshold', value: (row: AnomalyRecord) => row.threshold, numeric: true },
        { header: 'Unit', value: (row: AnomalyRecord) => row.unit },
        { header: 'Resolved', value: (row: AnomalyRecord) => (row.resolvedAt ? formatDateTime(row.resolvedAt) : '') },
      ] as unknown as Array<ReportColumn<never>>,
    },
    predictions: {
      title: 'Prediction History',
      filename: 'intelora_prediction_history',
      rows: predictionRows,
      columns: [
        { header: 'Date', value: (row: PredictionHistoryRecord) => formatDate(row.date) },
        { header: 'Asset ID', value: (row: PredictionHistoryRecord) => row.assetId },
        { header: 'Asset Name', value: (row: PredictionHistoryRecord) => row.assetName },
        { header: 'Component', value: (row: PredictionHistoryRecord) => row.component },
        {
          header: 'Failure Probability',
          value: (row: PredictionHistoryRecord) => row.failureProbability,
          numeric: true,
        },
        { header: 'Remaining Life (days)', value: (row: PredictionHistoryRecord) => row.rulDays, numeric: true },
        { header: 'Confidence', value: (row: PredictionHistoryRecord) => row.confidence, numeric: true },
      ] as unknown as Array<ReportColumn<never>>,
    },
    preventive: {
      title: 'Preventive Maintenance History',
      filename: 'intelora_preventive_history',
      rows: preventiveRows,
      columns: [
        { header: 'Task ID', value: (row: PreventiveTask) => row.id },
        { header: 'Task Name', value: (row: PreventiveTask) => row.taskName },
        { header: 'Asset ID', value: (row: PreventiveTask) => row.assetId },
        { header: 'Asset Name', value: (row: PreventiveTask) => row.assetName },
        { header: 'Category', value: (row: PreventiveTask) => row.category },
        { header: 'Due Date', value: (row: PreventiveTask) => formatDate(row.dueDate) },
        { header: 'Priority', value: (row: PreventiveTask) => row.priority },
        { header: 'Status', value: (row: PreventiveTask) => row.status },
        { header: 'Completed', value: (row: PreventiveTask) => (row.completedAt ? formatDate(row.completedAt) : '') },
        { header: 'Interval (days)', value: (row: PreventiveTask) => row.intervalDays, numeric: true },
      ] as unknown as Array<ReportColumn<never>>,
    },
    alerts: {
      title: 'Alert History',
      filename: 'intelora_alert_history',
      rows: alertRows,
      columns: [
        { header: 'Raised', value: (row: AnomalyRecord) => formatDateTime(row.timestamp) },
        { header: 'Error Code', value: (row: AnomalyRecord) => row.code },
        { header: 'Severity', value: (row: AnomalyRecord) => row.severity },
        { header: 'Title', value: (row: AnomalyRecord) => row.title },
        { header: 'Asset ID', value: (row: AnomalyRecord) => row.assetId },
        { header: 'Asset Name', value: (row: AnomalyRecord) => row.assetName },
        { header: 'Status', value: (row: AnomalyRecord) => row.status },
        { header: 'Detail', value: (row: AnomalyRecord) => row.detail },
      ] as unknown as Array<ReportColumn<never>>,
    },
  };

  const activeDef = exportDefs[recordSet];
  const pageCount = Math.max(1, Math.ceil(activeDef.rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedRows = activeDef.rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const runExport = (format: ReportFormat) => {
    if (activeDef.rows.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no records.');
      return;
    }
    void exportReport(format, activeDef.rows as never[], activeDef.columns, {
      filename: activeDef.filename,
      title: activeDef.title,
      subtitle: `${activeDef.rows.length} records · ${RANGE_OPTIONS.find((option) => option.value === range)?.label}`,
      generatedAt: at,
      notes: [
        category === 'all' ? 'All device categories' : `Category: ${category}`,
        needle.length > 0 ? `Search: "${debouncedSearch}"` : 'No search term applied',
      ],
    });
    toast.success('Export started', `${activeDef.rows.length} records to ${format.toUpperCase()}.`);
  };

  /* Daily energy total across the filtered telemetry archive. */
  const energyTrend = useMemo(() => {
    const byDate = new Map<number, number>();
    for (const row of telemetryRows) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.energyKwh);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([date, kwh]) => ({ label: formatDate(date), kwh: Number(kwh.toFixed(2)) }));
  }, [telemetryRows]);

  const filters: FilterDef[] = [
    {
      key: 'range',
      label: 'Date range',
      value: range,
      options: RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      onChange: (value) => {
        setRange(value as RangeValue);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.reports.title}
        subtitle={MODULE_TITLES.reports.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Archive}>
              {formatNumber(daily.length + journal.length + predictions.length + tasks.length)} records retained
            </Badge>
            <Badge tone="neutral" size="sm">
              {RANGE_OPTIONS.find((option) => option.value === range)?.label}
            </Badge>
          </>
        }
        meta={
          <>
            <MetaStat label="Telemetry" value={formatNumber(counts.telemetry)} />
            <MetaStat label="Anomalies" value={formatNumber(counts.anomalies)} />
            <MetaStat label="Predictions" value={formatNumber(counts.predictions)} />
            <MetaStat label="Maintenance" value={formatNumber(counts.preventive)} />
            <MetaStat label="Alerts" value={formatNumber(counts.alerts)} />
          </>
        }
      />

      {/* Export bar — one pipeline, three formats. */}
      <Card>
        <CardHeader
          title="Export current view"
          subtitle="Whatever the table below shows is exactly what leaves in the file"
          eyebrow="Report"
          icon={Download}
          actions={
            <Select
              size="sm"
              aria-label="Date range"
              options={RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={range}
              onChange={(event) => {
                setRange(event.target.value as RangeValue);
                setPage(1);
              }}
              containerClassName="w-40"
            />
          }
        />

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {FORMAT_META.map((format) => {
            const Icon = format.icon;
            return (
              <button
                key={format.value}
                type="button"
                onClick={() => runExport(format.value)}
                disabled={activeDef.rows.length === 0}
                className="group flex items-center gap-3 rounded-xl border border-overlay/[0.07] bg-ink-850/50 p-3.5 text-left transition-all duration-200 ease-enterprise hover:-translate-y-0.5 hover:border-brand-400/25 hover:bg-brand-500/[0.06] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-400/20">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-fg">
                    Export {format.label}
                    <span className="ml-1.5 font-normal tabular-nums text-fg-dim">
                      ({formatNumber(activeDef.rows.length)})
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-fg-dim">{format.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Record set selector. */}
      <Card flush>
        <div className="p-4 sm:p-5">
          <Tabs
            layoutId="reports-tabs"
            value={recordSet}
            onChange={(value) => {
              setRecordSet(value);
              setPage(1);
            }}
            className="border-b-0"
            items={[
              { value: 'telemetry', label: 'Telemetry', icon: Radio, count: counts.telemetry },
              { value: 'anomalies', label: 'Anomalies', icon: ShieldAlert, count: counts.anomalies },
              { value: 'predictions', label: 'Predictions', icon: Waypoints, count: counts.predictions },
              { value: 'preventive', label: 'Maintenance', icon: CalendarCheck, count: counts.preventive },
              { value: 'alerts', label: 'Alerts', icon: ShieldAlert, count: counts.alerts },
            ]}
          />
        </div>
      </Card>

      {recordSet === 'telemetry' && energyTrend.length > 1 ? (
        <BarTrend
          title="Archived daily energy"
          subtitle="Total consumption per day across the filtered device set"
          eyebrow="Trend"
          icon={Radio}
          data={energyTrend}
          series={[{ key: 'kwh', name: 'Energy', color: SERIES[1], unit: 'kWh', decimals: 2 }]}
          height={240}
          footnote="Daily aggregates written when the engine initialised, using the same statistical character as the live stream."
        />
      ) : null}

      {/* One table per record set, all sharing the toolbar and pagination. */}
      {recordSet === 'telemetry' ? (
        <DataTable<DailyTelemetryRecord>
          data={pagedRows as DailyTelemetryRecord[]}
          columns={telemetryColumns}
          rowKey={(row) => `${row.assetId}-${row.date}`}
          density={density}
          minWidth="96rem"
          emptyIcon={Archive}
          emptyTitle="No telemetry records in this range"
          emptyDescription="Widen the date range or clear the category filter."
          toolbar={
            <TableToolbar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              searchPlaceholder="Search device or category…"
              filters={filters}
              activeFilterCount={[range === 'all' ? 'all' : 'set', category].filter((v) => v !== 'all').length}
              onReset={() => {
                setSearch('');
                setRange('30');
                setCategory('all');
                setPage(1);
              }}
            />
          }
          footer={
            <Pagination
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={activeDef.rows.length}
              noun="records"
              pageSizeOptions={PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      ) : null}

      {recordSet === 'anomalies' || recordSet === 'alerts' ? (
        <DataTable<AnomalyRecord>
          data={pagedRows as AnomalyRecord[]}
          columns={anomalyColumns}
          rowKey={(row) => row.id}
          density={density}
          minWidth="94rem"
          emptyIcon={ShieldAlert}
          emptyTitle={recordSet === 'alerts' ? 'No alerts in this range' : 'No anomalies in this range'}
          emptyDescription="Anomalies accumulate while the stream runs. Widen the range or leave the platform streaming."
          toolbar={
            <TableToolbar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              searchPlaceholder="Search code, device or title…"
              filters={filters}
              activeFilterCount={category === 'all' ? 0 : 1}
              onReset={() => {
                setSearch('');
                setRange('30');
                setCategory('all');
                setPage(1);
              }}
            />
          }
          footer={
            <Pagination
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={activeDef.rows.length}
              noun="records"
              pageSizeOptions={PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      ) : null}

      {recordSet === 'predictions' ? (
        <DataTable<PredictionHistoryRecord>
          data={pagedRows as PredictionHistoryRecord[]}
          columns={predictionColumns}
          rowKey={(row) => `${row.assetId}-${row.component}-${row.date}`}
          density={density}
          minWidth="86rem"
          emptyIcon={Waypoints}
          emptyTitle="No prediction records in this range"
          emptyDescription="Widen the date range to see archived prediction scores."
          toolbar={
            <TableToolbar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              searchPlaceholder="Search device or component…"
              filters={filters}
              activeFilterCount={category === 'all' ? 0 : 1}
              onReset={() => {
                setSearch('');
                setRange('30');
                setCategory('all');
                setPage(1);
              }}
            />
          }
          footer={
            <Pagination
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={activeDef.rows.length}
              noun="records"
              pageSizeOptions={PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      ) : null}

      {recordSet === 'preventive' ? (
        <DataTable<PreventiveTask>
          data={pagedRows as PreventiveTask[]}
          columns={preventiveColumns}
          rowKey={(row) => row.id}
          density={density}
          minWidth="88rem"
          emptyIcon={CalendarCheck}
          emptyTitle="No maintenance records match"
          emptyDescription="Clear the category filter or search term."
          toolbar={
            <TableToolbar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              searchPlaceholder="Search task or device…"
              filters={filters}
              activeFilterCount={category === 'all' ? 0 : 1}
              onReset={() => {
                setSearch('');
                setRange('30');
                setCategory('all');
                setPage(1);
              }}
            />
          }
          footer={
            <Pagination
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={activeDef.rows.length}
              noun="records"
              pageSizeOptions={PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        />
      ) : null}

      <p className="text-[11px] leading-relaxed text-fg-dim">
        Telemetry and prediction history are daily aggregates written when the engine initialised, so reports are
        populated from first load. Anomalies and maintenance records are the live journals and grow while the stream runs.
        All five sets share one column definition per report, so a CSV, spreadsheet and PDF of the same view always agree.
      </p>
    </div>
  );
};
