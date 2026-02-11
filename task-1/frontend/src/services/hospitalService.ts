import api from './api';
import { Hospital, HospitalCreate, HospitalUpdate, HospitalStatus, HospitalLogoUpload } from '../types/hospital';

export const hospitalService = {
  // Check if hospital is configured
  checkStatus: async (): Promise<HospitalStatus> => {
    const response = await api.get('/hospital/status');
    return response.data;
  },

  // Get hospital details (public info)
  getHospital: async (): Promise<Hospital> => {
    const response = await api.get('/hospital');
    return response.data;
  },

  // Get full hospital details (super_admin only)
  getHospitalFull: async (): Promise<Hospital> => {
    const response = await api.get('/hospital/full');
    return response.data;
  },

  // Create hospital (one-time setup, super_admin only)
  createHospital: async (data: HospitalCreate): Promise<Hospital> => {
    const response = await api.post('/hospital', data);
    return response.data;
  },

  // Update hospital (super_admin only)
  updateHospital: async (data: HospitalUpdate): Promise<Hospital> => {
    const response = await api.put('/hospital', data);
    return response.data;
  },

  // Upload hospital logo (super_admin only)
  uploadLogo: async (file: File): Promise<HospitalLogoUpload> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/hospital/logo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get hospital logo URL
  getLogoUrl: (): string => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    return `${apiBaseUrl}/hospital/logo`;
  },

  // Delete hospital logo (super_admin only)
  deleteLogo: async (): Promise<{ message: string }> => {
    const response = await api.delete('/hospital/logo');
    return response.data;
  },
};
