import { useState, useEffect } from 'react';

/**
 * Tracks whether the user is currently scrolled past a given threshold.
 * Useful for showing "scroll to top" buttons or sticky elements.
 */
export function useScrollPosition(threshold: number = 100): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > threshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return isScrolled;
}
