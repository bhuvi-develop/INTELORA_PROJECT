import { useCallback, useEffect, useState } from 'react';

/** Persisted state that tolerates unavailable or corrupted storage. */
export const useLocalStorage = <T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] => {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Quota exceeded or private mode — state still works in memory. */
    }
  }, [key, value]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
  }, []);

  return [value, update];
};
