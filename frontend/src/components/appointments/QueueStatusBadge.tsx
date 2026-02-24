import React from 'react';

const URGENCY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  routine:   { label: 'Routine',   bg: 'bg-slate-100',  text: 'text-slate-600' },
  urgent:    { label: 'Urgent',    bg: 'bg-amber-50',   text: 'text-amber-700' },
  emergency: { label: 'Emergency', bg: 'bg-red-50',     text: 'text-red-700' },
};

interface Props {
  position?: number | null;
  urgency?: string | null;
  estimatedWait?: number | null;
}

const QueueStatusBadge: React.FC<Props> = ({ position, urgency, estimatedWait }) => {
  const cfg = URGENCY_CONFIG[urgency || 'routine'] || URGENCY_CONFIG.routine;

  return (
    <div className="flex items-center gap-2">
      {position != null && (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
          #{position}
        </span>
      )}
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
      {estimatedWait != null && (
        <span className="text-[10px] text-slate-400 font-medium">~{estimatedWait} min</span>
      )}
    </div>
  );
};

export default QueueStatusBadge;
