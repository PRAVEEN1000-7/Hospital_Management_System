import { useState, useCallback, useEffect } from 'react';

/**
 * Shared ArrowUp/ArrowDown/Enter/Escape navigation for search-result and
 * suggestion dropdowns. Wire `onKeyDown` to the search <input>, use
 * `activeIndex` to highlight the matching row, and call `reset()` whenever
 * the result list is cleared/reloaded so a stale index doesn't point past
 * the end of a shorter new list.
 */
export function useListKeyboardNav<T>(items: T[], onSelect: (item: T) => void) {
  const [activeIndex, setActiveIndex] = useState(-1);

  // A new search result set arriving mid-navigation (e.g. debounced typing)
  // must not leave the highlight pointing at an index the new list doesn't have.
  useEffect(() => {
    setActiveIndex(-1);
  }, [items]);

  const reset = useCallback(() => setActiveIndex(-1), []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev => (prev + 1) % items.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev => (prev - 1 + items.length) % items.length);
          break;
        case 'Enter':
          if (activeIndex >= 0 && activeIndex < items.length) {
            e.preventDefault();
            onSelect(items[activeIndex]);
            setActiveIndex(-1);
          }
          break;
        case 'Escape':
          setActiveIndex(-1);
          break;
      }
    },
    [items, activeIndex, onSelect]
  );

  return { activeIndex, setActiveIndex, onKeyDown, reset };
}
