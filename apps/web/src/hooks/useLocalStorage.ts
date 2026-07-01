import { useState } from 'react';

/**
 * Custom hook that syncs state to localStorage.
 * Initializes from stored value on mount.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`[useLocalStorage] Failed to set key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
