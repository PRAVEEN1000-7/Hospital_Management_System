import api from './api';
import type { UserData, UserCreateData, UserUpdateData, PasswordResetData } from '../types/user';
import type { PaginatedResponse } from '../types/patient';

export const userService = {
  async getUsers(page = 1, limit = 10, search = ''): Promise<PaginatedResponse<UserData>> {
    const params: Record<string, string | number> = { page, limit };
    if (search) params.search = search;
    const response = await api.get<PaginatedResponse<UserData>>('/users', { params });
    return response.data;
  },

  async getUser(id: number): Promise<UserData> {
    const response = await api.get<UserData>(`/users/${id}`);
    return response.data;
  },

  async createUser(data: UserCreateData, sendEmail = true): Promise<UserData> {
    const response = await api.post<UserData>(`/users?send_email=${sendEmail}`, data);
    return response.data;
  },

  async updateUser(id: number, data: UserUpdateData): Promise<UserData> {
    const response = await api.put<UserData>(`/users/${id}`, data);
    return response.data;
  },

  async deleteUser(id: number): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async resetPassword(id: number, data: PasswordResetData, sendEmail = false): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/reset-password?send_email=${sendEmail}`, data);
    return response.data;
  },

  async sendPassword(id: number, data: PasswordResetData): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/send-password`, data);
    return response.data;
  },
};

export default userService;
