import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Fingerprint, ListTree, Radar, Timer, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AnomalyRecord } from '@/engine/types';
import { channelMeta } from '@/engine/catalog';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { SERIES } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { BarTrend } from '@/components/charts';
import {
  FAULT_CLASSES,
  FAULT_RULES,
  classifyRecord,
  faultClass,
  parameterContribution,
  ruleRemedy,
  type ContributionSlice,
  type FaultClassId,
} from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from './DetailShell';

/* ───────────────────────────────────────────────────────────────────────────
 * Taxonomy reference and rule signatures.
 *
 * The catalogue is the authority on what an M-code means, and the counts beside
 * each rule say what is live against it right now. A rule with no live signal is
 * labelled as armed rather than shown as a zero, because zero reads as "this
 * never happens" when it means "not in this window".
 *
 * The attribution chart is measured, not read from the model: the scorer
 * publishes one probability per event and no per-feature values, so the
 * contribution is each channel's departure from that device's own trailing mean
 * at the moment of the raise. It answers the question a SHAP plot answers —
 * which signal moved — from the stream the detector was reading.
 * ─────────────────────────────────────────────────────────────────────────── */

type Lens = 'ALL' | FaultClassId;

export const TaxonomySignaturesDetailPage = () => {
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const snapshot = useSnapshot();

  const now = snapshot.at;
  const [lens, setLens] = useState<Lens>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focusedRule, setFocusedRule] = useState<string | null>(null);

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  const unresolved = useMemo(
    () => journal.filter((record) => record.status !== 'Resolved'),
    [journal],
  );

  /** Per-rule counts: what is open now, and what the whole session produced. */
  const tally = useMemo(() => {
    const map = new Map<string, { open: number; session: number; devices: Set<string> }>();

    for (const rule of FAULT_RULES) {
      map.set(rule.id, { open: 0, session: 0, devices: new Set() });
    }

    for (const record of journal) {
      const rule = ruleFor(record);
      if (!rule) continue;
      const entry = map.get(rule.id);
      if (!entry) continue;
      entry.session += 1;
      if (record.status !== 'Resolved') {
        entry.open += 1;
        entry.devices.add(record.assetId);
      }
    }

    return map;
  }, [journal, ruleFor]);

  const activeRuleIds = useMemo(
    () => FAULT_RULES.filter((rule) => (tally.get(rule.id)?.open ?? 0) > 0).map((rule) => rule.id),
    [tally],
  );

  /* The signature the attribution chart explains: whichever the operator picked,
   * else the busiest one currently open. */
  const focused = useMemo(() => {
    const candidate = focusedRule ?? activeRuleIds[0] ?? null;
    return candidate ? (FAULT_RULES.find((rule) => rule.id === candidate) ?? null) : null;
  }, [focusedRule, activeRuleIds]);

  /** The most severe open event carrying the focused signature. */
  const focusedEvent = useMemo(() => {
    if (!focused) return null;
    const members = unresolved.filter((record) => ruleFor(record)?.id === focused.id);
    if (members.length === 0) return null;
    return members.reduce((worst, record) =>
      Math.abs(record.observed - record.threshold) > Math.abs(worst.observed - worst.threshold)
        ? record
        : worst,
    );
  }, [focused, unresolved, ruleFor]);

  const contribution = useMemo<ContributionSlice[]>(() => {
    if (!focusedEvent) return [];
    const asset = assets.find((entry) => entry.device.assetId === focusedEvent.assetId);
    return asset ? parameterContribution(asset, focusedEvent) : [];
  }, [focusedEvent, assets]);

  const frequency = useMemo(
    () =>
      FAULT_RULES.filter((rule) => lens === 'ALL' || rule.classId === lens).map((rule) => {
        const entry = tally.get(rule.id);
        return {
          label: rule.id,
          open: entry?.open ?? 0,
          session: entry?.session ?? 0,
          color: faultClass(rule.classId).color,
        };
      }),
    [lens, tally],
  );

  const dwellRange = useMemo(() => {
    const dwells = FAULT_RULES.map((rule) => rule.dwellSeconds);
    const clears = FAULT_RULES.map((rule) => rule.clearSeconds);
    return {
      dwellMin: Math.min(...dwells),
      dwellMax: Math.max(...dwells),
      clearMin: Math.min(...clears),
      clearMax: Math.max(...clears),
    };
  }, []);

  const stats: DetailStat[] = [
    {
      key: 'active',
      label: 'Active signatures',
      value: formatNumber(activeRuleIds.length),
      unit: activeRuleIds.length === 1 ? 'signature' : 'signatures',
      caption:
        activeRuleIds.length === 0
          ? 'Nothing open against any rule in this window'
          : activeRuleIds
              .map((id) => FAULT_RULES.find((rule) => rule.id === id)?.signature ?? id)
              .join(' · '),
      icon: Fingerprint,
      accent: '#A855F7',
    },
    {
      key: 'catalogue',
      label: 'Catalogue rules',
      value: formatNumber(FAULT_RULES.length),
      unit: 'rules',
      caption: `Across ${formatNumber(FAULT_CLASSES.length)} fault classes, each mapped to one of the detector's nine channel rules`,
      icon: ListTree,
      accent: '#38BDF8',
    },
    {
      key: 'dwell',
      label: 'Dwell window',
      value: `${formatNumber(dwellRange.dwellMin)}–${formatNumber(dwellRange.dwellMax)}`,
      unit: 's',
      caption: `Confirm before raising. Clear window ${formatNumber(dwellRange.clearMin)}–${formatNumber(dwellRange.clearMax)} s, with a 3% margin inside the limit.`,
      icon: Timer,
      accent: '#22C55E',
    },
    {
      key: 'open',
      label: 'Open against a rule',
      value: formatNumber(unresolved.length),
      caption: `${formatNumber(new Set(unresolved.map((record) => record.assetId)).size)} device${new Set(unresolved.map((record) => record.assetId)).size === 1 ? '' : 's'} carrying at least one`,
      icon: Radar,
      accent: '#EAB308',
    },
  ];

  return (
    <DetailShell
      title="Taxonomy Reference & Rule Signatures"
      subtitle="The fifteen failure modes the classifier recognises, what each one is recognised by, and what to do about it."
      eyebrow={
        <>
          <Badge tone="brand" size="sm" icon={ListTree}>
            M01 – M15
          </Badge>
          {focused ? (
            <Badge tone="neutral" size="sm">
              Explaining {focused.id} · {focused.signature}
            </Badge>
          ) : null}
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <BarTrend
          title="Signature frequency"
          subtitle="Events per rule — open now against everything raised this session"
          eyebrow="Attribution"
          icon={Radar}
          data={frequency}
          series={[
            { key: 'session', name: 'Raised this session', color: SERIES[2], decimals: 0 },
            { key: 'open', name: 'Open now', color: SERIES[0], decimals: 0 },
          ]}
          layout="horizontal"
          height={Math.max(280, frequency.length * 26)}
          categoryWidth={56}
          actions={
            <Segmented<Lens>
              size="xs"
              layoutId="signature-lens"
              ariaLabel="Filter signatures by fault class"
              value={lens}
              onChange={setLens}
              options={[
                { value: 'ALL', label: 'All' },
                ...FAULT_CLASSES.map((entry) => ({ value: entry.id, label: entry.short })),
              ]}
            />
          }
          footnote="A rule sitting at zero is armed, not broken — it means the estate has not produced that signature in the retained window. Rules that fire across several classes point at a shared cause upstream rather than at component wear."
        />

        <Card className="flex flex-col">
          <CardHeader
            title="Parameter contribution"
            subtitle={
              focusedEvent
                ? `${focused?.signature} on ${focusedEvent.assetId} — which channel moved`
                : 'No open event to explain'
            }
            eyebrow="Explainability"
            icon={Fingerprint}
          />

          {contribution.length > 0 && focusedEvent ? (
            <>
              <ul className="mt-4 space-y-2.5">
                {contribution.map((slice) => (
                  <li key={slice.channel} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-[11.5px] text-fg-soft">{slice.label}</span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-overlay/[0.07]">
                      <span
                        className="block h-full rounded-full transition-[width] duration-500 ease-enterprise"
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
                      title="Signed departure from the device's own window mean"
                    >
                      {slice.deviationPct > 0 ? '+' : ''}
                      {formatNumber(slice.deviationPct, 2)}%
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 grid grid-cols-2 gap-2.5 border-t border-overlay/[0.06] pt-3.5">
                {[
                  { label: 'Observed', value: `${formatNumber(focusedEvent.observed, 2)} ${focusedEvent.unit}` },
                  { label: 'Threshold', value: `${formatNumber(focusedEvent.threshold, 2)} ${focusedEvent.unit}` },
                  { label: 'Model score', value: formatNumber(focusedEvent.anomalyScore, 2) },
                  { label: 'Confidence', value: formatPercent(focusedEvent.confidence * 100, 1) },
                ].map((cell) => (
                  <div key={cell.label} className="rounded-lg border border-overlay/[0.06] bg-ink-850/50 p-2.5">
                    <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                      {cell.label}
                    </dt>
                    <dd className="mt-1 truncate text-[12.5px] font-semibold tabular-nums text-fg">
                      {cell.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-3 border-t border-overlay/[0.06] pt-3 text-[11px] leading-relaxed text-fg-dim">
                Measured, not read from the model. The scorer publishes a single probability per event and no
                per-feature values, so each channel's share here is its departure from this device's own
                trailing mean at the moment of the raise, normalised across the channels. Leading driver:{' '}
                <span className="font-semibold text-fg-soft">
                  {channelMeta(contribution[0].channel).label}
                </span>
                .
              </p>
            </>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={Fingerprint}
                title="Nothing open to attribute"
                description="Select a signature with open events below, or wait for the stream to raise one. Attribution needs a live event and its retained sample window."
                compact
              />
            </div>
          )}
        </Card>
      </div>

      {/* ─── Rule grid ──────────────────────────────────────────────────── */}
      <Card flush>
        <div className="border-b border-overlay/[0.06] p-4">
          <p className="text-[13px] font-semibold text-fg">Rule catalogue</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-fg-dim">
            Dwell and clear windows are the detector's published configuration, so this cannot drift from the
            rules that actually run. Expand a rule for its hysteresis and the standing work instruction.
          </p>
        </div>

        <ul className="divide-y divide-overlay/[0.045]">
          {FAULT_RULES.filter((rule) => lens === 'ALL' || rule.classId === lens).map((rule) => {
            const def = faultClass(rule.classId);
            const entry = tally.get(rule.id);
            const open = entry?.open ?? 0;
            const isOpen = expanded === rule.id;

            return (
              <li key={rule.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setExpanded(isOpen ? null : rule.id);
                    if (open > 0) setFocusedRule(rule.id);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-overlay/[0.035]"
                >
                  <span
                    className="shrink-0 rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[11px] text-fg-soft"
                  >
                    {rule.id}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-fg">{rule.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-fg-dim">{rule.expression}</span>
                  </span>

                  <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: def.color }}
                      aria-hidden
                    />
                    <span className="text-[11.5px] text-fg-muted">{def.short}</span>
                  </span>

                  <span className="w-24 shrink-0 text-right">
                    {open > 0 ? (
                      <Badge tone="critical" size="xs">
                        {formatNumber(open)} open
                      </Badge>
                    ) : (
                      <span className="text-[10.5px] text-fg-faint">armed</span>
                    )}
                  </span>

                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={cn(
                      'shrink-0 text-fg-faint transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 bg-ink-850/40 px-4 pb-4 pt-3">
                        <p className="text-[12px] leading-relaxed text-fg-muted">{rule.detail}</p>

                        <dl className="grid gap-2.5 sm:grid-cols-4">
                          {[
                            { label: 'Channel', value: channelMeta(rule.channel).label },
                            { label: 'Dwell', value: `${formatNumber(rule.dwellSeconds, rule.dwellSeconds % 1 === 0 ? 0 : 1)} s` },
                            { label: 'Clear', value: `${formatNumber(rule.clearSeconds)} s` },
                            { label: 'Raised this session', value: formatNumber(entry?.session ?? 0) },
                          ].map((cell) => (
                            <div
                              key={cell.label}
                              className="rounded-lg border border-overlay/[0.06] bg-ink-800/50 p-2.5"
                            >
                              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                                {cell.label}
                              </dt>
                              <dd className="mt-1 truncate text-[12px] font-semibold tabular-nums text-fg">
                                {cell.value}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <div className="rounded-lg border border-overlay/[0.06] bg-ink-800/50 p-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                            <Wrench size={10} aria-hidden />
                            Corrective action
                          </p>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-fg-soft">
                            {ruleRemedy(rule.id)}
                          </p>
                        </div>

                        <p className="text-[11px] leading-relaxed text-fg-dim">
                          Hysteresis: the breach must persist for {formatNumber(rule.dwellSeconds, rule.dwellSeconds % 1 === 0 ? 0 : 1)} s
                          before this is raised, and the reading must sit back inside the limit with a 3% margin
                          for {formatNumber(rule.clearSeconds)} s before it may clear. That asymmetry is why the
                          journal reads as a list of faults rather than a list of samples.
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </Card>
    </DetailShell>
  );
};
