import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Zap, FileSignature } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import type { LiveStatus, TaxonomyBreakdown } from './useAnomalyModule';
import type { CategorySelection } from './taxonomy';

/* ───────────────────────────────────────────────────────────────────────────
 * Section 1 — Navigation Cards (Redesigned as per PRD)
 *
 * Four navigation cards containing only Icon, Title, and a "View Details" call to action.
 * No analytics, counts, or detailed data are shown here.
 * ─────────────────────────────────────────────────────────────────────────── */

interface StatusCardProps {
  accent: string;
  title: string;
  icon: LucideIcon;
  onClick: () => void;
}

const StatusCard = ({ accent, title, icon: Icon, onClick }: StatusCardProps) => {
  return (
    <Card
      className={cn(
        'relative flex h-[120px] flex-col justify-center px-5 text-left transition-all duration-200 ease-enterprise',
        'group cursor-pointer hover:border-overlay/[0.13] hover:-translate-y-px hover:shadow-raised'
      )}
      onClick={onClick}
      onMouseEnter={(event) => {
        event.currentTarget.style.boxShadow = `inset 0 0 0 1px ${accent}59, 0 8px 26px -12px ${accent}4D`;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.boxShadow = '';
      }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl" style={{ backgroundColor: accent }} />
      
      <div className="flex items-center gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={24} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold tracking-[-0.02em] text-fg">{title}</p>
          <p className="mt-1 text-xs font-medium opacity-80 group-hover:opacity-100 transition-opacity" style={{ color: accent }}>
            View Details →
          </p>
        </div>
      </div>
    </Card>
  );
};

export interface TaxonomyStatusBarProps {
  status: LiveStatus;
  taxonomy: TaxonomyBreakdown;
  selectedCategory: CategorySelection;
  onSelectCategory: (category: CategorySelection) => void;
  onOpenTaxonomy: () => void;
}

export const TaxonomyStatusBar = (_props: TaxonomyStatusBarProps) => {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCard
        accent="#22C55E"
        title="System Online"
        icon={ShieldCheck}
        onClick={() => navigate(PATHS.anomalyLiveStatus)}
      />
      <StatusCard
        accent="#EAB308"
        title="Active Events"
        icon={ShieldAlert}
        onClick={() => navigate(PATHS.anomalyActiveEvents)}
      />
      <StatusCard
        accent="#38BDF8"
        title="Electrical Faults"
        icon={Zap}
        onClick={() => navigate(PATHS.anomalyCategoryBreakdown)}
      />
      <StatusCard
        accent="#A855F7"
        title="Signature Analytics"
        icon={FileSignature}
        onClick={() => navigate(PATHS.anomalyTaxonomySignatures)}
      />
    </div>
  );
};
