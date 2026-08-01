import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Brain,
  Download,
  ExternalLink,
  HeartPulse,
  MonitorSmartphone,
  Timer,
  TrendingDown,
} from 'lucide-react';
import { bandDef } from '@/engine/derive';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { deviceDetailPath } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn } from '@/utils/report';
import { useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { BarTrend, ScatterRisk, type ScatterPoint } from '@/components/charts';
import { DataTable } from '@/components/data';
import { DeviceIdentity, StatusBadge } from '@/components/common';
import { useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { groupMissesByCategory, riskRows, type RiskRow } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * False negative analytics.
 *
 * A miss is a device the platform already rates critical or high-risk while
 * nothing has been raised against it. That is the only false-negative signal
 * available without field failure reports: the detector cannot be scored against
 * breakdowns nobody recorded.
 *
 * Recall counts devices on both sides rather than events, so the two terms are
 * commensurable. The scatter is condition against remaining life, which is the
 * pair that decides whether a miss actually matters — a degraded device with a
 * long horizon is a triage item, one with a short horizon is not.
 * ─────────────────────────────────────────────────────────────────────────── */

export const FalseNegativesMetricPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const snapshot = useSnapshot();
  const { quality } = useAnomalyModule();

  const fn = quality.falseNegative;

  const unresolved = useMemo(
    () => journal.filter((record) => record.status !== 'Resolved'),
    [journal],
  );

  const rows = useMemo(() => riskRows(assets, unresolved), [assets, unresolved]);
  const missed = useMemo(() => rows.filter((row) => row.missed), [rows]);
  const byCategory = useMemo(() => groupMissesByCategory(assets, unresolved), [assets, unresolved]);

  /**
   * Condition against remaining life, for every device.
   *
   * The quadrant split is the platform's own critical band boundary and a
   * fortnight of remaining life — both published, neither chosen here.
   */
  const points = useMemo<ScatterPoint[]>(
    () =>
      rows.map((row) => ({
        id: row.asset.device.assetId,
        label: row.asset.device.assetId,
        x: Math.round(row.asset.health * 10) / 10,
        y: Math.round(row.asset.prediction.primary.rulDays * 10) / 10,
        z: Math.max(1, row.open),
        group: row.missed ? 'Unflagged at risk' : row.open > 0 ? 'Flagged' : 'Healthy',
        meta: `${row.asset.device.assetName} · ${row.open} open · weakest ${row.asset.prediction.primary.component}`,
      })),
    [rows],
  );

  const stats: DetailStat[] = [
    {
      key: 'recall',
      label: 'Recall score',
      value:
        fn.recallPct === null || fn.detectedAssets + fn.missedAssets === 0
          ? '—'
          : formatPercent(fn.recallPct, 1),
      caption: 'TP / (TP + FN), counting devices rather than events so both terms are comparable',
      icon: TrendingDown,
      accent: '#A855F7',
      tone: fn.recallPct >= 80 ? 'good' : 'bad',
    },
    {
      key: 'detected',
      label: 'Detected devices',
      value: formatNumber(fn.detectedAssets),
      caption: `Carrying at least one open event, out of ${formatNumber(assets.length)} commissioned`,
      icon: HeartPulse,
      accent: '#22C55E',
      tone: 'good',
    },
    {
      key: 'missed',
      label: 'Unflagged at risk',
      value: formatNumber(fn.missedAssets),
      caption: 'Rated critical or high-risk by the platform with nothing raised against them',
      icon: MonitorSmartphone,
      accent: STATUS_COLOR.critical,
      tone: fn.missedAssets > 0 ? 'bad' : 'good',
    },
    {
      key: 'retrain',
      label: 'Retraining set',
      value: formatNumber(missed.length),
      unit: missed.length === 1 ? 'device' : 'devices',
      caption:
        missed.length > 0
          ? missed.slice(0, 4).map((row) => row.asset.device.assetId).join(', ')
          : 'Nothing to retrain against',
      icon: Brain,
      accent: '#38BDF8',
    },
  ];

  const columns = useMemo<Array<ColumnDef<RiskRow, unknown>>>(
    () => [
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.asset.device.assetName,
        enableSorting: true,
        meta: { width: '18rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.asset.device.assetId}
            assetName={row.original.asset.device.assetName}
            meta={`${row.original.asset.device.brand} ${row.original.asset.device.model}`}
          />
        ),
      },
      {
        id: 'verdict',
        header: 'Detector',
        accessorFn: (row) => (row.missed ? 0 : 1),
        enableSorting: true,
        cell: ({ row }) =>
          row.original.missed ? (
            <Badge tone="critical" size="xs">
              Missed
            </Badge>
          ) : row.original.open > 0 ? (
            <Badge tone="good" size="xs">
              Flagged
            </Badge>
          ) : (
            <Badge tone="neutral" size="xs">
              Not at risk
            </Badge>
          ),
      },
      {
        id: 'link',
        header: 'Link',
        accessorFn: (row) => row.asset.device.status,
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.asset.device.status} size="xs" />,
      },
      {
        id: 'health',
        header: 'Condition',
        accessorFn: (row) => row.asset.health,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => {
          const def = bandDef(row.original.asset.band);
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: def.color }}
                aria-hidden
              />
              <span className="text-[12px] tabular-nums text-fg-soft">
                {formatPercent(row.original.asset.health, 1)}
              </span>
            </span>
          );
        },
      },
      {
        id: 'risk',
        header: 'Risk tier',
        accessorFn: (row) => row.asset.riskTier,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[12px] capitalize text-fg-soft">{row.original.asset.riskTier}</span>
        ),
      },
      {
        id: 'rul',
        header: 'Remaining life',
        accessorFn: (row) => row.asset.prediction.primary.rulDays,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatNumber(row.original.asset.prediction.primary.rulDays, 1)} d
          </span>
        ),
      },
      {
        id: 'component',
        header: 'Weakest component',
        accessorFn: (row) => row.asset.prediction.primary.component,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[12px] text-fg-soft">{row.original.asset.prediction.primary.component}</span>
        ),
      },
      {
        id: 'open',
        header: 'Open events',
        accessorFn: (row) => row.open,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12.5px] font-semibold tabular-nums text-fg">
            {formatNumber(row.original.open)}
          </span>
        ),
      },
      {
        id: 'action',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="xs"
            icon={ExternalLink}
            onClick={(event) => {
              event.stopPropagation();
              navigate(deviceDetailPath(row.original.asset.device.assetId));
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [navigate],
  );

  const runExport = () => {
    if (missed.length === 0) {
      toast.warning('Nothing to export', 'No at-risk device is currently unflagged.');
      return;
    }
    const columnsOut: Array<ReportColumn<RiskRow>> = [
      { header: 'Asset ID', value: (row) => row.asset.device.assetId },
      { header: 'Asset Name', value: (row) => row.asset.device.assetName },
      { header: 'Category', value: (row) => row.asset.category },
      { header: 'Health', value: (row) => Math.round(row.asset.health * 10) / 10, numeric: true },
      { header: 'Band', value: (row) => row.asset.band },
      { header: 'Risk Tier', value: (row) => row.asset.riskTier },
      {
        header: 'RUL Days',
        value: (row) => Math.round(row.asset.prediction.primary.rulDays * 10) / 10,
        numeric: true,
      },
      { header: 'Weakest Component', value: (row) => row.asset.prediction.primary.component },
      {
        header: 'Failure Probability',
        value: (row) => Math.round(row.asset.prediction.primary.failureProbability * 1000) / 1000,
        numeric: true,
      },
    ];
    void exportReport('csv', missed, columnsOut, {
      filename: 'intelora_retraining_set',
      title: 'False negative retraining set',
      subtitle: `${missed.length} at-risk devices with nothing raised`,
      generatedAt: snapshot.at,
      notes: [
        `Recall ${fn.recallPct === null ? 'unknown' : formatPercent(fn.recallPct, 1)} at device level`,
        'Ground truth is the platform’s own risk rating; no field failure reports are available to score against.',
      ],
    });
    toast.success('Export started', `${missed.length} devices to CSV.`);
  };

  return (
    <DetailShell
      title="False Negative Analytics & Missed Breakdowns"
      subtitle="Devices the platform already rates at risk while the detector has raised nothing against them."
      eyebrow={
        <>
          <Badge tone={fn.recallPct >= 80 ? 'good' : 'critical'} size="sm" icon={TrendingDown}>
            Recall {fn.recallPct === null ? '—' : formatPercent(fn.recallPct, 1)}
          </Badge>
          {fn.missedAssets > 0 ? (
            <Badge tone="critical" size="sm">
              {formatNumber(fn.missedAssets)} missed
            </Badge>
          ) : (
            <Badge tone="good" size="sm">
              Nothing missed
            </Badge>
          )}
        </>
      }
      actions={
        <Button variant="secondary" size="sm" icon={Download} onClick={runExport}>
          Export retraining set
        </Button>
      }
    >
      <DetailStatStrip stats={stats} />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <ScatterRisk
          title="Condition against remaining life"
          subtitle="Every commissioned device, grouped by what the detector did about it"
          eyebrow="Coverage"
          icon={HeartPulse}
          points={points}
          xLabel="Health score (%)"
          yLabel="Remaining useful life (days)"
          height={320}
          quadrant={{ x: bandDef('critical').min > 0 ? bandDef('warning').min : 65, y: 14 }}
          quadrantLabels={[
            'Degraded, long horizon',
            'Healthy, long horizon',
            'Degraded, short horizon',
            'Healthy, short horizon',
          ]}
          onSelect={(point) => navigate(deviceDetailPath(point.id))}
          footnote="The bottom-left quadrant is where a miss matters: degraded condition and a short published horizon. A device sitting top-left is degrading but has time, which is a triage item rather than an escape. Bubble size is the count of open events."
        />

        <BarTrend
          title="Miss rate by device class"
          subtitle="At-risk devices per class, and how many carry nothing raised"
          eyebrow="Comparison"
          icon={MonitorSmartphone}
          data={byCategory}
          series={[
            { key: 'atRisk', name: 'At risk', color: SERIES[3], decimals: 0 },
            { key: 'missed', name: 'Missed', color: STATUS_COLOR.critical, decimals: 0 },
            { key: 'flagged', name: 'Flagged', color: '#22C55E', decimals: 0 },
          ]}
          xKey="category"
          height={320}
          footnote="A class where at-risk and missed track together is a model gap for that hardware. A class where flagged keeps pace with at-risk is being covered."
        />
      </div>

      {/* ─── Retraining scope ───────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Model retraining scope"
          subtitle="What a retraining pass would be given, and what it could not be told"
          eyebrow="Next step"
          icon={Brain}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Devices in set', value: formatNumber(missed.length) },
            {
              label: 'Mean health',
              value:
                missed.length === 0
                  ? '—'
                  : formatPercent(
                      missed.reduce((sum, row) => sum + row.asset.health, 0) / missed.length,
                      1,
                    ),
            },
            {
              label: 'Soonest horizon',
              value:
                missed.length === 0
                  ? '—'
                  : `${formatNumber(Math.min(...missed.map((row) => row.asset.prediction.primary.rulDays)), 1)} d`,
            },
            {
              label: 'Classes affected',
              value: formatNumber(new Set(missed.map((row) => row.asset.category)).size),
            },
          ].map((cell) => (
            <div key={cell.label} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                {cell.label}
              </p>
              <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-fg">{cell.value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-overlay/[0.06] pt-3.5 text-[11.5px] leading-relaxed text-fg-dim">
          Retraining is not triggered from here, and the button above exports rather than fires: the platform
          holds no training endpoint, and inventing a control that appears to start a job it cannot start would
          be worse than not offering one. The export is the handoff — it carries the condition, risk tier,
          remaining life and weakest component for every device the detector did not flag.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
          One limit worth stating: ground truth here is the platform’s own risk rating, not a recorded
          breakdown. A detector and a risk model that share inputs can agree with each other and both be
          wrong — closing that gap needs field failure reports the estate does not yet collect.
        </p>
      </Card>

      <DataTable<RiskRow>
        data={rows}
        columns={columns}
        rowKey={(row) => row.asset.device.assetId}
        density={density}
        minWidth="92rem"
        onRowClick={(row) => navigate(deviceDetailPath(row.asset.device.assetId))}
        emptyIcon={Timer}
        emptyTitle="No devices commissioned"
        emptyDescription="The asset register returned nothing."
        toolbar={
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg">Coverage by device</p>
            <p className="mt-0.5 text-[11.5px] text-fg-dim">
              Missed devices first, then by soonest remaining life
            </p>
          </div>
        }
      />
    </DetailShell>
  );
};
