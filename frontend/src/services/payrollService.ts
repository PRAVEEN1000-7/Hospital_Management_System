import api from './api';
import type { PayrollRun, PayrollRunGenerateData, Payslip } from '../types/payroll';

interface PayrollRunListResponse {
  total: number;
  data: PayrollRun[];
}

interface PayslipListResponse {
  total: number;
  data: Payslip[];
}

const payrollService = {
  async listRuns(): Promise<PayrollRun[]> {
    const res = await api.get<PayrollRunListResponse>('/payroll/runs');
    return res.data.data;
  },

  async generateRun(data: PayrollRunGenerateData): Promise<PayrollRun> {
    const res = await api.post<PayrollRun>('/payroll/runs', data);
    return res.data;
  },

  async getRunPayslips(runId: string): Promise<Payslip[]> {
    const res = await api.get<PayslipListResponse>(`/payroll/runs/${runId}/payslips`);
    return res.data.data;
  },

  async getPayslip(payslipId: string): Promise<Payslip> {
    const res = await api.get<Payslip>(`/payslips/${payslipId}`);
    return res.data;
  },

  async getPayslipPrintHtml(payslipId: string): Promise<string> {
    const res = await api.get(`/payslips/${payslipId}/print`, { responseType: 'text' });
    return res.data;
  },
};

export default payrollService;
