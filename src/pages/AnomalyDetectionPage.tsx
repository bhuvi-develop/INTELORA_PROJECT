import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  AlertTriangle,
  CheckCheck,
  Crosshair,
  Download,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import type { AnomalyRecord, AnomalyStatus, AnomalyType, Severity } from '@/engine/types';
import { ANOMALY_DEFS, SEVERITY_TONE } from '@/engine/derive';
import {
  CHANNEL_FOR_ANOMALY,
  SEVERITY_ORDER,
  bucketBySeverity,
  sortBySeverity,
  tallyByType,
} from '@/engine/analytics';
import { DEVICE_CATEGORIES, channelMeta } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { CHANNEL_COLOR, SERIES } from '@/config/viz';
import { env } from '@/config/env';
import { useAnomalyJournal, useAssetList, useEngineControl, useSnapshot } from '@/engine/store';
import { formatDateTime, formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { AreaTrend, BarTrend, LineTrend } from '@/components/charts';
import type { SeriesDef } from '@/components/charts';
import { AiPanel } from '@/components/ai';
import { GrafanaPanel } from '@/components/grafana';
import { DataTable, Pagination, TableToolbar, type FilterDef } from '@/components/data';
import {
  AnomalyStatusBadge,
  DeviceIdentity,
  MetaStat,
  PageHeader,
  SeverityBadge,
  StatTile,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Anomaly detection.
 *
 * Every record here was raised by the engine when a live reading breached a
 * threshold held on the device's own profile and stayed there — a charger at
 * 19.8 V and a UPS at 230 V are each judged against their own tolerance. Nothing
 * on this page is generated for display.
 * ─────────────────────────────────────────────────────────────────────────── */

const TIMELINE_SERIES: SeriesDef[] = SEVERITY_ORDER.map((severity) => ({
  key: severity,
  name: severity,
  color: SEVERITY_TONE[severity].color,
  decimals: 0,
}));

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

const PAGE_SIZES = [10, 25, 50, 100];

export const AnomalyDetectionPage = () => {
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const { at, mttrMinutes } = useSnapshot();
  const { acknowledge, acknowledgeAll } = useEngineControl();

  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [status, setStatus] = useState<AnomalyStatus | 'all'>('all');
  const [type, setType] = useState<AnomalyType | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<AnomalyRecord | null>(null);
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const debouncedSearch = useDebounce(search, 240);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return journal
      .filter((record) => {
        if (severity !== 'all' && record.severity !== severity) return false;
        if (status !== 'all' && record.status !== status) return false;
        if (type !== 'all' && record.type !== type) return false;
        if (category !== 'all' && record.category !== category) return false;
        if (needle.length > 0) {
          const haystack =
            `${record.code} ${record.assetId} ${record.assetName} ${record.title} ${record.category}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort(sortBySeverity);
  }, [journal, debouncedSearch, severity, status, type, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const stats = useMemo(() => {
    const active = journal.filter((record) => record.status === 'Active');
    const acknowledged = journal.filter((record) => record.status === 'Acknowledged');
    const resolved = journal.filter((record) => record.status === 'Resolved');
    return {
      active: active.length,
      critical: active.filter((record) => record.severity === 'Critical').length,
      acknowledged: acknowledged.length,
      resolved: resolved.length,
      mttr: mttrMinutes,
      affected: new Set(active.map((record) => record.assetId)).size,
    };
  }, [journal, mttrMinutes]);

  const timeline = useMemo(() => bucketBySeverity(journal, at), [journal, at]);
  const tallies = useMemo(() => tallyByType(journal), [journal]);

  const typeBars = useMemo(
    () => tallies.filter((entry) => entry.count > 0).map((entry) => ({ label: entry.label, count: entry.count })),
    [tallies],
  );

  /* Channel history around the selected event, so the evidence is the actual
   * stream rather than a redrawn illustration. */
  const evidence = useMemo(() => {
    if (!selected) return null;
    const asset = assets.find((entry) => entry.device.assetId === selected.assetId);
    if (!asset) return null;

    const channel = CHANNEL_FOR_ANOMALY[selected.type];
    const meta = channelMeta(channel);

    return {
      asset,
      channel,
      meta,
      data: asset.history.slice(-90).map((sample) => ({
        label: sample.label,
        t: sample.t,
        [channel]: sample[channel],
        threshold: selected.threshold,
      })),
      series: [
        {
          key: channel,
          name: meta.label,
          color: CHANNEL_COLOR[channel] ?? SERIES[0],
          unit: meta.unit,
          decimals: meta.decimals,
        },
        {
          key: 'threshold',
          name: 'Threshold',
          color: SEVERITY_TONE.Critical.color,
          unit: meta.unit,
          decimals: meta.decimals,
          reference: true,
        },
      ] satisfies SeriesDef[],
    };
  }, [selected, assets]);

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
        id: 'title',
        header: 'Title',
        accessorFn: (row) => row.title,
        enableSorting: true,
        meta: { width: '13rem' },
        cell: ({ row }) => <span className="text-[12.5px] font-semibold text-fg">{row.original.title}</span>,
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
    [acknowledge, toast],
  );

  const filters: FilterDef[] = [
    {
      key: 'severity',
      label: 'Severity',
      value: severity,
      options: SEVERITY_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      onChange: (value) => {
        setSeverity(value as Severity | 'all');
        setPage(1);
      },
    },
    {
      key: 'status',
      label: 'State',
      value: status,
      options: STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      onChange: (value) => {
        setStatus(value as AnomalyStatus | 'all');
        setPage(1);
      },
    },
    {
      key: 'type',
      label: 'Type',
      value: type,
      options: [
        { value: 'all', label: 'All types' },
        ...(Object.keys(ANOMALY_DEFS) as AnomalyType[]).map((entry) => ({
          value: entry,
          label: `${ANOMALY_DEFS[entry].code} · ${ANOMALY_DEFS[entry].title}`,
        })),
      ],
      onChange: (value) => {
        setType(value as AnomalyType | 'all');
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

  const activeFilterCount = [severity, status, type, category].filter((value) => value !== 'all').length;

  const reset = useCallback(() => {
    setSearch('');
    setSeverity('all');
    setStatus('all');
    setType('all');
    setCategory('all');
    setPage(1);
  }, []);

  const exportColumns: Array<ReportColumn<AnomalyRecord>> = [
    { header: 'Error Code', value: (row) => row.code },
    { header: 'Title', value: (row) => row.title },
    { header: 'Severity', value: (row) => row.severity },
    { header: 'Status', value: (row) => row.status },
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Category', value: (row) => row.category },
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
            <MetaStat label="Mean time to clear" value={`${formatNumber(stats.mttr, 1)} min`} />
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active anomalies"
          value={formatNumber(stats.active)}
          caption={`${stats.affected} device${stats.affected === 1 ? '' : 's'} affected`}
          icon={ShieldAlert}
          accent={stats.active > 0 ? SEVERITY_TONE.Critical.color : SEVERITY_TONE.Info.color}
        />
        <StatTile
          label="Critical severity"
          value={formatNumber(stats.critical)}
          caption="Breach magnitude above 18% of threshold"
          icon={AlertTriangle}
          accent={SEVERITY_TONE.Critical.color}
        />
        <StatTile
          label="Acknowledged"
          value={formatNumber(stats.acknowledged)}
          caption="Claimed and under investigation"
          icon={CheckCheck}
          accent={SEVERITY_TONE.Warning.color}
        />
        <StatTile
          label="Mean time to clear"
          value={formatNumber(stats.mttr, 1)}
          unit="min"
          caption={`${stats.resolved} events self-cleared`}
          icon={Timer}
          accent={SERIES[2]}
        />
      </div>

      <AiPanel module="anomaly" />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <AreaTrend
          title="Detection timeline"
          subtitle="Anomalies raised per two-minute window, stacked by severity"
          eyebrow="Volume"
          icon={Activity}
          data={timeline}
          series={TIMELINE_SERIES}
          height={280}
          stacked
          footnote="An event is raised only after a breach persists across consecutive samples, and cleared only once the reading returns inside the threshold with margin — so a single noisy sample never appears here."
        />

        <BarTrend
          title="Signature families"
          subtitle="Event count by anomaly type, ranked by volume"
          eyebrow="Attribution"
          icon={Crosshair}
          data={typeBars}
          series={[{ key: 'count', name: 'Events', color: SERIES[0], decimals: 0 }]}
          layout="horizontal"
          height={280}
          categoryWidth={132}
          footnote="A family spanning several categories points at a shared cause rather than isolated component wear."
        />
      </div>

      <DataTable<AnomalyRecord>
        data={paged}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        onRowClick={(row) => setSelected(row)}
        minWidth="88rem"
        emptyIcon={ShieldCheck}
        emptyTitle={journal.length === 0 ? 'No anomalies raised yet' : 'No anomalies match the current filters'}
        emptyDescription={
          journal.length === 0
            ? 'The stream has not produced a sustained threshold breach since this session started. Leave it running and events will appear here.'
            : 'Clear a filter or widen the search term.'
        }
        toolbar={
          <TableToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search code, device, title or category…"
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
        variables={{ severity, type }}
      />

      {/* ─── Event detail ───────────────────────────────────────────────── */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? `${selected.code} · ${selected.title}` : ''}
        subtitle={selected ? `${selected.assetName} · detected ${formatRelative(selected.timestamp)}` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected?.status === 'Active' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  acknowledge(selected.id);
                  toast.success('Anomaly acknowledged', `${selected.code} on ${selected.assetId}.`);
                  setSelected(null);
                }}
              >
                Acknowledge and assign
              </Button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={selected.severity} />
              <AnomalyStatusBadge status={selected.status} />
              <Badge tone="neutral" size="sm">
                {selected.category}
              </Badge>
              <Badge tone="neutral" size="sm">
                {selected.assetId}
              </Badge>
            </div>

            <p className="text-[12.5px] leading-relaxed text-fg-muted">{selected.detail}</p>

            {evidence ? (
              <LineTrend
                title="Channel evidence"
                subtitle={`${evidence.meta.label} on ${selected.assetId} against the threshold that was breached`}
                eyebrow="Live stream"
                data={evidence.data}
                series={evidence.series}
                height={220}
                domain={['auto', 'auto']}
                footnote="Taken from the retained sample window on this device — the same stream the detector reads."
              />
            ) : null}

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Observed', value: `${formatNumber(selected.observed, 2)} ${selected.unit}` },
                { label: 'Threshold', value: `${formatNumber(selected.threshold, 2)} ${selected.unit}` },
                {
                  label: 'Breach',
                  value:
                    selected.threshold === 0
                      ? '—'
                      : formatPercent(
                          (Math.abs(selected.observed - selected.threshold) / Math.abs(selected.threshold)) * 100,
                          1,
                        ),
                },
                {
                  label: 'Cleared',
                  value: selected.resolvedAt ? formatRelative(selected.resolvedAt) : 'Still open',
                },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">{row.label}</dt>
                  <dd className="mt-1.5 truncate text-[12.5px] font-semibold tabular-nums text-fg">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
