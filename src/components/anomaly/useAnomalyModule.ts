import { useCallback, useMemo, useRef, useState } from 'react';
import type { AnomalyRecord, AssetRuntime, TelemetryChannel } from '@/engine/types';
import { channelMeta } from '@/engine/catalog';
import { useAnomalyJournal, useAssetList, useConnection, useSnapshot } from '@/engine/store';
import { CHANNEL_COLOR, SERIES } from '@/config/viz';
import type { SeriesDef } from '@/components/charts';
import {
  BROADCAST_SLA_MS,
  CHANNELS_FOR_CLASS,
  COST_MODEL,
  FAULT_CLASSES,
  FAULT_RULES,
  PING_TOLERANCE_MS,
  SENSOR_RANGE,
  SEVERITY_FOR_SELECTION,
  breachRatio,
  classifyRecord,
  isTransient,
  withinSensorRange,
  type CategorySelection,
  type FaultClassDef,
  type FaultRule,
  type SeveritySelection,
} from './taxonomy';

/* ───────────────────────────────────────────────────────────────────────────
 * Anomaly module state and analytics.
 *
 * Everything this hook holds is local to the anomaly view. It reads the shared
 * engine snapshot and writes nothing back to it, so a drill-down here cannot
 * change what any other module sees — the only cross-module state it touches is
 * the acknowledgement action, which is a request to the backend and belongs to
 * the estate rather than to this page.
 *
 * Provenance of the figures below, stated once so the tiles do not have to:
 *
 *   · counts, severities, breach magnitudes, dwell and clear windows — the
 *     platform's own, passed through
 *   · precision, recall, adoption, latency, lead time and confidence — composed
 *     here from those published fields, with the composition written into each
 *     tile's formula line so it can be checked on screen
 *   · the two commercial rates in `COST_MODEL` — the only inputs on this page
 *     that telemetry cannot supply
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── State ──────────────────────────────────────────────────────────────── */

export interface AnomalyModuleState {
  selectedCategory: CategorySelection;
  selectedSeverity: SeveritySelection;
  activeFailureTypeId: string | null;
  isTaxonomyModalOpen: boolean;
  /**
   * Drop events that cleared on their own inside a minute.
   *
   * Added beyond the four fields the specification names, because the
   * "classified detections" control has to be able to express the classified
   * half of the classified-versus-transient split the donut reports.
   */
  classifiedOnly: boolean;
}

const INITIAL_STATE: AnomalyModuleState = {
  selectedCategory: 'ALL',
  selectedSeverity: 'ALL',
  activeFailureTypeId: null,
  isTaxonomyModalOpen: false,
  classifiedOnly: false,
};

/* ─── Derived shapes ─────────────────────────────────────────────────────── */

export interface StatusCheck {
  key: string;
  label: string;
  expression: string;
  reading: string;
  ok: boolean;
}

export interface LiveStatus {
  online: boolean;
  headline: string;
  checks: StatusCheck[];
  packetAgeMs: number;
  reporting: number;
  total: number;
  transport: string;
}

export interface ClassTally {
  def: FaultClassDef;
  /** Unresolved events in this class. */
  total: number;
  /** Held long enough to be a standing fault. */
  classified: number;
  /** Cleared inside a minute under their own steam. */
  transient: number;
  critical: number;
  assets: number;
  rules: Array<{ rule: FaultRule; count: number }>;
}

export interface TaxonomyBreakdown {
  /** All six classes, ranked by open volume. */
  classes: ClassTally[];
  /** Only the classes carrying open events — what the donut draws. */
  present: ClassTally[];
  top: ClassTally | null;
  unresolved: number;
  critical: number;
  /** COUNT(DISTINCT rule) across the open queue. */
  distinctSignatures: number;
  signatures: string[];
}

export interface DetectionQuality {
  falsePositive: {
    precisionPct: number;
    truePositives: number;
    falsePositives: number;
    flagged: number;
    uncorroborated: number;
    envelopesTuned: number;
  };
  falseNegative: {
    recallPct: number;
    detectedAssets: number;
    missedAssets: number;
    retrainQueue: string[];
  };
  latency: {
    dwellSeconds: number;
    broadcastMs: number;
    p95Ms: number;
    slaPct: number;
    samples: number;
  };
  horizon: {
    leadDays: number;
    soonestDays: number;
    confidencePct: number;
    assets: number;
  };
  adoption: {
    adoptionPct: number;
    accepted: number;
    outstanding: number;
    selfCleared: number;
  };
  impact: {
    costSaved: number;
    downtimeHoursAvoided: number;
    hardwareSaved: number;
    actioned: number;
  };
  confidence: {
    scorePct: number;
    modelPct: number;
    snrPct: number;
    driver: string;
    driverPct: number;
  };
}

export interface SignalIsolation {
  channels: TelemetryChannel[];
  data: Array<Record<string, string | number>>;
  series: SeriesDef[];
  assets: number;
}

export interface ContributionSlice {
  channel: TelemetryChannel;
  label: string;
  /** Share of the total deviation at the event, 0–100. */
  pct: number;
  /** Signed departure from the device's own window mean, in per cent. */
  deviationPct: number;
  color: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

const pct = (numerator: number, denominator: number): number =>
  denominator <= 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;

/** Samples the trace draws, and the window the baseline is taken over. */
const TRACE_POINTS = 60;

/**
 * Per-channel contribution behind one event.
 *
 * The scorer publishes a single probability, not a per-feature attribution, so
 * the contribution is measured rather than read: each channel's departure from
 * that device's own trailing mean, normalised across the channels. It answers
 * the same question a SHAP plot answers — which signal moved — from the stream
 * the detector was reading at the time.
 */
export const parameterContribution = (asset: AssetRuntime, record: AnomalyRecord): ContributionSlice[] => {
  const window = asset.history.slice(-TRACE_POINTS);
  if (window.length < 2) return [];

  const channels: TelemetryChannel[] = ['voltage', 'current', 'power', 'powerFactor', 'temperature', 'energy'];

  // The sample nearest the moment the event was raised.
  const at = window.reduce((closest, sample) =>
    Math.abs(sample.t - record.timestamp) < Math.abs(closest.t - record.timestamp) ? sample : closest,
  );

  const raw = channels.map((channel) => {
    const baseline = mean(window.map((sample) => sample[channel]));
    const deviationPct = baseline === 0 ? 0 : ((at[channel] - baseline) / Math.abs(baseline)) * 100;
    return { channel, deviationPct };
  });

  const magnitude = raw.reduce((sum, entry) => sum + Math.abs(entry.deviationPct), 0);
  if (magnitude === 0) return [];

  return raw
    .map((entry) => ({
      channel: entry.channel,
      label: channelMeta(entry.channel).label,
      pct: Math.round((Math.abs(entry.deviationPct) / magnitude) * 1000) / 10,
      deviationPct: Math.round(entry.deviationPct * 100) / 100,
      color: CHANNEL_COLOR[entry.channel] ?? SERIES[0],
    }))
    .sort((a, b) => b.pct - a.pct);
};

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export const useAnomalyModule = () => {
  const snapshot = useSnapshot();
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const connection = useConnection();

  const [state, setState] = useState<AnomalyModuleState>(INITIAL_STATE);

  /**
   * Events a technician has marked as noise.
   *
   * Held here rather than sent upstream: the backend exposes no feedback
   * endpoint, so the flag tunes what this page reports and is lost when the
   * session ends. The tile says so.
   */
  const [falseAlarms, setFalseAlarms] = useState<ReadonlySet<string>>(() => new Set<string>());

  const now = snapshot.at;
  const tick = snapshot.tick;

  /* Round-trip latency, sampled once per backend tick. Guarded on the tick so a
   * double render never records the same observation twice. */
  const latency = useRef<{ samples: number[]; lastTick: number }>({ samples: [], lastTick: -1 });
  if (latency.current.lastTick !== tick) {
    latency.current.lastTick = tick;
    const observed = snapshot.platform.apiResponseMs;
    if (Number.isFinite(observed) && observed > 0) {
      latency.current.samples.push(observed);
      if (latency.current.samples.length > 240) latency.current.samples.shift();
    }
  }

  /* ─── Actions ──────────────────────────────────────────────────────────── */

  const selectCategory = useCallback((selectedCategory: CategorySelection) => {
    // Changing class abandons a signature drill-down that belonged to the old one.
    setState((previous) => ({
      ...previous,
      selectedCategory,
      activeFailureTypeId:
        previous.activeFailureTypeId && selectedCategory !== 'ALL'
          ? FAULT_RULES.find((rule) => rule.id === previous.activeFailureTypeId)?.classId === selectedCategory
            ? previous.activeFailureTypeId
            : null
          : previous.activeFailureTypeId,
    }));
  }, []);

  const toggleCategory = useCallback(
    (candidate: CategorySelection) =>
      selectCategory(candidate === state.selectedCategory ? 'ALL' : candidate),
    [selectCategory, state.selectedCategory],
  );

  const selectSeverity = useCallback((selectedSeverity: SeveritySelection) => {
    setState((previous) => ({ ...previous, selectedSeverity }));
  }, []);

  /** Set outright — for the dropdown and the reference table. */
  const setFailureType = useCallback((activeFailureTypeId: string | null) => {
    setState((previous) => ({ ...previous, activeFailureTypeId }));
  }, []);

  /** Toggle — for the signature rows, where clicking the active one clears it. */
  const selectFailureType = useCallback((activeFailureTypeId: string | null) => {
    setState((previous) => ({
      ...previous,
      activeFailureTypeId: previous.activeFailureTypeId === activeFailureTypeId ? null : activeFailureTypeId,
    }));
  }, []);

  const setTaxonomyModal = useCallback((isTaxonomyModalOpen: boolean) => {
    setState((previous) => ({ ...previous, isTaxonomyModalOpen }));
  }, []);

  const toggleClassifiedOnly = useCallback(() => {
    setState((previous) => ({ ...previous, classifiedOnly: !previous.classifiedOnly }));
  }, []);

  const clearDrilldown = useCallback(() => {
    setState((previous) => ({
      ...previous,
      selectedCategory: 'ALL',
      selectedSeverity: 'ALL',
      activeFailureTypeId: null,
      classifiedOnly: false,
    }));
  }, []);

  const toggleFalseAlarm = useCallback((id: string) => {
    setFalseAlarms((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ─── Classification ───────────────────────────────────────────────────── */

  const ruleFor = useMemo(() => {
    const cache = new Map<string, FaultRule | null>();
    return (record: AnomalyRecord): FaultRule | null => {
      // Keyed on the lifecycle too: an open overcurrent becomes an inrush
      // transient the moment it clears, and the cache must follow it.
      const key = `${record.id}:${record.resolvedAt ?? 'open'}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const resolved = classifyRecord(record, now);
      cache.set(key, resolved);
      return resolved;
    };
  }, [now]);

  const inScope = useCallback(
    (record: AnomalyRecord): boolean => {
      const rule = ruleFor(record);
      if (state.selectedCategory !== 'ALL' && rule?.classId !== state.selectedCategory) return false;
      if (
        state.selectedSeverity !== 'ALL' &&
        record.severity !== SEVERITY_FOR_SELECTION[state.selectedSeverity]
      ) {
        return false;
      }
      if (state.activeFailureTypeId !== null && rule?.id !== state.activeFailureTypeId) return false;
      if (state.classifiedOnly && isTransient(record, now)) return false;
      return true;
    },
    [
      ruleFor,
      now,
      state.selectedCategory,
      state.selectedSeverity,
      state.activeFailureTypeId,
      state.classifiedOnly,
    ],
  );

  const scoped = useMemo(() => journal.filter(inScope), [journal, inScope]);

  const unresolved = useMemo(() => journal.filter((record) => record.status !== 'Resolved'), [journal]);

  const scopedUnresolved = useMemo(
    () => scoped.filter((record) => record.status !== 'Resolved'),
    [scoped],
  );

  const affectedAssetIds = useMemo(
    () => new Set(scopedUnresolved.map((record) => record.assetId)),
    [scopedUnresolved],
  );

  /* ─── Section 1 · live status ──────────────────────────────────────────── */

  const { status: linkStatus, lastUpdatedAt, transport } = connection;

  const status = useMemo<LiveStatus>(() => {
    const { platform } = snapshot;

    const socketOk = platform.mqttConnected && platform.gatewayConnected && linkStatus === 'live';
    const packetAgeMs = Math.max(0, Date.now() - lastUpdatedAt);
    const pingOk = lastUpdatedAt > 0 && packetAgeMs <= PING_TOLERANCE_MS;

    const reporting = assets.filter((asset) => asset.device.status !== 'Offline');

    /* Plausibility, not compliance. A device outside its own operating limit is
     * a fault the detector has already raised and the stream is still sound; a
     * channel outside the instrument's range means the reading is not a
     * measurement, and nothing judged from it can be trusted. */
    const implausible = reporting.filter(
      (asset) =>
        !withinSensorRange('voltage', asset.live.voltage) ||
        !withinSensorRange('temperature', asset.live.temperature) ||
        !withinSensorRange('current', asset.live.current) ||
        !withinSensorRange('powerFactor', asset.live.powerFactor),
    );
    const boundsOk = implausible.length === 0;

    const voltages = reporting.map((asset) => asset.live.voltage);
    const temperatures = reporting.map((asset) => asset.live.temperature);

    const envelope =
      reporting.length === 0
        ? 'no device reporting'
        : `V ${Math.min(...voltages).toFixed(1)}–${Math.max(...voltages).toFixed(1)} · T max ${Math.max(...temperatures).toFixed(1)} °C`;

    const checks: StatusCheck[] = [
      {
        key: 'socket',
        label: 'Broker link',
        expression: 'MQTT ∧ gateway ∧ stream subscribed',
        reading: socketOk
          ? `${transport === 'websocket' ? 'WebSocket' : 'Polling'} · ${platform.ingestPerMinute.toLocaleString()} msg/min`
          : linkStatus,
        ok: socketOk,
      },
      {
        key: 'ping',
        label: 'Telemetry ping',
        expression: 't_now − t_packet ≤ 1.5 s',
        reading: lastUpdatedAt > 0 ? `${(packetAgeMs / 1000).toFixed(2)} s` : 'no packet yet',
        ok: pingOk,
      },
      {
        key: 'bounds',
        label: 'Sensor bounds',
        expression: `0 ≤ V_rms ≤ ${SENSOR_RANGE.voltage.max} V · T_enc < ${SENSOR_RANGE.temperature.max} °C`,
        reading: boundsOk
          ? envelope
          : `${implausible.length} channel${implausible.length === 1 ? '' : 's'} out of range`,
        ok: boundsOk,
      },
    ];

    const online = checks.every((check) => check.ok);

    return {
      online,
      headline: online
        ? 'System Online'
        : !socketOk
          ? 'Link Degraded'
          : !pingOk
            ? 'Stream Stalled'
            : 'Bounds Breached',
      checks,
      packetAgeMs,
      reporting: reporting.length,
      total: assets.length,
      transport,
    };
  }, [snapshot, linkStatus, lastUpdatedAt, transport, assets]);

  /* ─── Sections 1–2 · taxonomy ──────────────────────────────────────────── */

  const taxonomy = useMemo<TaxonomyBreakdown>(() => {
    const classes: ClassTally[] = FAULT_CLASSES.map((def) => {
      const members = unresolved.filter((record) => ruleFor(record)?.classId === def.id);
      const transient = members.filter((record) => isTransient(record, now));

      const rules = FAULT_RULES.filter((rule) => rule.classId === def.id).map((rule) => ({
        rule,
        count: members.filter((record) => ruleFor(record)?.id === rule.id).length,
      }));

      return {
        def,
        total: members.length,
        classified: members.length - transient.length,
        transient: transient.length,
        critical: members.filter((record) => record.severity === 'Critical').length,
        assets: new Set(members.map((record) => record.assetId)).size,
        rules,
      };
    }).sort((a, b) => b.total - a.total || a.def.label.localeCompare(b.def.label));

    const present = classes.filter((entry) => entry.total > 0);
    const signatureIds = new Set(
      unresolved.map((record) => ruleFor(record)?.id).filter((id): id is string => Boolean(id)),
    );

    return {
      classes,
      present,
      top: present[0] ?? null,
      unresolved: unresolved.length,
      critical: unresolved.filter((record) => record.severity === 'Critical').length,
      distinctSignatures: signatureIds.size,
      signatures: FAULT_RULES.filter((rule) => signatureIds.has(rule.id)).map((rule) => rule.signature),
    };
  }, [unresolved, ruleFor, now]);

  /* ─── Section 3 · detection quality ────────────────────────────────────── */

  const quality = useMemo<DetectionQuality>(() => {
    /* 1 · Precision. The rule raises; the isolation forest corroborates. An event
     * the model never backed, or one a technician has called noise, is counted
     * against precision. */
    const flaggedInScope = scoped.filter((record) => falseAlarms.has(record.id));
    const uncorroborated = scoped.filter(
      (record) => !falseAlarms.has(record.id) && record.detectionMethod === 'rule',
    );
    const falsePositives = flaggedInScope.length + uncorroborated.length;
    const truePositives = Math.max(0, scoped.length - falsePositives);

    /* 2 · Recall, at asset level so both sides count the same thing. A device the
     * platform already rates at risk while nothing has been raised against it is
     * a breakdown the detector did not see. */
    const atRisk = assets.filter(
      (asset) => asset.band === 'critical' || asset.riskTier === 'critical' || asset.riskTier === 'high',
    );
    const everFlagged = new Set(unresolved.map((record) => record.assetId));
    const missed = atRisk.filter((asset) => !everFlagged.has(asset.device.assetId));
    const detectedAssets = affectedAssetIds.size;

    /* 3 · Latency, in two legs. The dwell is the detector's own confirm window —
     * deliberate, not overhead. The broadcast leg is the round trip this client
     * has been measuring since the view mounted, and it is the leg the 200 ms
     * target applies to. */
    const dwellSeconds = mean(
      scoped.map((record) => ruleFor(record)?.dwellSeconds ?? 0).filter((value) => value > 0),
    );
    const samples = latency.current.samples;
    const withinSla = samples.filter((value) => value <= BROADCAST_SLA_MS).length;

    /* 4 · Horizon. Lead time is the platform's published remaining life on the
     * devices that are currently warned — the window between this warning and
     * the failure it is warning about. */
    const warnedAssets = assets.filter((asset) => affectedAssetIds.has(asset.device.assetId));
    const leadDays = warnedAssets.map((asset) => asset.prediction.primary.rulDays);

    /* 5 · Adoption. A claimed alert is an accepted recommendation; one that
     * cleared before anyone claimed it was never acted on either way. */
    const accepted = scoped.filter((record) => record.status === 'Acknowledged').length;
    const outstanding = scoped.filter((record) => record.status === 'Active').length;
    const selfCleared = scoped.filter((record) => record.status === 'Resolved').length;

    /* 6 · Impact. Counts and durations are measured; the two rates are not. */
    const actioned = accepted + selfCleared;
    const downtimeHoursAvoided = (actioned * snapshot.mttrMinutes) / 60;
    const savedAssets = new Set(
      scoped
        .filter((record) => record.severity === 'Critical' && record.status !== 'Active')
        .map((record) => record.assetId),
    ).size;
    const hardwareSaved = savedAssets * COST_MODEL.unitReplacementCost;

    /* 7 · Confidence. The published per-event confidence, derated by how much of
     * the estate is actually reporting — a score drawn from a half-silent fleet
     * should not read the same as one drawn from a complete one. */
    const modelConfidence = mean(scoped.map((record) => record.confidence)) * 100;
    const snr =
      snapshot.platform.sensorsTotal > 0
        ? (snapshot.platform.sensorsConnected / snapshot.platform.sensorsTotal) * 100
        : 0;

    const byChannel = new Map<TelemetryChannel, number[]>();
    for (const record of scoped) {
      const rule = ruleFor(record);
      if (!rule) continue;
      const bucket = byChannel.get(rule.channel) ?? [];
      bucket.push(breachRatio(record) * 100);
      byChannel.set(rule.channel, bucket);
    }
    const drivers = [...byChannel.entries()]
      .map(([channel, values]) => ({ channel, value: mean(values) }))
      .sort((a, b) => b.value - a.value);

    return {
      falsePositive: {
        precisionPct: pct(truePositives, scoped.length),
        truePositives,
        falsePositives,
        flagged: flaggedInScope.length,
        uncorroborated: uncorroborated.length,
        envelopesTuned: new Set(flaggedInScope.map((record) => `${record.assetId}:${record.type}`)).size,
      },
      falseNegative: {
        recallPct: pct(detectedAssets, detectedAssets + missed.length),
        detectedAssets,
        missedAssets: missed.length,
        retrainQueue: missed.slice(0, 4).map((asset) => asset.device.assetId),
      },
      latency: {
        dwellSeconds: Math.round(dwellSeconds * 10) / 10,
        broadcastMs: Math.round(mean(samples)),
        p95Ms: Math.round(percentile(samples, 95)),
        slaPct: pct(withinSla, samples.length),
        samples: samples.length,
      },
      horizon: {
        leadDays: Math.round(mean(leadDays) * 10) / 10,
        soonestDays: leadDays.length === 0 ? 0 : Math.round(Math.min(...leadDays) * 10) / 10,
        confidencePct: Math.round(mean(warnedAssets.map((asset) => asset.prediction.primary.confidence)) * 1000) / 10,
        assets: warnedAssets.length,
      },
      adoption: {
        adoptionPct: pct(accepted, accepted + outstanding),
        accepted,
        outstanding,
        selfCleared,
      },
      impact: {
        costSaved: downtimeHoursAvoided * COST_MODEL.downtimeRatePerHour + hardwareSaved,
        downtimeHoursAvoided: Math.round(downtimeHoursAvoided * 10) / 10,
        hardwareSaved,
        actioned,
      },
      confidence: {
        scorePct: Math.round(modelConfidence * (snr / 100) * 10) / 10,
        modelPct: Math.round(modelConfidence * 10) / 10,
        snrPct: Math.round(snr * 10) / 10,
        driver: drivers.length > 0 ? channelMeta(drivers[0].channel).label : '—',
        driverPct: drivers.length > 0 ? Math.round(drivers[0].value * 10) / 10 : 0,
      },
    };
  }, [scoped, falseAlarms, assets, unresolved, affectedAssetIds, ruleFor, snapshot]);

  /* ─── Signal isolation ─────────────────────────────────────────────────── */

  const signal = useMemo<SignalIsolation>(() => {
    const channels = CHANNELS_FOR_CLASS[state.selectedCategory];
    const affected = assets.filter((asset) => affectedAssetIds.has(asset.device.assetId));
    const source = (affected.length > 0 ? affected : assets).filter(
      (asset) => asset.history.length >= 2,
    );

    const series: SeriesDef[] = channels.map((channel) => ({
      key: channel,
      name: channelMeta(channel).label,
      color: CHANNEL_COLOR[channel] ?? SERIES[0],
      unit: '%',
      decimals: 2,
    }));

    if (source.length === 0) return { channels, data: [], series, assets: 0 };

    const depth = Math.min(TRACE_POINTS, ...source.map((asset) => asset.history.length));
    const windows = source.map((asset) => asset.history.slice(-depth));

    // Channels carry different units, so each is plotted as its departure from
    // that device's own mean over the window. One axis, one meaning: how far
    // this signal has moved, not how large it happens to be.
    const baselines = windows.map((window) => {
      const perChannel = {} as Record<TelemetryChannel, number>;
      for (const channel of channels) perChannel[channel] = mean(window.map((sample) => sample[channel]));
      return perChannel;
    });

    const data = Array.from({ length: depth }, (_, index) => {
      const point: Record<string, string | number> = { label: windows[0][index].label };
      for (const channel of channels) {
        point[channel] =
          Math.round(
            mean(
              windows.map((window, assetIndex) => {
                const baseline = baselines[assetIndex][channel];
                return baseline === 0 ? 0 : ((window[index][channel] - baseline) / Math.abs(baseline)) * 100;
              }),
            ) * 1000,
          ) / 1000;
      }
      return point;
    });

    return { channels, data, series, assets: source.length };
  }, [assets, affectedAssetIds, state.selectedCategory]);

  return {
    state,
    selectCategory,
    toggleCategory,
    selectSeverity,
    selectFailureType,
    setFailureType,
    setTaxonomyModal,
    toggleClassifiedOnly,
    clearDrilldown,
    falseAlarms,
    toggleFalseAlarm,
    ruleFor,
    scoped,
    scopedUnresolved,
    affectedAssetIds,
    status,
    taxonomy,
    quality,
    signal,
  };
};

export type AnomalyModule = ReturnType<typeof useAnomalyModule>;
