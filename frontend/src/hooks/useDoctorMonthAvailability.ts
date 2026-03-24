import { useEffect, useState } from 'react';
import scheduleService from '../services/scheduleService';
import { formatLocalDateISO } from '../utils/calendarDate';

interface UseDoctorMonthAvailabilityArgs {
  doctorId: string | null | undefined;
  monthKey: string;
  minDateISO: string;
  enabled?: boolean;
}

export function useDoctorMonthAvailability({
  doctorId,
  monthKey,
  minDateISO,
  enabled = true,
}: UseDoctorMonthAvailabilityArgs) {
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !doctorId) {
      setAvailabilityMap({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadAvailability = async () => {
      setLoading(true);
      try {
        const [year, month] = monthKey.split('-').map(Number);
        if (!year || !month) {
          setAvailabilityMap({});
          return;
        }

        const daysInMonth = new Date(year, month, 0).getDate();
        const datesToCheck: string[] = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const iso = formatLocalDateISO(new Date(year, month - 1, day));
          if (iso >= minDateISO) datesToCheck.push(iso);
        }

        const results = await Promise.all(
          datesToCheck.map(async (dateIso) => {
            try {
              const slots = await scheduleService.getAvailableSlots(doctorId, dateIso);
              const hasAvailable = Array.isArray(slots.slots) && slots.slots.some((s) => s.available);
              return [dateIso, hasAvailable] as const;
            } catch {
              return [dateIso, false] as const;
            }
          }),
        );

        if (cancelled) return;

        const nextMap: Record<string, boolean> = {};
        results.forEach(([dateIso, hasAvailable]) => {
          nextMap[dateIso] = hasAvailable;
        });

        setAvailabilityMap(nextMap);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [doctorId, monthKey, minDateISO, enabled]);

  const reset = () => {
    setAvailabilityMap({});
    setLoading(false);
  };

  return {
    availabilityMap,
    loading,
    reset,
  };
}
