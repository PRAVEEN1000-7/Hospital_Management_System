import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

interface DialogState {
  open: boolean;
  options: ConfirmOptions;
  resolve: (v: boolean) => void;
}

// ── Confirm Dialog UI ─────────────────────────────────────────────────────────
const ConfirmDialog: React.FC<{
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ options, onConfirm, onCancel }) => {
  const { title, message, confirmLabel, cancelLabel, variant = 'danger' } = options;

  const cfg = {
    danger: {
      icon: 'delete_forever',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white shadow-red-200',
      confirmDefault: confirmLabel ?? 'Delete',
    },
    warning: {
      icon: 'warning',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      confirmBtn: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400 text-white shadow-amber-200',
      confirmDefault: confirmLabel ?? 'Confirm',
    },
    info: {
      icon: 'help',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white shadow-blue-200',
      confirmDefault: confirmLabel ?? 'Confirm',
    },
  }[variant];

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 animate-backdrop-in"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`w-12 h-12 rounded-full ${cfg.iconBg} flex items-center justify-center mb-4`}>
          <span className={`material-symbols-outlined text-2xl ${cfg.iconColor}`}>{cfg.icon}</span>
        </div>

        {/* Text */}
        <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">{message}</p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            autoFocus={false}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {cancelLabel ?? 'Cancel'}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.97] ${cfg.confirmBtn}`}
          >
            {cfg.confirmDefault}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Provider ──────────────────────────────────────────────────────────────────
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState>({
    open: false,
    options: { title: '', message: '' },
    resolve: () => {},
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve });
    });
  }, []);

  const handle = (value: boolean) => {
    state.resolve(value);
    setState((s) => ({ ...s, open: false }));
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <ConfirmDialog
          options={state.options}
          onConfirm={() => handle(true)}
          onCancel={() => handle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
};