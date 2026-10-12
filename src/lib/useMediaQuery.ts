import { useSyncExternalStore } from 'react';

/** Follows a media query; used to tell the side panel (wide) from the bottom sheet (narrow). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
  );
}
