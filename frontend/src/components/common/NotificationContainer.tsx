import React from 'react';
import type { Notification } from '../../contexts/NotificationContext';
import { useNotification } from '../../contexts/NotificationContext';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification, markAsRead } = useNotification();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = (type: string) => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-green-50 border-green-200',
          icon: 'text-green-600',
          title: 'text-green-900',
          message: 'text-green-700',
          close: 'text-green-400 hover:text-green-600',
        };
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          icon: 'text-red-600',
          title: 'text-red-900',
          message: 'text-red-700',
          close: 'text-red-400 hover:text-red-600',
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          icon: 'text-yellow-600',
          title: 'text-yellow-900',
          message: 'text-yellow-700',
          close: 'text-yellow-400 hover:text-yellow-600',
        };
      case 'info':
      default:
        return {
          container: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          title: 'text-blue-900',
          message: 'text-blue-700',
          close: 'text-blue-400 hover:text-blue-600',
        };
    }
  };

  const NotificationItem: React.FC<{ notification: Notification }> = ({ notification }) => {
    const styles = getStyles(notification.type);

    const handleClick = () => {
      if (!notification.read) {
        markAsRead(notification.id);
      }
      if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
      }
    };

    return (
      <div
        className={`border rounded-lg shadow-lg overflow-hidden transform transition-all duration-300 animate-slideIn ${styles.container}`}
        role="alert"
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={styles.icon}>{getIcon(notification.type)}</div>
            <div className="flex-1 min-w-0">
              {notification.title && (
                <h3 className={`font-semibold ${styles.title}`}>{notification.title}</h3>
              )}
              <p className={`text-sm ${styles.message} ${notification.title ? 'mt-1' : ''}`}>
                {notification.message}
              </p>
              {notification.description && (
                <p className={`text-xs ${styles.message} mt-1 opacity-75`}>
                  {notification.description}
                </p>
              )}
              {notification.actionUrl && (
                <button
                  onClick={handleClick}
                  className={`text-xs font-semibold mt-2 hover:underline ${styles.message}`}
                >
                  {notification.actionLabel || 'View'}
                </button>
              )}
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className={`shrink-0 p-1 rounded hover:bg-white/30 transition-colors ${styles.close}`}
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm max-h-[80vh] overflow-y-auto custom-scrollbar"
      aria-label="Notifications"
    >
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
};

export default NotificationContainer;

// Add CSS for slide-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .animate-slideIn {
    animation: slideIn 0.3s ease-out;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
  }
`;

if (typeof document !== 'undefined') {
  document.head.appendChild(style);
}
