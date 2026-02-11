import api from './api';
import {
  UserData,
  UserCreateData,
  UserUpdateData,
  PasswordResetData,
  UserListResponse,
} from '../types/user';

export const userService = {
  async listUsers(
    page = 1,
    limit = 10,
    search?: string
  ): Promise<UserListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) params.append('search', search);
    const response = await api.get<UserListResponse>(
      `/users?${params.toString()}`
    );
    return response.data;
  },

  async getUser(id: number): Promise<UserData> {
    const response = await api.get<UserData>(`/users/${id}`);
    return response.data;
  },

  async createUser(
    user: UserCreateData,
    sendEmail = false
  ): Promise<UserData> {
    const response = await api.post<UserData>(
      `/users?send_email=${sendEmail}`,
      user
    );
    return response.data;
  },

  async updateUser(id: number, user: UserUpdateData): Promise<UserData> {
    const response = await api.put<UserData>(`/users/${id}`, user);
    return response.data;
  },

  async deleteUser(id: number): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async resetPassword(
    id: number,
    data: PasswordResetData,
    sendEmail = false
  ): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(
      `/users/${id}/reset-password?send_email=${sendEmail}`,
      data
    );
    return response.data;
  },

  async sendPassword(
    id: number,
    data: PasswordResetData
  ): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/send-password`, data);
    return response.data;
  },
};
