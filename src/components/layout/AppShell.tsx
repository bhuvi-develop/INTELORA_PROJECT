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

/* ───────────────────────────────────────────────────────────────────────────
 * Application shell.
 *
 * The window is the application: the shell fills the viewport exactly, the
 * sidebar and header are fixed planes, and only the workspace scrolls. Nothing
 * pushes the page taller than the screen, so the product never behaves like a
 * document.
 *
 * `EngineProvider` opens the platform connection here rather than at the root,
 * so a session that never reaches the workspace is not left streaming.
 * ─────────────────────────────────────────────────────────────────────────── */

export const AppShell = () => {
  const { sidebarCollapsed, commandOpen, setCommandOpen, toggleSidebar } = useUI();
  const { pathname } = useLocation();

  const openPalette = useCallback(() => setCommandOpen(true), [setCommandOpen]);
  const collapseToggle = useCallback(() => toggleSidebar(), [toggleSidebar]);

  useHotkey({ key: 'k', meta: true, allowInInput: true, enabled: !commandOpen }, openPalette);
  useHotkey({ key: 'b', meta: true }, collapseToggle);

  return (
    <EngineProvider>
      <div className="relative h-screen w-screen overflow-hidden bg-ink-950">
        {/* Ambient plane — a fine grid under a soft brand wash, fixed behind
            everything so scrolling the workspace does not drag the atmosphere. */}
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
          <div className="grid-bg absolute inset-0 opacity-[0.4]" />
          <div className="absolute inset-x-0 top-0 h-[34rem] bg-radial-brand opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/40 to-ink-950" />
        </div>

        <Sidebar />
        <CommandPalette />

        <div
          className={cn(
            'flex h-full flex-col transition-[padding] duration-200 ease-enterprise',
            sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-[17.5rem]',
          )}
        >
          <Topbar />

          {/* The only scrolling region in the product. */}
          <main className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto">
            <ErrorBoundary>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto w-full max-w-[120rem] px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-10"
              >
                <Outlet />
              </motion.div>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </EngineProvider>
  );
};
