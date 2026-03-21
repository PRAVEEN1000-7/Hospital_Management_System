import React from 'react';
import ModuleBadge from './ModuleBadge';
import type { ModuleStatus } from '../../../types/analytics.types';

interface Props {
  title: string;
  status: ModuleStatus;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onExport?: () => void;
  children: React.ReactNode;
}

/* ── Skeleton placeholder ─────────────────────────────────────────────── */
const Skeleton: React.FC = () => (
  <div className="space-y-4 p-6">
    <div className="h-4 w-1/3 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
    <div className="h-40 rounded bg-slate-100 animate-pulse dark:bg-slate-800" />
    <div className="h-4 w-2/3 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
  </div>
);

const PanelCard: React.FC<Props> = ({
  title,
  status,
  isLoading,
  error,
  onRetry,
  onExport,
  children,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
    {/* Header */}
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
      <div className="flex items-center gap-2.5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h3>
        <ModuleBadge status={status} />
      </div>

      {onExport && status === 'live' && (
        <button
          onClick={onExport}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined text-base">download</span>
          Export
        </button>
      )}
    </div>

    {/* Dev banner */}
    {status === 'development' && (
      <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <span className="material-symbols-outlined mr-1 align-middle text-sm">
          construction
        </span>
        This module is under development — showing sample data.
      </div>
    )}

    {/* Body */}
    {isLoading ? (
      <Skeleton />
    ) : error ? (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="material-symbols-outlined text-3xl text-red-400">error</span>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg bg-red-50 px-4 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
          >
            Retry
          </button>
        )}
      </div>
    ) : (
      <div className="p-5">{children}</div>
    )}
  </div>
);

export default PanelCard;
