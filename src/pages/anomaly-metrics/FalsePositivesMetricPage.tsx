import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertOctagon,
  ArrowRight,
  Download,
  FileText,
  Filter,
  Radio,
  Sigma,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { useAnomalyJournal, useSnapshot } from '@/engine/store';
import { PATHS } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatDateTime, formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn } from '@/utils/report';
import { useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AreaTrend, BarTrend, LineTrend, type SeriesDef } from '@/components/charts';
import { DataTable } from '@/components/data';
import { DeviceIdentity, SeverityBadge } from '@/components/common';
import { breachRatio, classifyRecord, faultClass, useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { bucketJournal, groupByChannel, ratioPct } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * False positive analytics.
 *
 * Precision here is the rule-versus-model agreement: the rule raises, and the
 * isolation forest either backs it or does not. An event the model never backed
 * is counted against precision, and so is one an engineer has marked as noise.
 *
 * The retune queue is the useful output. Grouping uncorroborated events by
 * (device, channel) says exactly which threshold envelope is producing the noise,
 * which is the thing an engineer can act on — a fleet-wide precision number is
 * not actionable on its own.
 * ─────────────────────────────────────────────────────────────────────────── */

export const FalsePositivesMetricPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const snapshot = useSnapshot();
  const { quality, falseAlarms, toggleFalseAlarm } = useAnomalyModule();

  const now = snapshot.at;
  const fp = quality.falsePositive;

  const trend = useMemo(() => bucketJournal(journal, now), [journal, now]);
  const channels = useMemo(() => groupByChannel(journal, now), [journal, now]);

  /* The retune queue: every (device, channel) pair producing rule-only events,
   * ranked by how many. This is what "envelopes to retune" would act on. */
  const envelopes = useMemo(() => {
    const byPair = new Map<
      string,
      { assetId: string; channel: string; label: string; count: number; meanBreach: number; flagged: number }
    >();

    for (const record of journal) {
      const rule = classifyRecord(record, now);
      if (!rule) continue;
      const uncorroborated = record.detectionMethod === 'rule';
      const flagged = falseAlarms.has(record.id);
      if (!uncorroborated && !flagged) continue;

      const key = `${record.assetId}:${rule.channel}`;
      const entry = byPair.get(key);
      if (entry) {
        entry.count += 1;
        entry.meanBreach += breachRatio(record) * 100;
        entry.flagged += flagged ? 1 : 0;
      } else {
        byPair.set(key, {
          assetId: record.assetId,
          channel: rule.channel,
          label: rule.signature,
          count: 1,
          meanBreach: breachRatio(record) * 100,
          flagged: flagged ? 1 : 0,
        });
      }
    }

    return [...byPair.values()]
      .map((entry) => ({ ...entry, meanBreach: entry.meanBreach / entry.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [journal, now, falseAlarms]);

  /* The feedback log: what an engineer has actually judged, plus the rule-only
   * candidates waiting on a judgement. */
  const feedbackRows = useMemo(
    () =>
      journal
        .filter((record) => falseAlarms.has(record.id) || record.detectionMethod === 'rule')
        .sort((a, b) => {
          const aFlagged = falseAlarms.has(a.id) ? 1 : 0;
          const bFlagged = falseAlarms.has(b.id) ? 1 : 0;
          return bFlagged - aFlagged || b.timestamp - a.timestamp;
        }),
    [journal, falseAlarms],
  );

  const stats: DetailStat[] = [
    {
      key: 'precision',
      label: 'Current precision',
      value: fp.precisionPct === null || quality.falsePositive.truePositives + fp.falsePositives === 0
        ? '—'
        : formatPercent(fp.precisionPct, 1),
      caption: 'TP / (TP + FP) at event level, over the open journal',
      icon: Target,
      accent: '#F43F5E',
      tone: fp.precisionPct >= 80 ? 'good' : 'bad',
    },
    {
      key: 'tp',
      label: 'True positives',
      value: formatNumber(fp.truePositives),
      caption: `${formatNumber(fp.truePositives - fp.uncorroborated > 0 ? fp.truePositives : 0)} standing, model-backed or unjudged`,
      icon: Sigma,
      accent: '#22C55E',
      tone: 'good',
    },
    {
      key: 'fp',
      label: 'False positives',
      value: formatNumber(fp.falsePositives),
      caption: `${formatNumber(fp.uncorroborated)} model-uncorroborated · ${formatNumber(fp.flagged)} engineer-flagged`,
      icon: AlertOctagon,
      accent: STATUS_COLOR.critical,
      tone: fp.falsePositives > 0 ? 'bad' : 'good',
    },
    {
      key: 'envelopes',
      label: 'Envelopes to retune',
      value: formatNumber(envelopes.length),
      caption: 'Distinct device-and-channel pairs producing rule-only events',
      icon: Filter,
      accent: '#EAB308',
    },
  ];

  const precisionSeries: SeriesDef[] = [
    { key: 'precisionPct', name: 'Running precision', color: SERIES[0], unit: '%', decimals: 1 },
  ];

  const alarmSeries: SeriesDef[] = [
    { key: 'corroborated', name: 'Model-backed', color: '#22C55E', decimals: 0 },
    { key: 'uncorroborated', name: 'Rule only', color: STATUS_COLOR.critical, decimals: 0 },
  ];

  const columns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(
    () => [
      {
        id: 'verdict',
        header: 'Verdict',
        accessorFn: (row) => (falseAlarms.has(row.id) ? 'flagged' : 'pending'),
        enableSorting: true,
        cell: ({ row }) =>
          falseAlarms.has(row.original.id) ? (
            <Badge tone="warning" size="xs" icon={AlertOctagon}>
              False alarm
            </Badge>
          ) : (
            <Badge tone="neutral" size="xs">
              Unjudged
            </Badge>
          ),
      },
      {
        id: 'signature',
        header: 'Failure mode',
        accessorFn: (row) => classifyRecord(row, now)?.id ?? '',
        enableSorting: true,
        meta: { width: '14rem' },
        cell: ({ row }) => {
          const rule = classifyRecord(row.original, now);
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
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">{rule.id}</span>
              </span>
            </span>
          );
        },
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '15rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.assetId}
            assetName={row.original.assetName}
            meta={row.original.category}
          />
        ),
      },
      {
        id: 'method',
        header: 'Corroboration',
        accessorFn: (row) => row.detectionMethod,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[12px] text-fg-soft">
            {row.original.detectionMethod === 'rule' ? (
              <span className="text-rose-300">rule only</span>
            ) : (
              row.original.detectionMethod
            )}
            <span className="ml-1.5 text-[10.5px] tabular-nums text-fg-faint">
              score {formatNumber(row.original.anomalyScore, 2)}
            </span>
          </span>
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
        id: 'raised',
        header: 'Raised',
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
        meta: { align: 'right', width: '11rem' },
        cell: ({ row }) => {
          const flagged = falseAlarms.has(row.original.id);
          return (
            <Button
              variant={flagged ? 'subtle' : 'ghost'}
              size="xs"
              icon={AlertOctagon}
              onClick={(event) => {
                event.stopPropagation();
                toggleFalseAlarm(row.original.id);
                toast.info(
                  flagged ? 'False alarm withdrawn' : 'Logged as a false alarm',
                  `${row.original.code} — precision recomputes for the session.`,
                );
              }}
            >
              {flagged ? 'Withdraw' : 'Retune'}
            </Button>
          );
        },
      },
    ],
    [falseAlarms, toggleFalseAlarm, toast, now],
  );

  const runExport = () => {
    if (envelopes.length === 0) {
      toast.warning('Nothing to export', 'No threshold envelope is currently producing rule-only events.');
      return;
    }
    const columnsOut: Array<ReportColumn<(typeof envelopes)[number]>> = [
      { header: 'Device', value: (row) => row.assetId },
      { header: 'Channel', value: (row) => row.channel },
      { header: 'Signature', value: (row) => row.label },
      { header: 'Rule-only events', value: (row) => row.count, numeric: true },
      { header: 'Engineer-flagged', value: (row) => row.flagged, numeric: true },
      { header: 'Mean breach %', value: (row) => Math.round(row.meanBreach * 100) / 100, numeric: true },
    ];
    void exportReport('csv', envelopes, columnsOut, {
      filename: 'intelora_retune_queue',
      title: 'Threshold envelope retune queue',
      subtitle: `${envelopes.length} device-and-channel pairs`,
      generatedAt: now,
      notes: [
        `Precision ${fp.precisionPct === null ? 'unknown' : formatPercent(fp.precisionPct, 1)} over ${formatNumber(fp.truePositives + fp.falsePositives)} events`,
        'A pair appears here when its rule fired without model corroboration, or an engineer marked it noise.',
      ],
    });
    toast.success('Export started', `${envelopes.length} envelopes to CSV.`);
  };

  return (
    <DetailShell
      title="False Positive Analytics & Envelope Tuning"
      subtitle="Where the detector is raising events the model does not back, and which threshold envelope is producing them."
      eyebrow={
        <>
          <Badge tone={fp.precisionPct >= 80 ? 'good' : 'critical'} size="sm" icon={Target}>
            Precision {fp.precisionPct === null ? '—' : formatPercent(fp.precisionPct, 1)}
          </Badge>
          {fp.flagged > 0 ? (
            <Badge tone="warning" size="sm" icon={AlertOctagon}>
              {formatNumber(fp.flagged)} engineer-flagged
            </Badge>
          ) : null}
        </>
      }
      actions={
        <Button variant="secondary" size="sm" icon={Download} onClick={runExport}>
          Export retune queue
        </Button>
      }
    >
      <DetailStatStrip stats={stats} />

      <div className="grid gap-4 xl:grid-cols-2">
        <LineTrend
          title="Precision trend"
          subtitle="Running rule-versus-model agreement across the session"
          eyebrow="Trend"
          icon={TrendingUp}
          data={trend}
          series={precisionSeries}
          height={280}
          domain={[0, 100]}
          references={[{ value: 80, label: 'Target 80%', color: STATUS_COLOR.warning }]}
          footnote="Running rather than per-window: a two-minute window holding three events would swing between 0% and 100% and read as volatility in the detector rather than in the sample size."
        />

        <AreaTrend
          title="Alarms by corroboration"
          subtitle="Events raised per two-minute window, split by whether the model agreed"
          eyebrow="Volume"
          icon={Radio}
          data={trend}
          series={alarmSeries}
          height={280}
          stacked
          footnote="The rule decides whether an event is raised; the isolation forest only corroborates. A window that is mostly rule-only is where the noise envelope needs work."
        />
      </div>

      <BarTrend
        title="Noise distribution by channel"
        subtitle="Events per telemetry channel, and how many of them the model never backed"
        eyebrow="Attribution"
        icon={Filter}
        data={channels}
        series={[
          { key: 'count', name: 'All events', color: SERIES[2], decimals: 0 },
          { key: 'uncorroborated', name: 'Rule only', color: STATUS_COLOR.critical, decimals: 0 },
        ]}
        layout="horizontal"
        height={Math.max(240, channels.length * 42)}
        categoryWidth={124}
        footnote="Channel is a published property of each event — the detector evaluates nine channel rules — so this is measured rather than inferred. A channel where most events are rule-only is a threshold problem, not a hardware problem."
      />

      <DataTable<AnomalyRecord>
        data={feedbackRows}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        minWidth="88rem"
        emptyIcon={Target}
        emptyTitle="Nothing awaiting judgement"
        emptyDescription="Every event in the journal was corroborated by the model, and none has been flagged as noise."
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg">Feedback log</p>
              <p className="mt-0.5 text-[11.5px] text-fg-dim">
                Engineer verdicts first, then rule-only events awaiting one. Marking noise is held for this
                session — the platform exposes a feedback endpoint but this client does not yet post to it.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[11px] tabular-nums text-fg-dim">
                {formatNumber(feedbackRows.length)} row{feedbackRows.length === 1 ? '' : 's'} ·{' '}
                {ratioPct(fp.flagged, feedbackRows.length) ?? 0}% judged
              </span>
              {/* This log is scoped to precision — rule-only and flagged events.
                  The full journal, with every class and severity, lives on the
                  module's report page. */}
              <Button
                variant="subtle"
                size="sm"
                icon={FileText}
                iconRight={ArrowRight}
                onClick={() => navigate(PATHS.anomalyReports)}
              >
                View full anomaly report
              </Button>
            </div>
          </div>
        }
      />
    </DetailShell>
  );
};
