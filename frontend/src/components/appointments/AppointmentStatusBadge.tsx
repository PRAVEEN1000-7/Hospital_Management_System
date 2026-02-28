import React from 'react';
import type { AppointmentStatus } from '../../types/appointment';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  scheduled:     { label: 'Scheduled',   bg: 'bg-sky-50',     text: 'text-sky-700',    icon: 'event_available' },
  pending:       { label: 'Pending',     bg: 'bg-amber-50',   text: 'text-amber-700',  icon: 'schedule' },
  confirmed:     { label: 'Confirmed',   bg: 'bg-blue-50',    text: 'text-blue-700',   icon: 'check_circle' },
  'in-progress': { label: 'In Progress', bg: 'bg-purple-50',  text: 'text-purple-700', icon: 'pending' },
  completed:     { label: 'Completed',   bg: 'bg-emerald-50', text: 'text-emerald-700',icon: 'task_alt' },
  cancelled:     { label: 'Cancelled',   bg: 'bg-red-50',     text: 'text-red-700',    icon: 'cancel' },
  'no-show':     { label: 'No Show',     bg: 'bg-slate-100',  text: 'text-slate-600',  icon: 'person_off' },
  rescheduled:   { label: 'Rescheduled', bg: 'bg-orange-50',  text: 'text-orange-700', icon: 'event_repeat' },
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const AppointmentStatusBadge: React.FC<Props> = ({ status, size = 'sm' }) => {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-slate-100', text: 'text-slate-600', icon: 'help' };
  const px = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 ${px} font-bold rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className="material-symbols-outlined" style={{ fontSize: size === 'sm' ? 12 : 14 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
};

export default AppointmentStatusBadge;
