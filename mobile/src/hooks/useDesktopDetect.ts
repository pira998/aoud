import { useState, useEffect } from 'react';

/**
 * Hook to detect desktop viewport (≥1024px).
 * Used to gate the multi-pane view feature to desktop/laptop only.
 */
export function useDesktopDetect(breakpoint: number = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isDesktop;
}
