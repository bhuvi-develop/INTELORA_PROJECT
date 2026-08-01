import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Layers, Search, Zap } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { bandDef } from '@/engine/derive';
import { deviceDetailPath } from '@/routes/paths';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelative } from '@/utils/format';
import { useDebounce } from '@/hooks/useDebounce';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { SectionHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Progress } from '@/components/ui/Progress';

/* ───────────────────────────────────────────────────────────────────────────
 * Live asset overview.
 *
 * A card per connected device carrying the eight fields the brief specifies.
 * Cards are ordered weakest-first so what needs attention is always at the top
 * left, and the set is capped with an explicit "show all" rather than silently
 * truncating — a hidden row reads as "nothing there".
 * ─────────────────────────────────────────────────────────────────────────── */

const INITIAL_VISIBLE = 12;

type SortMode = 'attention' | 'power' | 'name';

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'power', label: 'Highest draw' },
  { value: 'name', label: 'Name' },
];

const Reading = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
  <div className="min-w-0">
    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-fg-faint">{label}</p>
    <p className="mt-0.5 truncate text-[11.5px] font-semibold tabular-nums text-fg-soft">
      {value}
      <span className="ml-0.5 text-[9px] font-normal text-fg-dim">{unit}</span>
    </p>
  </div>
);

const AssetCard = ({ asset, index }: { asset: AssetRuntime; index: number }) => {
  const def = bandDef(asset.band);
  const offline = asset.device.status === 'Offline';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 11) * 0.02, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={deviceDetailPath(asset.device.assetId)}
        className="group panel relative flex h-full flex-col overflow-hidden p-3.5 transition-all duration-200 ease-enterprise hover:-translate-y-0.5 hover:border-overlay/[0.14] hover:shadow-raised"
      >
        {/* Condition rail. */}
        <span
          className="absolute inset-y-0 left-0 w-0.5"
          style={{ backgroundColor: def.color }}
          aria-hidden
        />

        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-fg">{asset.device.assetName}</p>
            <p className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[9.5px] leading-none text-fg-muted">
                {asset.device.assetId}
              </span>
              <span className="truncate text-[10px] text-fg-dim">{asset.device.category}</span>
            </p>
          </div>
          <StatusBadge status={asset.device.status} size="xs" />
        </div>

        {/* Health score. */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-fg-faint">Health</span>
            <span className="flex items-baseline gap-1">
              <span className="text-[15px] font-semibold leading-none tabular-nums" style={{ color: def.color }}>
                {formatNumber(asset.health, 1)}
              </span>
              <span className="text-[9.5px] text-fg-dim">{def.label}</span>
            </span>
          </div>
          <Progress
            value={asset.health}
            size="xs"
            color={def.color}
            marker={95}
            className="mt-1.5"
            label={`Health ${formatNumber(asset.health, 1)}`}
          />
        </div>

        {/* Four live readings. */}
        <div className={cn('mt-3 grid grid-cols-4 gap-2', offline && 'opacity-45')}>
          <Reading label="Voltage" value={formatNumber(asset.live.voltage, 1)} unit="V" />
          <Reading label="Current" value={formatNumber(asset.live.current, 2)} unit="A" />
          <Reading label="Power" value={formatNumber(asset.live.power, 1)} unit="W" />
          <Reading label="Energy" value={formatNumber(asset.live.energy, 3)} unit="kWh" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-overlay/[0.06] pt-2.5">
          <span className="truncate text-[9.5px] text-fg-faint">
            Updated {formatRelative(asset.live.t)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-brand-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            Manage
            <ArrowRight size={10} aria-hidden />
          </span>
        </div>
      </Link>
    </motion.div>
  );
};

export const LiveAssetGrid = ({
  assets,
  className,
}: {
  assets: AssetRuntime[];
  className?: string;
}) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('attention');
  const [expanded, setExpanded] = useState(false);

  const debounced = useDebounce(search, 220);

  const ordered = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
      if (needle.length === 0) return true;
      const haystack =
        `${asset.device.assetId} ${asset.device.assetName} ${asset.device.category} ${asset.device.brand}`.toLowerCase();
      return haystack.includes(needle);
    });

    switch (sort) {
      case 'power':
        return [...filtered].sort((a, b) => b.live.power - a.live.power);
      case 'name':
        return [...filtered].sort((a, b) => a.device.assetName.localeCompare(b.device.assetName));
      default:
        // Offline first, then weakest condition — the attention ordering.
        return [...filtered].sort((a, b) => {
          const aOffline = a.device.status === 'Offline' ? 0 : 1;
          const bOffline = b.device.status === 'Offline' ? 0 : 1;
          if (aOffline !== bOffline) return aOffline - bOffline;
          return a.health - b.health;
        });
    }
  }, [assets, debounced, sort]);

  const visible = expanded ? ordered : ordered.slice(0, INITIAL_VISIBLE);
  const hidden = ordered.length - visible.length;

  return (
    <div className={cn('space-y-4', className)}>
      <SectionHeader
        title="Live asset overview"
        subtitle="Every connected device with its current condition and electrical readings"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              icon={Search}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter devices…"
              aria-label="Filter devices"
              containerClassName="w-44"
            />
            <Segmented
              ariaLabel="Card ordering"
              layoutId="cockpit-asset-sort"
              size="xs"
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
            />
          </div>
        }
      />

      {visible.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Layers size={18} className="text-fg-faint" aria-hidden />
          <p className="text-[12.5px] font-medium text-fg-soft">No devices match that filter</p>
          <p className="text-[11px] text-fg-dim">Clear the filter to see the full estate.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((asset, index) => (
            <AssetCard key={asset.device.assetId} asset={asset} index={index} />
          ))}
        </div>
      )}

      {hidden > 0 ? (
        <div className="flex items-center justify-center gap-3">
          <Badge tone="neutral" size="sm" icon={Zap}>
            {hidden} more device{hidden === 1 ? '' : 's'} not shown
          </Badge>
          <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
            Show all {ordered.length}
          </Button>
        </div>
      ) : expanded && ordered.length > INITIAL_VISIBLE ? (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
            Collapse to {INITIAL_VISIBLE}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
