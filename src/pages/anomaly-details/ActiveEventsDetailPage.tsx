import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertOctagon,
  ArrowRight,
  CheckCheck,
  Clock3,
  Crosshair,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { SEVERITY_TONE } from '@/engine/derive';
import { SEVERITY_ORDER, sortBySeverity } from '@/engine/analytics';
import { useAnomalyJournal, useEngineControl, useSnapshot } from '@/engine/store';
import { PATHS, deviceDetailPath } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BarTrend, type SeriesDef } from '@/components/charts';
import { DataTable } from '@/components/data';
import { AnomalyStatusBadge, DeviceIdentity, SeverityBadge } from '@/components/common';
import {
  breachRatio,
  classifyRecord,
  faultClass,
  isTransient,
} from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from './DetailShell';

/* ───────────────────────────────────────────────────────────────────────────
 * Active event queue and severity distribution.
 *
 * The queue is the work: raised, and neither cleared by the device nor closed by
 * an engineer. Everything here is scoped to that, with the self-cleared trail
 * shown alongside so an operator can see how much of the load resolved itself.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Windows the timeline is bucketed into, and how wide each one is. */
const BUCKETS = 24;
const BUCKET_MS = 120_000;

const minuteFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

interface LifecycleBucket {
  t: number;
  label: string;
  raised: number;
  cleared: number;
  Critical: number;
  Major: number;
  Warning: number;
  Info: number;
}

/**
 * Bucket raises against clears on one axis.
 *
 * A raise count alone cannot answer the question an operator actually has —
 * whether the queue is growing. Pairing it with the clear count in the same
 * window does.
 */
const bucketLifecycle = (records: readonly AnomalyRecord[], now: number): LifecycleBucket[] => {
  const out: LifecycleBucket[] = [];

  for (let index = BUCKETS - 1; index >= 0; index -= 1) {
    const to = now - index * BUCKET_MS;
    const from = to - BUCKET_MS;

    const raised = records.filter((record) => record.timestamp > from && record.timestamp <= to);
    const cleared = records.filter(
      (record) => record.resolvedAt !== null && record.resolvedAt > from && record.resolvedAt <= to,
    );

    out.push({
      t: to,
      label: minuteFmt.format(new Date(to)),
      raised: raised.length,
      cleared: cleared.length,
      Critical: raised.filter((record) => record.severity === 'Critical').length,
      Major: raised.filter((record) => record.severity === 'Major').length,
      Warning: raised.filter((record) => record.severity === 'Warning').length,
      Info: raised.filter((record) => record.severity === 'Info').length,
    });
  }

  return out;
};

export const ActiveEventsDetailPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const snapshot = useSnapshot();
  const { acknowledge } = useEngineControl();

  const now = snapshot.at;

  /* Local to this page: the platform holds no feedback endpoint wired to the
   * client yet, so a flag here tunes what this page reports for the session. */
  const [falseAlarms, setFalseAlarms] = useState<ReadonlySet<string>>(() => new Set<string>());

  const toggleFalseAlarm = useCallback((id: string, code: string) => {
    setFalseAlarms((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    toast.info(
      falseAlarms.has(id) ? 'False alarm withdrawn' : 'Logged as a false alarm',
      `${code} — precision on this page updates for the session.`,
    );
  }, [falseAlarms, toast]);

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  const unresolved = useMemo(
    () => journal.filter((record) => record.status !== 'Resolved').sort(sortBySeverity),
    [journal],
  );

  const counts = useMemo(() => {
    const critical = unresolved.filter((record) => record.severity === 'Critical').length;
    const major = unresolved.filter((record) => record.severity === 'Major').length;
    const warning = unresolved.filter((record) => record.severity === 'Warning').length;
    const info = unresolved.filter((record) => record.severity === 'Info').length;
    return {
      critical,
      major,
      warning,
      info,
      active: unresolved.filter((record) => record.status === 'Active').length,
      acknowledged: unresolved.filter((record) => record.status === 'Acknowledged').length,
      selfCleared: journal.filter((record) => record.status === 'Resolved').length,
      devices: new Set(unresolved.map((record) => record.assetId)).size,
    };
  }, [unresolved, journal]);

  /* Mean dwell across the queue — the detector's own confirm window per matched
   * rule. It is deliberate latency, not overhead, and it is the dominant term in
   * time-to-detect on this platform. */
  const meanDwell = useMemo(() => {
    const dwells = unresolved
      .map((record) => ruleFor(record)?.dwellSeconds ?? 0)
      .filter((value) => value > 0);
    return dwells.length === 0 ? null : dwells.reduce((sum, value) => sum + value, 0) / dwells.length;
  }, [unresolved, ruleFor]);

  const timeline = useMemo(() => bucketLifecycle(journal, now), [journal, now]);

  const timelineSeries = useMemo<SeriesDef[]>(
    () => SEVERITY_ORDER.map((severity) => ({
      key: severity,
      name: severity,
      color: SEVERITY_TONE[severity].color,
      decimals: 0,
    })),
    [],
  );

  /* ─── Breach magnitude ─────────────────────────────────────────────────── */

  /**
   * Signed departure from each threshold, largest first.
   *
   * A loss cascade is the wrong form here: a breach is an excess over a limit,
   * not a subtraction from a running total, and voltage sag breaches downward.
   * A diverging bar against a zero baseline states both magnitude and direction,
   * which is what an engineer reads this to find out.
   */
  const breaches = useMemo(
    () =>
      unresolved
        .map((record) => {
          const rule = ruleFor(record);
          const magnitude = breachRatio(record) * 100;
          const below = record.observed < record.threshold;
          return {
            label: `${record.assetId} · ${rule?.id ?? record.code}`,
            breachPct: Math.round((below ? -magnitude : magnitude) * 100) / 100,
            severity: record.severity,
            record,
          };
        })
        .sort((a, b) => Math.abs(b.breachPct) - Math.abs(a.breachPct))
        .slice(0, 12),
    [unresolved, ruleFor],
  );

  const stats: DetailStat[] = [
    {
      key: 'queue',
      label: 'Unresolved queue',
      value: formatNumber(unresolved.length),
      unit: unresolved.length === 1 ? 'event' : 'events',
      caption: `${formatNumber(counts.active)} unclaimed · ${formatNumber(counts.acknowledged)} claimed · across ${formatNumber(counts.devices)} device${counts.devices === 1 ? '' : 's'}`,
      icon: ShieldAlert,
      accent: '#EAB308',
    },
    {
      key: 'split',
      label: 'Severity split',
      value: `${formatNumber(counts.critical + counts.major)} / ${formatNumber(counts.warning + counts.info)}`,
      caption: `Critical ${formatNumber(counts.critical)} · Major ${formatNumber(counts.major)} · Warning ${formatNumber(counts.warning)} · Info ${formatNumber(counts.info)}`,
      icon: Crosshair,
      accent: counts.critical > 0 ? STATUS_COLOR.critical : SERIES[0],
      tone: counts.critical > 0 ? 'bad' : 'neutral',
    },
    {
      key: 'dwell',
      label: 'Mean rule dwell',
      value: meanDwell === null ? '—' : formatNumber(meanDwell, 1),
      unit: meanDwell === null ? undefined : 's',
      caption:
        'The confirm window the detector holds a breach for before raising. Deliberate — a single noisy sample never becomes an alert.',
      icon: Clock3,
      accent: '#38BDF8',
    },
    {
      key: 'cleared',
      label: 'Self-cleared',
      value: formatNumber(counts.selfCleared),
      caption: `Returned inside the limit with margin and stayed there · mean time to clear ${formatNumber(snapshot.mttrMinutes, 1)} min`,
      icon: ShieldCheck,
      accent: '#22C55E',
      tone: 'good',
    },
  ];

  /* ─── Event log ────────────────────────────────────────────────────────── */

  const columns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(
    () => [
      {
        id: 'signature',
        header: 'Failure mode',
        accessorFn: (row) => ruleFor(row)?.id ?? '',
        enableSorting: true,
        meta: { width: '15rem' },
        cell: ({ row }) => {
          const rule = ruleFor(row.original);
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
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {rule.id} · {row.original.code}
                </span>
              </span>
            </span>
          );
        },
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetId,
        enableSorting: true,
        meta: { width: '16rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.assetId}
            assetName={row.original.assetName}
            meta={row.original.category}
            idOnly
          />
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
        header: 'Breach vs limit',
        accessorFn: (row) => breachRatio(row),
        enableSorting: true,
        meta: { width: '13rem', numeric: true, align: 'right' },
        cell: ({ row }) => {
          const record = row.original;
          const below = record.observed < record.threshold;
          return (
            <span className="text-[12px] tabular-nums">
              <span className={cn('font-semibold', below ? 'text-amber-300' : 'text-rose-300')}>
                {below ? '−' : '+'}
                {formatPercent(breachRatio(record) * 100, 1)}
              </span>
              <span className="ml-1.5 text-fg-dim">
                {formatNumber(record.observed, 2)}/{formatNumber(record.threshold, 2)} {record.unit}
              </span>
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'State',
        accessorFn: (row) => row.status,
        enableSorting: true,
        cell: ({ row }) =>
          falseAlarms.has(row.original.id) ? (
            <Badge tone="warning" size="xs" icon={AlertOctagon}>
              False alarm
            </Badge>
          ) : (
            <AnomalyStatusBadge status={row.original.status} size="xs" />
          ),
      },
      {
        id: 'age',
        header: 'Open for',
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
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { width: '20rem', align: 'right' },
        cell: ({ row }) => {
          const record = row.original;
          const flagged = falseAlarms.has(record.id);
          return (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button
                variant={flagged ? 'subtle' : 'ghost'}
                size="xs"
                icon={flagged ? Undo2 : AlertOctagon}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFalseAlarm(record.id, record.code);
                }}
              >
                {flagged ? 'Withdraw' : 'False alarm'}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                icon={ExternalLink}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(deviceDetailPath(record.assetId));
                }}
              >
                Investigate
              </Button>
              {record.status === 'Active' ? (
                <Button
                  variant="subtle"
                  size="xs"
                  icon={CheckCheck}
                  onClick={(event) => {
                    event.stopPropagation();
                    acknowledge(record.id);
                    toast.success('Anomaly acknowledged', `${record.code} on ${record.assetId}.`);
                  }}
                >
                  Acknowledge
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [ruleFor, falseAlarms, toggleFalseAlarm, navigate, acknowledge, toast],
  );

  return (
    <DetailShell
      title="Active Event Queue & Severity Distribution"
      subtitle="Every unresolved event with the magnitude of its breach, the direction it broke in, and the actions available on it."
      eyebrow={
        <>
          <Badge tone={unresolved.length > 0 ? 'critical' : 'good'} size="sm" icon={ShieldAlert}>
            {formatNumber(unresolved.length)} unresolved
          </Badge>
          {counts.critical > 0 ? (
            <Badge tone="critical" size="sm">
              {formatNumber(counts.critical)} critical
            </Badge>
          ) : null}
          {falseAlarms.size > 0 ? (
            <Badge tone="warning" size="sm" icon={AlertOctagon}>
              {formatNumber(falseAlarms.size)} flagged as noise
            </Badge>
          ) : null}
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="hover:border-overlay/[0.12] transition-colors cursor-pointer" onClick={() => navigate(PATHS.anomalyEventLifecycle)}>
          <div className="p-6 flex flex-col h-full justify-center">
            <h3 className="text-lg font-semibold text-fg flex items-center justify-between">
              Event Lifecycle Timeline
              <ArrowRight className="w-5 h-5 text-fg-soft" />
            </h3>
            <p className="mt-2 text-sm text-fg-dim">
              Drill down into isolated timelines for Critical, Major, Warning, and Info events.
            </p>
          </div>
        </Card>
        
        <Card className="hover:border-overlay/[0.12] transition-colors cursor-pointer" onClick={() => navigate(PATHS.anomalyClearRate)}>
          <div className="p-6 flex flex-col h-full justify-center">
            <h3 className="text-lg font-semibold text-fg flex items-center justify-between">
              Clear Rate Analytics
              <ArrowRight className="w-5 h-5 text-fg-soft" />
            </h3>
            <p className="mt-2 text-sm text-fg-dim">
              Analyze throughput, resolution velocity, and Mean Time to Resolution (MTTR).
            </p>
          </div>
        </Card>
      </div>

      <BarTrend
        title="Breach magnitude against threshold envelope"
        subtitle="Signed departure from each device's own limit, largest first"
        eyebrow="Magnitude"
        icon={Crosshair}
        data={breaches}
        series={[{ key: 'breachPct', name: 'Breach', color: SERIES[0], unit: '%', decimals: 2 }]}
        layout="horizontal"
        height={Math.max(240, breaches.length * 30)}
        categoryWidth={148}
        colorFor={(point) => SEVERITY_TONE[(point.severity as keyof typeof SEVERITY_TONE) ?? 'Info'].color}
        references={[{ value: 0, label: 'Threshold', color: STATUS_COLOR.warning }]}
        footnote="Zero is the device's own limit, so bar length is how far past it the reading sat and the side states the direction — a sag breaches downward, a surge upward. Each device is judged against its own rating, which is what makes a 20 V laptop adapter and a 35 W charger comparable on one axis."
      />

      <DataTable<AnomalyRecord>
        data={unresolved}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        minWidth="92rem"
        emptyIcon={ShieldCheck}
        emptyTitle="Nothing unresolved"
        emptyDescription="Every event raised this session has cleared on its own or been closed by an engineer."
        toolbar={
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg">Event log</p>
            <p className="mt-0.5 text-[11.5px] text-fg-dim">
              Most severe first, newest within a severity. Marking noise is held for this session only.
            </p>
          </div>
        }
      />
    </DetailShell>
  );
};
