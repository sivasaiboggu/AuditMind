import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  const routeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = routeRef.current;
    if (!target) return;
    // Keep the first paint visible and move keyboard focus off the old route.
    if (document.activeElement === document.body) target.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  return <div ref={routeRef} tabIndex={-1} className="outline-none">{children}</div>;
}
