import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import publicQueueService, { type PublicQueueDisplayResponse, type PublicQueueColumn } from '../services/publicQueueService';
import HospitalLogo from '../components/common/HospitalLogo';

// ── Department colour palette ────────────────────────────────────────────────
// Exported so PublicQueueDisplayScreen.tsx (BRD-005 multi-screen variant) can
// reuse the exact same column rendering — guarantees the two displays never
// visually drift apart.
export const COLUMN_THEME: Record<string, {
  accent: string;
  glow: string;
  badge: string;
  activeBadge: string;
  icon: string;
  headerBg: string;
  dot: string;
}> = {
  doctor: {
    accent: 'text-blue-400',
    glow: 'shadow-[0_0_24px_rgba(59,130,246,0.55)] ring-2 ring-blue-400/30',
    badge: 'border-blue-700 bg-blue-950/60 text-blue-100',
    activeBadge: 'border-blue-400 bg-blue-900/80 text-white shadow-[0_0_18px_rgba(59,130,246,0.6)]',
    icon: 'medical_services',
    headerBg: 'from-blue-950/60 to-transparent',
    dot: 'bg-blue-400',
  },
  pharmacy: {
    accent: 'text-emerald-400',
    glow: 'shadow-[0_0_24px_rgba(16,185,129,0.55)] ring-2 ring-emerald-400/30',
    badge: 'border-emerald-700 bg-emerald-950/60 text-emerald-100',
    activeBadge: 'border-emerald-400 bg-emerald-900/80 text-white shadow-[0_0_18px_rgba(16,185,129,0.6)]',
    icon: 'local_pharmacy',
    headerBg: 'from-emerald-950/60 to-transparent',
    dot: 'bg-emerald-400',
  },
  opthal: {
    accent: 'text-violet-400',
    glow: 'shadow-[0_0_24px_rgba(139,92,246,0.55)] ring-2 ring-violet-400/30',
    badge: 'border-violet-700 bg-violet-950/60 text-violet-100',
    activeBadge: 'border-violet-400 bg-violet-900/80 text-white shadow-[0_0_18px_rgba(139,92,246,0.6)]',
    icon: 'visibility',
    headerBg: 'from-violet-950/60 to-transparent',
    dot: 'bg-violet-400',
  },
};

const ACTIVE_STATUSES = new Set(['being_served', 'in_consultation', 'ready', 'called']);

function resolveTheme(columnId: string) {
  if (columnId.startsWith('doctor')) return COLUMN_THEME.doctor;
  if (columnId === 'pharmacy') return COLUMN_THEME.pharmacy;
  if (columnId === 'opthal') return COLUMN_THEME.opthal;
  return COLUMN_THEME.doctor;
}

// ── Single column card ───────────────────────────────────────────────────────
export const QueueColumn: React.FC<{ column: PublicQueueColumn; animKey: number }> = ({ column, animKey }) => {
  const theme = resolveTheme(column.id);

  const activeTokens = column.tokens.filter(t => !['completed', 'collected', 'skipped'].includes(t.status));
  const nowServing = activeTokens.find(t => ACTIVE_STATUSES.has(t.status)) ?? activeTokens[0] ?? null;
  // "Next in line" is exactly ONE patient — the one who'll be called after
  // nowServing. Everyone behind them is just "Waiting"; token 6 of 6 must
  // not share the "Next in line" label with token 2 (BUG-19).
  const upcomingTokens = nowServing
    ? activeTokens.filter(t => t !== nowServing).slice(0, 5)
    : [];
  const nextToken = upcomingTokens[0] ?? null;
  const waitingTokens = upcomingTokens.slice(1);
  const totalWaiting = activeTokens.length;

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-slate-800/70 bg-slate-900/60 backdrop-blur-md shadow-2xl h-full">
      {/* Column Header */}
      <div className={`bg-gradient-to-b ${theme.headerBg} px-5 py-4 flex items-center justify-between border-b border-slate-800/60`}>
        <div className="flex items-center gap-2.5">
          <span className={`material-symbols-outlined text-xl ${theme.accent}`}>{theme.icon}</span>
          <span className="text-base font-extrabold text-slate-100 truncate max-w-[160px]">{column.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {totalWaiting > 0 ? (
            <>
              <span className={`w-2 h-2 rounded-full animate-pulse ${theme.dot}`} />
              <span className={`text-xs font-bold ${theme.accent}`}>{totalWaiting} waiting</span>
            </>
          ) : (
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Empty</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 min-h-[260px]">
        {totalWaiting === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-3 text-center select-none">
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-slate-700">hourglass_empty</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">No Patient Tokens</p>
          </div>
        ) : (
          <>
            {/* ── Now Serving ───────────────────────────────── */}
            <div className="flex flex-col items-center gap-2 w-full">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Now Serving</p>
              {(() => {
                const isActive = nowServing && ACTIVE_STATUSES.has(nowServing.status);
                return (
                  <div
                    key={`${animKey}-now-${nowServing?.token}`}
                    className={`w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-500 select-none
                      ${isActive
                        ? `animate-pulse ${theme.activeBadge} ${theme.glow}`
                        : 'border-dashed border-slate-700 bg-slate-800/40'
                      }`}
                  >
                    <span className={`text-5xl font-black leading-none tabular-nums ${isActive ? '' : 'text-slate-500'}`}>
                      {nowServing?.token ?? '—'}
                    </span>
                    {isActive && (
                      <span className={`text-[9px] font-extrabold uppercase tracking-widest mt-1 ${theme.accent}`}>
                        Calling
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ── Next in Line — the single next patient only ── */}
            {nextToken && (
              <div className="w-full flex flex-col items-center gap-2.5 border-t border-slate-800/60 pt-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Next in Line</p>
                <div
                  className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-lg font-bold select-none transition-all ${theme.badge}`}
                >
                  {nextToken.token ?? '—'}
                </div>
              </div>
            )}

            {/* ── Waiting — everyone behind the next patient ── */}
            {waitingTokens.length > 0 && (
              <div className="w-full flex flex-col items-center gap-2.5 border-t border-slate-800/60 pt-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Waiting</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {waitingTokens.map((entry, idx) => (
                    <div
                      key={idx}
                      className="w-11 h-11 rounded-full border-2 border-slate-700 bg-slate-800/40 text-slate-400 flex items-center justify-center text-sm font-bold select-none"
                    >
                      {entry.token ?? '—'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Grid column count ────────────────────────────────────────────────────────
export const GRID: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4',
};

// ── Root component ───────────────────────────────────────────────────────────
const PublicQueueDisplay: React.FC = () => {
  const { hospitalCode } = useParams<{ hospitalCode: string }>();
  const [data, setData] = useState<PublicQueueDisplayResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [time, setTime] = useState('');
  const [animKey, setAnimKey] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Digital clock
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!hospitalCode) return;
    try {
      const result = await publicQueueService.getQueueDisplay(hospitalCode);
      setData(prev => {
        // Bump animKey only when token set actually changes (triggers CSS re-entry)
        const prevStr = JSON.stringify(prev?.columns);
        const nextStr = JSON.stringify(result.columns);
        if (prevStr !== nextStr) setAnimKey(k => k + 1);
        return result;
      });
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }, [hospitalCode]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  useEffect(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    const secs = data?.refresh_seconds || 10;
    intervalRef.current = window.setInterval(fetchQueue, secs * 1000);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [data?.refresh_seconds, fetchQueue]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center p-10 bg-slate-900 border border-slate-800 rounded-3xl max-w-md shadow-2xl">
          <span className="material-symbols-outlined text-red-500 text-6xl mb-4 block animate-pulse">error</span>
          <h2 className="text-2xl font-bold mb-2">Unavailable</h2>
          <p className="text-slate-400 text-sm">This queue display link is invalid or the hospital does not support public display.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
          <p className="text-slate-500 text-sm font-medium tracking-wider uppercase">Loading Queue…</p>
        </div>
      </div>
    );
  }

  const gridCols = GRID[Math.min(data.columns.length, 4)] || 'lg:grid-cols-4';
  const totalActive = data.columns.reduce((s, c) => s + c.tokens.filter(t => !['completed', 'collected', 'skipped'].includes(t.status)).length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0a0e1a] to-slate-950 text-white font-sans flex flex-col select-none">

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl shrink-0">
        {/* Logo + hospital name + live pill */}
        <div className="flex items-center gap-3">
          <HospitalLogo
            logoUrl={data.logo_url}
            name={data.hospital_name}
            className="w-10 h-10 rounded-xl bg-slate-800 shrink-0 border border-slate-700/50"
          />
          <div>
            <p className="text-sm font-extrabold text-slate-100 leading-tight">{data.hospital_name}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Queue Display</p>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 ml-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest">Live</span>
          </div>
        </div>

        {/* Active count + Clock */}
        <div className="flex items-center gap-4">
          {totalActive > 0 && (
            <span className="text-xs font-bold text-slate-400 hidden sm:block">
              {totalActive} active token{totalActive !== 1 ? 's' : ''}
            </span>
          )}
          <div className="font-mono text-xl font-bold tracking-widest text-slate-200 bg-slate-900/70 px-5 py-1.5 rounded-xl border border-slate-800/50 shadow-inner">
            {time}
          </div>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">

        {/* Columns grid — fills all available vertical space */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-5 flex-1 max-w-7xl mx-auto w-full`}>
          {data.columns.map(col => (
            <QueueColumn key={col.id} column={col} animKey={animKey} />
          ))}
        </div>

        {/* Footer */}
        {/* <p className="text-center text-[10px] text-slate-700 font-medium tracking-wider shrink-0">
          Auto-refreshes every {data.refresh_seconds}s &nbsp;·&nbsp; {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p> */}
      </main>
    </div>
  );
};

export default PublicQueueDisplay;
