import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ApmOverviewDto } from '@/types/api';
import { env } from '@/config/env';
import { isApiError } from './http';
import { apmService, type ApmQuery } from './platform.service';

/* ───────────────────────────────────────────────────────────────────────────
 * The APM store.
 *
 * Deliberately separate from `platformStore`, which owns the estate snapshot the
 * whole application renders from. Two reasons, and the first is the important one:
 *
 *   1. Ownership. APM is one module of four, and folding its projection into the
 *      global snapshot would put APM data on every page's re-render path and give
 *      three other modules a reason to read it. This store is imported by the APM
 *      view and by nothing else, so the module boundary is a fact about the import
 *      graph rather than a convention.
 *
 *   2. Cadence. The APM composites are recomputed by the backend on the analytics
 *      pass, not on the tick. Polling them at the live rate would ask the server
 *      to re-serialise twenty-four records a second to publish a number that has
 *      not moved.
 *
 * Same shape as the platform store otherwise: an external store read through
 * `useSyncExternalStore`, so every subscriber sees one snapshot with no tearing;
 * one in-flight request at a time, aborted when superseded; and the last good
 * payload stays on screen when the backend goes away, because an operator staring
 * at a blank panel learns less than one staring at a stale panel that admits it.
 *
 * Nothing here computes a domain figure. The backend publishes aggregates over
 * whatever scope was requested, which is precisely so this file does not have to.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ApmState {
  data: ApmOverviewDto | null;
  /** True until the first successful load, so a view can show a skeleton. */
  loading: boolean;
  error: string | null;
  /** Epoch millis of the last successful load. */
  lastUpdatedAt: number;
  /** Consecutive failures. One is a blip; a run of them is an outage. */
  failures: number;
  /** True while a request is in flight over an already-loaded payload. */
  refreshing: boolean;
}

const EMPTY: ApmState = {
  data: null,
  loading: true,
  error: null,
  lastUpdatedAt: 0,
  failures: 0,
  refreshing: false,
};

/** Stable key for a query, so an inline object at the call site is not a change. */
const keyOf = (query: ApmQuery): string =>
  JSON.stringify({
    category: query.category ?? null,
    criticality: query.criticality ?? null,
    risk_tier: query.risk_tier ?? null,
    band: query.band ?? null,
    status: query.status ?? null,
    sort: query.sort ?? null,
  });

class ApmStore {
  private state: ApmState = EMPTY;
  private readonly listeners = new Set<() => void>();

  private query: ApmQuery = {};
  private queryKey = keyOf({});

  private subscribers = 0;
  private timer: number | null = null;
  private inFlight: AbortController | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.subscribers += 1;
    if (this.subscribers === 1) this.begin();

    return () => {
      this.listeners.delete(listener);
      this.subscribers -= 1;
      // Nobody is watching: stop polling rather than leaving a backgrounded
      // view holding a timer open for the life of the session.
      if (this.subscribers === 0) this.end();
    };
  };

  getSnapshot = (): ApmState => this.state;

  private publish(patch: Partial<ApmState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /* ── Lifecycle ────────────────────────────────────────────────────── */

  private begin(): void {
    if (this.timer !== null) return;
    void this.load();
    this.timer = window.setInterval(() => void this.load(), env.analyticsPollMs);
  }

  private end(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  /* ── Query ────────────────────────────────────────────────────────── */

  /**
   * Point the store at a different scope.
   *
   * Filtering happens on the server. The response carries aggregates over the
   * filtered scope, so changing the filter is a request rather than a client-side
   * recomputation of numbers the browser has no business deriving.
   */
  setQuery(query: ApmQuery): void {
    const next = keyOf(query);
    if (next === this.queryKey) return;

    this.queryKey = next;
    this.query = query;

    // The payload on screen describes the previous scope, so it is not a stale
    // version of what was asked for — it is an answer to a different question.
    // Clear it and report loading rather than showing one scope's figures under
    // another scope's label.
    this.publish({ data: null, loading: true, refreshing: false, error: null });
    void this.load();
  }

  refresh(): void {
    void this.load();
  }

  /* ── Fetch ────────────────────────────────────────────────────────── */

  private async load(): Promise<void> {
    if (this.subscribers === 0) return;

    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;

    const requestedKey = this.queryKey;
    this.publish({ refreshing: this.state.data !== null });

    try {
      const data = await apmService.overview(this.query, { signal: controller.signal });

      // The scope changed while this was in flight. Publishing now would show
      // the old scope's data against the new filter.
      if (requestedKey !== this.queryKey) return;

      this.publish({
        data,
        loading: false,
        refreshing: false,
        error: null,
        lastUpdatedAt: Date.now(),
        failures: 0,
      });
    } catch (error) {
      if (isApiError(error) && error.kind === 'cancelled') return;

      const failures = this.state.failures + 1;
      this.publish({
        // The last good payload stays. Only the first load leaves the view empty,
        // and that is the one case where there is nothing to keep.
        loading: this.state.data === null,
        refreshing: false,
        error: isApiError(error) ? error.detail : 'The APM projection could not be loaded.',
        failures,
      });
    }
  }
}

let instance: ApmStore | null = null;

export const getApmStore = (): ApmStore => {
  if (!instance) instance = new ApmStore();
  return instance;
};

/* ─── React binding ──────────────────────────────────────────────────────── */

export interface ApmView extends ApmState {
  retry: () => void;
}

/**
 * Subscribe to the APM projection for a given scope.
 *
 * The query is compared by value, so passing a fresh object literal on every
 * render does not cause a refetch.
 */
export const useApmOverview = (query: ApmQuery = {}): ApmView => {
  const store = getApmStore();
  const key = keyOf(query);
  const queryRef = useRef(query);
  queryRef.current = query;

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.setQuery(queryRef.current);
    // Keyed on the serialised query: an object literal with the same contents is
    // the same scope and must not trigger a request.
  }, [store, key]);

  return { ...state, retry: useCallback(() => store.refresh(), [store]) };
};
