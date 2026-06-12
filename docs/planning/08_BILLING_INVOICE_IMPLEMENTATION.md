# HMS — Billing & Invoice Module Implementation Plan

**Author**: Engineering Team  
**Date**: 2026-03-07  
**Branch**: `billing_invoice_sakthivel`  
**Status**: 🟢 Implemented and hardened through workflow audit  
**Module**: Phase 3 — Billing & Invoice  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Scope](#2-scope)
3. [Database Schema (Already Exists)](#3-database-schema-already-exists)
4. [API Endpoints](#4-api-endpoints)
5. [Backend File Changes](#5-backend-file-changes)
6. [Frontend File Changes](#6-frontend-file-changes)
7. [Role & Permission Matrix](#7-role--permission-matrix)
8. [Business Logic Rules](#8-business-logic-rules)
9. [Number Generation Conventions](#9-number-generation-conventions)
10. [Implementation Checklist](#10-implementation-checklist)
11. [Testing Guidelines](#11-testing-guidelines)

---

## 1. Overview

The Billing & Invoice module handles the complete financial lifecycle of patient visits:

```
Patient Visit
    → Appointment / Walk-in
    → Consultation Done
    → Invoice Created (draft)
    → Line items added (consultation, medicines, services)
    → Tax calculated
    → Invoice issued to patient
    → Patient pays (cash / card / UPI / insurance)
    → Payment recorded
    → Invoice marked paid
    → Refund if needed (approval workflow)
    → Daily settlement by cashier at end of day
```

---

## 2. Scope

### ✅ In Scope (This Implementation)

| Feature | Description |
|---------|-------------|
| **Invoice CRUD** | Create, read, update, void, issue invoices |
| **Invoice Items** | Add/remove line items (consultation, medicine, service) |
| **Tax Calculation** | Auto-apply tax configs to invoice items |
| **Payments** | Record payments (cash, UPI, debit card, credit card) |
| **Refunds** | Request → Approve → Process workflow |
| **Daily Settlements** | Cashier end-of-day close and verify |
| **Tax Configurations** | CRUD for tax rules per hospital |
| **Invoice PDF Print** | Print-friendly invoice view |

### ❌ Out of Scope (Future Phases)

- Insurance claims & pre-authorization (separate module)
- Credit notes (Phase 3.2)
- Payment gateway integration (online payments)
- Automated dunning / overdue reminders
- GST filing / tax reports

---

## 3. Database Schema (Already Exists)

The following tables are **already defined** in `database_hole/01_schema.sql`. No schema changes needed.

### Tables Used

| Table | Purpose |
|-------|---------|
| `invoices` | Master invoice record |
| `invoice_items` | Line items per invoice |
| `payments` | Payment transactions |
| `refunds` | Refund requests and approvals |
| `credit_notes` | Credit note issuance (not in v1 UI) |
| `daily_settlements` | Cashier end-of-day settlements |
| `tax_configurations` | Hospital-specific tax rules |

### Key Business Enums (from Schema)

```
invoice.status:        draft | issued | partially_paid | paid | overdue | cancelled | void
invoice.invoice_type:  opd | pharmacy | optical | combined
invoice_item.item_type: consultation | medicine | optical_product | service | procedure
payment.payment_mode:  cash | upi | debit_card | credit_card
payment.status:        pending | completed | failed | reversed
refund.status:         pending | approved | processed | rejected
refund.reason_code:    service_not_provided | billing_error | patient_request | duplicate | other
daily_settlement.status: open | closed | verified
```

---

## 4. API Endpoints

All endpoints are under `/api/v1`. All require JWT `Authorization: Bearer <token>`.

### 4.1 Invoices — `/invoices`

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| `POST` | `/invoices` | Create draft invoice | admin, super_admin, cashier |
| `GET` | `/invoices` | List invoices (paginated + filters) | admin, super_admin, cashier |
| `GET` | `/invoices/{id}` | Get invoice with line items & payments | admin, super_admin, cashier, doctor |
| `PUT` | `/invoices/{id}` | Update draft invoice header | admin, super_admin, cashier |
| `PATCH` | `/invoices/{id}/issue` | Issue invoice (draft → issued) | admin, super_admin, cashier |
| `PATCH` | `/invoices/{id}/void` | Void invoice | admin, super_admin |
| `POST` | `/invoices/{id}/items` | Add line item to invoice | admin, super_admin, cashier |
| `DELETE` | `/invoices/{id}/items/{item_id}` | Remove line item | admin, super_admin, cashier |
| `GET` | `/invoices/patient/{patient_id}` | Get all invoices for a patient | admin, super_admin, cashier, doctor |

### 4.2 Payments — `/payments`

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| `POST` | `/payments` | Record payment against invoice | admin, super_admin, cashier |
| `GET` | `/payments` | List all payments (paginated) | admin, super_admin, cashier |
| `GET` | `/payments/{id}` | Get payment details | admin, super_admin, cashier |
| `GET` | `/payments/invoice/{invoice_id}` | Payments for specific invoice | admin, super_admin, cashier |

### 4.3 Refunds — `/refunds`

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| `POST` | `/refunds` | Request a refund | admin, super_admin, cashier |
| `GET` | `/refunds` | List all refunds | admin, super_admin, cashier |
| `GET` | `/refunds/{id}` | Get refund details | admin, super_admin, cashier |
| `PATCH` | `/refunds/{id}/approve` | Approve refund | admin, super_admin |
| `PATCH` | `/refunds/{id}/reject` | Reject refund | admin, super_admin |
| `PATCH` | `/refunds/{id}/process` | Mark as processed | admin, super_admin, cashier |

### 4.4 Daily Settlements — `/settlements`

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| `POST` | `/settlements` | Create/open daily settlement | cashier, admin, super_admin |
| `GET` | `/settlements` | List settlements | admin, super_admin, cashier |
| `GET` | `/settlements/{id}` | Get settlement details | admin, super_admin, cashier |
| `PATCH` | `/settlements/{id}/close` | Close settlement (cashier) | cashier, admin |
| `PATCH` | `/settlements/{id}/verify` | Verify settlement (admin) | admin, super_admin |

### 4.5 Tax Configurations — `/tax-configurations`

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| `POST` | `/tax-configurations` | Create tax rule | admin, super_admin |
| `GET` | `/tax-configurations` | List all active tax rules | admin, super_admin, cashier |
| `GET` | `/tax-configurations/{id}` | Get tax rule | admin, super_admin |
| `PUT` | `/tax-configurations/{id}` | Update tax rule | admin, super_admin |
| `PATCH` | `/tax-configurations/{id}/toggle` | Activate / deactivate | admin, super_admin |

---

## 5. Backend File Changes

### 5.1 New Files to Create

```
backend/app/
├── models/
│   ├── invoice.py          ← NEW: Invoice, InvoiceItem
│   ├── payment.py          ← NEW: Payment
│   ├── refund.py           ← NEW: Refund
│   ├── settlement.py       ← NEW: DailySettlement
│   └── tax_config.py       ← NEW: TaxConfiguration
│
├── schemas/
│   ├── invoice.py          ← NEW: InvoiceCreate, InvoiceUpdate, InvoiceResponse, InvoiceListItem, Paginated
│   ├── payment.py          ← NEW: PaymentCreate, PaymentResponse, PaymentListItem, Paginated
│   ├── refund.py           ← NEW: RefundCreate, RefundResponse, RefundListItem, Paginated
│   ├── settlement.py       ← NEW: SettlementCreate, SettlementResponse, Paginated
│   └── tax_config.py       ← NEW: TaxConfigCreate, TaxConfigUpdate, TaxConfigResponse
│
├── services/
│   ├── invoice_service.py  ← NEW: create, get, list, update, issue, void, add_item, calc_totals
│   ├── payment_service.py  ← NEW: record_payment, generate_payment_number, update_invoice_balance
│   ├── refund_service.py   ← NEW: request, approve, reject, process
│   ├── settlement_service.py ← NEW: create, close, verify, aggregate_totals
│   └── tax_service.py      ← NEW: get_active_taxes, calculate_item_tax
│
└── routers/
    ├── invoices.py         ← NEW
    ├── payments.py         ← NEW
    ├── refunds.py          ← NEW
    ├── settlements.py      ← NEW
    └── tax_configurations.py ← NEW
```

### 5.2 Existing Files to Modify

| File | Change |
|------|--------|
| `backend/app/main.py` | Import and register 5 new routers |

---

## 6. Frontend File Changes

### 6.1 New Files to Create

```
frontend/src/
├── types/
│   └── billing.ts              ← NEW: Invoice, InvoiceItem, Payment, Refund, Settlement, TaxConfig interfaces
│
├── services/
│   ├── invoiceService.ts       ← NEW: CRUD, issue, void, add/remove items
│   ├── paymentService.ts       ← NEW: record, list
│   ├── refundService.ts        ← NEW: request, approve, reject, process
│   ├── settlementService.ts    ← NEW: create, close, verify
│   └── taxService.ts           ← NEW: CRUD
│
└── pages/
    ├── InvoiceList.tsx         ← NEW: Paginated invoice list with filters & stats
    ├── InvoiceCreate.tsx       ← NEW: Create invoice form with line items & tax
    ├── InvoiceDetail.tsx       ← NEW: Full detail + payment history + print view
    ├── PaymentList.tsx         ← NEW: All payments with filters
    ├── RefundList.tsx          ← NEW: Refund requests with approve/reject
    └── SettlementList.tsx      ← NEW: Daily settlements
```

### 6.2 Existing Files to Modify

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `/invoices`, `/invoices/new`, `/invoices/:id`, `/payments`, `/refunds`, `/settlements` routes |
| `frontend/src/components/common/Layout.tsx` | Add **Billing** section to sidebar with 5 sub-items |

---

## 7. Role & Permission Matrix

| Feature | super_admin | admin | cashier | doctor | receptionist | others |
|---------|:-----------:|:-----:|:-------:|:------:|:------------:|:------:|
| View invoices | ✅ | ✅ | ✅ | ✅ (own patients) | ❌ | ❌ |
| Create invoice | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Issue/void invoice | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Void invoice | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Record payment | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Request refund | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve refund | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Daily settlement | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Verify settlement | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage tax config | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 8. Business Logic Rules

### Invoice Calculation

```
For each invoice item:
    line_subtotal   = quantity × unit_price
    discount_amount = line_subtotal × (discount_percent / 100)
    taxable_amount  = line_subtotal - discount_amount
    tax_amount      = taxable_amount × (tax_rate / 100)
    total_price     = taxable_amount + tax_amount

Invoice totals:
    subtotal        = SUM(line_subtotal) for all items
    discount_amount = SUM(item.discount_amount) + header_discount
    tax_amount      = SUM(item.tax_amount)
    total_amount    = subtotal - discount_amount + tax_amount
    balance_amount  = total_amount - paid_amount
```

### Invoice Status Machine

```
draft
  → issued       (when explicitly issued by cashier)
  → cancelled    (while still draft)

issued
  → partially_paid  (when payment < total_amount)
  → paid             (when payment >= total_amount)
  → void             (admin/super_admin only, no active payments)
  → overdue          (system: if due_date passed and not paid)

partially_paid
  → paid             (when remaining balance paid)

paid
  → (terminal, no further transitions except refund creates separate record)
```

### Payment Rules

- Payment amount must be > 0
- Multiple payments allowed per invoice (partial payments)
- `invoice.paid_amount` auto-updated after each payment
- `invoice.balance_amount` = `total_amount - paid_amount`
- If `balance_amount <= 0` → `invoice.status = 'paid'`
- If `0 < balance_amount < total_amount` → `invoice.status = 'partially_paid'`

### Refund Rules

- Refund can only be requested for **completed payments** (`payment.status = 'completed'`)
- Refund amount cannot exceed original payment amount
- Created with `status = 'pending'`
- Requires admin/super_admin approval (`status = 'approved'`)
- Once approved, cashier marks as `processed`
- On rejection: `status = 'rejected'` — no money movement
- Financial totals change only when refund is `processed`
- After a processed refund:
  - `payment.refunded_amount` increases by the processed refund amount
  - `payment.net_amount = payment.amount - refunded_amount`
  - fully refunded payments become `reversed`
  - invoice `paid_amount` is recomputed from net payments
  - invoice status becomes `issued` when net paid = 0, `partially_paid` when `0 < net paid < total`, `paid` when fully covered
- Refund workflow should be accessible from the invoice detail page to reduce page switching for billing roles

### Invoice Number Format

```
INV-YYYYMMDD-XXXXXX   (e.g. INV-20260307-000001)
```

### Payment Number Format

```
PAY-YYYYMMDD-XXXXXX   (e.g. PAY-20260307-000001)
```

### Refund Number Format

```
REF-YYYYMMDD-XXXXXX   (e.g. REF-20260307-000001)
```

---

## 9. Number Generation Conventions

All sequential numbers are generated using the same pattern as `appointment_service.generate_appointment_number()`:

```python
import random, string
from datetime import date

def generate_invoice_number() -> str:
    date_str = date.today().strftime("%Y%m%d")
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"INV-{date_str}-{suffix}"

def generate_payment_number() -> str:
    date_str = date.today().strftime("%Y%m%d")
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"PAY-{date_str}-{suffix}"

def generate_refund_number() -> str:
    date_str = date.today().strftime("%Y%m%d")
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"REF-{date_str}-{suffix}"
```

---

## 10. Implementation Checklist

### Backend

- [x] `models/invoice.py` — Invoice, InvoiceItem SQLAlchemy models
- [x] `models/payment.py` — Payment SQLAlchemy model
- [x] `models/refund.py` — Refund SQLAlchemy model
- [x] `models/settlement.py` — DailySettlement SQLAlchemy model
- [x] `models/tax_config.py` — TaxConfiguration SQLAlchemy model
- [x] `schemas/invoice.py` — Pydantic schemas (Create, Update, Response, ListItem, Paginated)
- [x] `schemas/payment.py` — Pydantic schemas, including refund-aware payment list fields
- [x] `schemas/refund.py` — Pydantic schemas
- [x] `schemas/settlement.py` — Pydantic schemas
- [x] `schemas/tax_config.py` — Pydantic schemas
- [x] `services/invoice_service.py` — Business logic
- [x] `services/payment_service.py` — Business logic, including payment/refund reconciliation values
- [x] `services/refund_service.py` — Business logic and invoice status recalculation after processed refunds
- [x] `services/settlement_service.py` — Business logic
- [x] `services/tax_service.py` — Business logic
- [x] `routers/invoices.py` — 9 endpoints
- [x] `routers/payments.py` — 4 endpoints
- [x] `routers/refunds.py` — 6 endpoints with invoice/patient filters
- [x] `routers/settlements.py` — 5 endpoints
- [x] `routers/tax_configurations.py` — 5 endpoints
- [x] `main.py` — Register all 5 new routers

### Frontend

- [x] `types/billing.ts` — TypeScript interfaces
- [x] `services/invoiceService.ts` — API calls
- [x] `services/paymentService.ts` — API calls
- [x] `services/refundService.ts` — API calls
- [x] `services/settlementService.ts` — API calls
- [x] `services/taxService.ts` — API calls
- [x] `pages/InvoiceList.tsx` — List with stats, filters, pagination
- [x] `pages/InvoiceCreate.tsx` — Create form with dynamic line items
- [x] `pages/InvoiceDetail.tsx` — Detail view + payment panel + print + inline refund workflow/history
- [x] `pages/PaymentList.tsx` — Payment history with gross/refunded/net summaries
- [x] `pages/RefundList.tsx` — Refund management with approve/reject/process modals
- [x] `pages/SettlementList.tsx` — Daily settlement
- [x] `components/common/Layout.tsx` — Add Billing nav section
- [x] `App.tsx` — Add all billing routes

---

## 11. Testing Guidelines

### Manual Test Flow

1. **Create Invoice**
   - Login as `cashier` / `admin`
   - Go to Invoices → New
   - Select patient, appointment type = OPD
   - Add consultation line item: qty=1, price=500, tax=GST 18%
   - Add medicine line item: qty=2, price=150, tax=GST 12%
   - Verify totals auto-calculate
   - Save as draft

2. **Issue Invoice**
   - Open draft invoice
   - Click "Issue Invoice" → status changes to `issued`
   - Verify invoice number generated

3. **Record Payment**
   - On issued invoice → click "Record Payment"
   - Enter amount=500, mode=cash
   - Verify invoice changes to `partially_paid`
   - Record second payment for balance
   - Verify invoice changes to `paid`

4. **Request Refund**
   - On paid invoice → click "Refund"
   - Select payment, enter reason, amount
   - Verify refund created as `pending`
  - Login as admin → approve refund
  - Cashier/admin marks as processed
  - Verify on the same invoice detail page that payment history shows `Amount / Refunded / Net`
  - Verify full refund changes payment status to `reversed`
  - Verify invoice status becomes `issued` after a full refund and `partially_paid` after a partial refund

5. **Daily Settlement**
   - Cashier creates settlement for today
   - System aggregates all today's payments by mode
   - Cashier closes settlement
   - Admin verifies settlement

### API Quick Tests (curl examples)

```bash
# Create invoice
curl -X POST http://localhost:8000/api/v1/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "...", "invoice_type": "opd", "items": [{"item_type": "consultation", "description": "OPD Consultation", "quantity": 1, "unit_price": 500}]}'

# List invoices
curl http://localhost:8000/api/v1/invoices?page=1&limit=10 \
  -H "Authorization: Bearer $TOKEN"

# Record payment
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invoice_id": "...", "patient_id": "...", "amount": 500, "payment_mode": "cash"}'
```

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-07 | Engineering | Plan document created |
| 2026-03-07 | Engineering | Backend models, schemas, services, routers implemented |
| 2026-03-07 | Engineering | Frontend types, services, pages implemented |
| 2026-03-07 | Engineering | Layout and routing updated |
| 2026-03-13 | Engineering | Payment modes reduced to cash, UPI, debit card, credit card only |
| 2026-03-13 | Engineering | Refund workflow moved inline to invoice detail: request, review, approve/reject, process |
| 2026-03-13 | Engineering | Payment list enhanced with gross, refunded, and net figures |
| 2026-03-13 | Engineering | Full refund reconciliation clarified: full processed refund makes payment `reversed` and invoice status `issued` |
