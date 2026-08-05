import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  AnomalyRecord,
  AssetRuntime,
  CategoryRollup,
  EngineSnapshot,
  FleetKpis,
  FleetOee,
  PreventiveTask,
} from './types';
import { getPlatformStore } from '@/services/platformStore';
import { ConnectionBanner } from '@/components/common/ConnectionBanner';
import { AlertAggregator } from './AlertAggregator';

/* ───────────────────────────────────────────────────────────────────────────
 * React binding.
 *
 * The platform is an external store rather than React state, read through
 * `useSyncExternalStore` so every subscriber sees the same snapshot with no
 * tearing. Selectors are cached against snapshot identity, so a component that
 * only cares about one slice does not re-render when an unrelated slice changes.
 *
 * The snapshot itself is assembled entirely from FastAPI responses — see
 * `services/platformStore.ts`. Nothing below this line computes a domain figure;
 * these hooks select and memoise, and that is all.
 *
 * The module keeps the shape it had when a browser-side simulator produced the
 * data, which is why no component changed when the source moved to the backend.
 * ─────────────────────────────────────────────────────────────────────────── */

const store = getPlatformStore();

/** Reference-equality check across the members of two arrays. */
export const shallowArrayEqual = <T,>(a: readonly T[], b: readonly T[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/** Reference-equality check across the own enumerable keys of two objects. */
export const shallowEqual = <T extends object>(a: T, b: T): boolean => {
  if (a === b) return true;
  const aKeys = Object.keys(a) as Array<keyof T>;
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
};

/**
 * Subscribe to a slice of the platform snapshot.
 *
 * The selector and equality function are held in refs so an inline arrow at the
 * call site does not force a resubscribe on every render.
 */
export function useEngineSelector<T>(
  selector: (snapshot: EngineSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector);
  const equalRef = useRef(isEqual);
  selectorRef.current = selector;
  equalRef.current = isEqual;

  const cache = useRef<{ snapshot: EngineSnapshot; value: T } | null>(null);

  const getSelection = useCallback((): T => {
    const snapshot = store.getSnapshot();
    const cached = cache.current;

    // Same snapshot — return the memoised selection unchanged.
    if (cached && cached.snapshot === snapshot) return cached.value;

    const next = selectorRef.current(snapshot);

    // New snapshot but an equivalent slice — keep the previous reference so
    // React can skip the re-render entirely.
    if (cached && equalRef.current(cached.value, next)) {
      cache.current = { snapshot, value: cached.value };
      return cached.value;
    }

    cache.current = { snapshot, value: next };
    return next;
  }, []);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}

/* ─── Slice hooks ────────────────────────────────────────────────────────── */

export const useSnapshot = (): EngineSnapshot => useEngineSelector((snapshot) => snapshot);

export const useFleetKpis = (): FleetKpis => useEngineSelector((snapshot) => snapshot.kpis, shallowEqual);

export const useFleetOee = (): FleetOee => useEngineSelector((snapshot) => snapshot.oee, shallowEqual);

export const useAssetList = (): AssetRuntime[] =>
  useEngineSelector((snapshot) => snapshot.assets, shallowArrayEqual);

export const useAssetRuntime = (assetId: string | undefined): AssetRuntime | undefined => {
  // Detail comes from its own endpoint — component wear, per-component
  // predictions and the prescriptive action are not carried on the list.
  useEffect(() => {
    if (!assetId) return undefined;
    return store.watchAsset(assetId);
  }, [assetId]);

  return useEngineSelector((snapshot) => (assetId ? snapshot.byId[assetId] : undefined));
};

export const useAnomalyJournal = (): AnomalyRecord[] =>
  useEngineSelector((snapshot) => snapshot.anomalies, shallowArrayEqual);

export const usePreventiveTasks = (): PreventiveTask[] =>
  useEngineSelector((snapshot) => snapshot.tasks, shallowArrayEqual);

export const useCategoryRollups = (): CategoryRollup[] =>
  useEngineSelector((snapshot) => snapshot.categories, shallowArrayEqual);

export const useFleetTrail = (): EngineSnapshot['fleetTrail'] =>
  useEngineSelector((snapshot) => snapshot.fleetTrail, shallowArrayEqual);

export const useEngineTick = (): number => useEngineSelector((snapshot) => snapshot.tick);

export const useEngineClock = (): number => useEngineSelector((snapshot) => snapshot.at);

/* ─── Connection state ───────────────────────────────────────────────────── */

export interface ConnectionState {
  status: 'connecting' | 'live' | 'reconnecting' | 'offline';
  /** True until the first successful load, so views can show a skeleton. */
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number;
  transport: 'websocket' | 'polling' | 'none';
  consecutiveFailures: number;
  retry: () => void;
}

export const useConnection = (): ConnectionState => {
  const state = useSyncExternalStore(
    store.subscribeConnection,
    store.getConnection,
    store.getConnection,
  );

  return { ...state, retry: useCallback(() => store.refreshNow(), []) };
};

/* ─── Control surface ────────────────────────────────────────────────────── */

export interface EngineControl {
  running: boolean;
  tick: number;
  at: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  step: () => void;
  acknowledge: (id: string) => void;
  acknowledgeAll: () => number;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => void;
  streamIntervalMs: number;
  setStreamIntervalMs: (ms: number) => void;
}

/**
 * Actions on the estate.
 *
 * Every one of these is a request to the backend. `start`, `stop` and `toggle`
 * govern this client's subscription to the stream, not the sensor engine — the
 * platform keeps generating telemetry whether or not a browser is watching.
 */
export const useEngineControl = (): EngineControl => {
  const running = useEngineSelector((snapshot) => snapshot.running);
  const tick = useEngineSelector((snapshot) => snapshot.tick);
  const at = useEngineSelector((snapshot) => snapshot.at);
  const streamIntervalMs = useSyncExternalStore(store.subscribeConnection, () => store.getStreamIntervalMs(), () => store.getStreamIntervalMs());

  return {
    running,
    tick,
    at,
    start: useCallback(() => store.start(), []),
    stop: useCallback(() => store.stop(), []),
    toggle: useCallback(() => store.toggle(), []),
    step: useCallback(() => store.refreshNow(), []),
    acknowledge: useCallback((id: string) => store.acknowledge(id), []),
    acknowledgeAll: useCallback(() => store.acknowledgeAll(), []),
    completeTask: useCallback((id: string) => store.completeTask(id), []),
    reopenTask: useCallback((id: string) => store.reopenTask(id), []),
    streamIntervalMs,
    setStreamIntervalMs: useCallback((ms: number) => {
      store.setStreamIntervalMs(ms);
      store.refreshNow(); 
    }, []),
  };
};

/* ─── Historical records ─────────────────────────────────────────────────── */

/**
 * Archive records for the reporting module.
 *
 * Served from the backend's stored history, so they are fetched rather than
 * read synchronously. Both hooks return a stable array reference until new
 * records land, which is what lets the tables downstream memoise normally.
 *
 * Read through a closure rather than by handing the method itself to
 * `useSyncExternalStore`. The store's subscribe/getSnapshot pair are arrow
 * properties and so carry their instance; these two are prototype methods, and
 * a bare `store.getDailyRecords` reference arrives at React detached from it —
 * `this` is undefined by the time React invokes it, and reading the field off
 * it throws. Calling through the instance restores the receiver.
 *
 * Defined once at module scope, not per render: `useSyncExternalStore` compares
 * the getter by identity, and a fresh closure each render would resubscribe on
 * every commit.
 */
const readDailyRecords = () => store.getDailyRecords();
const readPredictionRecords = () => store.getPredictionRecords();

export const useDailyRecords = () =>
  useSyncExternalStore(store.subscribe, readDailyRecords, readDailyRecords);

export const usePredictionRecords = () =>
  useSyncExternalStore(store.subscribe, readPredictionRecords, readPredictionRecords);

/* ─── Provider ───────────────────────────────────────────────────────────── */

/**
 * Connects to the platform for as long as the shell is mounted, and disconnects
 * on unmount so a backgrounded session is not left polling.
 */
export const EngineProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, []);

  return (
    <>
      {children}
      <ConnectionBanner />
      <AlertAggregator />
    </>
  );
};
