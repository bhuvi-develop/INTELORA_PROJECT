import { useSyncExternalStore } from 'react';
import type { PlatformAlert } from '@/types/alerts';

class AlertStore {
  private alerts: Map<string, PlatformAlert> = new Map();
  private listeners: Set<() => void> = new Set();

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getSnapshot = (): PlatformAlert[] => {
    return Array.from(this.alerts.values()).sort((a, b) => b.timestamp - a.timestamp);
  };

  public publish = (alert: PlatformAlert) => {
    this.alerts.set(alert.id, alert);
    this.notify();
  };

  public publishMany = (alerts: PlatformAlert[]) => {
    let changed = false;
    for (const alert of alerts) {
      const existing = this.alerts.get(alert.id);
      if (!existing || existing.status !== alert.status || existing.severity !== alert.severity) {
        this.alerts.set(alert.id, alert);
        changed = true;
      }
    }
    if (changed) this.notify();
  };
}

export const platformAlertStore = new AlertStore();

export const usePlatformAlerts = () => {
  return useSyncExternalStore(
    platformAlertStore.subscribe,
    platformAlertStore.getSnapshot,
    platformAlertStore.getSnapshot
  );
};
