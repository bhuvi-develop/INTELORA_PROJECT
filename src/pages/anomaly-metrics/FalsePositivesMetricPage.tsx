import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowRight,
  Download,
  FileText,
  Filter,
  Gavel,
  Radio,
  Sigma,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useAnomalyJournal, useSnapshot } from '@/engine/store';
import { PATHS } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn } from '@/utils/report';
import { useToast } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AreaTrend, BarTrend, LineTrend, type SeriesDef } from '@/components/charts';
import { breachRatio, classifyRecord, useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { MetricSummaryPanel } from './MetricSummaryPanel';
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
  const journal = useAnomalyJournal();
  const snapshot = useSnapshot();
  const { quality, falseAlarms, scoped } = useAnomalyModule();

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

  /* Only the size of the log is needed here — the rows themselves live on the
   * report page, so this page does not build or hold them. */
  const feedbackCount = useMemo(
    () =>
      journal.filter((record) => falseAlarms.has(record.id) || record.detectionMethod === 'rule')
        .length,
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

      <MetricSummaryPanel metric="falsePositive" quality={quality} scopedCount={scoped.length} />

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

      {/* ─── Feedback log, as an entry point rather than a table ─────────
          The log itself is a working surface: hundreds of rows, each with a
          retune control. It belongs on its own page, so this page stays the
          summary and links to it. */}
      <Card
        className="group relative cursor-pointer"
        interactive
        onMouseEnter={(event) => {
          event.currentTarget.style.boxShadow =
            'inset 0 0 0 1px #38BDF859, 0 8px 26px -12px #38BDF84D';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.boxShadow = '';
        }}
      >
        <button
          type="button"
          onClick={() => navigate(PATHS.anomalyFeedbackReport)}
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60"
        >
          <span className="sr-only">Open the feedback log report</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
              style={{ backgroundColor: '#38BDF81A', color: '#38BDF8' }}
            >
              <Gavel size={16} aria-hidden />
            </span>

            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-fg">Feedback log</p>
              <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-fg-dim">
                Engineer verdicts and the rule-only detections still awaiting one. Flagging a false alarm
                retunes that device and channel — the control lives on the report.
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-fg-muted">
                <span>
                  <span className="font-semibold text-fg">{formatNumber(feedbackCount)}</span> row
                  {feedbackCount === 1 ? '' : 's'}
                </span>
                <span>
                  <span className="font-semibold text-fg">
                    {formatNumber(ratioPct(fp.flagged, feedbackCount) ?? 0, 0)}%
                  </span>{' '}
                  judged
                </span>
                <span>
                  <span className="font-semibold text-fg">{formatNumber(envelopes.length)}</span> envelope
                  {envelopes.length === 1 ? '' : 's'} to retune
                </span>
              </div>
            </div>
          </div>

          <span className="relative z-20 shrink-0">
            <Button
              variant="subtle"
              size="sm"
              icon={FileText}
              iconRight={ArrowRight}
              onClick={() => navigate(PATHS.anomalyFeedbackReport)}
            >
              Open feedback log report
            </Button>
          </span>
        </div>
      </Card>
    </DetailShell>
  );
};
