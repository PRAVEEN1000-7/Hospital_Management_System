import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import publicQueueService, { type PublicQueueDisplayResponse } from '../services/publicQueueService';

const STATUS_COLOR: Record<string, string> = {
  waiting: 'bg-slate-100 text-slate-700',
  being_served: 'bg-blue-100 text-blue-700',
  in_consultation: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  collected: 'bg-gray-100 text-gray-500',
  completed: 'bg-gray-100 text-gray-500',
};

const GRID_COLS_CLASS: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4',
};

/**
 * Public, unauthenticated kiosk screen for one hospital's queue (BRD v1.1 §3).
 * Intentionally bare — no sidebar, no login, no patient names. Just the
 * hospital name and the live token numbers per counter.
 */
const PublicQueueDisplay: React.FC = () => {
  const { hospitalCode } = useParams<{ hospitalCode: string }>();
  const [data, setData] = useState<PublicQueueDisplayResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchQueue = useCallback(async () => {
    if (!hospitalCode) return;
    try {
      const result = await publicQueueService.getQueueDisplay(hospitalCode);
      setData(result);
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }, [hospitalCode]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Re-arm the poll interval whenever the server-reported refresh rate changes.
  useEffect(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    const seconds = data?.refresh_seconds || 10;
    intervalRef.current = window.setInterval(fetchQueue, seconds * 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [data?.refresh_seconds, fetchQueue]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="text-xl">Queue display not available.</p>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  const gridColsClass = GRID_COLS_CLASS[data.columns.length] || 'lg:grid-cols-4';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <h1 className="text-5xl font-bold text-center mb-10">{data.hospital_name}</h1>

      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridColsClass} gap-6`}>
        {data.columns.map(column => (
          <div key={column.id} className="bg-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-primary/80 px-4 py-3 text-center">
              <h2 className="text-2xl font-semibold">{column.name}</h2>
            </div>
            <div className="p-5 grid grid-cols-3 gap-3 min-h-[200px]">
              {column.tokens.length === 0 ? (
                <p className="col-span-3 text-center text-slate-400 py-10">—</p>
              ) : (
                column.tokens.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl py-4 text-center text-3xl font-bold ${
                      STATUS_COLOR[entry.status] || 'bg-slate-700 text-white'
                    }`}
                  >
                    {entry.token ?? '—'}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PublicQueueDisplay;
