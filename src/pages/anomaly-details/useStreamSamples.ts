import { useRef } from 'react';
import { useConnection, useSnapshot } from '@/engine/store';

/* ───────────────────────────────────────────────────────────────────────────
 * Stream measurement.
 *
 * The platform publishes the current round-trip and ingest figures but keeps no
 * history of them, so a trend has to be accumulated by whoever wants one. This
 * samples once per backend tick into a bounded ring and reports what it has
 * actually observed since the view mounted — never a back-filled or synthesised
 * series. The charts say so in their footnotes, because a fifteen-minute axis
 * that only holds two minutes of real observations would otherwise read as a
 * quiet period rather than a short history.
 *
 * The ring is written during render behind a tick guard rather than in an
 * effect: an effect would land one tick late, and a tick guard makes the write
 * idempotent so a double render in strict mode cannot record the same
 * observation twice.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface StreamSample {
  t: number;
  /** Clock label for the chart axis. */
  label: string;
  /** Backend round trip, ms. */
  apiMs: number;
  /** Database round trip, ms. */
  dbMs: number;
  /** Age of the newest packet at the moment it was sampled, ms. */
  packetAgeMs: number;
  /** Messages per minute the platform reports it is ingesting. */
  ingestPerMinute: number;
  /** Endpoints reporting at this tick. */
  reporting: number;
}

/** 15 minutes at one sample per second. */
const CAPACITY = 900;

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export interface StreamSeries {
  samples: StreamSample[];
  /** Wall-clock span actually covered, in seconds. */
  spanSeconds: number;
}

export const useStreamSamples = (): StreamSeries => {
  const snapshot = useSnapshot();
  const connection = useConnection();

  const ring = useRef<{ samples: StreamSample[]; lastTick: number }>({ samples: [], lastTick: -1 });

  if (ring.current.lastTick !== snapshot.tick) {
    ring.current.lastTick = snapshot.tick;

    const reporting = snapshot.assets.filter((asset) => asset.device.status !== 'Offline').length;

    ring.current.samples.push({
      t: snapshot.at,
      label: clockFmt.format(new Date(snapshot.at)),
      apiMs: Math.max(0, snapshot.platform.apiResponseMs),
      dbMs: Math.max(0, snapshot.platform.databaseLatencyMs),
      packetAgeMs:
        connection.lastUpdatedAt > 0 ? Math.max(0, Date.now() - connection.lastUpdatedAt) : 0,
      ingestPerMinute: snapshot.platform.ingestPerMinute,
      reporting,
    });

    if (ring.current.samples.length > CAPACITY) {
      ring.current.samples.splice(0, ring.current.samples.length - CAPACITY);
    }
  }

  const samples = ring.current.samples;
  const spanSeconds =
    samples.length < 2 ? 0 : Math.round((samples[samples.length - 1].t - samples[0].t) / 1000);

  return { samples, spanSeconds };
};

/* ─── Histogram ──────────────────────────────────────────────────────────── */

export interface HistogramBin {
  label: string;
  /** Inclusive lower edge, ms. */
  from: number;
  /** Exclusive upper edge, ms. Infinity on the overflow bin. */
  to: number;
  count: number;
  sharePct: number;
}

/**
 * Bucket packet arrival delay.
 *
 * The edges are fixed rather than derived from the data so the shape of the
 * distribution is comparable between visits — a histogram that rescales its own
 * bins makes a stable stream and a degrading one look identical.
 */
const DELAY_EDGES = [0, 250, 500, 750, 1000, 1250, 1500] as const;

export const bucketDelay = (samples: readonly StreamSample[]): HistogramBin[] => {
  const total = Math.max(1, samples.length);

  const bins: HistogramBin[] = DELAY_EDGES.map((from, index) => {
    const to = index === DELAY_EDGES.length - 1 ? Number.POSITIVE_INFINITY : DELAY_EDGES[index + 1];
    const count = samples.filter((sample) => sample.packetAgeMs >= from && sample.packetAgeMs < to).length;

    return {
      label:
        to === Number.POSITIVE_INFINITY
          ? `≥ ${from / 1000}s`
          : `${from}–${to}`,
      from,
      to,
      count,
      sharePct: Math.round((count / total) * 1000) / 10,
    };
  });

  return bins;
};
