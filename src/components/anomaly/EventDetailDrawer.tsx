import { useMemo } from 'react';
import { AlertOctagon, Undo2 } from 'lucide-react';
import type { AnomalyRecord, AssetRuntime } from '@/engine/types';
import { SEVERITY_TONE } from '@/engine/derive';
import { CHANNEL_FOR_ANOMALY } from '@/engine/analytics';
import { channelMeta } from '@/engine/catalog';
import { CHANNEL_COLOR, SERIES } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LineTrend, type SeriesDef } from '@/components/charts';
import { AnomalyStatusBadge, SeverityBadge } from '@/components/common';
import { breachRatio, faultClass, openMs, type FaultRule } from './taxonomy';
import { parameterContribution } from './useAnomalyModule';

/* ───────────────────────────────────────────────────────────────────────────
 * Event detail.
 *
 * Three things, in the order an engineer asks for them: what was called, what
 * the stream actually did at the time, and which parameter moved. The trace is
 * the retained sample window on the device itself — the same stream the
 * detector read — not a redrawing of the event.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface EventDetailDrawerProps {
  record: AnomalyRecord | null;
  rule: FaultRule | null;
  asset: AssetRuntime | undefined;
  now: number;
  flaggedFalseAlarm: boolean;
  onToggleFalseAlarm: (id: string) => void;
  onAcknowledge: (record: AnomalyRecord) => void;
  onClose: () => void;
}

export const EventDetailDrawer = ({
  record,
  rule,
  asset,
  now,
  flaggedFalseAlarm,
  onToggleFalseAlarm,
  onAcknowledge,
  onClose,
}: EventDetailDrawerProps) => {
  /* Channel history around the event, so the evidence is the actual stream. */
  const evidence = useMemo(() => {
    if (!record || !asset) return null;

    const channel = CHANNEL_FOR_ANOMALY[record.type];
    const meta = channelMeta(channel);

    return {
      meta,
      data: asset.history.slice(-90).map((sample) => ({
        label: sample.label,
        t: sample.t,
        [channel]: sample[channel],
        threshold: record.threshold,
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
  }, [record, asset]);

  const contribution = useMemo(
    () => (record && asset ? parameterContribution(asset, record) : []),
    [record, asset],
  );

  const classDef = rule ? faultClass(rule.classId) : null;

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      size="lg"
      title={record ? `${record.code} · ${record.title}` : ''}
      subtitle={
        record
          ? `${record.assetName} · ${rule ? `${rule.id} ${rule.signature} · ` : ''}detected ${formatRelative(record.timestamp)}`
          : undefined
      }
      footer={
        record ? (
          <>
            <Button
              variant={flaggedFalseAlarm ? 'subtle' : 'ghost'}
              size="sm"
              icon={flaggedFalseAlarm ? Undo2 : AlertOctagon}
              onClick={() => onToggleFalseAlarm(record.id)}
            >
              {flaggedFalseAlarm ? 'Withdraw false alarm' : 'Mark as false alarm'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            {record.status === 'Active' ? (
              <Button variant="primary" size="sm" onClick={() => onAcknowledge(record)}>
                Acknowledge and assign
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {record ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={record.severity} />
            <AnomalyStatusBadge status={record.status} />
            {classDef ? (
              <span
                className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium"
                style={{ color: classDef.color, backgroundColor: `${classDef.color}14` }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {classDef.label}
              </span>
            ) : null}
            <Badge tone="neutral" size="sm">
              {record.assetId}
            </Badge>
            {record.component ? (
              <Badge tone="neutral" size="sm">
                {record.component}
              </Badge>
            ) : null}
            {flaggedFalseAlarm ? (
              <Badge tone="warning" size="sm" icon={AlertOctagon}>
                Flagged as noise
              </Badge>
            ) : null}
          </div>

          <p className="text-[12.5px] leading-relaxed text-fg-muted">{record.detail}</p>

          {rule ? (
            <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5">
              <p className="eyebrow">Signature {rule.id}</p>
              <p className="mt-1.5 font-mono text-[11.5px] text-fg-soft">{rule.expression}</p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-fg-dim">{rule.detail}</p>
            </div>
          ) : null}

          {evidence ? (
            <LineTrend
              title="Raw channel trace"
              subtitle={`${evidence.meta.label} on ${record.assetId} at the publication rate, against the threshold that was breached`}
              eyebrow="1 Hz stream"
              data={evidence.data}
              series={evidence.series}
              height={220}
              domain={['auto', 'auto']}
              footnote="Taken from the retained sample window on this device — the same stream the detector reads."
            />
          ) : null}

          {contribution.length > 0 ? (
            <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">Parameter contribution</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-fg-dim">
                    Each channel’s departure from this device’s own window mean at the moment of the raise,
                    normalised across the channels. The scorer publishes one probability rather than per-feature
                    values, so the attribution is measured from the stream instead of read from the model.
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {contribution.map((slice) => (
                  <li key={slice.channel} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-[11.5px] text-fg-soft">{slice.label}</span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-overlay/[0.07]">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${slice.pct}%`, backgroundColor: slice.color }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-fg">
                      {formatPercent(slice.pct, 1)}
                    </span>
                    <span
                      className={cn(
                        'w-16 shrink-0 text-right text-[10.5px] tabular-nums',
                        slice.deviationPct >= 0 ? 'text-fg-muted' : 'text-fg-dim',
                      )}
                      title="Signed departure from the device’s own window mean"
                    >
                      {slice.deviationPct > 0 ? '+' : ''}
                      {formatNumber(slice.deviationPct, 2)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Observed', value: `${formatNumber(record.observed, 2)} ${record.unit}` },
              { label: 'Threshold', value: `${formatNumber(record.threshold, 2)} ${record.unit}` },
              { label: 'Breach', value: record.threshold === 0 ? '—' : formatPercent(breachRatio(record) * 100, 1) },
              { label: 'Open for', value: `${formatNumber(openMs(record, now) / 60_000, 1)} min` },
              { label: 'Detection', value: record.detectionMethod },
              { label: 'Model score', value: formatNumber(record.anomalyScore, 2) },
              { label: 'Confidence', value: formatPercent(record.confidence * 100, 1) },
              {
                label: 'Cleared',
                value: record.resolvedAt ? formatRelative(record.resolvedAt) : 'Still open',
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
  );
};
