import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, ClipboardList, Clock, Download, ShieldAlert, Wrench } from 'lucide-react';
import type { ActionUrgency, AssetRuntime } from '@/engine/types';
import { URGENCY_TONE, bandDef } from '@/engine/derive';
import { activeByAsset } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { deviceDetailPath } from '@/routes/paths';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast } from '@/hooks';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import {
  HealthBandBadge,
  HealthValue,
  MetaStat,
  PageHeader,
  SectionHeader,
  StatTile,
  StatusBadge,
  UrgencyBadge,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Prescriptive maintenance.
 *
 * Business recommendations only — no telemetry, no charts, no analytics, per
 * specification. Each recommendation is derived from the device's condition
 * band, its weakest component and its connectivity, so it changes when the
 * condition changes rather than being authored once.
 *
 * A healthy device says so explicitly. "No action required" is a real answer and
 * an empty card would read as missing data.
 * ─────────────────────────────────────────────────────────────────────────── */

const URGENCY_ORDER: ActionUrgency[] = ['Immediate', 'Scheduled', 'Monitor', 'None'];

const URGENCY_COPY: Record<ActionUrgency, { heading: string; blurb: string }> = {
  Immediate: {
    heading: 'Immediate action',
    blurb: 'Condition is critical or the device is unreachable. Do not leave these in service unattended.',
  },
  Scheduled: {
    heading: 'Schedule work',
    blurb: 'Degradation is established but contained. Book into the next service window.',
  },
  Monitor: {
    heading: 'Monitor',
    blurb: 'Trending down but serviceable. Observe before committing labour or parts.',
  },
  None: {
    heading: 'No action required',
    blurb: 'Operating normally and within expected wear. Nothing to do.',
  },
};

type UrgencyFilter = ActionUrgency | 'all' | 'actionable';

const URGENCY_FILTERS: Array<{ value: UrgencyFilter; label: string }> = [
  { value: 'actionable', label: 'Actionable' },
  { value: 'Immediate', label: 'Immediate' },
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'Monitor', label: 'Monitor' },
  { value: 'all', label: 'All devices' },
];

interface Row {
  asset: AssetRuntime;
  activeAnomalies: number;
}

const RecommendationCard = ({ row, index }: { row: Row; index: number }) => {
  const { asset } = row;
  const tone = URGENCY_TONE[asset.prescriptive.urgency];
  const band = bandDef(asset.band);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 9) * 0.025, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="relative flex h-full flex-col overflow-hidden" interactive>
        <span className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: tone.color }} aria-hidden />

        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <Link
              to={deviceDetailPath(asset.device.assetId)}
              className="block truncate text-[13px] font-semibold text-fg transition-colors hover:text-brand-200"
            >
              {asset.device.assetName}
            </Link>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-muted">
                {asset.device.assetId}
              </span>
              <span className="truncate text-[10.5px] text-fg-dim">{asset.device.category}</span>
            </p>
          </div>
          <UrgencyBadge urgency={asset.prescriptive.urgency} size="xs" />
        </div>

        {/* The recommendation itself — the reason this page exists. */}
        <div
          className="mt-3.5 rounded-xl border p-3.5"
          style={{ borderColor: `${tone.color}33`, backgroundColor: `${tone.color}0D` }}
        >
          <p className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-fg">
            <Wrench size={13} className="mt-0.5 shrink-0" style={{ color: tone.color }} aria-hidden />
            {asset.prescriptive.action}
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-fg-muted">{asset.prescriptive.rationale}</p>
        </div>

        {/* Context — condition and connectivity, no telemetry. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-overlay/[0.06] pt-3">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Health</span>
            <HealthValue health={asset.health} className="text-[12.5px]" />
          </span>
          <HealthBandBadge band={asset.band} size="xs" showIcon={false} />
          <StatusBadge status={asset.device.status} size="xs" />
          {row.activeAnomalies > 0 ? (
            <Badge tone="critical" size="xs" icon={ShieldAlert}>
              {row.activeAnomalies} open alert{row.activeAnomalies === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-[10.5px] text-fg-dim">
            Limiting component: <span className="text-fg-soft">{asset.prediction.primary.component}</span>
          </span>
          <Link
            to={deviceDetailPath(asset.device.assetId)}
            className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-brand-300 transition-colors hover:text-brand-200"
          >
            Open device
            <ArrowRight size={10} aria-hidden />
          </Link>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-fg-faint">
          Band {band.label.toLowerCase()} · {formatPercent(asset.prediction.primary.failureProbability * 100, 1)}{' '}
          failure probability on the limiting component
        </p>
      </Card>
    </motion.div>
  );
};

export const PrescriptiveMaintenancePage = () => {
  const toast = useToast();
  const assets = useAssetList();
  const journal = useAnomalyJournal();
  const { at } = useSnapshot();

  const [search, setSearch] = useState('');
  const [urgency, setUrgency] = useState<UrgencyFilter>('actionable');
  const [category, setCategory] = useState('all');
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const debouncedSearch = useDebounce(search, 220);
  const activeCounts = useMemo(() => activeByAsset(journal), [journal]);

  const rows = useMemo<Row[]>(
    () => assets.map((asset) => ({ asset, activeAnomalies: activeCounts[asset.device.assetId] ?? 0 })),
    [assets, activeCounts],
  );

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();

    return rows
      .filter((row) => {
        const rowUrgency = row.asset.prescriptive.urgency;
        if (urgency === 'actionable' && rowUrgency === 'None') return false;
        if (urgency !== 'all' && urgency !== 'actionable' && rowUrgency !== urgency) return false;
        if (category !== 'all' && row.asset.device.category !== category) return false;
        if (needle.length > 0) {
          const haystack =
            `${row.asset.device.assetId} ${row.asset.device.assetName} ${row.asset.device.category} ${row.asset.prescriptive.action}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rank =
          URGENCY_ORDER.indexOf(a.asset.prescriptive.urgency) - URGENCY_ORDER.indexOf(b.asset.prescriptive.urgency);
        if (rank !== 0) return rank;
        return a.asset.health - b.asset.health;
      });
  }, [rows, urgency, category, debouncedSearch]);

  const counts = useMemo(
    () =>
      URGENCY_ORDER.reduce<Record<ActionUrgency, number>>(
        (acc, entry) => ({
          ...acc,
          [entry]: rows.filter((row) => row.asset.prescriptive.urgency === entry).length,
        }),
        { Immediate: 0, Scheduled: 0, Monitor: 0, None: 0 },
      ),
    [rows],
  );

  const grouped = useMemo(
    () =>
      URGENCY_ORDER.map((entry) => ({
        urgency: entry,
        rows: filtered.filter((row) => row.asset.prescriptive.urgency === entry),
      })).filter((group) => group.rows.length > 0),
    [filtered],
  );

  const exportColumns: Array<ReportColumn<Row>> = [
    { header: 'Asset ID', value: (row) => row.asset.device.assetId },
    { header: 'Asset Name', value: (row) => row.asset.device.assetName },
    { header: 'Category', value: (row) => row.asset.device.category },
    { header: 'Status', value: (row) => row.asset.device.status },
    { header: 'Condition Band', value: (row) => bandDef(row.asset.band).label },
    { header: 'Health', value: (row) => row.asset.health, numeric: true },
    { header: 'Urgency', value: (row) => row.asset.prescriptive.urgency },
    { header: 'Recommended Action', value: (row) => row.asset.prescriptive.action },
    { header: 'Rationale', value: (row) => row.asset.prescriptive.rationale },
    { header: 'Limiting Component', value: (row) => row.asset.prediction.primary.component },
    { header: 'Open Alerts', value: (row) => row.activeAnomalies, numeric: true },
  ];

  const runExport = () => {
    if (filtered.length === 0) {
      toast.warning('Nothing to export', 'The current filters return no devices.');
      return;
    }
    void exportReport(exportFormat, filtered, exportColumns, {
      filename: 'intelora_prescriptive_actions',
      title: 'Prescriptive Maintenance',
      subtitle: `${filtered.length} recommendations`,
      generatedAt: at,
      notes: [
        `${counts.Immediate} immediate, ${counts.Scheduled} scheduled, ${counts.Monitor} monitor`,
        `${counts.None} device(s) require no action`,
      ],
    });
    toast.success('Export started', `${filtered.length} recommendations to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.prescriptive.title}
        subtitle={MODULE_TITLES.prescriptive.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={ClipboardList}>
              {rows.length} devices assessed
            </Badge>
            {counts.Immediate > 0 ? (
              <Badge tone="critical" size="sm" icon={ShieldAlert}>
                {counts.Immediate} immediate
              </Badge>
            ) : (
              <Badge tone="good" size="sm" icon={CheckCircle2}>
                Nothing immediate
              </Badge>
            )}
          </>
        }
        meta={
          <>
            <MetaStat label="Immediate" value={formatNumber(counts.Immediate)} />
            <MetaStat label="Scheduled" value={formatNumber(counts.Scheduled)} />
            <MetaStat label="Monitor" value={formatNumber(counts.Monitor)} />
            <MetaStat label="No action" value={formatNumber(counts.None)} />
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
        {URGENCY_ORDER.map((entry) => (
          <StatTile
            key={entry}
            label={URGENCY_COPY[entry].heading}
            value={formatNumber(counts[entry])}
            caption={URGENCY_COPY[entry].blurb}
            icon={entry === 'Immediate' ? ShieldAlert : entry === 'Scheduled' ? Wrench : entry === 'Monitor' ? Clock : CheckCircle2}
            accent={URGENCY_TONE[entry].color}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          ariaLabel="Urgency filter"
          layoutId="prescriptive-urgency"
          options={URGENCY_FILTERS}
          value={urgency}
          onChange={setUrgency}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            size="sm"
            aria-label="Category"
            options={[
              { value: 'all', label: 'All categories' },
              ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
            ]}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            containerClassName="w-44"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter devices or actions…"
            aria-label="Filter devices or actions"
            containerClassName="w-56"
          />
        </div>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title={urgency === 'actionable' ? 'No action required anywhere' : 'No devices match this filter'}
            description={
              urgency === 'actionable'
                ? 'Every device is operating normally and within expected wear. Nothing on the estate needs intervention right now.'
                : 'Widen the urgency filter or clear the category to see more devices.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.urgency} className="space-y-4">
              <SectionHeader
                title={URGENCY_COPY[group.urgency].heading}
                subtitle={URGENCY_COPY[group.urgency].blurb}
                actions={
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset',
                      URGENCY_TONE[group.urgency].bg,
                      URGENCY_TONE[group.urgency].text,
                      URGENCY_TONE[group.urgency].ring,
                    )}
                  >
                    {group.rows.length} device{group.rows.length === 1 ? '' : 's'}
                  </span>
                }
              />

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {group.rows.map((row, index) => (
                  <RecommendationCard key={row.asset.device.assetId} row={row} index={index} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-fg-dim">
        Recommendations follow condition, not a schedule: each is derived from the device's current band, its weakest
        component and whether it is reachable. This module carries the recommendation and its reasoning only — the
        readings behind it are in Live Telemetry, and the numbers are in Predictive Maintenance.
      </p>
    </div>
  );
};
