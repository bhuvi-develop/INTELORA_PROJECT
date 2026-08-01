import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Check, Crosshair, Layers, ListTree, Minus, Radio, ShieldAlert } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { LiveStatus, TaxonomyBreakdown } from './useAnomalyModule';
import type { CategorySelection } from './taxonomy';

/* ───────────────────────────────────────────────────────────────────────────
 * Section 1 — real-time taxonomy and status bar.
 *
 * Four cards, each one a claim the operator can check on the same card: the
 * headline states the conclusion and the lines under it show the readings that
 * produced it. Two of the four are controls — top category selects that class,
 * failure types opens the rule reference.
 * ─────────────────────────────────────────────────────────────────────────── */

interface StatusCardProps {
  accent: string;
  eyebrow: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  indicator?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  actionHint?: string;
  /**
   * In-page control that survives the card becoming a link.
   *
   * Rendered above the navigation overlay so it stays clickable — without this,
   * making the whole card navigate would swallow the filter and modal actions
   * these cards already carried.
   */
  secondaryAction?: ReactNode;
  children?: ReactNode;
}

const StatusCard = ({
  accent,
  eyebrow,
  value,
  caption,
  icon: Icon,
  indicator,
  active = false,
  onClick,
  actionHint,
  secondaryAction,
  children,
}: StatusCardProps) => {
  const body = (
    <>
      {/* The accent is carried by a rail rather than the whole border, so the
          card keeps the panel language the rest of the estate uses. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5 truncate">
            {indicator}
            {eyebrow}
          </p>
          <p className="mt-2 truncate text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-fg">
            {value}
          </p>
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={16} aria-hidden />
        </span>
      </div>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-dim">{caption}</p>

      {children ? <div className="mt-3 border-t border-overlay/[0.06] pt-3">{children}</div> : null}

      <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
        {actionHint ? (
          <p
            className="text-[10.5px] font-medium uppercase tracking-[0.12em] opacity-80 transition-opacity group-hover:opacity-100"
            style={{ color: accent }}
          >
            {actionHint}
          </p>
        ) : (
          <span />
        )}

        {/* Above the overlay so the in-page action still receives the click. */}
        {secondaryAction ? <div className="relative z-20 shrink-0">{secondaryAction}</div> : null}
      </div>
    </>
  );

  const shell = 'relative flex h-full flex-col pl-5 text-left transition-all duration-200 ease-enterprise';
  const selectedRing = active ? { boxShadow: `inset 0 0 0 1px ${accent}66` } : undefined;

  if (!onClick) {
    return (
      <Card className={shell} style={selectedRing}>
        {body}
      </Card>
    );
  }

  // The whole card is the hit target, but only the overlay is focusable — the
  // readings underneath stay selectable text rather than becoming button chrome.
  // The hover glow is drawn in the card's own accent rather than a fixed blue, so
  // the affordance carries the same identity as the metric it belongs to.
  return (
    <Card
      className={cn(
        shell,
        'group cursor-pointer hover:border-overlay/[0.13]',
        'hover:-translate-y-px hover:shadow-raised',
      )}
      style={selectedRing}
      onMouseEnter={(event) => {
        event.currentTarget.style.boxShadow = `inset 0 0 0 1px ${accent}59, 0 8px 26px -12px ${accent}4D`;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.boxShadow = active ? `inset 0 0 0 1px ${accent}66` : '';
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60"
      >
        <span className="sr-only">{eyebrow} — open detail</span>
      </button>
      {body}
    </Card>
  );
};

/** One pass/fail line inside the live card. */
const CheckLine = ({ label, reading, ok }: { label: string; reading: string; ok: boolean }) => (
  <li className="flex items-center justify-between gap-3">
    <span className="flex min-w-0 items-center gap-1.5">
      {ok ? (
        <Check size={11} className="shrink-0 text-emerald-400" aria-hidden />
      ) : (
        <Minus size={11} className="shrink-0 text-rose-400" aria-hidden />
      )}
      <span className="truncate text-[11px] text-fg-muted">{label}</span>
    </span>
    <span
      className={cn('shrink-0 truncate text-[10.5px] tabular-nums', ok ? 'text-fg-dim' : 'text-rose-300')}
      title={reading}
    >
      {reading}
    </span>
  </li>
);

export interface TaxonomyStatusBarProps {
  status: LiveStatus;
  taxonomy: TaxonomyBreakdown;
  selectedCategory: CategorySelection;
  onSelectCategory: (category: CategorySelection) => void;
  onOpenTaxonomy: () => void;
}

export const TaxonomyStatusBar = ({
  status,
  taxonomy,
  selectedCategory,
  onSelectCategory,
  onOpenTaxonomy,
}: TaxonomyStatusBarProps) => {
  const navigate = useNavigate();
  const top = taxonomy.top;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* ── 1 · Live status ─────────────────────────────────────────────── */}
      <StatusCard
        accent={status.online ? '#22C55E' : '#D03B3B'}
        eyebrow="Live status"
        value={status.headline}
        caption={`${formatNumber(status.reporting)} of ${formatNumber(status.total)} endpoints publishing at 1 Hz`}
        icon={Radio}
        onClick={() => navigate(PATHS.anomalyLiveStatus)}
        actionHint="Stream health"
        indicator={
          <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
            {status.online ? (
              <span className="absolute h-full w-full animate-pulse-ring rounded-full bg-emerald-400/70" />
            ) : null}
            <span
              className={cn('relative h-1.5 w-1.5 rounded-full', status.online ? 'bg-emerald-400' : 'bg-rose-400')}
            />
          </span>
        }
      >
        <ul className="space-y-1.5">
          {status.checks.map((check) => (
            <CheckLine key={check.key} label={check.label} reading={check.reading} ok={check.ok} />
          ))}
        </ul>
      </StatusCard>

      {/* ── 2 · Open queue ──────────────────────────────────────────────── */}
      <StatusCard
        accent="#EAB308"
        eyebrow="Latest anomalies"
        value={`${formatNumber(taxonomy.unresolved)} Active Event${taxonomy.unresolved === 1 ? '' : 's'}`}
        caption="Unresolved queue — raised and neither cleared by the device nor closed by an engineer"
        icon={ShieldAlert}
        onClick={() => navigate(PATHS.anomalyActiveEvents)}
        actionHint="Event queue"
      >
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <dt className="truncate text-[11px] text-fg-muted">Critical</dt>
            <dd className="text-[11px] font-semibold tabular-nums text-rose-300">
              {formatNumber(taxonomy.critical)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="truncate text-[11px] text-fg-muted">Classes hit</dt>
            <dd className="text-[11px] font-semibold tabular-nums text-fg-soft">
              {formatNumber(taxonomy.present.length)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[10.5px] leading-relaxed text-fg-faint">
          N_total = Σ A<sub>i</sub> across the M01–M15 rule set, over the retained session window.
        </p>
      </StatusCard>

      {/* ── 3 · Top category ────────────────────────────────────────────── */}
      <StatusCard
        accent={top?.def.color ?? '#38BDF8'}
        eyebrow="Top category"
        value={top ? `${top.def.label} (${formatNumber(top.total)})` : 'Nothing open'}
        caption={
          top
            ? `${formatNumber(top.classified)} classified · ${formatNumber(top.transient)} transient · ${formatNumber(top.assets)} device${top.assets === 1 ? '' : 's'}`
            : 'No class carries an open event in this window'
        }
        icon={Layers}
        active={top !== null && selectedCategory === top.def.id}
        onClick={() => navigate(PATHS.anomalyCategoryBreakdown)}
        actionHint="Category analytics"
        secondaryAction={
          top ? (
            <Button
              variant={selectedCategory === top.def.id ? 'subtle' : 'ghost'}
              size="xs"
              icon={Crosshair}
              aria-pressed={selectedCategory === top.def.id}
              onClick={() => onSelectCategory(top.def.id)}
            >
              {selectedCategory === top.def.id ? 'Isolated' : 'Isolate'}
            </Button>
          ) : undefined
        }
      >
        <ul className="space-y-1.5">
          {taxonomy.present.slice(0, 3).map((entry) => (
            <li key={entry.def.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: entry.def.color }}
                  aria-hidden
                />
                <span className="truncate text-[11px] text-fg-muted">{entry.def.short}</span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-fg-soft">
                {formatNumber(entry.total)}
              </span>
            </li>
          ))}
          {taxonomy.present.length === 0 ? (
            <li className="text-[11px] text-fg-faint">argmax undefined on an empty queue</li>
          ) : null}
        </ul>
      </StatusCard>

      {/* ── 4 · Distinct signatures ─────────────────────────────────────── */}
      <StatusCard
        accent="#A855F7"
        eyebrow="Failure types"
        value={`${formatNumber(taxonomy.distinctSignatures)} Signature${taxonomy.distinctSignatures === 1 ? '' : 's'} Active`}
        caption="COUNT(DISTINCT rule) over the open queue, against a catalogue of 15"
        icon={ListTree}
        onClick={() => navigate(PATHS.anomalyTaxonomySignatures)}
        actionHint="Signature analytics"
        secondaryAction={
          <Button variant="ghost" size="xs" icon={ListTree} onClick={onOpenTaxonomy}>
            Quick reference
          </Button>
        }
      >
        <p className="line-clamp-3 text-[11px] leading-relaxed text-fg-muted">
          {taxonomy.signatures.length > 0 ? taxonomy.signatures.join(' · ') : 'No signature matched in this window'}
        </p>
      </StatusCard>
    </div>
  );
};
