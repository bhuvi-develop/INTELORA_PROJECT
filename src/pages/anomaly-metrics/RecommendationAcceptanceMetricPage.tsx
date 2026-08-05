import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCheck,
  ClipboardList,
  ExternalLink,
  Hourglass,
  ShieldCheck,
  ThumbsUp,
  Users,
} from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { URGENCY_TONE } from '@/engine/derive';
import { useAnomalyJournal, useAssetList, useEngineControl, useSnapshot } from '@/engine/store';
import { deviceDetailPath } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { useToast } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarTrend, DonutSplit, type SeriesDef } from '@/components/charts';
import { UrgencyBadge } from '@/components/common';
import { FAULT_CLASSES, classifyRecord, faultClass, useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { MetricSummaryPanel } from './MetricSummaryPanel';
import { ratioPct } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * AI recommendation acceptance.
 *
 * Every raised event carries a prescriptive action. Claiming it is the
 * acceptance; leaving it in the queue is not. Events that cleared before anyone
 * claimed them are excluded from both terms — nobody accepted or rejected those,
 * the device recovered, and counting them as rejections would penalise the
 * detector for being early.
 *
 * One substitution from the brief: there is no compliance-by-technician-group
 * chart, because the platform has no technician model — no assignee, no team, no
 * shift. Acceptance is broken down by fault class instead, which is a real
 * dimension of the data and answers the same operational question: which kind of
 * work is being picked up and which is being left.
 * ─────────────────────────────────────────────────────────────────────────── */

export const RecommendationAcceptanceMetricPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const snapshot = useSnapshot();
  const { acknowledge } = useEngineControl();
  const { quality, scoped } = useAnomalyModule();

  const now = snapshot.at;
  const adoption = quality.adoption;

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.device.assetId, asset])),
    [assets],
  );

  /** Outstanding work: unclaimed events, with the action the platform prescribed. */
  const outstanding = useMemo(
    () =>
      journal
        .filter((record) => record.status === 'Active')
        .map((record) => ({ record, asset: assetById.get(record.assetId) }))
        .sort((a, b) => {
          const aUrgent = a.asset?.prescriptive.urgency === 'Immediate' ? 1 : 0;
          const bUrgent = b.asset?.prescriptive.urgency === 'Immediate' ? 1 : 0;
          return bUrgent - aUrgent || b.record.timestamp - a.record.timestamp;
        }),
    [journal, assetById],
  );

  const disposition = useMemo(
    () => [
      { key: 'accepted', name: 'Accepted (claimed)', value: adoption.accepted, color: '#22C55E' },
      { key: 'outstanding', name: 'Outstanding', value: adoption.outstanding, color: STATUS_COLOR.warning },
      { key: 'selfCleared', name: 'Self-cleared', value: adoption.selfCleared, color: SERIES[0] },
    ].filter((entry) => entry.value > 0),
    [adoption],
  );

  /** Acceptance per fault class — the substitute for technician grouping. */
  const byClass = useMemo(
    () =>
      FAULT_CLASSES.map((def) => {
        const members = journal.filter((record) => ruleFor(record)?.classId === def.id);
        const accepted = members.filter((record) => record.status === 'Acknowledged').length;
        const open = members.filter((record) => record.status === 'Active').length;
        const cleared = members.filter((record) => record.status === 'Resolved').length;
        return {
          label: def.short,
          accepted,
          outstanding: open,
          selfCleared: cleared,
          adoptionPct: ratioPct(accepted, accepted + open) ?? 0,
        };
      }).filter((row) => row.accepted + row.outstanding + row.selfCleared > 0),
    [journal, ruleFor],
  );

  /** Urgency mix across the estate's prescriptive actions. */
  const urgencyMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const urgency = asset.prescriptive.urgency;
      counts.set(urgency, (counts.get(urgency) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([urgency, count]) => ({
        label: urgency,
        devices: count,
        color: URGENCY_TONE[urgency as keyof typeof URGENCY_TONE]?.color ?? SERIES[0],
      }))
      .sort((a, b) => b.devices - a.devices);
  }, [assets]);

  const stats: DetailStat[] = [
    {
      key: 'adoption',
      label: 'Adoption rate',
      value:
        adoption.adoptionPct === null || adoption.accepted + adoption.outstanding === 0
          ? '—'
          : formatPercent(adoption.adoptionPct, 1),
      caption: 'accepted / (accepted + outstanding) — self-cleared events excluded from both terms',
      icon: ThumbsUp,
      accent: '#14B8A6',
      tone: (adoption.adoptionPct ?? 0) >= 70 ? 'good' : 'bad',
    },
    {
      key: 'accepted',
      label: 'Accepted',
      value: formatNumber(adoption.accepted),
      caption: 'Claimed by an engineer and under investigation',
      icon: CheckCheck,
      accent: '#22C55E',
      tone: 'good',
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      value: formatNumber(adoption.outstanding),
      caption: 'Raised, unclaimed, still open work',
      icon: Hourglass,
      accent: STATUS_COLOR.warning,
      tone: adoption.outstanding > 0 ? 'bad' : 'good',
    },
    {
      key: 'cleared',
      label: 'Self-cleared',
      value: formatNumber(adoption.selfCleared),
      caption: 'Recovered before anyone claimed them — neither accepted nor rejected',
      icon: ShieldCheck,
      accent: SERIES[0],
    },
  ];

  const classSeries: SeriesDef[] = [
    { key: 'accepted', name: 'Accepted', color: '#22C55E', decimals: 0 },
    { key: 'outstanding', name: 'Outstanding', color: STATUS_COLOR.warning, decimals: 0 },
    { key: 'selfCleared', name: 'Self-cleared', color: SERIES[0], decimals: 0 },
  ];

  return (
    <DetailShell
      title="AI Recommendation Acceptance & Compliance"
      subtitle="Which prescriptive actions are being picked up, which are being left, and which resolved themselves before anyone looked."
      eyebrow={
        <>
          <Badge tone={(adoption.adoptionPct ?? 0) >= 70 ? 'good' : 'warning'} size="sm" icon={ThumbsUp}>
            Adoption {adoption.adoptionPct === null ? '—' : formatPercent(adoption.adoptionPct, 1)}
          </Badge>
          {adoption.outstanding > 0 ? (
            <Badge tone="warning" size="sm" icon={Hourglass}>
              {formatNumber(adoption.outstanding)} awaiting sign-off
            </Badge>
          ) : null}
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <MetricSummaryPanel metric="adoption" quality={quality} scopedCount={scoped.length} />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        {disposition.length > 0 ? (
          <DonutSplit
            title="Recommendation disposition"
            subtitle="Every raised event by what happened to its prescribed action"
            eyebrow="Breakdown"
            icon={ClipboardList}
            data={disposition}
            height={216}
            centerValue={formatNumber(adoption.accepted + adoption.outstanding + adoption.selfCleared)}
            centerLabel="recommendations"
            footnote="Self-cleared is the largest slice on a healthy estate. It is not a rejection — the device recovered inside the limit with margin before anyone claimed the alert."
          />
        ) : (
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="No recommendations yet"
              description="Nothing has been raised this session, so there is no prescriptive action to accept or leave."
            />
          </Card>
        )}

        <BarTrend
          title="Disposition by fault class"
          subtitle="Which kind of work is picked up, and which is left standing"
          eyebrow="Comparison"
          icon={Users}
          data={byClass}
          series={classSeries}
          height={280}
          stacked
          footnote="Standing in for a technician breakdown: the platform holds no assignee, team or shift, so grouping by who acted is not available. Fault class answers the same operational question — a tall outstanding segment on one class is work nobody is picking up."
        />
      </div>

      {urgencyMix.length > 0 ? (
        <BarTrend
          title="Prescriptive urgency across the estate"
          subtitle="What the platform is currently recommending per device, by urgency"
          eyebrow="Workload"
          icon={ClipboardList}
          data={urgencyMix}
          series={[{ key: 'devices', name: 'Devices', color: SERIES[0], decimals: 0 }]}
          height={220}
          colorFor={(point) => String(point.color)}
          footnote="One prescriptive action per device, driven by its current condition. Immediate actions with no corresponding claimed event are the gap between what the platform is asking for and what is being done."
        />
      ) : null}

      {/* ─── Outstanding sign-off queue ─────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Outstanding recommendations"
          subtitle="Unclaimed events, with the action the platform prescribed for the device"
          eyebrow="Sign-off queue"
          icon={Hourglass}
          actions={
            <span className="text-[11px] tabular-nums text-fg-dim">
              {formatNumber(outstanding.length)} awaiting
            </span>
          }
        />

        {outstanding.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={ShieldCheck}
              title="Queue is clear"
              description="Every raised event has been claimed by an engineer or cleared by the device."
              compact
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-overlay/[0.045]">
            {outstanding.slice(0, 24).map(({ record, asset }) => {
              const rule = ruleFor(record);
              const def = rule ? faultClass(rule.classId) : null;

              return (
                <li key={record.id} className="flex flex-wrap items-start gap-3 py-3">
                  {def ? (
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: def.color }}
                      aria-hidden
                    />
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-fg">
                        {rule?.signature ?? record.title}
                      </span>
                      <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
                        {record.assetId}
                      </span>
                      {asset ? <UrgencyBadge urgency={asset.prescriptive.urgency} size="xs" /> : null}
                    </span>

                    {asset ? (
                      <>
                        <span className="mt-1 block text-[11.5px] leading-relaxed text-fg-soft">
                          {asset.prescriptive.action}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-dim">
                          {asset.prescriptive.rationale}
                        </span>
                      </>
                    ) : (
                      <span className="mt-1 block text-[11.5px] text-fg-dim">{record.detail}</span>
                    )}
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={ExternalLink}
                      onClick={() => navigate(deviceDetailPath(record.assetId))}
                    >
                      Device
                    </Button>
                    <Button
                      variant="subtle"
                      size="xs"
                      icon={CheckCheck}
                      onClick={() => {
                        acknowledge(record.id);
                        toast.success('Recommendation accepted', `${record.code} on ${record.assetId}.`);
                      }}
                    >
                      Accept
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {outstanding.length > 24 ? (
          <p className="mt-3 border-t border-overlay/[0.06] pt-3 text-[11px] text-fg-dim">
            Showing the 24 most urgent of {formatNumber(outstanding.length)}. The full queue is on the anomaly
            journal.
          </p>
        ) : null}
      </Card>
    </DetailShell>
  );
};
