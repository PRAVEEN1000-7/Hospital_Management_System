import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  description?: string;
  duration?: number;
  priority: NotificationPriority;
  modules?: string[]; // Which modules should see this (empty = all)
  allowedRoles?: string[]; // Which roles should see this (empty = all)
  allowedUsers?: string[]; // Which specific users should see this (empty = all)
  userId?: string; // User who should see this
  createdAt: number;
  read: boolean;
  actionUrl?: string; // URL to navigate to
  actionLabel?: string; // Label for action button
  persistent: boolean; // Should survive page refresh
}

interface NotificationContextType {
  notifications: Notification[];
  visibleNotifications: Notification[];
  showNotification: (
    type: NotificationType,
    message: string,
    options?: NotificationOptions
  ) => string;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  success: (message: string, options?: Partial<NotificationOptions>) => string;
  error: (message: string, options?: Partial<NotificationOptions>) => string;
  warning: (message: string, options?: Partial<NotificationOptions>) => string;
  info: (message: string, options?: Partial<NotificationOptions>) => string;
  notifyModule: (
    module: string,
    type: NotificationType,
    message: string,
    options?: Partial<NotificationOptions>
  ) => string;
  notifyRole: (
    role: string | string[],
    type: NotificationType,
    message: string,
    options?: Partial<NotificationOptions>
  ) => string;
  notifyUser: (
    userId: string,
    type: NotificationType,
    message: string,
    options?: Partial<NotificationOptions>
  ) => string;
  unreadCount: number;
}

export interface NotificationOptions {
  title?: string;
  description?: string;
  duration?: number;
  priority?: NotificationPriority;
  modules?: string[];
  allowedRoles?: string[];
  allowedUsers?: string[];
  userId?: string;
  persistent?: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Storage key for persistent notifications
const STORAGE_KEY = 'hms_notifications';

// Default duration in milliseconds
const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

/**
 * Hook to access notification functionality
 * Must be used within NotificationProvider
 */
export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
  userId?: string;
  userRole?: string;
  userRoles?: string[];
  currentModule?: string;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  userId,
  userRole,
  userRoles = userRole ? [userRole] : [],
  currentModule,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const isMountedRef = useRef(true);
  const removeTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load persistent notifications from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const persistentNotifications = JSON.parse(stored) as Notification[];
        // Filter out expired notifications (older than 24 hours)
        const now = Date.now();
        const validNotifications = persistentNotifications.filter(
          (n) => now - n.createdAt < 24 * 60 * 60 * 1000
        );
        if (isMountedRef.current) {
          setNotifications(validNotifications);
        }
      }
    } catch (error) {
      console.error('Failed to load notifications from storage:', error);
    }
  }, []);

  // Save persistent notifications to storage
  useEffect(() => {
    try {
      const persistentNotifications = notifications.filter((n) => n.persistent);
      if (persistentNotifications.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentNotifications));
      }
    } catch (error) {
      console.error('Failed to save notifications to storage:', error);
    }
  }, [notifications]);

  // Determine if notification is visible to current user
  const isNotificationVisible = useCallback(
    (notification: Notification): boolean => {
      // Check module filter
      if (notification.modules && notification.modules.length > 0) {
        if (!currentModule || !notification.modules.includes(currentModule)) {
          return false;
        }
      }

      // Check role filter
      if (notification.allowedRoles && notification.allowedRoles.length > 0) {
        const userHasRole = userRoles.some((role) =>
          notification.allowedRoles?.includes(role)
        );
        if (!userHasRole) {
          return false;
        }
      }

      // Check user filter
      if (notification.allowedUsers && notification.allowedUsers.length > 0) {
        if (!userId || !notification.allowedUsers.includes(userId)) {
          return false;
        }
      }

      // Check specific user notification
      if (notification.userId && notification.userId !== userId) {
        return false;
      }

      return true;
    },
    [userId, userRoles, currentModule]
  );

  // Get visible notifications sorted by priority
  const visibleNotifications = notifications
    .filter(isNotificationVisible)
    .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);

  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const removeNotification = useCallback((id: string) => {
    if (!isMountedRef.current) return;

    // Clear any pending timeout
    const timeout = removeTimeoutRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      removeTimeoutRef.current.delete(id);
    }

    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    if (!isMountedRef.current) return;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    if (!isMountedRef.current) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clear all timeouts
    removeTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
    removeTimeoutRef.current.clear();

    setNotifications([]);
  }, []);

  const showNotification = useCallback(
    (type: NotificationType, message: string, options?: NotificationOptions): string => {
      if (!isMountedRef.current) return '';

      const id = `${Date.now()}-${Math.random()}`;
      const duration = options?.duration ?? DEFAULT_DURATIONS[type];
      const priority = options?.priority ?? 'normal';

      const notification: Notification = {
        id,
        type,
        message,
        title: options?.title,
        description: options?.description,
        duration,
        priority,
        modules: options?.modules,
        allowedRoles: options?.allowedRoles,
        allowedUsers: options?.allowedUsers,
        createdAt: Date.now(),
        read: false,
        actionUrl: options?.actionUrl,
        actionLabel: options?.actionLabel,
        persistent: options?.persistent ?? false,
      };

      if (isMountedRef.current) {
        setNotifications((prev) => [...prev, notification]);
      }

      // Auto-remove after duration
      if (duration > 0) {
        const timeout = setTimeout(() => {
          removeNotification(id);
        }, duration);
        removeTimeoutRef.current.set(id, timeout);
      }

      return id;
    },
    [removeNotification]
  );

  // Convenience methods
  const success = useCallback(
    (message: string, options?: Partial<NotificationOptions>): string => {
      return showNotification('success', message, {
        ...options,
        duration: options?.duration ?? DEFAULT_DURATIONS.success,
      });
    },
    [showNotification]
  );

  const error = useCallback(
    (message: string, options?: Partial<NotificationOptions>): string => {
      return showNotification('error', message, {
        ...options,
        duration: options?.duration ?? DEFAULT_DURATIONS.error,
      });
    },
    [showNotification]
  );

  const warning = useCallback(
    (message: string, options?: Partial<NotificationOptions>): string => {
      return showNotification('warning', message, {
        ...options,
        duration: options?.duration ?? DEFAULT_DURATIONS.warning,
      });
    },
    [showNotification]
  );

  const info = useCallback(
    (message: string, options?: Partial<NotificationOptions>): string => {
      return showNotification('info', message, {
        ...options,
        duration: options?.duration ?? DEFAULT_DURATIONS.info,
      });
    },
    [showNotification]
  );

  // Module-specific notification
  const notifyModule = useCallback(
    (
      module: string,
      type: NotificationType,
      message: string,
      options?: Partial<NotificationOptions>
    ): string => {
      return showNotification(type, message, {
        ...options,
        modules: [module],
      });
    },
    [showNotification]
  );

  // Role-specific notification
  const notifyRole = useCallback(
    (
      role: string | string[],
      type: NotificationType,
      message: string,
      options?: Partial<NotificationOptions>
    ): string => {
      const roles = Array.isArray(role) ? role : [role];
      return showNotification(type, message, {
        ...options,
        allowedRoles: roles,
      });
    },
    [showNotification]
  );

  // User-specific notification
  const notifyUser = useCallback(
    (
      targetUserId: string,
      type: NotificationType,
      message: string,
      options?: Partial<NotificationOptions>
    ): string => {
      return showNotification(type, message, {
        ...options,
        userId: targetUserId,
      });
    },
    [showNotification]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      removeTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      removeTimeoutRef.current.clear();
    };
  }, []);

  const contextValue: NotificationContextType = {
    notifications: visibleNotifications,
    visibleNotifications,
    showNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    success,
    error,
    warning,
    info,
    notifyModule,
    notifyRole,
    notifyUser,
    unreadCount,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};
