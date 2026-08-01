import { useEffect } from 'react';

export interface HotkeyOptions {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Fire even when focus sits inside an input or textarea. */
  allowInInput?: boolean;
  enabled?: boolean;
}

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

export const useHotkey = (options: HotkeyOptions, handler: (event: KeyboardEvent) => void): void => {
  const { key, meta, ctrl, shift, alt, allowInInput = false, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      // Accept either modifier for the platform-agnostic combos (⌘K / Ctrl+K).
      if (meta || ctrl) {
        if (!event.metaKey && !event.ctrlKey) return;
      } else if (event.metaKey || event.ctrlKey) {
        return;
      }
      if (shift !== undefined && event.shiftKey !== shift) return;
      if (alt !== undefined && event.altKey !== alt) return;
      if (!allowInInput && isEditable(event.target)) return;

      event.preventDefault();
      handler(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, meta, ctrl, shift, alt, allowInInput, enabled, handler]);
};
