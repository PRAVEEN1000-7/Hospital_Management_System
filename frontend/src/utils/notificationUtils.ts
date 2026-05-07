/**
 * Notification utilities for role-based notifications
 */
import type { AppNotification } from '../services/notificationsService';

export interface NotificationTarget {
  path: string;
  referenceId?: string;
  referenceType: string;
}

/**
 * Get the target path for a notification based on its reference type
 */
export const getNotificationTarget = (notification: AppNotification): NotificationTarget => {
  const basePaths: Record<string, string> = {
    purchase_order: '/inventory/purchase-orders',
    grn: '/inventory/grns',
    stock_adjustment: '/inventory/adjustments',
    cycle_count: '/inventory/cycle-counts',
    supplier: '/inventory/suppliers',
    stock_movement: '/inventory/stock-movements',
    appointment: '/appointments/manage',
    prescription: '/prescriptions',
  };

  const basePath = basePaths[notification.reference_type || ''] || '/dashboard';

  return {
    path: basePath,
    referenceId: notification.reference_id || undefined,
    referenceType: notification.reference_type || 'unknown',
  };
};

/**
 * Get notification icon based on reference type
 */
export const getNotificationIcon = (referenceType: string): string => {
  const icons: Record<string, string> = {
    purchase_order: 'local_shipping',
    grn: 'inventory_2',
    stock_adjustment: 'tune',
    cycle_count: 'inventory',
    supplier: 'local_shipping',
    stock_movement: 'swap_horiz',
    appointment: 'event',
    prescription: 'medication',
    low_stock: 'warning',
    expiry: 'schedule',
  };
  return icons[referenceType] || 'notifications';
};

/**
 * Get notification color based on reference type
 */
export const getNotificationColor = (referenceType: string): string => {
  const colors: Record<string, string> = {
    purchase_order: 'text-blue-500 bg-blue-50',
    grn: 'text-emerald-500 bg-emerald-50',
    stock_adjustment: 'text-amber-500 bg-amber-50',
    cycle_count: 'text-purple-500 bg-purple-50',
    supplier: 'text-indigo-500 bg-indigo-50',
    stock_movement: 'text-cyan-500 bg-cyan-50',
    appointment: 'text-primary bg-blue-50',
    prescription: 'text-pink-500 bg-pink-50',
    low_stock: 'text-red-500 bg-red-50',
    expiry: 'text-orange-500 bg-orange-50',
  };
  return colors[referenceType] || 'text-slate-500 bg-slate-50';
};

/**
 * Format notification message with context
 */
export const formatNotificationMessage = (notification: AppNotification): string => {
  // If message is already descriptive, use it
  if (notification.message && notification.message.length > 20) {
    return notification.message;
  }

  // Otherwise, format based on type
  const templates: Record<string, string> = {
    purchase_order: `Purchase Order ${notification.reference_id?.substring(0, 8)} requires attention`,
    grn: `Goods Receipt ${notification.reference_id?.substring(0, 8)} needs verification`,
    stock_adjustment: `Stock adjustment ${notification.reference_id?.substring(0, 8)} pending approval`,
    cycle_count: `Cycle count ${notification.reference_id?.substring(0, 8)} completed`,
    supplier: `Supplier information updated`,
    low_stock: `Item is below reorder level`,
    expiry: `Items expiring soon`,
  };

  return templates[notification.reference_type || ''] || notification.message || 'New notification';
};

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
};
