import { useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { EngineProvider } from '@/engine/store';
import { useUI } from '@/hooks/useUI';
import { useHotkey } from '@/hooks/useHotkey';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

/**
 * Authenticated shell. `EngineProvider` starts the telemetry tick here rather
 * than at the application root so a signed-out session is never left streaming.
 */
export const AppShell = () => {
  const { sidebarCollapsed, commandOpen, setCommandOpen, toggleSidebar } = useUI();
  const { pathname } = useLocation();

  const openPalette = useCallback(() => setCommandOpen(true), [setCommandOpen]);
  const collapseToggle = useCallback(() => toggleSidebar(), [toggleSidebar]);

  useHotkey({ key: 'k', meta: true, allowInInput: true, enabled: !commandOpen }, openPalette);
  useHotkey({ key: 'b', meta: true }, collapseToggle);

  return (
    <EngineProvider>
      <div className="relative min-h-screen bg-ink-950">
        {/* Ambient plane — a fine grid under a soft brand wash. */}
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
          <div className="absolute inset-0 grid-bg opacity-[0.55]" />
          <div className="absolute inset-x-0 top-0 h-[38rem] bg-radial-brand" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/40 to-ink-950" />
        </div>

        <Sidebar />
        <CommandPalette />

        <div
          className={cn(
            'flex min-h-screen flex-col transition-[padding] duration-200 ease-enterprise',
            sidebarCollapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-68',
          )}
        >
          <Topbar />

          <main className="min-w-0 flex-1">
            <ErrorBoundary>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto w-full max-w-[112rem] px-4 py-5 sm:px-5 sm:py-6 lg:px-6 lg:py-7"
              >
                <Outlet />
              </motion.div>
            </ErrorBoundary>
          </main>

          <footer className="border-t border-overlay/[0.06] px-4 py-4 sm:px-5 lg:px-6">
            <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10.5px] text-fg-faint">
                INTELORA Enterprise AIoT Intelligence Platform · live device telemetry
              </p>
              <p className="text-[10.5px] text-fg-faint">
                Press <kbd className="rounded bg-overlay/[0.06] px-1 py-0.5 font-mono">⌘K</kbd> to search ·{' '}
                <kbd className="rounded bg-overlay/[0.06] px-1 py-0.5 font-mono">⌘B</kbd> to collapse navigation
              </p>
            </div>
          </footer>
        </div>
      </div>
    </EngineProvider>
  );
};
