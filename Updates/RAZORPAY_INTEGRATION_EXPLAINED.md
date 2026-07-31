# Razorpay + HMS — Explained in Plain English

This is a plain-language explainer: what this integration actually means, how HMS connects to Razorpay's two products, and why it's useful. No code here.

Two other documents already exist and are untouched by this one:
- `RAZORPAY_PAYMENT_INTEGRATION_PLAN.md` — the business decision and the pricing Razorpay quoted.
- `RAZORPAY_INTEGRATION_README.md` — the technical build guide, for whoever writes the code.

This document sits between the two: less technical than the README, more detailed than the plan.

---

## 1. What "integrating Razorpay" actually means

Right now, in HMS, when a patient pays, a staff member sits at the computer and **types it in by hand** — picks "cash" or "card," types an amount, maybe types a reference number. The computer trusts whatever the staff member types. Nothing checks that the money actually moved.

"Integrating Razorpay" means replacing that manual typing with a **real, verified payment**: the patient actually pays through a bank/UPI/card network, Razorpay watches that payment happen, and Razorpay tells HMS automatically — "yes, ₹1,500 was really paid for Invoice #123." HMS then marks the bill as paid **by itself**, with no one typing anything.

That's the whole point: **turn "staff says it was paid" into "the bank confirms it was paid."**

---

## 2. Two separate Razorpay products, two ways to pay

Razorpay isn't one single thing — it's two related products, and HMS will connect to both:

### A) The Payment Gateway (for remote / online payment)

This is for when the patient **isn't standing at the counter** — they're at home, or a family member is paying on their behalf. HMS sends them a link (over WhatsApp, SMS, or email). They tap it, a payment screen opens on their own phone, they pay by card or UPI, done.

Think of this as: **"here's a bill, pay it whenever, from wherever you are."**

### B) The Smart POS (for in-person payment at the counter)

This is the physical machine sitting at reception — the one that already shows a QR code and accepts card taps. When the cashier finalizes a bill, HMS sends the exact amount to that machine. The patient standing right there taps their card or scans the QR **on the machine itself**.

Think of this as: **"the patient is right here, pay right now, on this machine."**

Both of these belong to the *same* Razorpay account for a hospital — so whether a patient pays remotely or at the counter, the money lands in the same place, and shows up the same way in HMS.

---

## 3. How HMS actually connects to the Payment Gateway (A)

In plain terms, four steps:

1. **HMS tells Razorpay the amount.** When staff clicks "Pay," HMS quietly messages Razorpay: *"I need to collect ₹1,500 for this invoice."* Razorpay replies with a reference number for that specific attempt.
2. **Razorpay shows the payment screen.** This is Razorpay's own pop-up window (or the page the WhatsApp link opens) — it already has card fields, UPI options, and a QR code built in. HMS doesn't design or build this screen; Razorpay provides it, and HMS just tells it what hospital and what amount.
3. **The patient pays.** Card, UPI, whatever they choose.
4. **Razorpay confirms back to HMS**, automatically, the moment it happens. HMS checks that the confirmation is genuinely from Razorpay (not faked by anyone), then marks the invoice paid.

Nobody at the hospital does anything after step 1 — steps 2-4 happen without staff involvement.

---

## 4. How HMS actually connects to the Smart POS machine (B)

This works the same way in *spirit*, but the "screen" in step 2 isn't on a computer — it's the physical machine's own screen:

1. **HMS sends the amount to that specific machine.** Every Smart POS device has its own ID number (like a phone number for that machine) — HMS uses that ID to know exactly which machine to send the amount to, in case a hospital has more than one counter.
2. **The machine lights up showing the amount** and gives the patient the choice — tap a card, or scan the UPI QR shown on its own little screen.
3. **The patient pays right there.**
4. **The machine (through Razorpay) confirms back to HMS**, exactly the same way as the online payment does — same confirmation system, same result: invoice marked paid automatically.

The one honest caveat, spelled out in full in the technical README: the *exact* wiring for step 1 — whether HMS's server talks straight to the machine, or through a small companion app sitting near the machine — hasn't been confirmed by Razorpay yet. Either way, the *outcome* for your staff and patients is identical: send the amount, patient pays on the machine, it confirms automatically.

---

## 5. What actually happens, start to finish, in one story

> The patient's consultation is done. The bill comes to ₹1,500.
>
> **If they're at the counter:** the cashier clicks "Collect Payment." The machine right there lights up: "₹1,500 — Tap Card or Scan QR." The patient does either. Within a couple of seconds, the cashier's screen shows "Paid" — nobody typed a number, nobody confirmed anything manually.
>
> **If they've already left, or a relative is paying:** the cashier clicks "Send Payment Link" instead. A message goes to the patient's WhatsApp: "Your hospital bill: ₹1,500. Tap to pay." They tap it, pay from their phone, and the same invoice on the hospital's system flips to "Paid" — automatically, even though nobody at the hospital touched anything.

Same ending both times: **money genuinely moves, HMS finds out on its own, and the invoice updates itself.**

---

## 6. Why this is actually useful to you

- **No more manual entry errors.** Staff can't accidentally type the wrong amount or forget to record a payment — the confirmation comes from the bank, not from memory.
- **Faster at the counter.** No fumbling with a separate card machine that isn't connected to anything — one click, one machine, done.
- **Reaches patients who've already left.** Outstanding dues can be collected without asking someone to physically return to the hospital.
- **One place to see everything.** Whether a patient paid in person or remotely, it shows up the same way in the same invoice — nothing to reconcile by hand later.
- **Works across both of your hospitals, and any future ones**, without hardcoding one payment company — each hospital's settings simply say which provider and which machine belong to them.

---

## 7. A few words worth knowing (glossary)

| Term | What it means, plainly |
|---|---|
| **Payment Gateway** | The Razorpay service that lets a patient pay remotely — over a link, on their own phone. |
| **Smart POS** | The physical machine at the counter that accepts card taps and shows a UPI QR. |
| **Order** | A one-time "request to be paid this amount" that HMS creates with Razorpay before showing the patient anything — like a temporary invoice number just for that payment attempt. |
| **Webhook** | Razorpay's way of instantly telling HMS "this payment happened" — an automatic notification, not something a person checks or clicks. |
| **Signature verification** | A security check HMS does on every confirmation from Razorpay, to make sure it's genuinely from Razorpay and not faked by someone trying to trick the system into marking an unpaid bill as paid. |
| **UPI** | India's instant bank-to-bank payment system — what most QR code payments actually use behind the scenes. |
