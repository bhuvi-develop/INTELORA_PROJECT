import { useMemo, useState } from 'react';
import { Cpu, Grid3x3, Layers } from 'lucide-react';
import { ON_FILL_INK, densityRampColor, needsDarkInk } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import { HORIZON_DAYS, TONE_CLASS, bandOfDays, componentClassRows, formatDays } from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Component Health — "Which components are degrading?"
 *
 * Screen budget: one selector, one metric bar, two charts, one table.
 *
 *   wear matrix        every device against every part of its class, so a bad
 *                      part type shows as a column and a bad device as a row
 *   degradation rank   part types ordered by worst instance — the stocking list
 *   health index       the row-level detail, scrolling inside itself
 *
 * The class selector is not a filter for convenience: a laptop and a charger
 * share no components, so putting both in one matrix would produce a grid that
 * is mostly empty cells.
 * ─────────────────────────────────────────────────────────────────────────── */

type DeviceClass = 'Laptop' | 'Mobile Charger';

export const ComponentHealthWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { components } = usePredictive();
  const [deviceClass, setDeviceClass] = useState<DeviceClass>('Laptop');

  const scoped = useMemo(
    () => components.filter((row) => row.category === deviceClass),
    [components, deviceClass],
  );

  /** Part types in this class, in the order the platform lists them. */
  const partTypes = useMemo(() => {
    const seen: string[] = [];
    for (const row of scoped) if (!seen.includes(row.component)) seen.push(row.component);
    return seen;
  }, [scoped]);

  /** Devices in this class, worst first, so the top rows carry the problem. */
  const devices = useMemo(() => {
    const byDevice = new Map<string, { assetId: string; assetName: string; worst: number }>();
    for (const row of scoped) {
      const held = byDevice.get(row.assetId);
      if (held) held.worst = Math.max(held.worst, row.wear);
      else byDevice.set(row.assetId, { assetId: row.assetId, assetName: row.assetName, worst: row.wear });
    }
    return Array.from(byDevice.values()).sort((a, b) => b.worst - a.worst);
  }, [scoped]);

  const wearAt = useMemo(() => {
    const lookup = new Map<string, (typeof scoped)[number]>();
    for (const row of scoped) lookup.set(`${row.assetId}|${row.component}`, row);
    return lookup;
  }, [scoped]);

  const classRows = useMemo(() => componentClassRows(scoped), [scoped]);
  const maxWear = Math.max(0.0001, ...scoped.map((row) => row.wear));

  const metrics = useMemo(() => {
    if (scoped.length === 0) return [];
    const worst = scoped.reduce((peak, row) => (row.wear > peak.wear ? row : peak), scoped[0]);
    const mean = scoped.reduce((sum, row) => sum + row.wear, 0) / scoped.length;
    const inHorizon = scoped.filter((row) => row.rulDays <= HORIZON_DAYS).length;
    const past60 = scoped.filter((row) => row.wear >= 0.6).length;

    return [
      {
        label: 'Most worn part',
        value: formatPercent(worst.wear * 100, 1),
        caption: `${worst.component} · ${worst.assetId}`,
        color: TONE_CLASS.critical.color,
      },
      { label: 'Mean wear', value: formatPercent(mean * 100, 1), caption: `${scoped.length} parts in class` },
      {
        label: 'Past 60% worn',
        value: formatNumber(past60),
        caption: 'approaching replacement',
        color: past60 > 0 ? TONE_CLASS.serious.color : undefined,
      },
      {
        label: 'Inside the horizon',
        value: formatNumber(inHorizon),
        caption: `end of life within ${HORIZON_DAYS} days`,
        color: inHorizon > 0 ? TONE_CLASS.warning.color : undefined,
      },
      { label: 'Devices in class', value: formatNumber(devices.length), caption: `${partTypes.length} part types each` },
    ];
  }, [scoped, devices.length, partTypes.length]);

  return (
    <WorkspaceFrame
      workspace={workspaceById('components')}
      onBack={onBack}
      actions={
        <Segmented
          options={[
            { value: 'Laptop', label: 'Laptops' },
            { value: 'Mobile Charger', label: 'Mobile Chargers' },
          ]}
          value={deviceClass}
          onChange={(value) => setDeviceClass(value as DeviceClass)}
          size="sm"
          layoutId="component-class"
          ariaLabel="Device class"
        />
      }
    >
      {scoped.length === 0 ? (
        <div className="panel flex min-h-[24rem] items-center justify-center">
          <EmptyState icon={Cpu} title={`No ${deviceClass.toLowerCase()} components published yet`} />
        </div>
      ) : (
        <>
          <MetricBar metrics={metrics} />

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {/* ── Wear matrix ──────────────────────────────────────── */}
            <Card className="flex min-w-0 flex-col">
              <CardHeader
                title="Fleet component wear matrix"
                subtitle="Every device against every part of its class — a bad part type shows as a column, a bad device as a row"
                eyebrow="Heatmap"
                icon={Grid3x3}
              />
              <div className="scroll-thin mt-4 overflow-auto" style={{ maxHeight: '19rem' }}>
                <table className="w-full border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-ink-900 pb-1 pr-2 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-faint">
                        Device
                      </th>
                      {partTypes.map((part) => (
                        <th
                          key={part}
                          className="px-1 pb-1 text-center text-[9.5px] font-semibold uppercase tracking-[0.06em] text-fg-faint"
                          title={part}
                        >
                          {part.split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((device) => (
                      <tr key={device.assetId}>
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-ink-900 py-1 pr-2 text-[11.5px] text-fg-soft">
                          {device.assetId}
                        </td>
                        {partTypes.map((part) => {
                          const row = wearAt.get(`${device.assetId}|${part}`);
                          const wear = row?.wear ?? 0;
                          const fill = densityRampColor(wear, maxWear);
                          return (
                            <td key={part} className="p-0">
                              <div
                                className="flex h-7 min-w-[3rem] items-center justify-center rounded-md text-[10.5px] font-semibold tabular-nums"
                                style={{
                                  backgroundColor: fill,
                                  color: needsDarkInk(fill) ? ON_FILL_INK : '#FFFFFF',
                                }}
                                title={
                                  row
                                    ? `${device.assetName} · ${part}: ${formatPercent(wear * 100, 1)} worn, ${formatDays(row.rulDays)} remaining`
                                    : `${part}: not fitted`
                                }
                              >
                                {row ? Math.round(wear * 100) : '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3.5 border-t border-line/70 pt-3 text-[11.5px] leading-relaxed text-fg-dim">
                Shading carries wear percentage and the figure is printed inside every cell, so colour is never the only
                channel. Expected service lives differ per part — a high figure on a long-lived component is not
                necessarily nearer failure than a lower one on a short-lived part.
              </p>
            </Card>

            {/* ── Degradation ranking ──────────────────────────────── */}
            <Card className="flex min-w-0 flex-col">
              <CardHeader
                title="Component degradation ranking"
                subtitle="Part types ordered by worst instance — the stocking list"
                eyebrow="Procurement"
                icon={Layers}
              />
              <ul className="scroll-thin mt-4 space-y-3 overflow-auto" style={{ maxHeight: '19rem' }}>
                {classRows.map((row) => {
                  const tone = TONE_CLASS[bandOfDays(row.soonestRulDays).tone];
                  return (
                    <li key={row.component}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[12.5px] font-medium text-fg-soft">{row.component}</span>
                        <span className="shrink-0 text-[11.5px] tabular-nums text-fg-dim">
                          {row.instances} fitted
                        </span>
                      </div>

                      {/* Mean fill with the worst instance marked on the same track. */}
                      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-overlay/[0.07]">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-brand-500/50"
                          style={{ width: `${row.meanWear * 100}%` }}
                        />
                        <div
                          className="absolute inset-y-0 w-[3px] rounded-full"
                          style={{ left: `calc(${row.worstWear * 100}% - 1.5px)`, backgroundColor: tone.color }}
                          title={`Worst instance ${formatPercent(row.worstWear * 100, 1)} — ${row.worstAssetId}`}
                        />
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
                        <span className="text-fg-faint">
                          mean {formatPercent(row.meanWear * 100, 1)} · worst{' '}
                          <span style={{ color: tone.color }}>{formatPercent(row.worstWear * 100, 1)}</span>
                        </span>
                        <span className="tabular-nums" style={{ color: tone.color }}>
                          {formatDays(row.soonestRulDays)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3.5 border-t border-line/70 pt-3 text-[11.5px] leading-relaxed text-fg-dim">
                The bar is the mean across the class; the marker is the single worst instance. A wide gap between them
                means one unit is dragging the class and should be replaced individually rather than in a batch.
              </p>
            </Card>
          </div>

          <BoundedTable
            title="Asset component health index"
            subtitle={`${scoped.length} parts across ${devices.length} ${deviceClass.toLowerCase()}s, weakest first`}
            maxHeight="22rem"
          >
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-ink-900">
                <tr className="border-b border-line/60">
                  {['Device', 'Component', 'Wear', 'Remaining life', 'Failure probability', 'Priority', 'Recommendation'].map(
                    (head) => (
                      <th
                        key={head}
                        className="whitespace-nowrap px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint"
                      >
                        {head}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {scoped.map((row) => {
                  const tone = TONE_CLASS[bandOfDays(row.rulDays).tone];
                  return (
                    <tr
                      key={`${row.assetId}-${row.component}`}
                      className="transition-colors duration-150 hover:bg-overlay/[0.03]"
                    >
                      <td className="px-4 py-2.5">
                        <p className="truncate text-[12px] text-fg-soft">{row.assetName}</p>
                        <p className="mt-0.5 text-[11px] text-fg-faint">{row.assetId}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-fg">{row.component}</span>
                          {row.isPrimary ? (
                            <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-brand-200">
                              Constraint
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-overlay/[0.07]">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${row.wear * 100}%`, backgroundColor: tone.color }}
                            />
                          </span>
                          <span className={cn('text-[11.5px] tabular-nums text-fg-muted')}>
                            {formatPercent(row.wear * 100, 1)}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: tone.color }}>
                          {formatDays(row.rulDays)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.failureProbability * 100, 1)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-fg-muted">
                        {row.maintenancePriority}
                      </td>
                      <td className="max-w-[18rem] px-4 py-2.5 text-[11.5px] leading-relaxed text-fg-muted">
                        {row.recommendation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </BoundedTable>
        </>
      )}
    </WorkspaceFrame>
  );
};
