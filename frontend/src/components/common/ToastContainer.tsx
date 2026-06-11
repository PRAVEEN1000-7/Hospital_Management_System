import React, { useState, useEffect } from 'react';
import { useToast, type Toast as ToastType } from '../../contexts/ToastContext';

const ICONS: Record<ToastType['type'], string> = {
  success: 'check_circle',
  error:   'cancel',
  warning: 'warning',
  info:    'info',
};

const STYLES: Record<ToastType['type'], {
  bg: string; border: string; iconBg: string; iconColor: string; title: string; text: string;
}> = {
  success: {
    bg: 'bg-white', border: 'border-emerald-200',
    iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
    title: 'text-emerald-800', text: 'text-slate-500',
  },
  error: {
    bg: 'bg-white', border: 'border-red-200',
    iconBg: 'bg-red-100', iconColor: 'text-red-600',
    title: 'text-red-800', text: 'text-slate-500',
  },
  warning: {
    bg: 'bg-white', border: 'border-amber-200',
    iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
    title: 'text-amber-800', text: 'text-slate-500',
  },
  info: {
    bg: 'bg-white', border: 'border-blue-200',
    iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
    title: 'text-blue-800', text: 'text-slate-500',
  },
};

const PROGRESS_COLOR: Record<ToastType['type'], string> = {
  success: 'bg-emerald-500',
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
};

const TITLE_TEXT: Record<ToastType['type'], string> = {
  success: 'Success',
  error:   'Error',
  warning: 'Warning',
  info:    'Info',
};

const Toast: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const { removeToast } = useToast();
  const [leaving, setLeaving] = useState(false);
  const s = STYLES[toast.type];
  const duration = toast.duration ?? 4000;

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => removeToast(toast.id), 200);
  };

  // Auto-dismiss
  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(dismiss, duration);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`
        ${s.bg} ${s.border} border rounded-2xl shadow-xl
        flex items-start gap-3 min-w-[320px] max-w-sm overflow-hidden
        ${leaving ? 'animate-slide-out' : 'animate-slide-in'}
      `}
    >
      {/* Main content */}
      <div className="flex items-start gap-3 flex-1 p-4 pb-3">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center flex-shrink-0`}>
          <span className={`material-symbols-outlined text-xl ${s.iconColor}`}>{ICONS[toast.type]}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={`text-sm font-bold leading-tight ${s.title}`}>{TITLE_TEXT[toast.type]}</p>
          <p className={`text-sm leading-snug mt-0.5 ${s.text}`}>{toast.message}</p>
        </div>

        {/* Close */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100 rounded-b-2xl overflow-hidden">
          <div
            className={`h-full ${PROGRESS_COLOR[toast.type]} toast-progress`}
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto relative">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;