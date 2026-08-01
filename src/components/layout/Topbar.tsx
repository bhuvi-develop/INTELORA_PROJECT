import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellDot, ChevronRight, LogOut, Menu, Moon, Search, Settings, ShieldCheck, Sun } from 'lucide-react';
import { NAV_ITEMS, navItemByPath } from '@/config/navigation';
import { PATHS, deviceDetailPath } from '@/routes/paths';
import { useAnomalyJournal } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/utils/format';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useUI } from '@/hooks/useUI';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/Dropdown';
import { LiveIndicator } from '@/components/common/LiveIndicator';
import { SeverityBadge } from '@/components/common/StatusBadge';
import { Logo } from '@/components/common/Logo';

const Breadcrumbs = () => {
  const { pathname } = useLocation();
  const active = navItemByPath(pathname);
  const isDetail = active?.key === 'devices' && pathname !== PATHS.devices;

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 md:flex">
      <Link to={PATHS.cockpit} className="shrink-0 text-[11.5px] text-fg-dim transition-colors hover:text-fg-soft">
        Platform
      </Link>
      {active ? (
        <>
          <ChevronRight size={12} className="shrink-0 text-fg-faint" aria-hidden />
          {isDetail ? (
            <Link to={active.to} className="shrink-0 text-[11.5px] text-fg-dim transition-colors hover:text-fg-soft">
              {active.label}
            </Link>
          ) : (
            <span className="truncate text-[11.5px] font-medium text-fg-soft">{active.label}</span>
          )}
          {isDetail ? (
            <>
              <ChevronRight size={12} className="shrink-0 text-fg-faint" aria-hidden />
              <span className="truncate font-mono text-[11px] font-medium text-fg-soft">
                {pathname.split('/').pop()}
              </span>
            </>
          ) : null}
        </>
      ) : null}
    </nav>
  );
};

/**
 * Notifications are a projection of the live anomaly journal rather than a
 * separate feed, so the badge count and the anomaly module can never disagree.
 */
const NotificationsMenu = () => {
  const journal = useAnomalyJournal();

  const items = useMemo(
    () =>
      journal.slice(0, 10).map((record) => ({
        id: record.id,
        title: `${record.assetId} · ${record.title}`,
        body: record.detail,
        severity: record.severity,
        at: record.timestamp,
        read: record.status !== 'Active',
        href: deviceDetailPath(record.assetId),
        code: record.code,
      })),
    [journal],
  );

  const unread = items.filter((item) => !item.read).length;

  return (
    <Dropdown
      width="w-[23rem]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className={cn(
            'relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
            open ? 'bg-overlay/[0.08] text-fg' : 'text-fg-muted hover:bg-overlay/[0.06] hover:text-fg',
          )}
        >
          {unread > 0 ? <BellDot size={17} aria-hidden /> : <Bell size={17} aria-hidden />}
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold tabular-nums text-white ring-2 ring-ink-900">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-overlay/[0.07] px-3.5 py-3">
            <p className="text-[12.5px] font-semibold text-fg">Notifications</p>
            {unread > 0 ? (
              <Badge tone="critical" size="xs">
                {unread} active
              </Badge>
            ) : null}
          </div>

          <ul className="scroll-thin max-h-[24rem] divide-y divide-overlay/[0.05] overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  onClick={close}
                  className={cn(
                    'block px-3.5 py-3 transition-colors hover:bg-overlay/[0.04]',
                    item.read ? '' : 'bg-brand-500/[0.045]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <p className="min-w-0 text-[12px] font-medium leading-snug text-fg">{item.title}</p>
                    <SeverityBadge severity={item.severity} size="xs" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{item.body}</p>
                  <p className="mt-1.5 flex items-center gap-2 text-[10.5px] text-fg-faint">
                    <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[9.5px] text-fg-muted">
                      {item.code}
                    </span>
                    {formatRelative(item.at)}
                  </p>
                </Link>
              </li>
            ))}
            {items.length === 0 ? (
              <li className="px-3.5 py-8 text-center text-[11.5px] text-fg-dim">
                No anomalies raised yet in this session
              </li>
            ) : null}
          </ul>

          <div className="border-t border-overlay/[0.07] px-3.5 py-2.5">
            <Link
              to={PATHS.anomaly}
              onClick={close}
              className="text-[11.5px] font-medium text-brand-300 transition-colors hover:text-brand-200"
            >
              Open anomaly detection
            </Link>
          </div>
        </>
      )}
    </Dropdown>
  );
};

/**
 * Global theme toggle. The icon shows the theme you will get, not the one you
 * are in — a sun means "switch to light", which is what people reach for.
 */
const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={theme === 'light'}
      aria-label={`Switch to ${next} mode`}
      title={`${theme === 'dark' ? 'Dark' : 'Light'} mode — switch to ${next}`}
      className="no-theme-transition relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl text-fg-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -70, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 70, scale: 0.6 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inline-flex"
        >
          {theme === 'dark' ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
};

const UserMenu = () => {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <Dropdown
      width="w-72"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            'flex shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors',
            open ? 'bg-overlay/[0.08]' : 'hover:bg-overlay/[0.06]',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-[11.5px] font-bold text-white">
            {user.initials}
          </span>
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block max-w-[9rem] truncate text-[12px] font-semibold leading-tight text-fg">
              {user.name}
            </span>
            <span className="block max-w-[9rem] truncate text-[10.5px] leading-tight text-fg-dim">
              {user.roleLabel}
            </span>
          </span>
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="border-b border-overlay/[0.07] px-3.5 py-3">
            <p className="text-[12.5px] font-semibold text-fg">{user.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-fg-dim">{user.email}</p>
            <div className="mt-2">
              <Badge tone="brand" size="xs" icon={ShieldCheck}>
                {user.roleLabel}
              </Badge>
            </div>
          </div>

          <DropdownLabel>Workspace</DropdownLabel>
          <Link to={PATHS.settings} onClick={close}>
            <DropdownItem icon={Settings}>Platform settings</DropdownItem>
          </Link>

          <DropdownSeparator />
          <DropdownItem
            icon={LogOut}
            danger
            onClick={() => {
              close();
              void logout();
            }}
          >
            Sign out
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
};

export const Topbar = () => {
  const { setMobileNavOpen, setCommandOpen } = useUI();
  const { pathname } = useLocation();
  const active = navItemByPath(pathname) ?? NAV_ITEMS[0];

  return (
    <header className="sticky top-0 z-30 border-b border-overlay/[0.07] bg-ink-900/80 backdrop-blur-2xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-5 lg:px-6">
        <IconButton
          icon={Menu}
          label="Open navigation"
          size="sm"
          className="lg:hidden"
          onClick={() => setMobileNavOpen(true)}
        />

        <Logo size="sm" className="lg:hidden" />

        <div className="hidden min-w-0 flex-1 flex-col justify-center lg:flex">
          <Breadcrumbs />
          <p className="mt-0.5 truncate text-[13px] font-semibold tracking-[-0.005em] text-fg">{active.label}</p>
        </div>

        <div className="flex-1 lg:hidden" />

        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden items-center gap-2.5 rounded-xl bg-ink-850/80 py-2 pl-3 pr-2 ring-1 ring-inset ring-overlay/[0.09] transition-colors hover:ring-overlay/[0.16] md:flex md:w-56 xl:w-72"
        >
          <Search size={14} className="shrink-0 text-fg-dim" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left text-[12.5px] text-fg-faint">Search devices…</span>
          <kbd className="shrink-0 rounded-md bg-overlay/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-fg-dim ring-1 ring-inset ring-overlay/10">
            ⌘K
          </kbd>
        </button>

        <IconButton
          icon={Search}
          label="Open search"
          size="sm"
          className="md:hidden"
          onClick={() => setCommandOpen(true)}
        />

        <LiveIndicator className="hidden xl:inline-flex" />

        <ThemeToggle />
        <NotificationsMenu />
        <UserMenu />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-overlay/[0.05] px-4 py-2 xl:hidden">
        <p className="truncate text-[11px] text-fg-dim">{active.description}</p>
        <LiveIndicator showClock={false} />
      </div>
    </header>
  );
};
