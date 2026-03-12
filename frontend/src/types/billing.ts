// ─────────────────────────────────────────────────────────────────────────────
// Billing & Invoice — TypeScript type definitions
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceType = 'opd' | 'pharmacy' | 'optical' | 'combined';
export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

export type InvoiceItemType =
  | 'consultation'
  | 'medicine'
  | 'optical_product'
  | 'service'
  | 'procedure'
  | 'registration';

export type PaymentMode =
  | 'cash'
  | 'card'
  | 'debit_card'
  | 'credit_card'
  | 'upi'
  | 'wallet'
  | 'bank_transfer'
  | 'online'
  | 'cheque'
  | 'insurance';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export type RefundReasonCode =
  | 'service_not_provided'
  | 'billing_error'
  | 'patient_request'
  | 'duplicate'
  | 'other';

export type RefundStatus = 'pending' | 'approved' | 'processed' | 'rejected';
export type SettlementStatus = 'open' | 'closed' | 'verified';

// ─── Tax Configuration ──────────────────────────────────────────────────────

export interface TaxConfig {
  id: string;
  hospital_id: string;
  name: string;
  code: string;
  rate_percentage: number;
  applies_to: 'product' | 'service' | 'both';
  category?: string;
  is_compound: boolean;
  is_active: boolean;
  effective_from: string;
  effective_to?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxConfigCreateData {
  name: string;
  code: string;
  rate_percentage: number;
  applies_to: 'product' | 'service' | 'both';
  category?: string;
  is_compound?: boolean;
  effective_from: string;
  effective_to?: string;
}

// ─── Invoice Item ────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_type: InvoiceItemType;
  reference_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_config_id?: string;
  tax_rate: number;
  tax_amount: number;
  total_price: number;
  display_order: number;
  batch_number?: string;
  created_at: string;
}

export interface InvoiceItemCreateData {
  item_type: InvoiceItemType;
  reference_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_config_id?: string;
  tax_rate?: number;
  display_order?: number;
  batch_number?: string;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  hospital_id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  appointment_id?: string;
  invoice_type: InvoiceType;
  invoice_date: string;
  due_date?: string;
  subtotal: number;
  discount_amount: number;
  discount_reason?: string;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  currency: string;
  status: InvoiceStatus;
  notes?: string;
  items: InvoiceItem[];
  created_at: string;
  updated_at: string;
}

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  invoice_type: InvoiceType;
  invoice_date: string;
  due_date?: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: InvoiceStatus;
  created_at: string;
}

export interface InvoiceCreateData {
  patient_id: string;
  appointment_id?: string;
  invoice_type: InvoiceType;
  invoice_date?: string;
  due_date?: string;
  discount_amount?: number;
  discount_reason?: string;
  currency?: string;
  notes?: string;
  items?: InvoiceItemCreateData[];
}

export interface InvoiceUpdateData {
  appointment_id?: string;
  due_date?: string;
  discount_amount?: number;
  discount_reason?: string;
  notes?: string;
}

// ─── Payment ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  hospital_id: string;
  payment_number: string;
  invoice_id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  currency: string;
  payment_mode: PaymentMode;
  payment_reference?: string;
  payment_date: string;
  payment_time?: string;
  status: PaymentStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentListItem {
  id: string;
  payment_number: string;
  invoice_id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  payment_mode: PaymentMode;
  payment_reference?: string;
  payment_date: string;
  status: PaymentStatus;
  created_at: string;
}

export interface PaymentCreateData {
  invoice_id: string;
  patient_id: string;
  amount: number;
  payment_mode: PaymentMode;
  payment_reference?: string;
  payment_date?: string;
  notes?: string;
}

// ─── Refund ──────────────────────────────────────────────────────────────────

export interface Refund {
  id: string;
  hospital_id: string;
  refund_number: string;
  invoice_id: string;
  invoice_number: string;
  payment_id: string;
  payment_number: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  reason_code: RefundReasonCode;
  reason_detail?: string;
  status: RefundStatus;
  refund_mode?: string;
  refund_reference?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RefundListItem {
  id: string;
  refund_number: string;
  invoice_id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  reason_code: RefundReasonCode;
  reason_detail?: string;
  status: RefundStatus;
  created_at: string;
}

export interface RefundCreateData {
  invoice_id: string;
  payment_id: string;
  patient_id: string;
  amount: number;
  reason_code: RefundReasonCode;
  reason_detail?: string;
  refund_mode?: string;
}

export interface RefundProcessData {
  refund_mode: string;
  refund_reference?: string;
}

// ─── Daily Settlement ────────────────────────────────────────────────────────

export interface Settlement {
  id: string;
  hospital_id: string;
  settlement_date: string;
  cashier_user_id: string;
  cashier_name: string;
  total_cash: number;
  total_card: number;
  total_online: number;
  total_other: number;
  total_collected: number;
  total_refunds: number;
  net_amount: number;
  status: SettlementStatus;
  verified_by?: string;
  notes?: string;
  created_at: string;
}

export interface SettlementListItem {
  id: string;
  settlement_date: string;
  cashier_name: string;
  total_collected: number;
  total_refunds: number;
  net_amount: number;
  status: SettlementStatus;
  created_at: string;
}

export interface SettlementCreateData {
  settlement_date?: string;
  notes?: string;
}

// ─── Paginated Response ───────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Future Scope — Insurance ────────────────────────────────────────────────
// NOTE: These types are stubs for the Insurance & Credit Note module (Phase 3.2).
// The DB tables already exist. Full implementation is tracked in I&b_Future_Scope.md.

export interface InsuranceProvider {
  id: string;
  hospital_id: string;
  name: string;
  code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

export interface InsurancePolicy {
  id: string;
  patient_id: string;
  provider_id: string;
  policy_number: string;
  group_number?: string;
  member_id?: string;
  plan_name?: string;
  coverage_type?: string;
  coverage_amount?: number;
  deductible?: number;
  copay_percent?: number;
  effective_from: string;
  effective_to?: string;
  is_primary: boolean;
  status: string;
}

export interface InsuranceClaim {
  id: string;
  hospital_id: string;
  claim_number: string;
  patient_id: string;
  policy_id: string;
  invoice_id?: string;
  claim_amount: number;
  approved_amount?: number;
  status: string;
  submission_date?: string;
  response_date?: string;
  rejection_reason?: string;
  notes?: string;
  created_at: string;
}

export interface CreditNote {
  id: string;
  hospital_id: string;
  credit_note_number: string;
  invoice_id: string;
  patient_id: string;
  amount: number;
  reason: string;
  status: string;
  applied_to_invoice_id?: string;
  valid_until?: string;
  created_at: string;
}
