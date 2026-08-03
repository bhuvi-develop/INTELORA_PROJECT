import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheck, Download, Radar, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { AnomalyRecord, AnomalyStatus } from '@/engine/types';
import { sortBySeverity } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { env } from '@/config/env';
import { useAnomalyJournal, useAssetList, useEngineControl, useSnapshot } from '@/engine/store';
import { formatDateTime, formatNumber, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { GrafanaPanel } from '@/components/grafana';
import { DataTable, Pagination, TableToolbar, type FilterDef } from '@/components/data';
import {
  AnomalyStatusBadge,
  DeviceIdentity,
  MetaStat,
  PageHeader,
  SeverityBadge,
} from '@/components/common';
import {
  DetectionQualityGrid,
  EventDetailDrawer,
  FAULT_CLASSES,
  FAULT_RULES,
  FailureClassification,
  StreamNavGrid,
  TaxonomyReference,
  TaxonomyStatusBar,
  faultClass,
  faultRule,
  useAnomalyModule,
  type CategorySelection,
  type SeveritySelection,
} from '@/components/anomaly';

/* ───────────────────────────────────────────────────────────────────────────
 * Anomaly detection.
 *
 * Every record here was raised by the engine when a live reading breached a
 * threshold held on the device's own profile and stayed there — a charger at
 * 19.8 V and a laptop at 20.5 V are each judged against their own tolerance.
 * Nothing on this page is generated for display.
 *
 * The view is three blocks over one shared selection:
 *
 *   1 · status bar        — is the stream trustworthy, and what is open on it
 *   2 · classification    — which failure modes those open events resolve to
 *   3 · detection quality — how well the detector is doing at the selection
 *
 * Selecting a class in block 2 narrows block 3, the traces and the table
 * together. The selection is held in `useAnomalyModule` and never leaves this
 * page, so no other module can be reached by a drill-down made here.
 * ─────────────────────────────────────────────────────────────────────────── */

const SEVERITY_OPTIONS: Array<{ value: SeveritySelection; label: string }> = [
  { value: 'ALL', label: 'All severities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'INFO', label: 'Info' },
];

const STATUS_OPTIONS: Array<{ value: AnomalyStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'Active', label: 'Active' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'Resolved', label: 'Resolved' },
];

const PAGE_SIZES = [10, 25, 50, 100];

export const AnomalyDetectionPage = () => {
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const { at, mttrMinutes } = useSnapshot();
  const { acknowledge, acknowledgeAll } = useEngineControl();

  const module = useAnomalyModule();
  const { state, taxonomy, status, quality, scoped, ruleFor } = module;

  /* Table-local controls. These narrow what is already in module scope; they are
   * not part of the taxonomy selection and nothing else on the page reads them. */
  const [search, setSearch] = useState('');
  const [recordStatus, setRecordStatus] = useState<AnomalyStatus | 'all'>('all');
  const [deviceCategory, setDeviceCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<AnomalyRecord | null>(null);
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const debouncedSearch = useDebounce(search, 240);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return scoped
      .filter((record) => {
        if (recordStatus !== 'all' && record.status !== recordStatus) return false;
        if (deviceCategory !== 'all' && record.category !== deviceCategory) return false;
        if (needle.length > 0) {
          const rule = ruleFor(record);
          const haystack =
            `${record.code} ${record.assetId} ${record.assetName} ${record.title} ${record.category} ${rule?.id ?? ''} ${rule?.signature ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort(sortBySeverity);
  }, [scoped, debouncedSearch, recordStatus, deviceCategory, ruleFor]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const stats = useMemo(() => {
    const active = journal.filter((record) => record.status === 'Active');
    return {
      active: active.length,
      critical: active.filter((record) => record.severity === 'Critical').length,
      acknowledged: journal.filter((record) => record.status === 'Acknowledged').length,
      resolved: journal.filter((record) => record.status === 'Resolved').length,
      affected: new Set(active.map((record) => record.assetId)).size,
    };
  }, [journal]);

  const selectedAsset = useMemo(
    () => (selected ? assets.find((entry) => entry.device.assetId === selected.assetId) : undefined),
    [selected, assets],
  );

  /* ─── Table ────────────────────────────────────────────────────────────── */

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
        meta: { width: '17rem' },
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
        id: 'reading',
        header: 'Observed vs threshold',
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
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) => <AnomalyStatusBadge status={row.original.status} size="xs" />,
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
      {
        id: 'action',
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
    [acknowledge, toast, ruleFor],
  );


  const filters: FilterDef[] = [
    {
      key: 'class',
      label: 'Fault class',
      value: state.selectedCategory,
      options: [
        { value: 'ALL', label: 'All classes' },
        ...FAULT_CLASSES.map((entry) => ({ value: entry.id, label: entry.label })),
      ],
      onChange: (value) => {
        module.selectCategory(value as CategorySelection);
        setPage(1);
      },
    },
    {
      key: 'signature',
      label: 'Failure mode',
      value: state.activeFailureTypeId ?? 'all',
      options: [
        { value: 'all', label: 'All failure modes' },
        ...FAULT_RULES.map((rule) => ({ value: rule.id, label: `${rule.id} · ${rule.signature}` })),
      ],
      onChange: (value) => {
        module.setFailureType(value === 'all' ? null : value);
        setPage(1);
      },
    },
    {
      key: 'severity',
      label: 'Severity',
      value: state.selectedSeverity,
      options: SEVERITY_OPTIONS,
      onChange: (value) => {
        module.selectSeverity(value as SeveritySelection);
        setPage(1);
      },
    },
    {
      key: 'status',
      label: 'State',
      value: recordStatus,
      options: STATUS_OPTIONS,
      onChange: (value) => {
        setRecordStatus(value as AnomalyStatus | 'all');
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
    (state.selectedCategory === 'ALL' ? 0 : 1) +
    (state.selectedSeverity === 'ALL' ? 0 : 1) +
    (state.activeFailureTypeId === null ? 0 : 1) +
    (state.classifiedOnly ? 1 : 0) +
    (recordStatus === 'all' ? 0 : 1) +
    (deviceCategory === 'all' ? 0 : 1);

  const reset = useCallback(() => {
    setSearch('');
    setRecordStatus('all');
    setDeviceCategory('all');
    setPage(1);
    module.clearDrilldown();
  }, [module]);

  /* ─── Drill-down chips ─────────────────────────────────────────────────── */

  const drilldown: Array<{ key: string; label: string; color?: string; onClear: () => void }> = [];
  if (state.selectedCategory !== 'ALL') {
    const def = faultClass(state.selectedCategory);
    drilldown.push({
      key: 'class',
      label: def.label,
      color: def.color,
      onClear: () => module.selectCategory('ALL'),
    });
  }
  if (state.activeFailureTypeId !== null) {
    const rule = faultRule(state.activeFailureTypeId);
    drilldown.push({
      key: 'signature',
      label: rule ? `${rule.id} · ${rule.signature}` : state.activeFailureTypeId,
      onClear: () => module.setFailureType(null),
    });
  }
  if (state.selectedSeverity !== 'ALL') {
    drilldown.push({
      key: 'severity',
      label: `${state.selectedSeverity.charAt(0)}${state.selectedSeverity.slice(1).toLowerCase()} severity`,
      onClear: () => module.selectSeverity('ALL'),
    });
  }
  if (state.classifiedOnly) {
    drilldown.push({
      key: 'classified',
      label: 'Classified only',
      onClear: module.toggleClassifiedOnly,
    });
  }

  /* ─── Export ───────────────────────────────────────────────────────────── */

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
    { header: 'Title', value: (row) => row.title },
    { header: 'Severity', value: (row) => row.severity },
    { header: 'Status', value: (row) => row.status },
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Device Type', value: (row) => row.category },
    { header: 'Observed', value: (row) => row.observed, numeric: true },
    { header: 'Threshold', value: (row) => row.threshold, numeric: true },
    { header: 'Unit', value: (row) => row.unit },
    { header: 'Detected', value: (row) => formatDateTime(row.timestamp) },
    { header: 'Resolved', value: (row) => (row.resolvedAt ? formatDateTime(row.resolvedAt) : '') },
  ];

  const runExport = () => {
    if (filtered.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no anomalies.');
      return;
    }
    void exportReport(exportFormat, filtered, exportColumns, {
      filename: 'intelora_anomalies',
      title: 'Anomaly Journal',
      subtitle: `${filtered.length} records`,
      generatedAt: at,
      notes: [
        `${stats.active} active, ${stats.critical} at critical severity`,
        state.selectedCategory === 'ALL'
          ? 'All fault classes'
          : `Class: ${faultClass(state.selectedCategory).label}`,
        activeFilterCount > 0 ? `${activeFilterCount} filter(s) applied` : 'No filters applied',
      ],
    });
    toast.success('Export started', `${filtered.length} anomalies to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.anomaly.title}
        subtitle={MODULE_TITLES.anomaly.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Radar}>
              {journal.length} raised this session
            </Badge>
            {stats.active > 0 ? (
              <Badge tone="critical" size="sm" icon={ShieldAlert}>
                {stats.active} active
              </Badge>
            ) : (
              <Badge tone="good" size="sm" icon={ShieldCheck}>
                Nothing active
              </Badge>
            )}
            {stats.critical > 0 ? (
              <Badge tone="critical" size="sm">
                {stats.critical} critical
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Devices affected" value={formatNumber(stats.affected)} />
            <MetaStat label="Acknowledged" value={formatNumber(stats.acknowledged)} />
            <MetaStat label="Self-cleared" value={formatNumber(stats.resolved)} />
            <MetaStat label="Mean time to clear" value={`${formatNumber(mttrMinutes, 1)} min`} />
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={CheckCheck}
              disabled={stats.active === 0}
              onClick={() => {
                const count = acknowledgeAll();
                toast.success('Batch acknowledged', `${count} active anomal${count === 1 ? 'y' : 'ies'} claimed.`);
              }}
            >
              Acknowledge all
            </Button>
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

      {/* ─── 1 · Real-time taxonomy and status ──────────────────────────── */}
      <TaxonomyStatusBar
        status={status}
        taxonomy={taxonomy}
        selectedCategory={state.selectedCategory}
        onSelectCategory={module.toggleCategory}
        onOpenTaxonomy={() => module.setTaxonomyModal(true)}
      />

      {drilldown.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-overlay/[0.06] bg-ink-850/40 px-3.5 py-2.5">
          <span className="eyebrow shrink-0">Drill-down</span>
          {drilldown.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex h-6 items-center gap-1.5 rounded-md bg-overlay/[0.06] px-2 text-[11.5px] font-medium text-fg-soft ring-1 ring-inset ring-overlay/10 transition-colors hover:bg-overlay/[0.1] hover:text-fg"
            >
              {chip.color ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: chip.color }}
                  aria-hidden
                />
              ) : null}
              {chip.label}
              <X size={11} aria-hidden />
            </button>
          ))}
          <span className="text-[11px] tabular-nums text-fg-dim">
            {formatNumber(scoped.length)} of {formatNumber(journal.length)} events in scope
          </span>
          <Button variant="ghost" size="xs" className="ml-auto" onClick={module.clearDrilldown}>
            Clear all
          </Button>
        </div>
      ) : null}

      {/* ─── 2 · Failure classification ─────────────────────────────────── */}
      <FailureClassification
        taxonomy={taxonomy}
        selectedCategory={state.selectedCategory}
        activeFailureTypeId={state.activeFailureTypeId}
        classifiedOnly={state.classifiedOnly}
        onSelectCategory={module.toggleCategory}
        onSelectFailureType={module.selectFailureType}
        onOpenTaxonomy={() => module.setTaxonomyModal(true)}
        onViewClassified={module.toggleClassifiedOnly}
      />

      {/* ─── 3 · Detection quality ──────────────────────────────────────── */}
      <DetectionQualityGrid
        quality={quality}
        selectedCategory={state.selectedCategory}
        scopedCount={scoped.length}
      />

      {/* ─── Streams ────────────────────────────────────────────────────
          Two entry points rather than two charts. Both charts that stood here
          were compromises the slot forced — four severities stacked into one
          plot, and channels normalised out of their own units so they could
          share an axis. Each now opens a page that does not need either
          compromise. */}
      <StreamNavGrid />

      <DataTable<AnomalyRecord>
        data={paged}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        onRowClick={(row) => setSelected(row)}
        minWidth="88rem"
        emptyIcon={ShieldCheck}
        emptyTitle={journal.length === 0 ? 'No anomalies raised yet' : 'No anomalies match the current selection'}
        emptyDescription={
          journal.length === 0
            ? 'The stream has not produced a sustained threshold breach since this session started. Leave it running and events will appear here.'
            : 'Clear a drill-down chip or widen the search term.'
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
            noun="anomalies"
            pageSizeOptions={PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />

      <GrafanaPanel
        dashboard={env.grafana.dashboards.anomaly}
        panelId={2}
        title="Detection engine analysis"
        subtitle="Residual distribution and score thresholds served from Grafana"
        height={320}
        refresh="30s"
        variables={{ severity: state.selectedSeverity, class: state.selectedCategory }}
      />

      {/* ─── Reference and detail ───────────────────────────────────────── */}
      <TaxonomyReference
        open={state.isTaxonomyModalOpen}
        onClose={() => module.setTaxonomyModal(false)}
        taxonomy={taxonomy}
        activeFailureTypeId={state.activeFailureTypeId}
        onSelectFailureType={(id) => {
          module.setFailureType(id);
          setPage(1);
        }}
      />

      <EventDetailDrawer
        record={selected}
        rule={selected ? ruleFor(selected) : null}
        asset={selectedAsset}
        now={at}
        flaggedFalseAlarm={selected !== null && module.falseAlarms.has(selected.id)}
        onToggleFalseAlarm={(id) => {
          module.toggleFalseAlarm(id);
          toast.info(
            module.falseAlarms.has(id) ? 'False alarm withdrawn' : 'Logged as a false alarm',
            'Precision and the noise envelope for this signature update for the session.',
          );
        }}
        onAcknowledge={(record) => {
          acknowledge(record.id);
          toast.success('Anomaly acknowledged', `${record.code} on ${record.assetId}.`);
          setSelected(null);
        }}
        onClose={() => setSelected(null)}
      />
    </div>
  );
};
