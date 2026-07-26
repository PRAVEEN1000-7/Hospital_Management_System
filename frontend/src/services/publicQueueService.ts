import api from './api';

export interface PublicQueueToken {
  // string when a BRD-005 screen's token_format template has been applied
  // client-side (e.g. "#{n}" -> "#12"); plain number on the legacy display.
  token: number | string | null;
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
  // BRD-005 — only meaningful for the per-screen endpoint.
  configured?: boolean;
  display_name?: string;
  token_format?: string;
}

/** Unauthenticated public Queue Display — see backend/app/routers/public_queue.py. */
const publicQueueService = {
  async getQueueDisplay(hospitalCode: string): Promise<PublicQueueDisplayResponse> {
    const res = await api.get<PublicQueueDisplayResponse>(`/public/queue-display/${hospitalCode}`);
    return res.data;
  },

  /** BRD-005 — named-screen variant. */
  async getScreenDisplay(hospitalCode: string, screenSlug: string): Promise<PublicQueueDisplayResponse> {
    const res = await api.get<PublicQueueDisplayResponse>(`/public/queue-display/${hospitalCode}/${screenSlug}`);
    return res.data;
  },
};

export default publicQueueService;
