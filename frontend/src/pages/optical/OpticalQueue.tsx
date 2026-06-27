import React, { useState, useEffect, useCallback } from 'react';
import opticalService from '../../services/opticalService';
import { useToast } from '../../contexts/ToastContext';
import DispensingQueueBoard, { type DispensingQueueStatus } from '../../components/common/DispensingQueueBoard';

const POLL_INTERVAL_MS = 15000;

const OpticalQueue: React.FC = () => {
  const toast = useToast();
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof opticalService.getQueue>>>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await opticalService.getQueue();
      setEntries(data);
    } catch {
      toast.error('Failed to load optical queue');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = window.setInterval(fetchQueue, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchQueue]);

  const handleAdvance = async (id: string, nextStatus: DispensingQueueStatus) => {
    setAdvancing(id);
    try {
      await opticalService.updateQueueStatus(id, nextStatus);
      await fetchQueue();
    } catch {
      toast.error('Failed to update queue status');
    } finally {
      setAdvancing(null);
    }
  };

  return (
    <DispensingQueueBoard
      title="Optical Dispensing Queue"
      entries={entries}
      loading={loading}
      advancing={advancing}
      onAdvance={handleAdvance}
    />
  );
};

export default OpticalQueue;
