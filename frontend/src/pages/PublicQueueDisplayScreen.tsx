import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import publicQueueService, { type PublicQueueDisplayResponse } from '../services/publicQueueService';
import HospitalLogo from '../components/common/HospitalLogo';
import { QueueColumn, GRID } from './PublicQueueDisplay';

/** BRD-005 — named-screen variant of the public queue display
 * (/public/queue/:hospitalCode/:screenSlug). Reuses PublicQueueDisplay.tsx's
 * QueueColumn/GRID exports for identical visuals; adds the "not configured
 * yet" state and applies the screen's token_format template client-side. */
const PublicQueueDisplayScreen: React.FC = () => {
  const { hospitalCode, screenSlug } = useParams<{ hospitalCode: string; screenSlug: string }>();
  const [data, setData] = useState<PublicQueueDisplayResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [time, setTime] = useState('');
  const [animKey, setAnimKey] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Digital clock — rendered in the hospital's configured timezone (from the
  // API response), not the kiosk device's own OS timezone. This page has no
  // logged-in user/AuthContext to source a timezone from otherwise.
  useEffect(() => {
    const tz = data?.timezone;
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        ...(tz ? { timeZone: tz } : {}),
      }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.timezone]);

  const fetchQueue = useCallback(async () => {
    if (!hospitalCode || !screenSlug) return;
    try {
      const result = await publicQueueService.getScreenDisplay(hospitalCode, screenSlug);
      // Apply the screen's display template ("#{n}" etc.) to every token
      // client-side — the API always returns raw numbers.
      const formatted: PublicQueueDisplayResponse = {
        ...result,
        columns: result.columns.map(col => ({
          ...col,
          tokens: col.tokens.map(t => ({
            ...t,
            token: t.token != null && result.token_format
              ? result.token_format.replace('{n}', String(t.token))
              : t.token,
          })),
        })),
      };
      setData(prev => {
        const prevStr = JSON.stringify(prev?.columns);
        const nextStr = JSON.stringify(formatted.columns);
        if (prevStr !== nextStr) setAnimKey(k => k + 1);
        return formatted;
      });
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }, [hospitalCode, screenSlug]);

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
          <p className="text-slate-400 text-sm">This queue display link is invalid.</p>
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

  // BRD-005 — "enabled only after configuration" / "validation for
  // incomplete setup": show a friendly message instead of live tokens.
  if (data.configured === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center p-10 bg-slate-900 border border-amber-900/40 rounded-3xl max-w-md shadow-2xl">
          <span className="material-symbols-outlined text-amber-500 text-6xl mb-4 block">construction</span>
          <h2 className="text-2xl font-bold mb-2">{data.display_name || 'This Display'}</h2>
          <p className="text-slate-400 text-sm">
            This queue display screen hasn't been fully configured yet. An admin needs to set its
            Display Name, Department, Doctor, and Token Format before it goes live.
          </p>
        </div>
      </div>
    );
  }

  const gridCols = GRID[Math.min(data.columns.length, 4)] || 'lg:grid-cols-4';
  const totalActive = data.columns.reduce((s, c) => s + c.tokens.filter(t => !['completed', 'collected', 'skipped'].includes(t.status)).length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0a0e1a] to-slate-950 text-white font-sans flex flex-col select-none">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <HospitalLogo
            logoUrl={data.logo_url}
            name={data.hospital_name}
            className="w-10 h-10 rounded-xl bg-slate-800 shrink-0 border border-slate-700/50"
          />
          <div>
            <p className="text-sm font-extrabold text-slate-100 leading-tight">{data.display_name || data.hospital_name}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{data.hospital_name}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 ml-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest">Live</span>
          </div>
        </div>

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

      <main className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
        <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-5 flex-1 w-full`}>
          {data.columns.map(col => (
            <QueueColumn key={col.id} column={col} animKey={animKey} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default PublicQueueDisplayScreen;
