import api from './api';

export interface Incentive {
  id: string;
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  year: number;
  month: number;
  sales_amount: number;
  incentive_percent: number;
  incentive_amount: number;
  created_at: string | null;
}

const incentiveService = {
  list: (year: number, month: number, userId?: string) =>
    api
      .get<Incentive[]>('/incentives', { params: { year, month, user_id: userId || undefined } })
      .then(res => res.data),

  create: (data: { user_id: string; year: number; month: number; sales_amount: number; incentive_percent: number }) =>
    api.post<Incentive>('/incentives', data).then(res => res.data),

  delete: (id: string) => api.delete(`/incentives/${id}`),
};

export default incentiveService;
