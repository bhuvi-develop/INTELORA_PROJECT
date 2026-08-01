import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CornerDownLeft, MonitorSmartphone, Search, Sparkles } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { NAV_ITEMS } from '@/config/navigation';
import { useAssetList } from '@/engine/store';
import { cn } from '@/lib/cn';
import { deviceDetailPath } from '@/routes/paths';
import { useUI } from '@/hooks/useUI';
import { StatusBadge } from '@/components/common/StatusBadge';
import { HealthValue } from '@/components/common/HealthMeter';

interface Entry {
  id: string;
  group: 'Modules' | 'Devices';
  title: string;
  subtitle: string;
  to: string;
  icon?: typeof MonitorSmartphone;
  asset?: AssetRuntime;
}

const MAX_DEVICE_RESULTS = 7;

/** ⌘K / Ctrl+K launcher across modules and the device register. */
export const CommandPalette = () => {
  const { commandOpen, setCommandOpen } = useUI();
  const navigate = useNavigate();
  const assets = useAssetList();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();

    const modules: Entry[] = NAV_ITEMS.filter(
      (item) =>
        needle.length === 0 ||
        item.label.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle),
    ).map((item) => ({
      id: `module-${item.key}`,
      group: 'Modules',
      title: item.label,
      subtitle: item.description,
      to: item.to,
      icon: item.icon,
    }));

    const devices: Entry[] = assets
      .filter((asset) => {
        if (needle.length === 0) return true;
        const haystack =
          `${asset.device.assetId} ${asset.device.assetName} ${asset.device.brand} ${asset.device.model} ${asset.device.category}`.toLowerCase();
        return haystack.includes(needle);
      })
      // Weakest first, so a blank query surfaces what needs attention.
      .sort((a, b) => a.health - b.health)
      .slice(0, MAX_DEVICE_RESULTS)
      .map((asset) => ({
        id: `device-${asset.device.assetId}`,
        group: 'Devices',
        title: asset.device.assetName,
        subtitle: `${asset.device.assetId} · ${asset.device.brand} ${asset.device.model} · ${asset.device.category}`,
        to: deviceDetailPath(asset.device.assetId),
        asset,
      }));

    return [...modules, ...devices];
  }, [query, assets]);

  useEffect(() => {
    if (!commandOpen) return;
    setQuery('');
    setCursor(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [commandOpen]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!commandOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setCommandOpen(false);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((prev) => (entries.length === 0 ? 0 : (prev + 1) % entries.length));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((prev) => (entries.length === 0 ? 0 : (prev - 1 + entries.length) % entries.length));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = entries[cursor];
        if (target) {
          navigate(target.to);
          setCommandOpen(false);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandOpen, entries, cursor, navigate, setCommandOpen]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup = '';

  return createPortal(
    <AnimatePresence>
      {commandOpen ? (
        <div className="fixed inset-0 z-[115] flex items-start justify-center p-4 pt-[12vh] sm:p-6 sm:pt-[14vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-scrim/70 backdrop-blur-sm"
            onClick={() => setCommandOpen(false)}
            aria-hidden
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-overlay/10 bg-ink-800/97 shadow-raised backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-overlay/[0.07] px-4 py-3.5">
              <Search size={16} className="shrink-0 text-fg-dim" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search devices, brands, models, categories or modules…"
                aria-label="Search devices and modules"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-fg placeholder:text-fg-faint focus:outline-none"
              />
              <kbd className="hidden shrink-0 rounded-md bg-overlay/[0.06] px-1.5 py-1 font-mono text-[10px] text-fg-dim ring-1 ring-inset ring-overlay/10 sm:block">
                ESC
              </kbd>
            </div>

            <ul ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
              {entries.length === 0 ? (
                <li className="px-3 py-10 text-center">
                  <Sparkles size={18} className="mx-auto text-fg-faint" aria-hidden />
                  <p className="mt-2.5 text-[12.5px] font-medium text-fg-soft">No matches</p>
                  <p className="mt-1 text-[11.5px] text-fg-dim">
                    Try an asset id such as <span className="font-mono text-fg-muted">LAP-001</span>, a brand, or a
                    module name.
                  </p>
                </li>
              ) : (
                entries.map((entry, index) => {
                  const header = entry.group !== lastGroup ? entry.group : null;
                  lastGroup = entry.group;
                  const active = index === cursor;
                  const Icon = entry.icon;

                  return (
                    <li key={entry.id}>
                      {header ? (
                        <p className="px-2.5 pb-1.5 pt-3 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
                          {header}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        data-active={active}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => {
                          navigate(entry.to);
                          setCommandOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                          active ? 'bg-brand-500/[0.13] ring-1 ring-inset ring-brand-400/25' : 'hover:bg-overlay/[0.04]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                            active
                              ? 'bg-brand-500/15 text-brand-200 ring-brand-400/25'
                              : 'bg-overlay/[0.04] text-fg-muted ring-overlay/[0.07]',
                          )}
                        >
                          {Icon ? <Icon size={15} aria-hidden /> : <MonitorSmartphone size={15} aria-hidden />}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-fg">{entry.title}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-fg-dim">{entry.subtitle}</span>
                        </span>

                        {entry.asset ? (
                          <span className="flex shrink-0 items-center gap-2">
                            <HealthValue health={entry.asset.health} className="text-[12px]" />
                            <StatusBadge status={entry.asset.device.status} size="xs" />
                          </span>
                        ) : null}

                        {active ? (
                          <CornerDownLeft size={13} className="shrink-0 text-brand-300" aria-hidden />
                        ) : (
                          <ArrowRight size={13} className="shrink-0 text-fg-faint" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex items-center justify-between gap-4 border-t border-overlay/[0.07] px-4 py-2.5 text-[10.5px] text-fg-faint">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded bg-overlay/[0.06] px-1 py-0.5 font-mono">↑↓</kbd> navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded bg-overlay/[0.06] px-1 py-0.5 font-mono">↵</kbd> open
                </span>
              </span>
              <span>{entries.length} results</span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};
