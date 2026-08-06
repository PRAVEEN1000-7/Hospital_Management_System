# Razorpay Payment Integration — Decision Record & Implementation Plan

**Status:** Decision confirmed 2026-07-28. Pricing confirmed verbally by Razorpay support — get it in writing in the merchant agreement before onboarding the first hospital.

## Decision

New hospital clients onboarding onto HMS will be steered toward **Razorpay's Android Smart POS** device as their default payment hardware. It handles card (tap/swipe/insert) and UPI (QR) on one device, and — per Razorpay support — settles through the *same* Razorpay account used for online/remote payments (WhatsApp links, hosted checkout). One provider, one dashboard, one settlement account per hospital.

Hospitals that already own different hardware (this hospital's own two branches run **Paytm EDC** machines) are not forced to switch — HMS supports multiple providers per tenant via an adapter layer (§4). Paytm becomes the second supported adapter, proving the abstraction holds for more than one provider.

## Confirmed pricing (Razorpay Smart POS, verbal confirmation from Razorpay support, 2026-07-28)

| Payment method | Fee |
|---|---|
| UPI (scan QR on the Smart POS) | **0%** platform fee |
| Card (debit/credit) | **1.06% + GST** |

> Verbal quote only. Before onboarding any hospital, get this written into the Razorpay merchant agreement — fee structures and promotional rates can change without notice.

## 1. Why this shape

Two constraints drove the design:

- **HMS is multi-tenant.** Each hospital is a separate tenant and may already own different payment hardware. The system cannot hardcode one provider.
- **A gateway can only drive hardware it manufactured.** Razorpay's API cannot control a Paytm machine, and Paytm's cannot control a Razorpay one. So whichever machine a hospital already owns fixes which adapter *that* hospital needs — independent of which provider we'd otherwise prefer to standardize on.

## 2. The two payment channels

**In-person — Smart POS.** Cashier finalizes the invoice, clicks *Collect Payment*, the amount is pushed to that counter's machine, the patient taps card or scans the UPI QR on the machine's own screen, confirmation flows back automatically.

**Remote — payment link (WhatsApp / SMS / email).** For dues collected after the visit, or a family member paying from outside the hospital. Staff generates a tokenized link tied to one invoice; the patient opens it, sees the amount, and pays via Razorpay's hosted Checkout (which renders card entry, UPI apps, and a UPI QR itself — no custom payment UI to build).

Both channels resolve into the same backend primitive: create a charge attempt against an invoice, then record the result. That's what makes one adapter per provider sufficient to cover both channels for that provider.

## 3. Multi-tenant design — the adapter layer

The rest of HMS never talks to Razorpay or Paytm directly. It calls one internal interface; a small per-provider adapter translates that into the specific provider's API:

```
# app/services/payment_gateway/base.py
class PaymentGatewayAdapter(Protocol):
    def create_charge(self, invoice: Invoice, channel: Literal["pos", "link"]) -> ChargeHandle: ...
    def verify_webhook(self, headers, body) -> WebhookEvent: ...

# app/services/payment_gateway/razorpay_adapter.py   — implements the above for Razorpay
# app/services/payment_gateway/paytm_adapter.py       — implements the above for Paytm
```

Each hospital's settings record which adapter to use plus that provider's credentials (§5). The invoice screen always shows the same *Collect Payment* button; which adapter handles the click is resolved from the logged-in user's `hospital_id`.

Adding a hospital that uses an **already-supported** provider is pure configuration (pick from a dropdown, enter credentials). Adding a **new provider** neither adapter covers is a one-time build — after which every future hospital on that provider gets it for free.

## 4. Data model changes

**New table** `hospital_payment_gateway_settings` — one row per hospital, alongside [`hospital_settings.py`](../backend/app/models/hospital_settings.py):
- `hospital_id` (FK, unique)
- `provider` (`razorpay` | `paytm`)
- `key_id` (plaintext — Razorpay's public key is not sensitive)
- `key_secret`, `webhook_secret` (**encrypted at rest** — Fernet, keyed off a new `ENCRYPTION_KEY` env var; no existing secret-encryption utility in the codebase today, so this is new)
- `pos_device_serial` (nullable — the Smart POS/EDC machine's serial number, for routing a charge to the right physical device)
- `is_active`

**`payments` table** ([`payment.py`](../backend/app/models/payment.py)) gains three columns for reconciliation: `gateway`, `gateway_order_id`, `gateway_payment_id`.

## 5. Backend components

- `app/services/payment_gateway/` — `base.py` (interface), `razorpay_adapter.py`, `paytm_adapter.py`.
- `POST /invoices/{id}/collect-payment` — resolves the hospital's adapter, calls `create_charge()`.
- `POST /payment-gateway/webhook/{provider}` — no-auth, mirrors the pattern already used by [`public_queue.py`](../backend/app/routers/public_queue.py) for unauthenticated-but-hospital-scoped access. Verifies the provider's signature, then creates a `Payment` row and calls the existing `_sync_invoice_after_payment()` in [`payment_service.py`](../backend/app/services/payment_service.py) — new money comes in through the same invoice-sync logic staff-recorded payments already use.
- Idempotency: skip webhook processing if a `Payment` with that `gateway_payment_id` already exists (a webhook can fire more than once).

## 6. Frontend components

- [`HospitalSettings.tsx`](../frontend/src/pages/HospitalSettings.tsx) — new "Payment Gateway" tab (admin-only): provider dropdown, credential fields, device serial number.
- [`InvoiceDetail.tsx`](../frontend/src/pages/InvoiceDetail.tsx) — *Collect Payment* button opens a modal that either shows a QR (remote/link channel) or a "waiting on machine…" state (POS channel), polling `GET /invoices/{id}` (same short-interval pattern already used by the pharmacy/queue boards) until status flips to paid.

## 7. Build phases

1. **Foundation** — encrypted per-tenant credential storage + admin settings screen. Nothing works without this.
2. **Razorpay adapter** — Smart POS charge + webhook. Covers this provider's in-person *and* remote channels, since both share one Razorpay account.
3. **Frontend collect-payment flow** — modal + polling on the invoice screen.
4. **Paytm adapter** — second provider, for this hospital's own existing machines. Proves the abstraction holds beyond one provider.
5. **WhatsApp link channel** — tokenized payment links, reusing the adapters built in phases 2 and 4.

## 8. Open items before build starts

- [ ] Razorpay merchant KYC/onboarding completed per hospital (separate settlement account per hospital, not shared).
- [ ] Written confirmation of the 0% UPI / 1.06%+GST card fee structure in the merchant agreement.
- [ ] Smart POS device(s) received and serial numbers on hand.
- [ ] Decide whether this hospital's own two branches stay on Paytm indefinitely, or migrate to Razorpay Smart POS once it's available (affects whether Phase 4 is urgent or can trail Phase 2-3).
