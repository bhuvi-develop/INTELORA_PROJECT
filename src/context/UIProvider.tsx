import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { LiveWindow } from '@/types';
import { UIContext, type Density, type UIContextValue } from '@/context/contexts';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useLocalStorage('intelora.ui.sidebar', false);
  const [density, setDensityRaw] = useLocalStorage<Density>('intelora.ui.density', 'comfortable');
  const [liveWindow, setLiveWindowRaw] = useLocalStorage<LiveWindow>('intelora.ui.liveWindow', '15m');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarCollapsedRaw((prev) => !prev), [setSidebarCollapsedRaw]);
  const setSidebarCollapsed = useCallback(
    (value: boolean) => setSidebarCollapsedRaw(value),
    [setSidebarCollapsedRaw],
  );
  const setDensity = useCallback((value: Density) => setDensityRaw(value), [setDensityRaw]);
  const setLiveWindow = useCallback((value: LiveWindow) => setLiveWindowRaw(value), [setLiveWindowRaw]);

  const value = useMemo<UIContextValue>(
    () => ({
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      mobileNavOpen,
      setMobileNavOpen,
      commandOpen,
      setCommandOpen,
      density,
      setDensity,
      liveWindow,
      setLiveWindow,
    }),
    [
      sidebarCollapsed,
      toggleSidebar,
      setSidebarCollapsed,
      mobileNavOpen,
      commandOpen,
      density,
      setDensity,
      liveWindow,
      setLiveWindow,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
