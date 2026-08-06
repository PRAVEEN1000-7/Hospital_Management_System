import api from './api';

export type AllowanceType = 'in_hand' | 'added_to_salary';

export interface Allowance {
  id: string;
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  year: number;
  month: number;
  amount: number;
  reason: string;
  allowance_type: AllowanceType;
  created_at: string | null;
}

const allowanceService = {
  list: (year: number, month: number, userId?: string) =>
    api
      .get<Allowance[]>('/allowances', { params: { year, month, user_id: userId || undefined } })
      .then(res => res.data),

  create: (data: {
    user_id: string;
    year: number;
    month: number;
    amount: number;
    reason: string;
    allowance_type: AllowanceType;
  }) => api.post<Allowance>('/allowances', data).then(res => res.data),

  delete: (id: string) => api.delete(`/allowances/${id}`),
};

export default allowanceService;
