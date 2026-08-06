# Razorpay Integration — Payment Gateway + Android Smart POS

Technical integration guide for connecting HMS to Razorpay's online Payment Gateway (web/WhatsApp checkout) **and** Razorpay's Android Smart POS device (in-person card/UPI), as one combined system, per hospital tenant.

Companion doc: [`RAZORPAY_PAYMENT_INTEGRATION_PLAN.md`](RAZORPAY_PAYMENT_INTEGRATION_PLAN.md) covers the business decision and confirmed pricing. This file is the "how to build it" reference.

---

## Table of contents

1. [Scope](#1-scope)
2. [Prerequisites](#2-prerequisites)
3. [Architecture — how the two pieces share one account](#3-architecture--how-the-two-pieces-share-one-account)
4. [Part A — Payment Gateway (online / remote checkout)](#4-part-a--payment-gateway-online--remote-checkout)
5. [Part B — Android Smart POS (in-person)](#5-part-b--android-smart-pos-in-person)
6. [Complete end-to-end workflow](#6-complete-end-to-end-workflow)
7. [Codebase integration plan](#7-codebase-integration-plan)
8. [Environment variables & secrets](#8-environment-variables--secrets)
9. [Testing](#9-testing)
10. [Security checklist](#10-security-checklist)
11. [Open questions — confirm with Razorpay before building Part B](#11-open-questions--confirm-with-razorpay-before-building-part-b)

---

## 1. Scope

Two payment channels, one Razorpay account per hospital:

| Channel | Where the patient pays | Built in |
|---|---|---|
| **Gateway** | Their own phone — a payment link (WhatsApp/SMS/email) or a hosted checkout page | Part A |
| **Smart POS** | The reception counter — tap card or scan UPI QR on the physical device | Part B |

Both channels resolve to the same backend action: create a charge against one HMS invoice, then record the result against that invoice once Razorpay confirms it.

---

## 2. Prerequisites

- [ ] A Razorpay **Business/merchant account** per hospital (separate settlement account each — do not share one account across tenants).
- [ ] Live **API Key ID + Key Secret**, generated per hospital under Settings → API Keys in the Razorpay Dashboard.
- [ ] **Webhook secret** configured under Settings → Webhooks (needed for Part A and, once confirmed, Part B).
- [ ] For Part B: the physical Smart POS device, its **serial number / Terminal ID**, and confirmation from Razorpay's POS onboarding team on the exact integration path (see [§11](#11-open-questions--confirm-with-razorpay-before-building-part-b) — this is not fully documented publicly and needs a direct answer from Razorpay).
- [ ] `razorpay` Python SDK added to [`backend/requirements.txt`](../backend/requirements.txt).

---

## 3. Architecture — how the two pieces share one account

```
                    ┌─────────────────────────┐
  Hospital's own    │   Razorpay Dashboard      │
  merchant account ─┤   (one per hospital)      │
                    └───────────┬───────────────┘
                                │
                ┌───────────────┴────────────────┐
                │                                 │
       Payment Gateway                    Smart POS device
     (Orders API + Checkout)          (device-linked transactions)
                │                                 │
     razorpay_order_id, payment_id       device serial / terminal id
                │                                 │
                └───────────────┬────────────────┘
                                 │
                    Same webhook stream
             (payment.captured, order.paid, ...)
```

Because both channels post to the **same webhook endpoint** and the **same underlying account**, HMS needs only one adapter (`razorpay_adapter.py`) with two entry points — `create_checkout()` for Part A, `create_pos_charge()` for Part B — sharing one webhook handler.

---

## 4. Part A — Payment Gateway (online / remote checkout)

This part is fully documented by Razorpay and stable. Flow:

### 4.1 Server — create an order

`POST https://api.razorpay.com/v1/orders` (via the SDK), authenticated with the hospital's `key_id`/`key_secret`:

```python
client = razorpay.Client(auth=(key_id, key_secret))
order = client.order.create({
    "amount": int(invoice.balance_amount * 100),  # paise, integer
    "currency": "INR",
    "receipt": invoice.invoice_number,
    "notes": {"invoice_id": str(invoice.id), "hospital_id": str(invoice.hospital_id)},
})
# order["id"] -> pass to frontend as order_id
```

`notes` is how we carry our own `invoice_id` through Razorpay and get it back on the webhook — Razorpay has no concept of our invoices, so this field is the correlation key.

### 4.2 Frontend — Checkout.js

Load `https://checkout.razorpay.com/v1/checkout.js`, then:

```js
const rzp = new Razorpay({
  key: hospitalRazorpayKeyId,     // public key_id, safe on frontend
  amount: order.amount,
  currency: "INR",
  order_id: order.id,
  name: hospital.name,
  theme: { color: hospitalSettings.branding_primary_color },
  handler: (response) => {
    // response.razorpay_payment_id, razorpay_order_id, razorpay_signature
    postToBackend("/payment-gateway/verify", response);
  },
});
rzp.open();
```

This modal is what renders the card-entry fields, UPI apps, and a UPI QR — nothing custom to build here.

### 4.3 Server — verify the signature

```python
client.utility.verify_payment_signature({
    "razorpay_order_id": data.razorpay_order_id,
    "razorpay_payment_id": data.razorpay_payment_id,
    "razorpay_signature": data.razorpay_signature,
})  # raises SignatureVerificationError on mismatch
```

Only after this passes do we create a `Payment` row.

### 4.4 Webhook (source of truth, backs up 4.3)

`POST /payment-gateway/webhook` — no auth, verifies `X-Razorpay-Signature` against the webhook secret, listens for `payment.captured` / `order.paid`, reads `invoice_id` back out of `notes`, and is the durable path in case the patient closes the browser tab right after paying (4.3 never fires in that case).

**Sources:** [Standard Checkout — Integration Steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) · [About Webhooks](https://razorpay.com/docs/webhooks/) · [Orders Webhook Events](https://razorpay.com/docs/webhooks/payloads/orders/)

---

## 5. Part B — Android Smart POS (in-person)

This part is **less publicly documented** than Part A — Razorpay gates the detailed integration spec behind their POS onboarding team rather than the open API docs. What's confirmed from public sources, and what still needs a direct answer, is split out below so nothing here is presented as more certain than it is.

### 5.1 What's confirmed

- The Smart POS device supports **4G/Wi-Fi/Bluetooth** connectivity and is described by Razorpay as integrating with a merchant's "existing systems."
- Integration is done through a **Razorpay POS SDK** with (per Razorpay's own SDK reference) at least:
  - An **Initialize API** — sets up the SDK/session, requires the device's **serial number and model** (e.g. A910, A920).
  - A **Universal Pay API** — one call that triggers whichever payment mode the merchant has enabled (card, UPI, etc.) on that device, instead of separate calls per mode.
- Payments made on the device land in the **same Dashboard** as online gateway payments — confirmed both by Razorpay's own POS overview page and independently by the support call in [`RAZORPAY_PAYMENT_INTEGRATION_PLAN.md`](RAZORPAY_PAYMENT_INTEGRATION_PLAN.md).

**Sources:** [How Razorpay POS Works](https://razorpay.com/docs/pos/?preferred-country=IN) · [Razorpay POS SDK reference (GitHub)](https://github.com/AtifQEzetap/razorpay-pos-payment-sdk)

### 5.2 What still needs confirming (before writing code against it)

- **Where does the Initialize/Universal Pay call originate from?** The public SDK material points to an **Android SDK embedded in an app** (i.e., something running either *on* the Smart POS device itself, or on a paired Android tablet/phone at the counter) — not a plain server-to-server REST call from our FastAPI backend. If that's correct, "our software sends the amount to the machine" means: our backend calls a small companion Android app (installed on or near the device), and *that* app calls Razorpay's POS SDK locally — not a direct HTTP call from `backend/app/services/`.
- Whether that companion app needs to be custom-built by us, or whether Razorpay provides one that just needs the amount handed to it (e.g. via an Android Intent, deep link, or local API) is exactly the question to put to Razorpay's POS integration/onboarding contact.
- Confirm the exact webhook event name(s) for POS transactions specifically (may differ from the online gateway's `payment.captured`).

**Action:** raise these two questions directly with the Razorpay POS onboarding contact from the earlier call, and fill in §5.3 below once answered — don't start Part B implementation before this is resolved, since it changes whether we're building a backend HTTP client or a small Android companion app.

### 5.3 Provisional design (to be confirmed/replaced per 5.2)

```
HMS backend  →  POST /invoices/{id}/pos-charge
                 (resolves hospital's device serial number)
             →  [companion app / SDK call — mechanism TBD, see 5.2]
                 sends amount + our invoice_id as a reference
             →  Smart POS device screen shows "₹1,500 — Tap Card / Scan QR"
             →  patient pays on the device
             →  Razorpay webhook → HMS, same handler as Part A (§4.4)
```

---

## 6. Complete end-to-end workflow

What the cashier and patient actually experience, once both parts are built:

1. Cashier finalizes the invoice in [`InvoiceDetail.tsx`](../frontend/src/pages/InvoiceDetail.tsx); `balance_amount` is set.
2. Cashier clicks **Collect Payment**. HMS looks up the hospital's `hospital_payment_gateway_settings` row (§7) to find its provider and, if present, a linked POS device serial number.
3. **If a POS device is linked** → HMS pushes the amount to that device (§5.3). The device screen shows **"Tap Card / Scan QR"** — the patient chooses either, right there at the counter.
   **If no device is linked** (or the cashier picks "Send Link" instead) → HMS creates a Razorpay order (§4.1) and either opens Checkout.js on the reception screen, or generates a payment link to send via WhatsApp/SMS for the patient to pay remotely.
4. Patient completes payment — card PIN on the device, or UPI approval on their own phone.
5. Razorpay confirms via **webhook** (§4.4) — signature verified, `invoice_id` read back out of the transaction's notes/reference.
6. HMS creates a `Payment` row (`payment_mode="online"`, `gateway="razorpay"`, `gateway_payment_id=...`) and calls the existing `_sync_invoice_after_payment()` in [`payment_service.py`](../backend/app/services/payment_service.py) — the same function that already updates `paid_amount`/`balance_amount`/`status` for manually-recorded payments.
7. The invoice screen (polling `GET /invoices/{id}` every few seconds, same pattern as the pharmacy/queue boards) flips to **Paid** automatically — no manual entry by the cashier at any point.

---

## 7. Codebase integration plan

**New backend files:**
- `backend/app/models/payment_gateway_settings.py` — `HospitalPaymentGatewaySettings` (hospital_id, provider, key_id, key_secret [encrypted], webhook_secret [encrypted], pos_device_serial, is_active).
- `backend/app/services/payment_gateway/base.py` — adapter interface (`create_checkout`, `create_pos_charge`, `verify_webhook`).
- `backend/app/services/payment_gateway/razorpay_adapter.py` — implements the interface using the `razorpay` SDK.
- `backend/app/core/secrets.py` — Fernet encrypt/decrypt helpers, keyed off a new `ENCRYPTION_KEY` in [`config.py`](../backend/app/config.py) (no existing secret-encryption utility in the codebase today).
- `backend/app/routers/payment_gateway.py` — `POST /invoices/{id}/checkout-order`, `POST /invoices/{id}/pos-charge`, `POST /payment-gateway/verify`, `POST /payment-gateway/webhook`.

**Modified:**
- [`backend/app/models/payment.py`](../backend/app/models/payment.py) — add `gateway`, `gateway_order_id`, `gateway_payment_id` columns.
- `database_hole/14_add_payment_gateway.sql` — new migration file, following the existing numbered convention.

**Frontend:**
- [`frontend/src/pages/HospitalSettings.tsx`](../frontend/src/pages/HospitalSettings.tsx) — new "Payment Gateway" admin tab.
- [`frontend/src/pages/InvoiceDetail.tsx`](../frontend/src/pages/InvoiceDetail.tsx) — "Collect Payment" button + status-polling modal.
- `frontend/src/services/paymentGatewayService.ts` — new service module, alongside the existing [`paymentService.ts`](../frontend/src/services/paymentService.ts).

---

## 8. Environment variables & secrets

Per-hospital credentials live in the database (encrypted), **not** in `backend/.env` — this is a multi-tenant system, so a single global Razorpay key (the pattern currently used for SMTP in [`config.py`](../backend/app/config.py)) doesn't fit here. `.env` only needs:

```
ENCRYPTION_KEY=          # Fernet key for encrypting key_secret/webhook_secret at rest
                          # generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 9. Testing

- Razorpay provides **test mode keys** (prefixed `rzp_test_`) — use these in a hospital's settings during development; switch to live keys only after the merchant KYC (§2) is complete.
- Test card numbers and test UPI VPAs are published in Razorpay's docs for simulating both success and failure without moving real money.
- Webhook testing locally: use the Razorpay Dashboard's "Send Test Webhook" feature, or a tunnel (ngrok-style) to receive real test-mode webhooks against a local backend.

---

## 10. Security checklist

- [ ] `key_secret` and `webhook_secret` encrypted at rest (§7), never logged, never returned in any API response.
- [ ] Webhook signature verified on **every** request before touching the database — reject anything that fails verification.
- [ ] Webhook handler is **idempotent** — check for an existing `Payment` with the same `gateway_payment_id` before creating a new one (Razorpay can and will redeliver webhooks).
- [ ] `POST /payment-gateway/webhook` has no auth dependency (Razorpay can't log in), but every other route in `payment_gateway.py` requires the normal `get_current_active_user` + billing-staff role check, matching [`payments.py`](../backend/app/routers/payments.py).
- [ ] Amount charged is always computed server-side from `invoice.balance_amount` — never trust an amount passed from the frontend.

---

## 11. Open questions — confirm with Razorpay before building Part B

1. Does the Smart POS integration require a companion Android app (on or near the device), or is there a direct server-to-server API to push a transaction to a specific device by serial number?
2. What's the exact webhook event name for a POS-completed transaction (vs. `payment.captured` for the online gateway)?
3. Is a separate SDK license/agreement needed for POS integration on top of the standard Payment Gateway merchant agreement?
4. Confirm in writing: 0% UPI / 1.06% + GST card fees on the Smart POS (verbally quoted 2026-07-28 — see [`RAZORPAY_PAYMENT_INTEGRATION_PLAN.md`](RAZORPAY_PAYMENT_INTEGRATION_PLAN.md)).

Part A can be built immediately — it's fully documented. Part B's design in §5.3 is provisional until these are answered.
