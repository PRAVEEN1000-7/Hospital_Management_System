import { useEffect, useRef } from 'react';

/**
 * setInterval that skips its work while the browser tab is in the
 * background, and fires one extra call immediately the moment the tab
 * becomes visible again — so a user switching back sees fresh data right
 * away instead of waiting up to a full interval for the next tick. A
 * backgrounded tab still burns a network request every tick otherwise,
 * for data nobody is looking at.
 */
export function useVisiblePolling(callback: () => void, intervalMs: number, enabled: boolean = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      if (!document.hidden) callbackRef.current();
    }, intervalMs);

    const onVisibilityChange = () => {
      if (!document.hidden) callbackRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
