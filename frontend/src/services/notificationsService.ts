import api from './api';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  reference_type?: string | null;
  reference_id?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  data: AppNotification[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  unread_count: number;
}

const notificationsService = {
  async getNotifications(page = 1, limit = 15, unreadOnly = false): Promise<NotificationListResponse> {
    const res = await api.get<NotificationListResponse>('/notifications', {
      params: { page, limit, unread_only: unreadOnly },
    });
    return res.data;
  },

  async markRead(id: string): Promise<AppNotification> {
    const res = await api.put<AppNotification>(`/notifications/${id}/read`);
    return res.data;
  },

  async markAllRead(): Promise<void> {
    await api.put('/notifications/read-all');
  },
};

export default notificationsService;
