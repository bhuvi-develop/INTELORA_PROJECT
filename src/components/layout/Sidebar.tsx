import { useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { PRIMARY_NAV, type NavItem } from '@/config/navigation';
import { PATHS } from '@/routes/paths';
import { useFleetKpis } from '@/engine/store';
import { cn } from '@/lib/cn';
import { useUI } from '@/hooks/useUI';
import { IconButton } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

import { SidebarLogo } from '@/components/common/Logo';

/* ───────────────────────────────────────────────────────────────────────────
 * Primary navigation.
 *
 * A flat list of modules. No category headings, no stream statistics, no
 * sample-rate readout — an operator navigating to a module does not need to be
 * told which taxonomy it belongs to, and platform telemetry about the platform
 * belongs in Settings rather than in the furniture.
 *
 * Rows are 46px with the icon and label on one baseline, so the whole row is
 * the target rather than the text. The active row carries three cues that
 * arrive together: a filled ground, a ring, and a rail that slides between rows
 * as the selection moves.
 * ─────────────────────────────────────────────────────────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const;

const NavRow = ({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: number }) => {
  const Icon = item.icon;
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const nextId = useRef(0);

  const handleTap = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nextId.current++;
    setRipples((prev) => [...prev, { x, y, id }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
  };

  const link = (
    <NavLink
      to={item.to}
      onClick={handleTap}
      className={({ isActive }) =>
        cn(
          'group relative flex h-14 items-center gap-4 rounded-xl transition-all duration-200 ease-enterprise overflow-hidden',
          collapsed ? 'justify-center px-0' : 'px-4',
          isActive
            ? 'bg-brand-500/[0.15] text-white font-bold ring-1 ring-inset ring-brand-400/30 shadow-[0_0_15px_rgba(0,110,230,0.25)]'
            : 'text-fg-muted font-medium hover:bg-brand-500/[0.08] hover:text-fg-soft hover:shadow-[0_0_15px_rgba(0,110,230,0.15)] hover:-translate-y-[1px]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Ripples */}
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="absolute rounded-full bg-brand-400/20 pointer-events-none animate-ripple"
              style={{
                left: ripple.x - 10,
                top: ripple.y - 10,
                width: 20,
                height: 20,
              }}
            />
          ))}

          {/* Active Left Indicator */}
          {isActive ? (
            <motion.span
              layoutId="sidebar-rail"
              className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 shadow-[0_0_8px_rgba(0,110,230,0.6)]"
              transition={{ duration: 0.2, ease: EASE }}
              aria-hidden
            />
          ) : null}

          {/* Icon */}
          <Icon
            size={18}
            strokeWidth={isActive ? 2.25 : 1.75}
            className={cn(
              'shrink-0 transition-all duration-200 group-hover:scale-110',
              isActive
                ? 'text-brand-400 drop-shadow-[0_0_8px_rgba(0,110,230,0.6)]'
                : 'text-fg-faint group-hover:text-brand-300',
            )}
            aria-hidden
          />

          {collapsed ? null : (
            <span className="min-w-0 flex-1 truncate text-[13.5px] tracking-wide transition-all duration-200 group-hover:text-white">
              {item.label}
            </span>
          )}

          {/* Badges */}
          {!collapsed && badge !== undefined && badge > 0 ? (
            <span
              className={cn(
                'shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums transition-colors duration-200',
                isActive ? 'bg-brand-500/20 text-brand-200' : 'bg-overlay/[0.07] text-fg-dim',
              )}
            >
              {badge}
            </span>
          ) : null}

          {collapsed && badge !== undefined && badge > 0 ? (
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden />
          ) : null}
        </>
      )}
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
};

const SidebarContent = ({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) => {
  const kpis = useFleetKpis();

  const badgeFor = (item: NavItem): number | undefined => {
    if (item.badgeKey === 'anomalies') return kpis.activeAnomalies;
    if (item.badgeKey === 'critical') return kpis.criticalAssets;
    if (item.badgeKey === 'tasks') return kpis.tasksOverdue;
    return undefined;
  };

  return (
    <nav className="scroll-thin flex-1 overflow-y-auto px-3.5 py-4" onClick={onNavigate} aria-label="Modules">
      <ul className="space-y-3">
        {PRIMARY_NAV.map((item) => (
          <li key={item.key}>
            <NavRow item={item} collapsed={collapsed} badge={badgeFor(item)} />
          </li>
        ))}
      </ul>
    </nav>
  );
};

/** Permanent rail on large viewports; off-canvas drawer below. */
export const Sidebar = () => {
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useUI();


  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col lg:flex',
          'border-r border-line/[0.15] bg-ink-950/40 backdrop-blur-3xl shadow-panel',
          'transition-[width] duration-200 ease-enterprise',
          sidebarCollapsed ? 'w-20' : 'w-[17.5rem]',
        )}
        aria-label="Primary"
      >
        <div
          className={cn(
            'flex h-[4.5rem] shrink-0 items-center px-4',
            sidebarCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <NavLink
            to={PATHS.workspace}
            end
            className="rounded-lg focus-visible:outline-none"
            aria-label="INTELORA workspace"
          >
            <SidebarLogo collapsed={sidebarCollapsed} />
          </NavLink>
        </div>

        {/* Hairline rather than a border: the plane continues, the section changes. */}
        <div
          className="mx-3.5 h-px shrink-0 bg-gradient-to-r from-transparent via-overlay/[0.09] to-transparent"
          aria-hidden
        />

        <SidebarContent collapsed={sidebarCollapsed} />

        {/* Pinned Bottom Section */}
        <div className="mt-auto border-t border-line/10 p-4 bg-ink-950/20 backdrop-blur-md shrink-0 transition-all duration-200">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" title="Backend Status: Connected" />
              <span className="text-[10px] font-semibold text-fg-dim">v1.0</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                <span className="text-fg-muted font-medium text-[11px]">Backend Connected</span>
              </div>
              <span className="text-fg-dim font-semibold text-[11px]">v1.0</span>
            </div>
          )}
        </div>

      </aside>

      <AnimatePresence>
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-[95] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-scrim/70 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: EASE }}
              className="absolute inset-y-0 left-0 flex w-[17.5rem] flex-col border-r border-line/[0.15] bg-ink-950/60 backdrop-blur-3xl shadow-panel"
              aria-label="Main navigation"
            >
              <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-3.5">
                <SidebarLogo collapsed={false} />
                <IconButton icon={X} label="Close navigation" size="sm" onClick={() => setMobileNavOpen(false)} />
              </div>
              <div
                className="mx-3.5 h-px shrink-0 bg-gradient-to-r from-transparent via-overlay/[0.09] to-transparent"
                aria-hidden
              />
              <SidebarContent collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
