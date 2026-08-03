import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ExternalLink,
  Filter,
  HeartPulse,
  Layers,
  MonitorSmartphone,
  PieChart as PieIcon,
  Timer,
  X,
} from 'lucide-react';
import type { AnomalyRecord, AssetRuntime } from '@/engine/types';
import { bandDef } from '@/engine/derive';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { deviceDetailPath } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BarTrend, DonutSplit } from '@/components/charts';
import { DataTable } from '@/components/data';
import { DeviceIdentity, StatusBadge } from '@/components/common';
import {
  FAULT_CLASSES,
  classifyRecord,
  faultClass,
  isTransient,
  type FaultClassId,
} from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from './DetailShell';

/* ───────────────────────────────────────────────────────────────────────────
 * Category failure analytics.
 *
 * One deliberate omission: there is no "downtime risk score". Composing severity,
 * device count and condition into a single number would look authoritative and
 * mean nothing — the weights would be invented here and no one downstream could
 * check them. The bar chart plots the measured quantities that a risk score
 * would have been built from, so the comparison is still answerable and every
 * bar traces back to something the platform published.
 * ─────────────────────────────────────────────────────────────────────────── */

interface ClassRow {
  id: FaultClassId;
  label: string;
  short: string;
  color: string;
  description: string;
  open: number;
  critical: number;
  classified: number;
  transient: number;
  devices: number;
  /** Mean condition of the devices carrying this class, 0–100. */
  meanHealth: number | null;
  /** Soonest published remaining life among them, in days. */
  soonestRulDays: number | null;
}

export const CategoryBreakdownDetailPage = () => {
  const navigate = useNavigate();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const snapshot = useSnapshot();

  const now = snapshot.at;
  const [isolated, setIsolated] = useState<FaultClassId | null>(null);

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  const unresolved = useMemo(
    () => journal.filter((record) => record.status !== 'Resolved'),
    [journal],
  );

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.device.assetId, asset])),
    [assets],
  );

  const rows = useMemo<ClassRow[]>(() => {
    return FAULT_CLASSES.map((def) => {
      const members = unresolved.filter((record) => ruleFor(record)?.classId === def.id);
      const deviceIds = new Set(members.map((record) => record.assetId));

      const affected = [...deviceIds]
        .map((id) => assetById.get(id))
        .filter((asset): asset is AssetRuntime => asset !== undefined);

      const transient = members.filter((record) => isTransient(record, now)).length;

      const healths = affected.map((asset) => asset.health);
      const ruls = affected.map((asset) => asset.prediction.primary.rulDays);

      return {
        id: def.id,
        label: def.label,
        short: def.short,
        color: def.color,
        description: def.description,
        open: members.length,
        critical: members.filter((record) => record.severity === 'Critical').length,
        classified: members.length - transient,
        transient,
        devices: deviceIds.size,
        meanHealth:
          healths.length === 0 ? null : healths.reduce((sum, value) => sum + value, 0) / healths.length,
        soonestRulDays: ruls.length === 0 ? null : Math.min(...ruls),
      };
    }).sort((a, b) => b.open - a.open || a.label.localeCompare(b.label));
  }, [unresolved, ruleFor, assetById, now]);

  const present = useMemo(() => rows.filter((row) => row.open > 0), [rows]);
  const top = present[0] ?? null;

  const totals = useMemo(
    () => ({
      open: present.reduce((sum, row) => sum + row.open, 0),
      devices: new Set(unresolved.map((record) => record.assetId)).size,
      classified: present.reduce((sum, row) => sum + row.classified, 0),
      transient: present.reduce((sum, row) => sum + row.transient, 0),
    }),
    [present, unresolved],
  );

  const donut = useMemo(
    () =>
      present.map((row) => ({
        key: row.id,
        name: row.label,
        value: row.open,
        color: row.color,
      })),
    [present],
  );

  /* Measured quantities, not a composite score — see the note at the top. */
  const impact = useMemo(
    () =>
      present.map((row) => ({
        label: row.short,
        open: row.open,
        critical: row.critical,
        devices: row.devices,
      })),
    [present],
  );

  const condition = useMemo(
    () =>
      present
        .filter((row) => row.meanHealth !== null)
        .map((row) => ({
          label: row.short,
          meanHealth: Math.round((row.meanHealth ?? 0) * 10) / 10,
          soonestRulDays: row.soonestRulDays === null ? 0 : Math.round(row.soonestRulDays * 10) / 10,
          color: row.color,
        })),
    [present],
  );

  /* ─── Isolated device list ─────────────────────────────────────────────── */

  const isolatedRecords = useMemo(
    () => (isolated === null ? unresolved : unresolved.filter((record) => ruleFor(record)?.classId === isolated)),
    [isolated, unresolved, ruleFor],
  );

  const isolatedDevices = useMemo(() => {
    const byDevice = new Map<string, { asset: AssetRuntime; events: AnomalyRecord[] }>();

    for (const record of isolatedRecords) {
      const asset = assetById.get(record.assetId);
      if (!asset) continue;
      const entry = byDevice.get(record.assetId);
      if (entry) entry.events.push(record);
      else byDevice.set(record.assetId, { asset, events: [record] });
    }

    return [...byDevice.values()].sort(
      (a, b) => b.events.length - a.events.length || a.asset.health - b.asset.health,
    );
  }, [isolatedRecords, assetById]);

  const stats: DetailStat[] = [
    {
      key: 'dominant',
      label: 'Dominant category',
      value: top ? top.label : 'Nothing open',
      caption: top
        ? `${formatNumber(top.open)} open event${top.open === 1 ? '' : 's'} · ${formatPercent((top.open / Math.max(1, totals.open)) * 100, 1)} of the queue`
        : 'No class carries an open event in this window',
      icon: Layers,
      accent: top?.color ?? SERIES[0],
    },
    {
      key: 'devices',
      label: 'Affected devices',
      value: formatNumber(totals.devices),
      unit: totals.devices === 1 ? 'device' : 'devices',
      caption: `Out of ${formatNumber(assets.length)} commissioned across ${formatNumber(present.length)} fault class${present.length === 1 ? '' : 'es'}`,
      icon: MonitorSmartphone,
      accent: '#38BDF8',
    },
    {
      key: 'split',
      label: 'Classified vs transient',
      value: `${formatNumber(totals.classified)} / ${formatNumber(totals.transient)}`,
      caption:
        'Classified events are still holding. Transient ones cleared on their own inside a minute — real, but not standing faults.',
      icon: Filter,
      accent: '#A855F7',
    },
    {
      key: 'condition',
      label: 'Weakest affected device',
      value:
        isolatedDevices.length === 0
          ? '—'
          : formatPercent(Math.min(...isolatedDevices.map((entry) => entry.asset.health)), 1),
      caption:
        isolatedDevices.length === 0
          ? 'Nothing in scope'
          : `Soonest published remaining life ${formatNumber(Math.min(...isolatedDevices.map((entry) => entry.asset.prediction.primary.rulDays)), 1)} days`,
      icon: HeartPulse,
      accent: STATUS_COLOR.warning,
    },
  ];

  const columns = useMemo<Array<ColumnDef<{ asset: AssetRuntime; events: AnomalyRecord[] }, unknown>>>(
    () => [
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.asset.device.assetId,
        enableSorting: true,
        meta: { width: '18rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.asset.device.assetId}
            assetName={row.original.asset.device.assetName}
            meta={row.original.asset.category}
            idOnly
          />
        ),
      },
      {
        id: 'status',
        header: 'Link',
        accessorFn: (row) => row.asset.device.status,
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.asset.device.status} size="xs" />,
      },
      {
        id: 'events',
        header: 'Open events',
        accessorFn: (row) => row.events.length,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12.5px] font-semibold tabular-nums text-fg">
            {formatNumber(row.original.events.length)}
          </span>
        ),
      },
      {
        id: 'signatures',
        header: 'Signatures',
        enableSorting: false,
        meta: { width: '20rem' },
        cell: ({ row }) => {
          const ids = [...new Set(row.original.events.map((record) => ruleFor(record)?.id).filter(Boolean))];
          return (
            <span className="flex flex-wrap gap-1">
              {ids.map((id) => (
                <span
                  key={id}
                  className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[10.5px] text-fg-soft"
                >
                  {id}
                </span>
              ))}
            </span>
          );
        },
      },
      {
        id: 'health',
        header: 'Condition',
        accessorFn: (row) => row.asset.health,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => {
          const def = bandDef(row.original.asset.band);
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: def.color }}
                aria-hidden
              />
              <span className="text-[12px] tabular-nums text-fg-soft">
                {formatPercent(row.original.asset.health, 1)}
              </span>
            </span>
          );
        },
      },
      {
        id: 'rul',
        header: 'Remaining life',
        accessorFn: (row) => row.asset.prediction.primary.rulDays,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatNumber(row.original.asset.prediction.primary.rulDays, 1)} d
          </span>
        ),
      },
      {
        id: 'action',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="xs"
            icon={ExternalLink}
            onClick={(event) => {
              event.stopPropagation();
              navigate(deviceDetailPath(row.original.asset.device.assetId));
            }}
          >
            Open
          </Button>
        ),
      },
    ],
    [ruleFor, navigate],
  );

  return (
    <DetailShell
      title="Category Failure Analytics"
      subtitle="How the open queue distributes across the six fault classes, and what condition the devices behind each class are in."
      eyebrow={
        <>
          <Badge tone="brand" size="sm" icon={Layers}>
            {formatNumber(present.length)} of {formatNumber(FAULT_CLASSES.length)} classes active
          </Badge>
          {isolated ? (
            <Badge tone="warning" size="sm">
              Isolated: {faultClass(isolated).label}
            </Badge>
          ) : null}
        </>
      }
      actions={
        isolated ? (
          <Button variant="ghost" size="sm" icon={X} onClick={() => setIsolated(null)}>
            Clear isolation
          </Button>
        ) : null
      }
    >
      <DetailStatStrip stats={stats} />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
        <DonutSplit
          title="Distribution by fault class"
          subtitle="Open events resolved to the failure mode that named them"
          eyebrow="Taxonomy"
          icon={PieIcon}
          data={donut}
          height={224}
          centerValue={formatNumber(totals.open)}
          centerLabel="open events"
          footnote="Classes with nothing open are omitted rather than drawn as a zero-width slice."
        />

        <BarTrend
          title="Cross-category load"
          subtitle="Open events, critical events and affected devices per class"
          eyebrow="Comparison"
          icon={Layers}
          data={impact}
          series={[
            { key: 'open', name: 'Open events', color: SERIES[0], decimals: 0 },
            { key: 'critical', name: 'Critical', color: STATUS_COLOR.critical, decimals: 0 },
            { key: 'devices', name: 'Devices', color: SERIES[2], decimals: 0 },
          ]}
          height={260}
          footnote="Measured counts rather than a composite risk score: a single weighted number would hide the weights and nobody downstream could check it. Read the three together — many events on few devices is a different problem from few events spread wide."
        />
      </div>

      {condition.length > 0 ? (
        <BarTrend
          title="Condition of the devices behind each class"
          subtitle="Mean health, and the soonest published remaining life among the affected devices"
          eyebrow="Consequence"
          icon={Timer}
          data={condition}
          series={[
            { key: 'meanHealth', name: 'Mean health', color: SERIES[2], unit: '%', decimals: 1 },
            { key: 'soonestRulDays', name: 'Soonest remaining life', color: SERIES[3], unit: 'd', decimals: 1 },
          ]}
          height={260}
          footnote="Both figures are the platform's published values for those devices, passed through. A class with healthy devices and a long horizon is noise to triage later; a short horizon is the one to act on regardless of how few events it raised."
        />
      ) : null}

      {/* ─── Isolation controls ─────────────────────────────────────────── */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg">Isolate a class</p>
            <p className="mt-0.5 text-[11.5px] text-fg-dim">
              Narrows the device list below. Classes with nothing open are disabled rather than hidden, so the
              catalogue stays visible.
            </p>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-fg-dim">
            {formatNumber(isolatedDevices.length)} device{isolatedDevices.length === 1 ? '' : 's'} ·{' '}
            {formatNumber(isolatedRecords.length)} event{isolatedRecords.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {rows.map((row) => {
            const active = isolated === row.id;
            return (
              <button
                key={row.id}
                type="button"
                disabled={row.open === 0}
                aria-pressed={active}
                onClick={() => setIsolated(active ? null : row.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  'disabled:cursor-default disabled:opacity-40',
                  active
                    ? 'text-fg'
                    : 'text-fg-muted enabled:hover:bg-overlay/[0.06] enabled:hover:text-fg',
                )}
                style={
                  active
                    ? { backgroundColor: `${row.color}1F`, boxShadow: `inset 0 0 0 1px ${row.color}59` }
                    : { backgroundColor: 'rgb(var(--overlay) / 0.04)' }
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: row.color }}
                  aria-hidden
                />
                Isolate {row.short}
                <span className="tabular-nums text-fg-faint">{formatNumber(row.open)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <DataTable<{ asset: AssetRuntime; events: AnomalyRecord[] }>
        data={isolatedDevices}
        columns={columns}
        rowKey={(row) => row.asset.device.assetId}
        density={density}
        minWidth="82rem"
        onRowClick={(row) => navigate(deviceDetailPath(row.asset.device.assetId))}
        emptyIcon={MonitorSmartphone}
        emptyTitle={isolated ? `No device carries an open ${faultClass(isolated).label} event` : 'No affected devices'}
        emptyDescription="Clear the isolation to see the whole affected set."
        toolbar={
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg">
              {isolated ? `${faultClass(isolated).label} — affected devices` : 'All affected devices'}
            </p>
            <p className="mt-0.5 text-[11.5px] text-fg-dim">
              Ordered by open event count, then by weakest condition
            </p>
          </div>
        }
      />
    </DetailShell>
  );
};
