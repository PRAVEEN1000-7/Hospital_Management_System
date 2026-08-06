import api from './api';

export interface AdvancePayment {
  id: string;
  user_id: string;
  reference_number: string | null;
  first_name: string;
  last_name: string;
  amount: number;
  installments: number;
  emi_amount: number;
  start_year: number;
  start_month: number;
  reason: string;
  created_at: string | null;
  // Computed live as of today — see backend advance_payment_service.get_status.
  repaid_amount: number;
  remaining_amount: number;
  is_completed: boolean;
}

const advancePaymentService = {
  list: (userId?: string) =>
    api.get<AdvancePayment[]>('/advance-payments', { params: { user_id: userId || undefined } }).then(res => res.data),

  create: (data: { user_id: string; amount: number; installments: number; start_year: number; start_month: number; reason: string }) =>
    api.post<AdvancePayment>('/advance-payments', data).then(res => res.data),

  delete: (id: string) => api.delete(`/advance-payments/${id}`),
};

export default advancePaymentService;
