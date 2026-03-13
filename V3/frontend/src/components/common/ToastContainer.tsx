import React from 'react';
import { useToast, type Toast as ToastType } from '../../contexts/ToastContext';

const Toast: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const { removeToast } = useToast();

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          icon: 'check_circle',
          iconColor: 'text-emerald-500',
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: 'error',
          iconColor: 'text-red-500',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: 'warning',
          iconColor: 'text-yellow-500',
        };
      case 'info':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: 'info',
          iconColor: 'text-blue-500',
        };
      default:
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          text: 'text-slate-700',
          icon: 'info',
          iconColor: 'text-slate-500',
        };
    }
  };

  const styles = getToastStyles();

  return (
    <div
      className={`${styles.bg} border ${styles.border} ${styles.text} rounded-xl p-4 shadow-lg flex items-center gap-3 min-w-[320px] max-w-md animate-slide-in`}
    >
      <span className={`material-symbols-outlined ${styles.iconColor}`}>{styles.icon}</span>
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className={`${styles.iconColor.replace('text-', 'text-').replace('500', '400')} hover:${styles.iconColor.replace('500', '600')} transition-colors`}
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
