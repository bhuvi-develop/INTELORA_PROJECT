import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ListTree, PieChart as PieIcon, Table2 } from 'lucide-react';
import { SURFACE } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ClassTally, TaxonomyBreakdown } from './useAnomalyModule';
import type { CategorySelection } from './taxonomy';

/* ───────────────────────────────────────────────────────────────────────────
 * Section 2 — failure classification and interactive taxonomy.
 *
 * The donut is the control, not a picture of one: a slice selects its class and
 * every downstream panel narrows to it. The rail beside it decomposes whichever
 * class is in focus down to the individual M-rule, which is the level an
 * engineer actually works at.
 * ─────────────────────────────────────────────────────────────────────────── */

interface SliceTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; color: string; share: number } }>;
}

const SliceTooltip = ({ active, payload }: SliceTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;

  return (
    <div className="rounded-lg border border-overlay/10 bg-ink-750/95 px-2.5 py-1.5 shadow-raised backdrop-blur-xl">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg">
        <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: datum.color }} aria-hidden />
        {datum.name}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-fg-dim">
        {formatNumber(datum.value)} open · {formatPercent(datum.share, 1)} of queue
      </p>
    </div>
  );
};

export interface FailureClassificationProps {
  taxonomy: TaxonomyBreakdown;
  selectedCategory: CategorySelection;
  activeFailureTypeId: string | null;
  classifiedOnly: boolean;
  onSelectCategory: (category: CategorySelection) => void;
  onSelectFailureType: (id: string | null) => void;
  onOpenTaxonomy: () => void;
  onViewClassified: () => void;
}

export const FailureClassification = ({
  taxonomy,
  selectedCategory,
  activeFailureTypeId,
  classifiedOnly,
  onSelectCategory,
  onSelectFailureType,
  onOpenTaxonomy,
  onViewClassified,
}: FailureClassificationProps) => {
  const focus: ClassTally | null =
    (selectedCategory === 'ALL'
      ? taxonomy.top
      : taxonomy.classes.find((entry) => entry.def.id === selectedCategory)) ?? null;

  const slices = taxonomy.present.map((entry) => ({
    id: entry.def.id,
    name: entry.def.label,
    value: entry.total,
    color: entry.def.color,
    share: taxonomy.unresolved === 0 ? 0 : (entry.total / taxonomy.unresolved) * 100,
  }));

  const centerValue = selectedCategory === 'ALL' ? taxonomy.unresolved : (focus?.total ?? 0);
  const centerLabel = selectedCategory === 'ALL' ? 'open events' : (focus?.def.short ?? 'none');

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Failure classification"
        subtitle="Open events resolved to a fault class, then to the rule that named them"
        eyebrow="Taxonomy"
        icon={PieIcon}
        actions={
          selectedCategory === 'ALL' ? null : (
            <Button variant="ghost" size="xs" onClick={() => onSelectCategory('ALL')}>
              Clear class filter
            </Button>
          )
        }
      />

      {taxonomy.unresolved === 0 ? (
        <EmptyState
          icon={PieIcon}
          title="Nothing open to classify"
          description="Every event raised this session has cleared or been closed. The taxonomy reference is still available."
        />
      ) : (
        <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* ── Distribution ────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
            <div className="relative h-[212px] w-[212px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<SliceTooltip />} isAnimationActive={false} />
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="64%"
                    outerRadius="94%"
                    paddingAngle={2}
                    stroke={SURFACE.chart}
                    strokeWidth={2}
                    isAnimationActive={false}
                    onClick={(datum: unknown) => {
                      // Recharts spreads the datum onto the sector props and also
                      // keeps it under `payload`; read whichever arrived.
                      const sector = datum as { id?: CategorySelection; payload?: { id?: CategorySelection } };
                      const id = sector.id ?? sector.payload?.id;
                      if (id) onSelectCategory(id);
                    }}
                  >
                    {slices.map((slice) => (
                      <Cell
                        key={slice.id}
                        fill={slice.color}
                        className="cursor-pointer outline-none"
                        // A class that is not selected recedes rather than
                        // disappearing, so the whole is still readable.
                        opacity={selectedCategory === 'ALL' || selectedCategory === slice.id ? 1 : 0.3}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-fg">
                  {formatNumber(centerValue)}
                </span>
                <span className="mt-1 max-w-[7rem] text-center text-[10.5px] leading-tight text-fg-dim">
                  {centerLabel}
                </span>
              </div>
            </div>

            <ul className="min-w-0 flex-1 space-y-1">
              {taxonomy.present.map((entry) => {
                const selected = selectedCategory === entry.def.id;
                return (
                  <li key={entry.def.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCategory(entry.def.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
                        selected ? 'bg-overlay/[0.07]' : 'hover:bg-overlay/[0.045]',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: entry.def.color }}
                          aria-hidden
                        />
                        <span className="truncate text-[12px] text-fg-soft">{entry.def.label}</span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-1.5">
                        <span className="text-[12.5px] font-semibold tabular-nums text-fg">
                          {formatNumber(entry.total)}
                        </span>
                        <span className="text-[10.5px] tabular-nums text-fg-faint">
                          {formatPercent((entry.total / taxonomy.unresolved) * 100, 1)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Drill-down and controls ─────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-4">
            {focus ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="eyebrow">
                      {selectedCategory === 'ALL' ? 'Largest class' : 'Selected class'}
                    </p>
                    <h4 className="mt-1 truncate text-[13.5px] font-semibold text-fg">{focus.def.label}</h4>
                  </div>
                  <span
                    className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium"
                    style={{
                      color: focus.def.color,
                      backgroundColor: `${focus.def.color}14`,
                      boxShadow: `inset 0 0 0 1px ${focus.def.color}40`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {formatNumber(focus.total)} open
                  </span>
                </div>

                <p className="text-[11.5px] leading-relaxed text-fg-dim">{focus.def.description}</p>

                {/* The split the operator argues about: what held, and what
                    cleared on its own before anyone looked at it. */}
                <dl className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Classified', value: focus.classified, tone: 'text-fg' },
                    { label: 'Transient', value: focus.transient, tone: 'text-fg-muted' },
                    { label: 'Critical', value: focus.critical, tone: 'text-rose-300' },
                  ].map((cell) => (
                    <div key={cell.label} className="rounded-lg border border-overlay/[0.06] bg-ink-800/50 p-2.5">
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                        {cell.label}
                      </dt>
                      <dd className={cn('mt-1 text-[15px] font-semibold tabular-nums', cell.tone)}>
                        {formatNumber(cell.value)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="min-w-0">
                  <p className="eyebrow mb-1.5">Signatures in this class</p>
                  <ul className="space-y-1">
                    {focus.rules.map(({ rule, count }) => {
                      const selected = activeFailureTypeId === rule.id;
                      return (
                        <li key={rule.id}>
                          <button
                            type="button"
                            disabled={count === 0}
                            onClick={() => onSelectFailureType(rule.id)}
                            aria-pressed={selected}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
                              'disabled:cursor-default disabled:opacity-45',
                              selected ? 'bg-overlay/[0.09]' : 'enabled:hover:bg-overlay/[0.05]',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 rounded bg-overlay/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
                                {rule.id}
                              </span>
                              <span className="truncate text-[11.5px] text-fg-soft">{rule.signature}</span>
                            </span>
                            <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-fg">
                              {formatNumber(count)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-fg-dim">Select a class to decompose it.</p>
            )}

            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" icon={ListTree} onClick={onOpenTaxonomy}>
                View detailed failure taxonomy
              </Button>
              <Button
                variant={classifiedOnly ? 'subtle' : 'outline'}
                size="sm"
                icon={Table2}
                onClick={onViewClassified}
                aria-pressed={classifiedOnly}
              >
                {classifiedOnly ? 'Showing classified only' : 'View classified detections'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
