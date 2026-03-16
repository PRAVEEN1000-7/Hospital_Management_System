import api from './api';
import type { UserData, UserCreateData, UserUpdateData, PasswordResetData } from '../types/user';
import type { PaginatedResponse } from '../types/patient';

export const userService = {
  async getUsers(
    page = 1, limit = 10, search = '',
    role?: string, isActive?: boolean,
  ): Promise<PaginatedResponse<UserData>> {
    const params: Record<string, string | number | boolean> = { page, limit };
    if (search) params.search = search;
    if (role) params.role = role;
    if (isActive !== undefined) params.is_active = isActive;
    const response = await api.get<PaginatedResponse<UserData>>('/users', { params });
    return response.data;
  },

  async getUser(id: string): Promise<UserData> {
    const response = await api.get<UserData>(`/users/${id}`);
    return response.data;
  },

  async createUser(data: UserCreateData, sendEmail = true): Promise<UserData> {
    const response = await api.post<UserData>(`/users?send_email=${sendEmail}`, data);
    return response.data;
  },

  async checkUsername(username: string): Promise<{ exists: boolean }> {
    const response = await api.get<{ exists: boolean }>(`/users/check-username/${encodeURIComponent(username)}`);
    return response.data;
  },

  async updateUser(id: string, data: UserUpdateData): Promise<UserData> {
    const response = await api.put<UserData>(`/users/${id}`, data);
    return response.data;
  },

  async deleteUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async uploadPhoto(id: string, file: File): Promise<{ message: string; avatar_url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/users/${id}/upload-photo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async uploadMyPhoto(file: File): Promise<{ message: string; avatar_url: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/users/me/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async resetPassword(id: string, data: PasswordResetData, sendEmail = false): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/reset-password?send_email=${sendEmail}`, data);
    return response.data;
  },

  async sendPassword(id: string, data: PasswordResetData): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/send-password`, data);
    return response.data;
  },

  getPhotoUrl(photoUrl: string | null): string | null {
    if (!photoUrl) return null;
    // If already a full URL, return as is
    if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
      return photoUrl;
    }
    // For relative URLs starting with /uploads, use the API base URL
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace('/api/v1', '');
    // Remove leading slash if present to avoid double slashes
    const photoPath = photoUrl.startsWith('/') ? photoUrl.substring(1) : photoUrl;
    // Use a static cache-busting timestamp (session-based) to allow browser caching
    // This prevents the image from being requested on every render while still allowing cache invalidation on page reload
    const timestamp = sessionStorage.getItem('photo_cache_timestamp');
    if (!timestamp) {
      sessionStorage.setItem('photo_cache_timestamp', Date.now().toString());
    }
    return `${baseUrl}/${photoPath}?t=${sessionStorage.getItem('photo_cache_timestamp')}`;
  },
};

export default userService;
