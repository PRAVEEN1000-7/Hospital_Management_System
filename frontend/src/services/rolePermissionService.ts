import api from './api';
import type {
  EffectiveMatrixResponse,
  MatrixUpdateResponse,
  PermissionOverrideChange,
} from '../types/rolePermissions';

/** Roles & Permissions admin UI — per-hospital effective RBAC matrix. */
const rolePermissionService = {
  async getMatrix(): Promise<EffectiveMatrixResponse> {
    const response = await api.get<EffectiveMatrixResponse>('/roles-permissions/matrix');
    return response.data;
  },

  async updateMatrix(changes: PermissionOverrideChange[]): Promise<MatrixUpdateResponse> {
    const response = await api.put<MatrixUpdateResponse>('/roles-permissions/matrix', { changes });
    return response.data;
  },

  async resetCell(key: string, role: string): Promise<void> {
    await api.post('/roles-permissions/reset', { key, role });
  },

  async resetCategory(category: string): Promise<{ removed: number }> {
    const response = await api.post<{ removed: number }>('/roles-permissions/reset-category', { category });
    return response.data;
  },

  async resetAll(): Promise<{ removed: number }> {
    const response = await api.post<{ removed: number }>('/roles-permissions/reset-all');
    return response.data;
  },
};

export default rolePermissionService;
