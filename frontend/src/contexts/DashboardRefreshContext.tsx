import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

interface DashboardRefreshContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
  isRefreshing: boolean;
  lastRefreshTime: number | null;
}

const DashboardRefreshContext = createContext<DashboardRefreshContextType | undefined>(undefined);

// Debounce delay in milliseconds - prevents rapid successive API calls
const DEBOUNCE_DELAY = 300;

// Storage key for cross-tab synchronization
const STORAGE_KEY = 'hms_dashboard_refresh_signal';

export const DashboardRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(null);

  // Ref to store debounce timeout - prevents rapid triggering
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to track if component is mounted - prevents memory leaks
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Debounced refresh trigger function
  const triggerRefresh = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clear existing timeout to debounce rapid calls
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set debounced timeout
    debounceTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      try {
        // Increment counter to trigger useEffect in listening components
        setRefreshTrigger(prev => prev + 1);
        setIsRefreshing(true);
        setLastRefreshTime(Date.now());

        // Broadcast to other tabs/windows for synchronization
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            trigger: Math.random(), // Random value to ensure change detection
          }));
        } catch (storageError) {
          // LocalStorage might be unavailable (private browsing, etc.)
          // Silently fail - app still works without cross-tab sync
          console.debug('Dashboard refresh: localStorage unavailable', storageError);
        }

        // Reset refreshing state after brief delay
        setTimeout(() => {
          if (isMountedRef.current) {
            setIsRefreshing(false);
          }
        }, 100);
      } catch (error) {
        console.error('Dashboard refresh error:', error);
        if (isMountedRef.current) {
          setIsRefreshing(false);
        }
      }
    }, DEBOUNCE_DELAY);
  }, []);

  // Listen for storage changes from other tabs (cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue && isMountedRef.current) {
        try {
          // Increment trigger to notify other dashboard components
          setRefreshTrigger(prev => prev + 1);
          setIsRefreshing(true);

          setTimeout(() => {
            if (isMountedRef.current) {
              setIsRefreshing(false);
            }
          }, 100);
        } catch (error) {
          console.error('Cross-tab sync error:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const contextValue: DashboardRefreshContextType = {
    refreshTrigger,
    triggerRefresh,
    isRefreshing,
    lastRefreshTime,
  };

  return (
    <DashboardRefreshContext.Provider value={contextValue}>
      {children}
    </DashboardRefreshContext.Provider>
  );
};

/**
 * Hook to access dashboard refresh functionality
 *
 * Usage:
 * const { triggerRefresh, refreshTrigger, isRefreshing } = useDashboardRefresh();
 *
 * useEffect(() => {
 *   fetchData();
 * }, [refreshTrigger]);
 *
 * @throws Error if used outside DashboardRefreshProvider
 * @returns Dashboard refresh context object
 */
export const useDashboardRefresh = () => {
  const context = useContext(DashboardRefreshContext);

  if (!context) {
    throw new Error(
      'useDashboardRefresh must be used within DashboardRefreshProvider. ' +
      'Make sure your app is wrapped with <DashboardRefreshProvider> in App.tsx'
    );
  }

  return context;
};
