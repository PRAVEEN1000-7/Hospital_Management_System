import api from './api';
import type { QueueDisplayScreen, QueueDisplayScreenCreateData, QueueDisplayScreenUpdateData } from '../types/queueScreen';

// BRD-005 — multi-screen Queue Display configuration (admin-only CRUD).
const queueScreenService = {
  async list(): Promise<QueueDisplayScreen[]> {
    const response = await api.get<QueueDisplayScreen[]>('/queue-screens');
    return response.data;
  },

  async create(data: QueueDisplayScreenCreateData): Promise<QueueDisplayScreen> {
    const response = await api.post<QueueDisplayScreen>('/queue-screens', data);
    return response.data;
  },

  async update(id: string, data: QueueDisplayScreenUpdateData): Promise<QueueDisplayScreen> {
    const response = await api.put<QueueDisplayScreen>(`/queue-screens/${id}`, data);
    return response.data;
  },

  async deactivate(id: string): Promise<void> {
    await api.delete(`/queue-screens/${id}`);
  },
};

export default queueScreenService;
