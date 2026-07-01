import { useEffect, useRef } from 'react';

export function useKeyboard(
  key: string,
  handler: (e: KeyboardEvent) => void,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key !== key) return;
      if (modifiers.ctrl && !e.ctrlKey) return;
      if (modifiers.shift && !e.shiftKey) return;
      if (modifiers.alt && !e.altKey) return;
      if (modifiers.meta && !e.metaKey) return;
      handlerRef.current(e);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [key, modifiers.alt, modifiers.ctrl, modifiers.meta, modifiers.shift]);
}
