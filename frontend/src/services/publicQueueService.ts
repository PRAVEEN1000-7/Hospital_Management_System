import api from './api';

export interface PublicQueueToken {
  token: number | null;
  status: string;
}

export interface PublicQueueColumn {
  id: string;
  name: string;
  tokens: PublicQueueToken[];
}

export interface PublicQueueDisplayResponse {
  hospital_name: string;
  logo_url?: string;
  refresh_seconds: number;
  columns: PublicQueueColumn[];
}

/** Unauthenticated public Queue Display — see backend/app/routers/public_queue.py. */
const publicQueueService = {
  async getQueueDisplay(hospitalCode: string): Promise<PublicQueueDisplayResponse> {
    const res = await api.get<PublicQueueDisplayResponse>(`/public/queue-display/${hospitalCode}`);
    return res.data;
  },
};

export default publicQueueService;
