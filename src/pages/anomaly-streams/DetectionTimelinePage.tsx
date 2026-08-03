import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  CircleSlash,
  Clock3,
  Cpu,
  Download,
  Filter,
  Flame,
  Gauge,
  Info,
  LayoutGrid,
  ListFilter,
  PieChart,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Tags,
  TrendingUp,
} from 'lucide-react';
import type { AnomalyRecord, AssetRuntime, DailyTelemetryRecord, Severity } from '@/engine/types';
import { SEVERITY_TONE } from '@/engine/derive';
import { bucketBySeverity, sortBySeverity } from '@/engine/analytics';
import { DEVICE_BRANDS, DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { PATHS } from '@/routes/paths';
import {
  useAnomalyJournal,
  useAssetList,
  useDailyRecords,
  useEngineControl,
  useSnapshot,
} from '@/engine/store';
import { formatDateTime, formatNumber, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import {
  AreaTrend,
  BarTrend,
  DonutSplit,
  Heatmap,
  LineTrend,
  type SeriesDef,
} from '@/components/charts';
import { DataTable, Pagination, TableToolbar } from '@/components/data';
import {
  AnomalyStatusBadge,
  DeviceIdentity,
  EventTimeline,
  MetaStat,
  PageHeader,
  SectionHeader,
  SeverityBadge,
  type TimelineEvent,
} from '@/components/common';
import { classifyRecord, openMs } from '@/components/anomaly';
import { bucketJournal } from '@/pages/anomaly-metrics/metricSeries';
import {
  ALL,
  DEFAULT_FILTERS,
  HEATMAP_HOURS,
  SEVERITIES,
  activeFilterCount,
  applyFilters,
  brandIndex,
  bucketByHour,
  bucketDaily,
  bucketMonthly,
  bucketWeekly,
  deviceTallies,
  groupBy,
  journalStart,
  severityByHour,
  severitySplit,
  type TimelineFilters,
} from './timelineSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * Detection timeline analytics.
 *
 * Everything on this page is a count of events the detector delivered, sliced a
 * different way each time. No figure is recomputed here and no threshold is
 * applied — grouping, bucketing and ordering only.
 *
 * Two sources, kept apart because they cover different spans. The live journal
 * (`/api/anomalies`) is the detector's in-memory record and reaches back as far
 * as the backend process has been running; it feeds everything except the daily,
 * weekly and monthly views, which read the thirty-day PostgreSQL archive
 * (`/api/reports/daily`). Neither is derived from the other, and each chart says
 * which it read.
 *
 * Two dimensions the brief asked for do not exist on this platform. The asset
 * register holds id, name, category, brand, model and status — there is no site
 * or factory anywhere in the model, and no assignee, so there is nothing to
 * group by or to fill an "acknowledged by" column with. Rather than ship two
 * empty dropdowns and a column of dashes, the real dimensions stand in: device
 * class where a plant grouping was wanted, brand where a site split was, and the
 * note under the filter bar says so.
 * ─────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZES = [10, 25, 50, 100];

/* Fallbacks for the defensive reads below. Held at module scope so the empty
 * case keeps a stable identity — `?? []` would mint a new array on every render
 * and defeat the memoisation of everything downstream of it. */
const NO_EVENTS: AnomalyRecord[] = [];
const NO_ASSETS: AssetRuntime[] = [];
const NO_DAILY: DailyTelemetryRecord[] = [];

const RANGE_OPTIONS = [
  { value: '0', label: 'All retained' },
  { value: '1', label: 'Last hour' },
  { value: '6', label: 'Last 6 hours' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
  { value: '720', label: 'Last 30 days' },
];

const STATUS_OPTIONS = [
  { value: ALL, label: 'All states' },
  { value: 'Active', label: 'Active' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'Resolved', label: 'Resolved' },
];

const severityColor = (severity: Severity): string => SEVERITY_TONE[severity].color;

const single = (key: string, name: string, color: string, unit?: string): SeriesDef[] => [
  { key, name, color, unit, decimals: 0 },
];

/** Stacked-by-severity series, in fixed severity order so colour never moves. */
const stackedSeverity = (): SeriesDef[] =>
  SEVERITIES.map((severity) => ({
    key: severity,
    name: severity,
    color: severityColor(severity),
    decimals: 0,
  }));

/** Duration an event has been, or was, open — rendered from published stamps. */
const durationLabel = (record: AnomalyRecord, now: number): string => {
  const ms = openMs(record, now);
  if (ms < 60_000) return `${formatNumber(ms / 1000, 0)} s`;
  if (ms < 3_600_000) return `${formatNumber(ms / 60_000, 1)} min`;
  return `${formatNumber(ms / 3_600_000, 1)} h`;
};

export const DetectionTimelinePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const { acknowledge } = useEngineControl();

  /* Every read is defensive: the archive endpoint is optional and the engine
   * publishes an empty snapshot until the first response lands. */
  const journal = useAnomalyJournal() ?? NO_EVENTS;
  const assets = useAssetList() ?? NO_ASSETS;
  const dailyRecords = useDailyRecords() ?? NO_DAILY;
  const snapshot = useSnapshot();

  const now = snapshot?.at ?? Date.now();

  const [filters, setFilters] = useState<TimelineFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const debouncedSearch = useDebounce(search, 240);

  const setFilter = useCallback(<K extends keyof TimelineFilters>(key: K, value: TimelineFilters[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }, []);

  /* ─── Scope ────────────────────────────────────────────────────────────── */

  const brandById = useMemo(() => brandIndex(assets), [assets]);

  const scoped = useMemo(
    () => applyFilters(journal, filters, brandById, now),
    [journal, filters, brandById, now],
  );

  const filterCount = activeFilterCount(filters);
  const hasEvents = scoped.length > 0;

  /* ─── Derivations ──────────────────────────────────────────────────────── */

  const timeline = useMemo(() => bucketBySeverity(scoped, now), [scoped, now]);
  const flow = useMemo(() => bucketJournal(scoped, now), [scoped, now]);
  const hourly = useMemo(() => bucketByHour(scoped, now), [scoped, now]);

  /* The archive is device-level and carries no severity, so the period trends
   * cannot honour the severity or status filters. They are left whole and the
   * footnotes say so rather than silently ignoring the control. */
  const daily = useMemo(() => bucketDaily(dailyRecords), [dailyRecords]);
  const weekly = useMemo(() => bucketWeekly(daily), [daily]);
  const monthly = useMemo(() => bucketMonthly(daily), [daily]);

  const severities = useMemo(() => severitySplit(scoped, severityColor), [scoped]);
  const devices = useMemo(() => deviceTallies(scoped), [scoped]);
  const topTen = useMemo(() => devices.slice(0, 10), [devices]);
  const byCategory = useMemo(() => groupBy(scoped, (record) => record.category), [scoped]);
  const byBrand = useMemo(
    () => groupBy(scoped, (record) => brandById.get(record.assetId)),
    [scoped, brandById],
  );
  const heatCells = useMemo(() => severityByHour(scoped), [scoped]);

  const oldest = useMemo(() => journalStart(scoped), [scoped]);
  const spanHours = oldest === null ? 0 : Math.max(0, (now - oldest) / 3_600_000);

  const timelineEvents = useMemo<TimelineEvent[]>(
    () =>
      [...scoped]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 40)
        .map((record) => ({
          id: record.id,
          title: record.title,
          description: record.detail,
          severity: record.severity,
          at: record.timestamp,
          tag: record.code,
          meta: `${record.assetId} · ${record.status}`,
        })),
    [scoped],
  );

  /* ─── KPI cards ────────────────────────────────────────────────────────── */

  const kpis = useMemo(() => {
    const count = (predicate: (record: AnomalyRecord) => boolean) => scoped.filter(predicate).length;

    return [
      {
        key: 'total',
        label: 'Total events',
        value: formatNumber(scoped.length),
        caption: `${formatNumber(devices.length)} device${devices.length === 1 ? '' : 's'} involved`,
        icon: Radar,
        accent: SERIES[0],
      },
      {
        key: 'critical',
        label: 'Critical events',
        value: formatNumber(count((r) => r.severity === 'Critical')),
        caption: 'Highest severity band the detector raises',
        icon: AlertOctagon,
        accent: severityColor('Critical'),
      },
      {
        key: 'major',
        label: 'Major events',
        value: formatNumber(count((r) => r.severity === 'Major')),
        caption: 'Breach past the major boundary',
        icon: ShieldAlert,
        accent: severityColor('Major'),
      },
      {
        key: 'warning',
        label: 'Warning events',
        value: formatNumber(count((r) => r.severity === 'Warning')),
        caption: 'Inside tolerance but outside the envelope',
        icon: Gauge,
        accent: severityColor('Warning'),
      },
      {
        key: 'info',
        label: 'Info events',
        value: formatNumber(count((r) => r.severity === 'Info')),
        caption: 'Recorded for context, no action implied',
        icon: Info,
        accent: severityColor('Info'),
      },
      {
        key: 'active',
        label: 'Active alerts',
        value: formatNumber(count((r) => r.status === 'Active')),
        caption: 'Raised and not yet claimed or cleared',
        icon: Flame,
        accent: STATUS_COLOR.critical,
      },
      {
        key: 'cleared',
        label: 'Cleared alerts',
        value: formatNumber(count((r) => r.status === 'Resolved')),
        caption: `${formatNumber(count((r) => r.status === 'Acknowledged'))} acknowledged and still open`,
        icon: ShieldCheck,
        accent: STATUS_COLOR.good,
      },
      {
        key: 'rate',
        label: 'Events / hour',
        value: spanHours <= 0 ? '—' : formatNumber(scoped.length / spanHours, 1),
        caption:
          spanHours <= 0
            ? 'Needs more than one hour of journal to report a rate'
            : `Over ${formatNumber(spanHours, 1)} h of record in scope`,
        icon: TrendingUp,
        accent: SERIES[2],
      },
    ];
  }, [scoped, devices.length, spanHours]);

  /* ─── Raw events ───────────────────────────────────────────────────────── */

  const searched = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    const rows = needle.length === 0
      ? scoped
      : scoped.filter((record) => {
          const rule = classifyRecord(record, now);
          return `${record.code} ${record.assetId} ${record.assetName} ${record.title} ${record.severity} ${record.status} ${record.category} ${rule?.id ?? ''} ${rule?.signature ?? ''}`
            .toLowerCase()
            .includes(needle);
        });
    return [...rows].sort(sortBySeverity);
  }, [scoped, debouncedSearch, now]);

  const pageCount = Math.max(1, Math.ceil(searched.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => searched.slice((safePage - 1) * pageSize, safePage * pageSize),
    [searched, safePage, pageSize],
  );

  const columns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(
    () => [
      {
        id: 'timestamp',
        header: 'Timestamp',
        accessorFn: (row) => row.timestamp,
        enableSorting: true,
        meta: { width: '11rem' },
        cell: ({ row }) => (
          <span className="text-[11.5px] tabular-nums text-fg-soft" title={formatDateTime(row.original.timestamp)}>
            {formatRelative(row.original.timestamp)}
          </span>
        ),
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetId,
        enableSorting: true,
        meta: { width: '16rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.assetId}
            assetName={row.original.assetName}
            meta={brandById.get(row.original.assetId) ?? row.original.category}
          />
        ),
      },
      {
        id: 'category',
        header: 'Device class',
        accessorFn: (row) => row.category,
        enableSorting: true,
        cell: ({ row }) => <span className="text-[12px] text-fg-soft">{row.original.category}</span>,
      },
      {
        id: 'severity',
        header: 'Severity',
        accessorFn: (row) => row.severity,
        enableSorting: true,
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} size="xs" />,
      },
      {
        id: 'type',
        header: 'Alert type',
        accessorFn: (row) => row.title,
        enableSorting: true,
        meta: { width: '15rem' },
        cell: ({ row }) => (
          <span className="block truncate text-[12.5px] text-fg-soft" title={row.original.detail}>
            {row.original.title}
          </span>
        ),
      },
      {
        id: 'rule',
        header: 'Detection rule',
        accessorFn: (row) => classifyRecord(row, now)?.id ?? '',
        enableSorting: true,
        meta: { width: '13rem' },
        cell: ({ row }) => {
          const rule = classifyRecord(row.original, now);
          if (!rule) return <span className="text-[12px] text-fg-dim">Unclassified</span>;
          return (
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-fg-soft">{rule.signature}</span>
              <span className="block font-mono text-[10.5px] text-fg-faint">{rule.id}</span>
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) => <AnomalyStatusBadge status={row.original.status} size="xs" />,
      },
      {
        id: 'duration',
        header: 'Duration',
        accessorFn: (row) => openMs(row, now),
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[11.5px] tabular-nums text-fg-soft">{durationLabel(row.original, now)}</span>
        ),
      },
      {
        id: 'component',
        header: 'Component',
        accessorFn: (row) => row.component ?? '',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[12px] text-fg-dim">{row.original.component ?? '—'}</span>
        ),
      },
      {
        id: 'updated',
        header: 'Last updated',
        accessorFn: (row) => row.resolvedAt ?? row.timestamp,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-[11.5px] text-fg-dim">
            {formatRelative(row.original.resolvedAt ?? row.original.timestamp)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.status === 'Active' ? (
            <Button
              variant="subtle"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                acknowledge(row.original.id);
                toast.success('Anomaly acknowledged', `${row.original.code} on ${row.original.assetId}.`);
              }}
            >
              Acknowledge
            </Button>
          ) : null,
      },
    ],
    [now, brandById, acknowledge, toast],
  );

  const exportColumns: Array<ReportColumn<AnomalyRecord>> = [
    { header: 'Timestamp', value: (row) => formatDateTime(row.timestamp) },
    { header: 'Error Code', value: (row) => row.code },
    { header: 'Device ID', value: (row) => row.assetId },
    { header: 'Device Name', value: (row) => row.assetName },
    { header: 'Device Class', value: (row) => row.category },
    { header: 'Brand', value: (row) => brandById.get(row.assetId) ?? '' },
    { header: 'Severity', value: (row) => row.severity },
    { header: 'Alert Type', value: (row) => row.title },
    { header: 'Detection Rule', value: (row) => classifyRecord(row, now)?.id ?? '' },
    { header: 'Failure Signature', value: (row) => classifyRecord(row, now)?.signature ?? 'Unclassified' },
    { header: 'Status', value: (row) => row.status },
    { header: 'Duration', value: (row) => durationLabel(row, now) },
    { header: 'Component', value: (row) => row.component ?? '' },
    { header: 'Observed', value: (row) => row.observed, numeric: true },
    { header: 'Threshold', value: (row) => row.threshold, numeric: true },
    { header: 'Unit', value: (row) => row.unit },
    { header: 'Last Updated', value: (row) => formatDateTime(row.resolvedAt ?? row.timestamp) },
  ];

  const runExport = () => {
    if (searched.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no timeline records.');
      return;
    }
    void exportReport(exportFormat, searched, exportColumns, {
      filename: 'intelora_detection_timeline',
      title: 'Detection Timeline',
      subtitle: `${searched.length} events`,
      generatedAt: now,
      notes: [
        filterCount > 0 ? `${filterCount} filter(s) applied` : 'No filters applied',
        `Journal span ${formatNumber(spanHours, 1)} h`,
      ],
    });
    toast.success('Export started', `${searched.length} events to ${exportFormat.toUpperCase()}.`);
  };

  /* ─── Filter bar ───────────────────────────────────────────────────────── */

  const deviceOptions = useMemo(
    () => [
      { value: ALL, label: 'All devices' },
      ...[...assets]
        .sort((a, b) => a.device.assetId.localeCompare(b.device.assetId))
        .map((asset) => ({ value: asset.device.assetId, label: asset.device.assetId })),
    ],
    [assets],
  );

  const emptyReason =
    journal.length === 0
      ? 'The detector has not raised an event since the backend started.'
      : 'No timeline records available for the selected filters.';

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─────────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-[11.5px] text-fg-dim">
          <li>
            <Link to={PATHS.cockpit} className="transition-colors hover:text-fg-soft">
              Cockpit
            </Link>
          </li>
          <li aria-hidden className="text-fg-faint">
            <ChevronRight size={12} />
          </li>
          <li>
            <Link to={PATHS.anomaly} className="transition-colors hover:text-fg-soft">
              {MODULE_TITLES.anomaly.title}
            </Link>
          </li>
          <li aria-hidden className="text-fg-faint">
            <ChevronRight size={12} />
          </li>
          <li className="font-medium text-fg-soft" aria-current="page">
            Detection Timeline
          </li>
        </ol>
      </nav>

      {/* ─── Page header ────────────────────────────────────────────────── */}
      <PageHeader
        title="Detection Timeline Analytics"
        subtitle="Every raised event on one clock — by severity, by period, by device and by hour of day."
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Radar}>
              {formatNumber(scoped.length)} in scope
            </Badge>
            <Badge tone="neutral" size="sm" icon={Clock3}>
              {spanHours < 1
                ? `${formatNumber(spanHours * 60, 0)} min of journal`
                : `${formatNumber(spanHours, 1)} h of journal`}
            </Badge>
            <Badge tone={daily.length > 0 ? 'neutral' : 'warning'} size="sm" icon={CalendarDays}>
              {formatNumber(daily.length)} d archived
            </Badge>
            {filterCount > 0 ? (
              <Badge tone="brand" size="sm" icon={Filter}>
                {filterCount} filter{filterCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Devices involved" value={formatNumber(devices.length)} />
            <MetaStat label="Active" value={formatNumber(scoped.filter((r) => r.status === 'Active').length)} />
            <MetaStat label="Mean time to clear" value={`${formatNumber(snapshot?.mttrMinutes ?? 0, 1)} min`} />
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

      {/* ─── Back ───────────────────────────────────────────────────────── */}
      <div>
        <Button variant="ghost" size="sm" icon={ArrowLeft} className="-ml-1" onClick={() => navigate(PATHS.anomaly)}>
          Back to Anomaly Detection
        </Button>
      </div>

      {/* ─── Global filters ─────────────────────────────────────────────── */}
      <div className="sticky top-2 z-20">
        <Card className="backdrop-blur-md">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 pb-1.5 pr-1">
              <ListFilter size={14} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="eyebrow">Filters</span>
            </div>

            <Select
              size="sm"
              label="Date range"
              options={RANGE_OPTIONS}
              value={String(filters.rangeHours)}
              onChange={(event) => setFilter('rangeHours', Number(event.target.value))}
              containerClassName="w-40"
            />
            <Select
              size="sm"
              label="Device"
              options={deviceOptions}
              value={filters.assetId}
              onChange={(event) => setFilter('assetId', event.target.value)}
              containerClassName="w-40"
            />
            <Select
              size="sm"
              label="Device class"
              options={[
                { value: ALL, label: 'All classes' },
                ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
              ]}
              value={filters.category}
              onChange={(event) => setFilter('category', event.target.value)}
              containerClassName="w-44"
            />
            <Select
              size="sm"
              label="Brand"
              options={[
                { value: ALL, label: 'All brands' },
                ...DEVICE_BRANDS.map((entry) => ({ value: entry, label: entry })),
              ]}
              value={filters.brand}
              onChange={(event) => setFilter('brand', event.target.value)}
              containerClassName="w-40"
            />
            <Select
              size="sm"
              label="Severity"
              options={[
                { value: ALL, label: 'All severities' },
                ...SEVERITIES.map((entry) => ({ value: entry, label: entry })),
              ]}
              value={filters.severity}
              onChange={(event) => setFilter('severity', event.target.value)}
              containerClassName="w-40"
            />
            <Select
              size="sm"
              label="Status"
              options={STATUS_OPTIONS}
              value={filters.status}
              onChange={(event) => setFilter('status', event.target.value)}
              containerClassName="w-40"
            />

            {filterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                icon={CircleSlash}
                className="mb-0.5"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPage(1);
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <p className="mt-3 border-t border-overlay/[0.06] pt-2.5 text-[10.5px] leading-relaxed text-fg-faint">
            No site or factory filter is offered because the estate has no location hierarchy — the asset
            register holds device id, name, class, brand, model and status, and nothing else. Device class and
            brand are the real grouping dimensions and are used wherever a plant or site split was wanted.
          </p>
        </Card>
      </div>

      {/* ─── KPI cards ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.key} className="relative flex flex-col pl-5" interactive>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
              style={{ backgroundColor: kpi.accent }}
            />
            <div className="flex items-start justify-between gap-3">
              <p className="eyebrow truncate">{kpi.label}</p>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-overlay/[0.07]"
                style={{ backgroundColor: `${kpi.accent}1A`, color: kpi.accent }}
              >
                <kpi.icon size={14} aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-fg">
              {kpi.value}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">{kpi.caption}</p>
          </Card>
        ))}
      </div>

      {/* ─── Charts ─────────────────────────────────────────────────────── */}
      <SectionHeader
        title="Timeline charts"
        subtitle="One measure per chart, each in its own card. Unrelated metrics are never combined."
      />

      {!hasEvents ? (
        <Card>
          <EmptyState
            icon={Radar}
            title="No timeline records available for the selected filters"
            description={emptyReason}
            action={
              filterCount > 0 ? (
                <Button variant="secondary" size="sm" icon={CircleSlash} onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <LineTrend
            title="Event trend"
            subtitle="Total events raised per two-minute window across the journal in scope"
            eyebrow="Time series"
            icon={Activity}
            data={timeline}
            series={single('total', 'Events raised', SERIES[0])}
            height={280}
            domain={[0, 'auto']}
            footnote="One line, one measure: how many events were raised. The severity split is the chart below, where it can be read without a small band hiding under a large one."
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <DonutSplit
              title="Severity distribution"
              subtitle="Share of the events in scope held by each severity band"
              eyebrow="Distribution"
              icon={PieChart}
              data={severities.filter((slice) => slice.value > 0)}
              height={216}
              centerValue={formatNumber(scoped.length)}
              centerLabel="events in scope"
              footnote="Severity is graded by the backend from how far past its own limit the reading sat. The bands are the platform's, not this page's."
            />

            <BarTrend
              title="Hourly event trend"
              subtitle="Events raised per hour, anchored on the hour"
              eyebrow="Hourly"
              icon={Clock3}
              data={hourly}
              series={single('events', 'Events raised', SERIES[2])}
              height={280}
              footnote={
                oldest === null
                  ? 'Nothing in scope, so every hour reads zero.'
                  : `Read from the live journal, which reaches back ${spanHours < 1 ? `${formatNumber(spanHours * 60, 0)} minutes` : `${formatNumber(spanHours, 1)} hours`}. Hours before that are shown empty rather than hidden.`
              }
            />
          </div>

          {daily.length > 0 ? (
            <>
              <AreaTrend
                title="Daily event trend"
                subtitle="Events per day from the stored archive"
                eyebrow="Daily"
                icon={CalendarDays}
                data={daily}
                series={single('events', 'Events raised', SERIES[0])}
                height={280}
                footnote={`Read from the thirty-day PostgreSQL archive rather than the live journal — ${formatNumber(daily.length)} day${daily.length === 1 ? '' : 's'} covered. The archive is device-and-day level and carries no severity or state, so the severity and status filters above do not narrow this chart.`}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <LineTrend
                  title="Weekly trend"
                  subtitle="Events per seven-day window from the stored archive"
                  eyebrow="Weekly"
                  icon={CalendarRange}
                  data={weekly}
                  series={single('events', 'Events raised', SERIES[4])}
                  height={260}
                  domain={[0, 'auto']}
                  footnote="Windows are anchored on the most recent day covered rather than on the calendar, so every bucket except possibly the oldest spans the same seven days."
                />

                <AreaTrend
                  title="Monthly trend"
                  subtitle="Events per calendar month from the stored archive"
                  eyebrow="Monthly"
                  icon={TrendingUp}
                  data={monthly}
                  series={single('events', 'Events raised', SERIES[6])}
                  height={260}
                  footnote={`The archive holds thirty days, so this resolves to ${formatNumber(monthly.length)} month${monthly.length === 1 ? '' : 's'} and the earliest is partial. Shown at the resolution the data supports rather than extended to fill an axis.`}
                />
              </div>
            </>
          ) : (
            <Card>
              <CardHeader
                title="Daily, weekly and monthly trends"
                subtitle="Aggregated from the stored detection archive"
                eyebrow="Periods"
                icon={CalendarDays}
              />
              <div className="mt-4">
                <EmptyState
                  icon={CalendarDays}
                  title="Archive not available"
                  description="The daily report endpoint has not returned. These three trends read stored history rather than the live journal, and none is synthesised from it — so they stay empty until the archive loads."
                />
              </div>
            </Card>
          )}

          <BarTrend
            title="Device-wise events"
            subtitle="Every device that has raised an event, busiest first"
            eyebrow="Attribution"
            icon={Cpu}
            data={devices}
            series={single('events', 'Events raised', SERIES[1])}
            layout="horizontal"
            height={Math.max(220, devices.length * 32)}
            categoryWidth={108}
            footnote="Ranked by total events regardless of severity. A device high here with no critical events is noisy; one with few events that are all critical is the one to open first."
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <BarTrend
              title="Top 10 devices"
              subtitle="The heaviest contributors to the journal in scope"
              eyebrow="Ranking"
              icon={BarChart3}
              data={topTen}
              series={single('events', 'Events raised', SERIES[3])}
              height={300}
              footnote="The same tally as the chart above, capped at ten so the axis stays readable when the estate grows."
            />

            <BarTrend
              title="Device class events by severity"
              subtitle="Class-wise volume, stacked by the severity each event was graded at"
              eyebrow="Grouped"
              icon={LayoutGrid}
              data={byCategory}
              series={stackedSeverity()}
              height={300}
              stacked
              footnote="Device class stands in for the plant grouping the estate does not model. Class is a published property of every event, so this is measured rather than assumed."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <DonutSplit
              title="Brand distribution"
              subtitle="Events by device brand, resolved through the asset register"
              eyebrow="Distribution"
              icon={Tags}
              data={byBrand.map((row, index) => ({
                key: row.label,
                name: row.label,
                value: row.total,
                color: SERIES[index % SERIES.length],
              }))}
              height={216}
              centerValue={formatNumber(byBrand.length)}
              centerLabel={`brand${byBrand.length === 1 ? '' : 's'} affected`}
              footnote="Brand stands in for the site split the estate does not model. It is carried on the asset register rather than on the event, so it is joined by device id."
            />

            <AreaTrend
              title="Alert state history"
              subtitle="Events raised against events cleared, per two-minute window"
              eyebrow="State flow"
              icon={ShieldCheck}
              data={flow}
              series={[
                { key: 'raised', name: 'Raised', color: STATUS_COLOR.critical, decimals: 0 },
                { key: 'cleared', name: 'Cleared', color: STATUS_COLOR.good, decimals: 0 },
              ]}
              height={280}
              footnote="Both series count state transitions rather than standing totals: raised is stamped at detection, cleared at the moment the reading returned inside the limit with margin. Windows where cleared outruns raised are the queue draining."
            />
          </div>

          <Heatmap
            title="Event heatmap"
            subtitle="Severity against hour of day, across the journal in scope"
            eyebrow="Density"
            icon={Flame}
            cells={heatCells}
            rows={[...SEVERITIES]}
            cols={HEATMAP_HOURS}
            colLabel={(hour) => `${String(hour).padStart(2, '0')}:00`}
            valueLabel={(value) => `${formatNumber(value)} event${value === 1 ? '' : 's'}`}
            footnote="Hour is taken from each event's own timestamp in your local zone. Every hour is drawn even when empty — dropping quiet columns would compress the axis and make a short history look like a busy night."
          />

          <EventTimeline
            title="Timeline distribution"
            subtitle="The most recent events in scope, newest first"
            eyebrow="Chronology"
            icon={Activity}
            events={timelineEvents}
            limit={20}
            emptyTitle="Nothing on the timeline"
            emptyDescription="No event in scope carries a timestamp to place."
          />

          {/* ─── Timeline reports ─────────────────────────────────────────── */}
          <SectionHeader
            title="Timeline reports"
            subtitle="Period summaries over the same scope, for hand-off rather than for reading on screen"
          />

          <Card>
            <CardHeader
              title="Period summary"
              subtitle="What each window contributed, and how it was graded"
              eyebrow="Report"
              icon={Table2}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Busiest hour', value: hourly.reduce((peak, bucket) => (bucket.events > peak.events ? bucket : peak), hourly[0]) },
              ].map((cell) => (
                <div key={cell.label} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                    {cell.label}
                  </p>
                  <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-fg">
                    {cell.value ? `${cell.value.label} · ${formatNumber(cell.value.events)}` : '—'}
                  </p>
                </div>
              ))}
              {severities.map((slice) => (
                <div key={slice.key} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
                  <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden
                    />
                    {slice.name}
                  </p>
                  <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-fg">
                    {formatNumber(slice.value)}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 border-t border-overlay/[0.06] pt-3.5 text-[11px] leading-relaxed text-fg-dim">
              Every figure above is a tally of records the detector delivered under the current filters. Use the
              export control in the header to take the row-level record out as CSV, Excel or PDF.
            </p>
          </Card>
        </>
      )}

      {/* ─── Raw events table ───────────────────────────────────────────── */}
      <SectionHeader
        title="Raw events"
        subtitle="The row-level record behind every chart above, sortable, searchable and exportable"
      />

      <DataTable<AnomalyRecord>
        data={paged}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        minWidth="104rem"
        emptyIcon={Table2}
        emptyTitle="No timeline records available for the selected filters"
        emptyDescription={emptyReason}
        toolbar={
          <TableToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search code, device, alert type, rule or status…"
            activeFilterCount={filterCount}
            onReset={() => {
              setSearch('');
              setFilters(DEFAULT_FILTERS);
              setPage(1);
            }}
          />
        }
        footer={
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={searched.length}
            noun="events"
            pageSizeOptions={PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />
    </div>
  );
};
