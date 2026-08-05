import type {
  AnomalyRecord,
  AssetRuntime,
  DailyTelemetryRecord,
  EngineSnapshot,
  PredictionHistoryRecord,
  PreventiveTask,
  TelemetrySample,
} from '@/engine/types';
import { applyBandThresholds, applyEffectivenessTargets } from '@/engine/derive';
import { applyFleetFacets, applyPlatformConfig } from '@/engine/catalog';
import { env } from '@/config/env';
import type {
  AnomalyDto,
  AssetDetailDto,
  AssetSummaryDto,
  DashboardDto,
  PredictiveResponseDto,
  PrescriptiveActionDto,
  PreventiveTaskDto,
  TelemetryReadingDto,
} from '@/types/api';
import { isApiError } from './http';
import { backendOrigin } from './http';
import {
  anomalyService,
  assetService,
  dashboardService,
  maintenanceService,
  reportService,
  systemService,
  telemetryService,
} from './platform.service';
import {
  mergeAssetDetail,
  toActivity,
  toAnomaly,
  toAssetRuntime,
  toCategoryRollup,
  toComponentPrediction,
  toDailyRecord,
  toEnergy,
  toFleetKpis,
  toFleetOee,
  toFleetTrail,
  toPlatformHealth,
  toPredictionRecord,
  toPrescriptiveAction,
  toPreventiveTask,
  toSample,
  toYesterday,
} from './adapters';

/* ───────────────────────────────────────────────────────────────────────────
 * The platform store.
 *
 * One object owns every conversation with FastAPI and publishes an immutable
 * snapshot that the whole interface renders from. It is the only place in the
 * application that knows a network exists.
 *
 * Two cadences, matching the backend's own:
 *
 *   live      every second — the fourteen MIKOS parameters and the condition
 *             the platform derived from them, over a websocket where one is
 *             available and by polling where it is not
 *   analytics every fifteen seconds — the derived views: effectiveness,
 *             predictions, the anomaly journal and the maintenance schedule,
 *             which the backend itself only recomputes every thirty
 *
 * Nothing here computes a domain figure. Samples are retained, not generated;
 * responses are renamed, not recalculated. When the backend is unreachable the
 * last good snapshot stays on screen and the connection state says so, because
 * an operator staring at a blank dashboard learns less than one staring at a
 * stale dashboard that admits it is stale.
 * ─────────────────────────────────────────────────────────────────────────── */

const HISTORY_LIMIT = 900;
const HYDRATE_SAMPLES = 180;

export interface ConnectionSnapshot {
  status: 'connecting' | 'live' | 'reconnecting' | 'offline';
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number;
  transport: 'websocket' | 'polling' | 'none';
  consecutiveFailures: number;
}

const EMPTY_SNAPSHOT: EngineSnapshot = {
  tick: 0,
  at: Date.now(),
  elapsedDays: 0,
  running: false,
  assets: [],
  byId: {},
  anomalies: [],
  tasks: [],
  kpis: {
    totalAssets: 0,
    onlineAssets: 0,
    offlineAssets: 0,
    standbyAssets: 0,
    averageHealth: 0,
    averagePower: 0,
    totalPower: 0,
    totalEnergy: 0,
    criticalAssets: 0,
    warningAssets: 0,
    goodAssets: 0,
    healthyAssets: 0,
    activeAnomalies: 0,
    criticalAnomalies: 0,
    averageAvailability: 0,
    averageOee: 0,
    averageRulDays: 0,
    assetsAtRisk: 0,
    tasksOverdue: 0,
    tasksDue: 0,
  },
  oee: { availability: 0, performance: 0, quality: 0, oee: 0, target: 85, worldClass: 92 },
  categories: [],
  fleetTrail: [],
  operationalHealth: 0,
  mttrMinutes: 0,
  yesterday: {
    operationalHealth: 0,
    averageHealth: 0,
    healthyAssets: 0,
    warningAssets: 0,
    criticalAssets: 0,
    offlineAssets: 0,
    averageRulDays: 0,
    energyKwh: 0,
    activeAlerts: 0,
    oee: 0,
    averagePower: 0,
  },
  activity: [],
  energy: {
    todayKwh: 0,
    yesterdayKwh: 0,
    changePct: 0,
    weeklyKwh: 0,
    monthlyKwh: 0,
    peakHour: 0,
    peakKw: 0,
    highestConsumer: null,
    lowestConsumer: null,
    estimatedMonthlyCost: 0,
    carbonKgPerMonth: 0,
    tariffPerKwh: 0,
    dailyTrend: [],
  },
  platform: {
    services: [],
    apiResponseMs: 0,
    databaseLatencyMs: 0,
    uptimePct: 0,
    gatewayConnected: false,
    mqttConnected: false,
    sensorsConnected: 0,
    sensorsTotal: 0,
    ingestPerMinute: 0,
  },
};

class PlatformStore {
  /* ── Published state ──────────────────────────────────────────────── */
  private snapshot: EngineSnapshot = EMPTY_SNAPSHOT;
  private connection: ConnectionSnapshot = {
    status: 'connecting',
    loading: true,
    error: null,
    lastUpdatedAt: 0,
    transport: 'none',
    consecutiveFailures: 0,
  };

  private readonly listeners = new Set<() => void>();
  private readonly connectionListeners = new Set<() => void>();

  /* ── Raw responses, kept so a partial refresh can rebuild ─────────── */
  private dashboard: DashboardDto | null = null;
  private assets: AssetSummaryDto[] = [];
  private anomalies: AnomalyDto[] = [];
  private tasks: PreventiveTaskDto[] = [];
  private predictive: PredictiveResponseDto | null = null;
  /** Mean time to restore, measured by the backend across resolved events. */
  private mttrMinutes = 0;
  private prescriptive: PrescriptiveActionDto[] = [];
  private readonly details = new Map<string, AssetDetailDto>();
  private readonly history = new Map<string, TelemetrySample[]>();
  private readonly latest = new Map<string, TelemetryReadingDto>();

  private dailyRecords: DailyTelemetryRecord[] = [];
  private predictionRecords: PredictionHistoryRecord[] = [];
  private reportsLoaded = false;

  /* ── Lifecycle ────────────────────────────────────────────────────── */
  private subscribers = 0;
  private running = false;
  private liveTimer: number | null = null;
  private analyticsTimer: number | null = null;
  private socket: WebSocket | null = null;
  private socketRetry: number | null = null;
  private hydrated = false;
  private inFlight: AbortController | null = null;
  private readonly watched = new Map<string, number>();
  
  private streamIntervalMs: number = env.streamIntervalMs;

  /* ── Subscription ─────────────────────────────────────────────────── */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.subscribers += 1;
    return () => {
      this.listeners.delete(listener);
      this.subscribers -= 1;
    };
  };

  subscribeConnection = (listener: () => void): (() => void) => {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  getConnection = (): ConnectionSnapshot => this.connection;

  private publish(): void {
    for (const listener of this.listeners) listener();
  }

  private publishConnection(patch: Partial<ConnectionSnapshot>): void {
    this.connection = { ...this.connection, ...patch };
    for (const listener of this.connectionListeners) listener();
  }

  /* ── Start and stop ───────────────────────────────────────────────── */

  start(): void {
    if (this.running) return;
    this.running = true;

    void this.refreshAnalytics();
    void this.refreshLive();

    this.analyticsTimer = window.setInterval(() => void this.refreshAnalytics(), this.streamIntervalMs);

    if (env.useWebsocket) {
      this.openSocket();
    } else {
      this.startPolling();
    }
  }

  stop(): void {
    this.running = false;

    if (this.analyticsTimer !== null) window.clearInterval(this.analyticsTimer);
    if (this.liveTimer !== null) window.clearInterval(this.liveTimer);
    if (this.socketRetry !== null) window.clearTimeout(this.socketRetry);
    this.analyticsTimer = null;
    this.liveTimer = null;
    this.socketRetry = null;

    this.inFlight?.abort();
    this.inFlight = null;

    this.closeSocket();
    this.publishConnection({ status: 'offline', transport: 'none' });
    this.setRunning(false);
  }

  toggle(): void {
    if (this.running) this.stop();
    else this.start();
  }

  /** Force an immediate refresh of everything. Backs the retry affordance. */
  refreshNow(): void {
    void this.refreshAnalytics();
    void this.refreshLive();
  }

  setStreamIntervalMs(ms: number): void {
    this.streamIntervalMs = ms;
    if (this.running) {
      if (this.analyticsTimer !== null) {
        window.clearInterval(this.analyticsTimer);
        this.analyticsTimer = window.setInterval(() => void this.refreshAnalytics(), this.streamIntervalMs);
      }
      if (this.liveTimer !== null) {
        window.clearInterval(this.liveTimer);
        this.liveTimer = window.setInterval(() => void this.refreshLive(), this.streamIntervalMs);
      }
    }
  }

  getStreamIntervalMs(): number {
    return this.streamIntervalMs;
  }

  private setRunning(running: boolean): void {
    if (this.snapshot.running === running) return;
    this.snapshot = { ...this.snapshot, running };
    this.publish();
  }

  /* ── Live stream ──────────────────────────────────────────────────── */

  private startPolling(): void {
    if (this.liveTimer !== null) return;
    this.publishConnection({ transport: 'polling' });
    this.liveTimer = window.setInterval(() => void this.refreshLive(), this.streamIntervalMs);
  }

  private stopPolling(): void {
    if (this.liveTimer === null) return;
    window.clearInterval(this.liveTimer);
    this.liveTimer = null;
  }

  private openSocket(): void {
    if (this.socket || !this.running) return;

    const url = `${backendOrigin().replace(/^http/, 'ws')}/api/ws/telemetry`;

    try {
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.onopen = () => {
        this.stopPolling();
        this.publishConnection({ status: 'live', transport: 'websocket', consecutiveFailures: 0, error: null });
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const frame = JSON.parse(event.data) as {
            type: string;
            tick: number;
            at: string;
            readings: TelemetryReadingDto[];
          };
          if (frame.type !== 'telemetry') return;
          this.ingestReadings(frame.readings, frame.tick);
        } catch {
          // A malformed frame is not worth tearing the stream down for; the
          // next one arrives in a second.
        }
      };

      socket.onerror = () => socket.close();

      socket.onclose = () => {
        this.socket = null;
        if (!this.running) return;
        // Fall back to polling immediately so the interface keeps moving, and
        // try the socket again shortly — polling is the safety net, not the plan.
        this.startPolling();
        this.publishConnection({ transport: 'polling' });
        this.socketRetry = window.setTimeout(() => this.openSocket(), 10_000);
      };
    } catch {
      this.socket = null;
      this.startPolling();
    }
  }

  private closeSocket(): void {
    if (!this.socket) return;
    this.socket.onclose = null;
    this.socket.onerror = null;
    this.socket.onmessage = null;
    this.socket.close();
    this.socket = null;
  }

  private async refreshLive(): Promise<void> {
    if (!this.running) return;
    try {
      const response = await telemetryService.live();
      this.ingestReadings(response.readings, response.meta.tick);
    } catch (error) {
      this.recordFailure(error);
    }
  }

  /**
   * Fold a batch of readings into the snapshot.
   *
   * Each reading is appended to that device's rolling window and becomes its
   * live sample. The health score on the reading is the platform's own, so
   * condition tracks the stream at its full rate without this client deriving
   * anything.
   */
  private ingestReadings(readings: TelemetryReadingDto[], tick: number): void {
    if (readings.length === 0) return;

    for (const reading of readings) {
      this.latest.set(reading.asset_id, reading);

      const sample = toSample(reading);
      const window = this.history.get(reading.asset_id) ?? [];
      // Guard against a duplicate frame replaying the same instant.
      if (window.length === 0 || window[window.length - 1].t !== sample.t) {
        window.push(sample);
        if (window.length > HISTORY_LIMIT) window.splice(0, window.length - HISTORY_LIMIT);
      }
      this.history.set(reading.asset_id, window);
    }

    this.markLive(tick);
    this.rebuild(tick);
  }

  /** Fill each device's window from the backend so charts open with depth. */
  private async hydrateHistory(assetIds: string[]): Promise<void> {
    if (this.hydrated || assetIds.length === 0) return;
    this.hydrated = true;

    const windows = await Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const response = await telemetryService.window(assetId, HYDRATE_SAMPLES);
          return [assetId, response.readings.map(toSample)] as const;
        } catch {
          return [assetId, [] as TelemetrySample[]] as const;
        }
      }),
    );

    for (const [assetId, samples] of windows) {
      if (samples.length === 0) continue;
      const live = this.history.get(assetId) ?? [];
      // Anything that arrived on the stream while this was in flight stays.
      const oldest = live.length > 0 ? live[0].t : Number.POSITIVE_INFINITY;
      this.history.set(assetId, [...samples.filter((sample) => sample.t < oldest), ...live]);
    }

    this.rebuild(this.snapshot.tick);
  }

  /* ── Derived views ────────────────────────────────────────────────── */

  private async refreshAnalytics(): Promise<void> {
    if (!this.running) return;

    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;
    const signal = controller.signal;

    const started = performance.now();

    try {
      const [dashboard, assets, anomalies, preventive, predictive, prescriptive] = await Promise.all([
        dashboardService.snapshot({ signal }),
        assetService.list({}, { signal }),
        anomalyService.list({ limit: 500 }, { signal }),
        maintenanceService.preventive({}, { signal }),
        maintenanceService.predictive({}, { signal }),
        maintenanceService.prescriptive({}, { signal }),
      ]);

      this.dashboard = dashboard;
      this.assets = assets.assets;
      this.anomalies = anomalies.anomalies;
      this.mttrMinutes = anomalies.mean_time_to_resolve_minutes;
      this.tasks = preventive.tasks;
      this.predictive = predictive;
      this.prescriptive = prescriptive.actions;
      this.apiResponseMs = Math.round(performance.now() - started);

      // Thresholds and facets are the backend's; the interface reads them
      // rather than carrying its own copy of either.
      applyBandThresholds(dashboard.bands.map((band) => ({ band: band.band, min: band.min })));
      applyFleetFacets(
        Array.from(new Set(assets.assets.map((asset) => asset.category))),
        ['Enterprise']
      );
      applyEffectivenessTargets(dashboard.oee.target, dashboard.oee.world_class);

      this.markLive(dashboard.meta.tick);
      this.rebuild(dashboard.meta.tick);

      void this.hydrateHistory(assets.assets.map((asset) => asset.asset_id));
      void this.loadConfiguration();
      void this.loadReports();
      void this.refreshWatchedDetails();
    } catch (error) {
      if (isApiError(error) && error.kind === 'cancelled') return;
      this.recordFailure(error);
    }
  }

  private apiResponseMs = 0;

  private configurationLoaded = false;

  private async loadConfiguration(): Promise<void> {
    if (this.configurationLoaded) return;
    this.configurationLoaded = true;

    try {
      const status = await systemService.status();
      const config = status.configuration as Record<string, number>;
      applyPlatformConfig({
        tickIntervalSeconds: config.tick_interval_seconds,
        wearTimeScale: config.wear_time_scale,
      });
      this.publish();
    } catch {
      this.configurationLoaded = false;
    }
  }

  private async loadReports(): Promise<void> {
    if (this.reportsLoaded) return;
    this.reportsLoaded = true;

    try {
      const [daily, predictions] = await Promise.all([
        reportService.daily({ days: 30 }),
        reportService.predictions({ days: 30 }),
      ]);
      this.dailyRecords = daily.records.map(toDailyRecord);
      this.predictionRecords = predictions.records.map(toPredictionRecord);
      this.publish();
    } catch {
      // Reports are not required for the live views; leave them empty and the
      // reporting page will show its own empty state.
      this.reportsLoaded = false;
    }
  }

  /* ── Asset detail ─────────────────────────────────────────────────── */

  /** Register interest in one device's full record. Returns an unsubscribe. */
  watchAsset(assetId: string): () => void {
    this.watched.set(assetId, (this.watched.get(assetId) ?? 0) + 1);
    void this.loadDetail(assetId);

    return () => {
      const count = (this.watched.get(assetId) ?? 1) - 1;
      if (count <= 0) this.watched.delete(assetId);
      else this.watched.set(assetId, count);
    };
  }

  private async loadDetail(assetId: string): Promise<void> {
    try {
      const detail = await assetService.detail(assetId);
      this.details.set(assetId, detail);
      this.rebuild(this.snapshot.tick);
    } catch (error) {
      if (isApiError(error) && error.kind === 'cancelled') return;
      // A failed detail load leaves the list-level record in place rather than
      // blanking the page.
    }
  }

  private async refreshWatchedDetails(): Promise<void> {
    await Promise.all(Array.from(this.watched.keys()).map((assetId) => this.loadDetail(assetId)));
  }

  /* ── Actions ──────────────────────────────────────────────────────── */

  acknowledge(uid: string): void {
    void anomalyService
      .acknowledge(uid)
      .then(() => this.refreshAnalytics())
      .catch(() => undefined);
  }

  acknowledgeAll(): number {
    const claimed = this.snapshot.anomalies.filter((record) => record.status === 'Active').length;
    void anomalyService
      .acknowledgeAll()
      .then(() => this.refreshAnalytics())
      .catch(() => undefined);
    return claimed;
  }

  completeTask(taskId: string): void {
    void maintenanceService
      .completeTask(taskId)
      .then(() => this.refreshAnalytics())
      .catch(() => undefined);
  }

  reopenTask(taskId: string): void {
    void maintenanceService
      .reopenTask(taskId)
      .then(() => this.refreshAnalytics())
      .catch(() => undefined);
  }

  /*
   * Bound properties, not prototype methods.
   *
   * These are handed straight to useSyncExternalStore, which invokes them with
   * no receiver. A prototype method loses `this` at that call site and throws
   * on first read, so the binding is load-bearing — matching `subscribe` and
   * `getSnapshot` above.
   */
  getDailyRecords = (): DailyTelemetryRecord[] => this.dailyRecords;

  getPredictionRecords = (): PredictionHistoryRecord[] => this.predictionRecords;

  /* ── Connection bookkeeping ───────────────────────────────────────── */

  private markLive(tick: number): void {
    this.publishConnection({
      status: 'live',
      loading: false,
      error: null,
      lastUpdatedAt: Date.now(),
      consecutiveFailures: 0,
    });
    if (!this.snapshot.running && this.running) this.setRunning(true);
    void tick;
  }

  private recordFailure(error: unknown): void {
    const failures = this.connection.consecutiveFailures + 1;
    const detail = isApiError(error) ? error.detail : 'The backend could not be reached.';

    this.publishConnection({
      // One missed poll is a blip; a run of them is an outage.
      status: failures >= 3 ? 'offline' : 'reconnecting',
      loading: this.connection.lastUpdatedAt === 0,
      error: detail,
      consecutiveFailures: failures,
    });
  }

  /* ── Snapshot assembly ────────────────────────────────────────────── */

  private rebuild(tick: number): void {
    const dashboard = this.dashboard;
    if (!dashboard) return;

    const predictionsById = new Map(
      (this.predictive?.assets ?? []).map((entry) => [entry.asset_id, entry]),
    );
    const prescriptiveById = new Map(this.prescriptive.map((action) => [action.asset_id, action]));

    const assets: AssetRuntime[] = this.assets.map((dto) => {
      const history = this.history.get(dto.asset_id) ?? [];
      const reading = this.latest.get(dto.asset_id);
      const live = reading ? toSample(reading) : history[history.length - 1];

      let asset = toAssetRuntime(dto, live, history);

      // The live stream carries condition at its own rate; the list response is
      // only refreshed on the analytics cadence, so the newer of the two wins.
      if (reading) {
        asset = {
          ...asset,
          health: reading.health_score,
          device: { ...asset.device, status: reading.device_status },
        };
      }

      const prediction = predictionsById.get(dto.asset_id);
      if (prediction) {
        asset = {
          ...asset,
          prediction: {
            assetId: prediction.asset_id,
            assetName: prediction.asset_name,
            category: asset.category,
            primary: toComponentPrediction(prediction.primary),
            components: prediction.components.map(toComponentPrediction),
            horizonDays: prediction.horizon_days,
          },
        };
      }

      const action = prescriptiveById.get(dto.asset_id);
      if (action) asset = { ...asset, prescriptive: toPrescriptiveAction(action) };

      const detail = this.details.get(dto.asset_id);
      if (detail) asset = mergeAssetDetail(asset, detail);

      return asset;
    });

    const byId: Record<string, AssetRuntime> = {};
    for (const asset of assets) byId[asset.device.assetId] = asset;

    const anomalies: AnomalyRecord[] = this.anomalies.map(toAnomaly);
    const tasks: PreventiveTask[] = this.tasks.map(toPreventiveTask);

    const onlineByCategory = new Map<string, number>();
    for (const asset of assets) {
      if (asset.device.status !== 'Offline') {
        onlineByCategory.set(asset.category, (onlineByCategory.get(asset.category) ?? 0) + 1);
      }
    }

    this.snapshot = {
      tick,
      at: new Date(dashboard.meta.generated_at).getTime(),
      elapsedDays: dashboard.platform.uptime_seconds / 86_400,
      running: this.running,
      assets,
      byId,
      anomalies,
      tasks,
      kpis: toFleetKpis(
        dashboard.kpis,
        tasks.filter((task) => task.status === 'Overdue').length,
        tasks.filter((task) => task.status === 'Due').length,
      ),
      oee: toFleetOee(dashboard.oee),
      categories: dashboard.categories.map((category) =>
        toCategoryRollup(category, onlineByCategory.get(category.category) ?? 0),
      ),
      fleetTrail: toFleetTrail(dashboard.fleet_trail),
      operationalHealth: dashboard.kpis.operational_health,
      mttrMinutes: this.mttrMinutes,
      yesterday: toYesterday(dashboard.yesterday, dashboard.kpis.average_rul_days),
      activity: dashboard.activity.map(toActivity),
      energy: toEnergy(dashboard.energy),
      platform: toPlatformHealth(dashboard.platform, this.apiResponseMs),
    };

    this.publish();
  }
}

let instance: PlatformStore | null = null;

export const getPlatformStore = (): PlatformStore => {
  if (!instance) instance = new PlatformStore();
  return instance;
};
