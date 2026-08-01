import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Download,
  FileText,
  Layers,
  ListTree,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import type { AnomalyRecord, AnomalyStatus, Severity } from '@/engine/types';
import { SEVERITY_TONE } from '@/engine/derive';
import { SEVERITY_ORDER, sortBySeverity } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { useAnomalyJournal, useSnapshot } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { formatDateTime, formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { BarTrend } from '@/components/charts';
import { DataTable, Pagination, TableToolbar, type FilterDef } from '@/components/data';
import { AnomalyStatusBadge, DeviceIdentity, SeverityBadge } from '@/components/common';
import {
  FAULT_CLASSES,
  FAULT_RULES,
  breachRatio,
  classifyRecord,
  faultClass,
  isTransient,
  openMs,
  type CategorySelection,
} from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';

/* ───────────────────────────────────────────────────────────────────────────
 * Anomaly report.
 *
 * The module's own report surface: the whole journal with its taxonomy resolved,
 * summarised by class and severity, and exportable to CSV, Excel or PDF.
 *
 * Deliberately not the same thing as Historical Reports. That page browses
 * several archived record sets — telemetry, predictions, tasks — at daily
 * resolution. This one carries the columns only the anomaly module knows about:
 * the M-code, the fault class, the breach against each device's own limit and
 * how long the event stayed open. An operator asked for "the anomaly report"
 * wants those.
 * ─────────────────────────────────────────────────────────────────────────── */

const SEVERITY_OPTIONS: Array<{ value: Severity | 'all'; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'Critical', label: 'Critical' },
  { value: 'Major', label: 'Major' },
  { value: 'Warning', label: 'Warning' },
  { value: 'Info', label: 'Info' },
];

const STATUS_OPTIONS: Array<{ value: AnomalyStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'Active', label: 'Active' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'Resolved', label: 'Resolved' },
];

const PAGE_SIZES = [25, 50, 100, 200];

export const AnomalyReportsPage = () => {
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const snapshot = useSnapshot();

  const now = snapshot.at;

  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [status, setStatus] = useState<AnomalyStatus | 'all'>('all');
  const [faultClassId, setFaultClassId] = useState<CategorySelection>('ALL');
  const [deviceCategory, setDeviceCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [format, setFormat] = useState<ReportFormat>('pdf');

  const debouncedSearch = useDebounce(search, 240);

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return journal
      .filter((record) => {
        const rule = ruleFor(record);
        if (severity !== 'all' && record.severity !== severity) return false;
        if (status !== 'all' && record.status !== status) return false;
        if (faultClassId !== 'ALL' && rule?.classId !== faultClassId) return false;
        if (deviceCategory !== 'all' && record.category !== deviceCategory) return false;
        if (needle.length > 0) {
          const haystack =
            `${record.code} ${record.assetId} ${record.assetName} ${record.title} ${rule?.id ?? ''} ${rule?.signature ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort(sortBySeverity);
  }, [journal, debouncedSearch, severity, status, faultClassId, deviceCategory, ruleFor]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const summary = useMemo(() => {
    const unresolved = filtered.filter((record) => record.status !== 'Resolved');
    const signatures = new Set(
      filtered.map((record) => ruleFor(record)?.id).filter((id): id is string => Boolean(id)),
    );
    const resolved = filtered.filter((record) => record.resolvedAt !== null);

    return {
      total: filtered.length,
      unresolved: unresolved.length,
      critical: filtered.filter((record) => record.severity === 'Critical').length,
      devices: new Set(filtered.map((record) => record.assetId)).size,
      signatures: signatures.size,
      transient: resolved.filter((record) => isTransient(record, now)).length,
      meanOpenMinutes:
        resolved.length === 0
          ? 0
          : resolved.reduce((sum, record) => sum + openMs(record, now), 0) / resolved.length / 60_000,
    };
  }, [filtered, ruleFor, now]);

  /** Severity mix per fault class — the report's headline breakdown. */
  const byClass = useMemo(
    () =>
      FAULT_CLASSES.map((def) => {
        const members = filtered.filter((record) => ruleFor(record)?.classId === def.id);
        return {
          label: def.short,
          Critical: members.filter((record) => record.severity === 'Critical').length,
          Major: members.filter((record) => record.severity === 'Major').length,
          Warning: members.filter((record) => record.severity === 'Warning').length,
          Info: members.filter((record) => record.severity === 'Info').length,
          total: members.length,
        };
      }).filter((row) => row.total > 0),
    [filtered, ruleFor],
  );

  const classSeries = useMemo(
    () =>
      SEVERITY_ORDER.map((band) => ({
        key: band,
        name: band,
        color: SEVERITY_TONE[band].color,
        decimals: 0,
      })),
    [],
  );

  const stats: DetailStat[] = [
    {
      key: 'total',
      label: 'Events in report',
      value: formatNumber(summary.total),
      caption: `${formatNumber(journal.length)} raised this session · ${formatNumber(summary.devices)} device${summary.devices === 1 ? '' : 's'} involved`,
      icon: FileText,
      accent: SERIES[0],
    },
    {
      key: 'unresolved',
      label: 'Still open',
      value: formatNumber(summary.unresolved),
      caption: `${formatNumber(summary.critical)} at critical severity`,
      icon: ShieldAlert,
      accent: '#EAB308',
      tone: summary.unresolved > 0 ? 'bad' : 'good',
    },
    {
      key: 'signatures',
      label: 'Signatures present',
      value: `${formatNumber(summary.signatures)} / ${formatNumber(FAULT_RULES.length)}`,
      caption: 'Distinct M-codes appearing in this selection, out of the catalogue',
      icon: ListTree,
      accent: '#A855F7',
    },
    {
      key: 'clear',
      label: 'Mean time open',
      value: formatNumber(summary.meanOpenMinutes, 1),
      unit: 'min',
      caption: `${formatNumber(summary.transient)} cleared inside a minute — transients rather than standing faults`,
      icon: Timer,
      accent: '#22C55E',
    },
  ];

  /* ─── Columns, shared between the table and the export ─────────────────── */

  const columns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(
    () => [
      {
        id: 'code',
        header: 'Error code',
        accessorFn: (row) => row.code,
        enableSorting: true,
        meta: { width: '8.5rem' },
        cell: ({ row }) => (
          <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[11px] text-fg-soft">
            {row.original.code}
          </span>
        ),
      },
      {
        id: 'signature',
        header: 'Failure mode',
        accessorFn: (row) => ruleFor(row)?.id ?? '',
        enableSorting: true,
        meta: { width: '15rem' },
        cell: ({ row }) => {
          const rule = ruleFor(row.original);
          if (!rule) return <span className="text-[12.5px] text-fg-dim">Unclassified</span>;
          const def = faultClass(rule.classId);
          return (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[3px]"
                style={{ backgroundColor: def.color }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-fg">{rule.signature}</span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {rule.id} · {def.short}
                </span>
              </span>
            </span>
          );
        },
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
            meta={row.original.category}
            idOnly
          />
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
        header: 'State',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) => <AnomalyStatusBadge status={row.original.status} size="xs" />,
      },
      {
        id: 'reading',
        header: 'Observed vs limit',
        accessorFn: (row) => row.observed,
        enableSorting: true,
        meta: { width: '12rem' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg">
            <span className="font-semibold">{formatNumber(row.original.observed, 2)}</span>
            <span className="text-fg-dim"> / {formatNumber(row.original.threshold, 2)}</span>
            <span className="ml-1 text-[10.5px] text-fg-faint">{row.original.unit}</span>
          </span>
        ),
      },
      {
        id: 'breach',
        header: 'Breach',
        accessorFn: (row) => breachRatio(row),
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatPercent(breachRatio(row.original) * 100, 1)}
          </span>
        ),
      },
      {
        id: 'timestamp',
        header: 'Detected',
        accessorFn: (row) => row.timestamp,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-[11.5px] text-fg-dim" title={formatDateTime(row.original.timestamp)}>
            {formatRelative(row.original.timestamp)}
          </span>
        ),
      },
    ],
    [ruleFor],
  );

  const filters: FilterDef[] = [
    {
      key: 'class',
      label: 'Fault class',
      value: faultClassId,
      options: [
        { value: 'ALL', label: 'All classes' },
        ...FAULT_CLASSES.map((entry) => ({ value: entry.id, label: entry.label })),
      ],
      onChange: (value) => {
        setFaultClassId(value as CategorySelection);
        setPage(1);
      },
    },
    {
      key: 'severity',
      label: 'Severity',
      value: severity,
      options: SEVERITY_OPTIONS,
      onChange: (value) => {
        setSeverity(value as Severity | 'all');
        setPage(1);
      },
    },
    {
      key: 'status',
      label: 'State',
      value: status,
      options: STATUS_OPTIONS,
      onChange: (value) => {
        setStatus(value as AnomalyStatus | 'all');
        setPage(1);
      },
    },
    {
      key: 'device',
      label: 'Device type',
      value: deviceCategory,
      options: [
        { value: 'all', label: 'All device types' },
        ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
      ],
      onChange: (value) => {
        setDeviceCategory(value);
        setPage(1);
      },
    },
  ];

  const activeFilterCount =
    (faultClassId === 'ALL' ? 0 : 1) +
    (severity === 'all' ? 0 : 1) +
    (status === 'all' ? 0 : 1) +
    (deviceCategory === 'all' ? 0 : 1);

  const reset = useCallback(() => {
    setSearch('');
    setSeverity('all');
    setStatus('all');
    setFaultClassId('ALL');
    setDeviceCategory('all');
    setPage(1);
  }, []);

  const exportColumns: Array<ReportColumn<AnomalyRecord>> = [
    { header: 'Error Code', value: (row) => row.code },
    { header: 'Rule', value: (row) => ruleFor(row)?.id ?? '' },
    { header: 'Failure Mode', value: (row) => ruleFor(row)?.signature ?? 'Unclassified' },
    {
      header: 'Fault Class',
      value: (row) => {
        const rule = ruleFor(row);
        return rule ? faultClass(rule.classId).label : '';
      },
    },
    { header: 'Severity', value: (row) => row.severity },
    { header: 'State', value: (row) => row.status },
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Device Type', value: (row) => row.category },
    { header: 'Component', value: (row) => row.component ?? '' },
    { header: 'Observed', value: (row) => row.observed, numeric: true },
    { header: 'Threshold', value: (row) => row.threshold, numeric: true },
    { header: 'Unit', value: (row) => row.unit },
    {
      header: 'Breach %',
      value: (row) => Math.round(breachRatio(row) * 10000) / 100,
      numeric: true,
    },
    { header: 'Detection', value: (row) => row.detectionMethod },
    { header: 'Model Score', value: (row) => row.anomalyScore, numeric: true },
    { header: 'Confidence', value: (row) => row.confidence, numeric: true },
    { header: 'Detected', value: (row) => formatDateTime(row.timestamp) },
    { header: 'Resolved', value: (row) => (row.resolvedAt ? formatDateTime(row.resolvedAt) : '') },
    {
      header: 'Minutes Open',
      value: (row) => Math.round((openMs(row, now) / 60_000) * 100) / 100,
      numeric: true,
    },
  ];

  const runExport = () => {
    if (filtered.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no events.');
      return;
    }
    void exportReport(format, filtered, exportColumns, {
      filename: 'intelora_anomaly_report',
      title: 'Anomaly Report',
      subtitle: `${filtered.length} events · ${summary.devices} devices · ${summary.signatures} signatures`,
      generatedAt: now,
      notes: [
        `${summary.unresolved} still open, ${summary.critical} at critical severity`,
        faultClassId === 'ALL' ? 'All fault classes' : `Class: ${faultClass(faultClassId).label}`,
        activeFilterCount > 0 ? `${activeFilterCount} filter(s) applied` : 'No filters applied',
        'Breach is measured against each device’s own profile limit, so figures are comparable across device classes.',
      ],
    });
    toast.success('Export started', `${filtered.length} events to ${format.toUpperCase()}.`);
  };

  return (
    <DetailShell
      title="Anomaly Report"
      subtitle="The full journal with its taxonomy resolved — every event, the rule that named it, and the breach against that device's own limit."
      eyebrow={
        <>
          <Badge tone="brand" size="sm" icon={FileText}>
            {formatNumber(filtered.length)} of {formatNumber(journal.length)} events
          </Badge>
          {summary.unresolved > 0 ? (
            <Badge tone="critical" size="sm" icon={ShieldAlert}>
              {formatNumber(summary.unresolved)} open
            </Badge>
          ) : (
            <Badge tone="good" size="sm" icon={ShieldCheck}>
              Nothing open
            </Badge>
          )}
        </>
      }
      actions={
        <>
          <Select
            size="sm"
            aria-label="Export format"
            options={[
              { value: 'pdf', label: 'PDF' },
              { value: 'excel', label: 'Excel' },
              { value: 'csv', label: 'CSV' },
            ]}
            value={format}
            onChange={(event) => setFormat(event.target.value as ReportFormat)}
            containerClassName="w-24"
          />
          <Button variant="primary" size="sm" icon={Download} onClick={runExport}>
            Export report
          </Button>
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      {byClass.length > 0 ? (
        <BarTrend
          title="Severity mix by fault class"
          subtitle="Every event in the current selection, stacked by the band the detector graded it at"
          eyebrow="Summary"
          icon={Layers}
          data={byClass}
          series={classSeries}
          height={280}
          stacked
          footnote="Severity comes from how far past its own limit each reading sat — 18% over is Critical, 8% Major, 2.5% Warning. A class that is mostly Info is noise at the threshold; one that is mostly Critical is doing real damage."
        />
      ) : null}

      <DataTable<AnomalyRecord>
        data={paged}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        minWidth="92rem"
        emptyIcon={ShieldCheck}
        emptyTitle={journal.length === 0 ? 'No events raised yet' : 'No events match the current filters'}
        emptyDescription={
          journal.length === 0
            ? 'The stream has not produced a sustained threshold breach since this session started.'
            : 'Clear a filter or widen the search term.'
        }
        toolbar={
          <TableToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search code, device, failure mode or rule…"
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
    </DetailShell>
  );
};
