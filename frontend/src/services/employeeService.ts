import api from './api';
import type {
  EmployeeProfile,
  EmployeeProfileCreateData,
  EmployeeProfileUpdateData,
  EmployeeSalary,
  EmployeeSalaryCreateData,
} from '../types/employee';

interface EmployeeProfileListResponse {
  total: number;
  data: EmployeeProfile[];
}

const employeeService = {
  async list(): Promise<EmployeeProfile[]> {
    const res = await api.get<EmployeeProfileListResponse>('/employees');
    return res.data.data;
  },

  async getByUserId(userId: string): Promise<EmployeeProfile | null> {
    try {
      const res = await api.get<EmployeeProfile>(`/employees/by-user/${userId}`);
      return res.data;
    } catch {
      return null;
    }
  },

  async create(data: EmployeeProfileCreateData): Promise<EmployeeProfile> {
    const res = await api.post<EmployeeProfile>('/employees', data);
    return res.data;
  },

  async update(profileId: string, data: EmployeeProfileUpdateData): Promise<EmployeeProfile> {
    const res = await api.put<EmployeeProfile>(`/employees/${profileId}`, data);
    return res.data;
  },

  async getSalaryHistory(employeeUserId: string): Promise<EmployeeSalary[]> {
    const res = await api.get<EmployeeSalary[]>(`/employees/${employeeUserId}/salary`);
    return res.data;
  },

  async addSalaryRevision(employeeUserId: string, data: EmployeeSalaryCreateData): Promise<EmployeeSalary> {
    const res = await api.post<EmployeeSalary>(`/employees/${employeeUserId}/salary`, data);
    return res.data;
  },
};

export default employeeService;
