import type { PaymentStatusBucket } from '../types/billing';

// BRD-001 "Paid Status Enhancement" — the 3 client-facing payment states,
// derived server-side from Invoice.status (see backend/app/core/billing_status.py).
// Single shared source for label/color so this doesn't get copy-pasted the
// way the underlying InvoiceStatus STATUS_COLORS/STATUS_LABELS maps already
// are between InvoiceList.tsx and InvoiceDetail.tsx.

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusBucket, string> = {
  not_paid: 'Not Paid',
  partially_paid: 'Partially Paid',
  paid: 'Completely Paid',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatusBucket, string> = {
  not_paid: 'bg-red-100 text-red-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
};

export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatusBucket; label: string }[] = [
  { value: 'not_paid', label: PAYMENT_STATUS_LABELS.not_paid },
  { value: 'partially_paid', label: PAYMENT_STATUS_LABELS.partially_paid },
  { value: 'paid', label: PAYMENT_STATUS_LABELS.paid },
];
