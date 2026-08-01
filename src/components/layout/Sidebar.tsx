import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Cpu, PanelLeftClose, Radio, X } from 'lucide-react';
import { NAV_SECTIONS, type NavItem } from '@/config/navigation';
import { APP } from '@/config/env';
import { TICK_MS } from '@/engine/catalog';
import { useEngineControl, useFleetKpis } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { useUI } from '@/hooks/useUI';
import { IconButton } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { Logo, LogoMark } from '@/components/common/Logo';

const NavRow = ({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: number }) => {
  const Icon = item.icon;

  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-150 ease-enterprise',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-brand-500/[0.13] text-fg ring-1 ring-inset ring-brand-400/25'
            : 'text-fg-muted hover:bg-overlay/[0.045] hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <motion.span
              layoutId="sidebar-active"
              className="absolute -left-2.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400"
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}

          <Icon size={17} className={cn('shrink-0', isActive ? 'text-brand-300' : '')} aria-hidden />

          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{item.label}</span>
              {badge !== undefined && badge > 0 ? (
                <span
                  className={cn(
                    'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1 ring-inset',
                    item.badgeKey === 'critical'
                      ? 'bg-rose-500/12 text-rose-300 ring-rose-400/25'
                      : item.badgeKey === 'anomalies'
                        ? 'bg-amber-500/12 text-amber-300 ring-amber-400/25'
                        : 'bg-brand-500/12 text-brand-200 ring-brand-400/25',
                  )}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </>
          )}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip side="right" content={<span className="whitespace-nowrap">{item.label}</span>}>
      {link}
    </Tooltip>
  );
};

const StreamFooter = ({ collapsed }: { collapsed: boolean }) => {
  const kpis = useFleetKpis();
  const { running, tick } = useEngineControl();

  const messagesPerMinute = Math.round((kpis.onlineAssets * 8 * 60_000) / TICK_MS);

  if (collapsed) {
    return (
      <Tooltip
        side="right"
        content={
          <span className="whitespace-nowrap">
            {running ? `${formatNumber(messagesPerMinute)} samples/min · tick ${tick}` : 'Stream paused'}
          </span>
        }
      >
        <div className="flex h-9 w-full items-center justify-center rounded-xl bg-overlay/[0.03] ring-1 ring-inset ring-overlay/[0.06]">
          <Radio size={15} className={running ? 'text-emerald-300' : 'text-fg-dim'} aria-hidden />
        </div>
      </Tooltip>
    );
  }

  return (
    <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Cpu size={12} className="text-brand-300" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">Stream</span>
        </span>
        <span className="flex items-center gap-1.5">
          {running ? (
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute h-full w-full animate-pulse-ring rounded-full bg-emerald-400/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" aria-hidden />
          )}
          <span className={cn('text-[10.5px] font-medium', running ? 'text-emerald-300' : 'text-fg-dim')}>
            {running ? 'Live' : 'Paused'}
          </span>
        </span>
      </div>

      <dl className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[10.5px] text-fg-dim">Reporting</dt>
          <dd className="text-[11px] font-semibold tabular-nums text-fg-soft">
            {kpis.onlineAssets}/{kpis.totalAssets}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[10.5px] text-fg-dim">Sample rate</dt>
          <dd className="text-[11px] font-semibold tabular-nums text-fg-soft">{TICK_MS / 1000}s</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[10.5px] text-fg-dim">Throughput</dt>
          <dd className="text-[11px] font-semibold tabular-nums text-fg-soft">
            {formatNumber(messagesPerMinute)}/min
          </dd>
        </div>
      </dl>

      <p className="mt-2.5 border-t border-overlay/[0.06] pt-2 text-[9.5px] leading-relaxed text-fg-faint">
        {APP.name} v{APP.version} · build {APP.build}
      </p>
    </div>
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
    <div className="flex h-full flex-col">
      <nav className="scroll-thin flex-1 overflow-y-auto px-3.5 py-4" onClick={onNavigate}>
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.key} className={cn(index > 0 && 'mt-5')}>
            {collapsed ? (
              index > 0 ? <div className="mx-auto mb-3 h-px w-6 bg-overlay/[0.07]" aria-hidden /> : null
            ) : (
              <p className="mb-2 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
                {section.label}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.key}>
                  <NavRow item={item} collapsed={collapsed} badge={badgeFor(item)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 px-3.5 pb-4">
        <StreamFooter collapsed={collapsed} />
      </div>
    </div>
  );
};

/** Permanent rail on large viewports; off-canvas drawer below. */
export const Sidebar = () => {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUI();

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-overlay/[0.07] bg-ink-900/85 backdrop-blur-2xl lg:flex',
          'transition-[width] duration-200 ease-enterprise',
          sidebarCollapsed ? 'w-[4.75rem]' : 'w-68',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-overlay/[0.07] px-3.5',
            sidebarCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {sidebarCollapsed ? <LogoMark size={28} /> : <Logo size="sm" showTagline />}
          {sidebarCollapsed ? null : (
            <IconButton icon={PanelLeftClose} label="Collapse navigation" size="sm" onClick={toggleSidebar} />
          )}
        </div>

        <SidebarContent collapsed={sidebarCollapsed} />

        {sidebarCollapsed ? (
          <div className="shrink-0 border-t border-overlay/[0.07] p-3">
            <IconButton
              icon={ChevronLeft}
              label="Expand navigation"
              size="sm"
              className="mx-auto rotate-180"
              onClick={toggleSidebar}
            />
          </div>
        ) : null}
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
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-overlay/[0.07] bg-ink-900/97 backdrop-blur-2xl"
              aria-label="Main navigation"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-overlay/[0.07] px-3.5">
                <Logo size="sm" showTagline />
                <IconButton icon={X} label="Close navigation" size="sm" onClick={() => setMobileNavOpen(false)} />
              </div>
              <SidebarContent collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
