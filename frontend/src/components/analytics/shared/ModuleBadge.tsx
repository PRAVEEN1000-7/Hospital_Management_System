import React from 'react';
import type { ModuleStatus } from '../../../types/analytics.types';

const cfg: Record<ModuleStatus, { label: string; classes: string }> = {
  live: {
    label: 'Live',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  development: {
    label: 'In Development',
    classes:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 animate-pulse',
  },
};

interface Props {
  status: ModuleStatus;
}

const ModuleBadge: React.FC<Props> = ({ status }) => {
  const { label, classes } = cfg[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {status === 'live' && (
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
      )}
      {label}
    </span>
  );
};

export default ModuleBadge;
