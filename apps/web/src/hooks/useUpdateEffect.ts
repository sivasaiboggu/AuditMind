import { useEffect, useRef } from 'react';

export function useUpdateEffect(effect: React.EffectCallback, deps: React.DependencyList) {
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
