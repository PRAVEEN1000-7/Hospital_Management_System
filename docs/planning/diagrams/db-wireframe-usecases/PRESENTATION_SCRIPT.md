# HMS — Full Presentation Script

> Read this out loud in a meeting. Each phase is a self-contained section.
> Pause between phases. Speak naturally. Keep it conversational.

---

## Opening

"Alright, let me walk you through how our Hospital Management System works — phase by phase. The system is built in five phases. Each phase adds a new layer of functionality. I'll explain who does what, and how the data flows through the system."

---

## Phase 0 — Foundation & Setup

"Before anything runs, we need to set up the foundation. This is Phase Zero."

"The Super Admin logs into the system. The system checks the credentials, hashes the password, and issues a JWT token. That token keeps the session alive."

"Once logged in, the Super Admin creates the hospital record — the name, address, license number, contact details. Then they configure the hospital settings — things like logo, timezone, currency, and fiscal year."

"Next, they set up departments. OPD, Pharmacy, Lab, Radiology — each department is linked to the hospital."

"Then comes tax configuration. We define tax rules like GST or VAT — the name, the rate, and where it applies."

"After that, the Super Admin creates roles. Doctor, Receptionist, Cashier, Nurse — each role gets specific permissions. For example, a Receptionist can create patients but cannot access billing. This is a full Role-Based Access Control system."

"Finally, user accounts are created. Each staff member gets an email, a password, and one or more roles. If someone forgets their password, the system sends a reset link with a token that expires after a set time."

"So to summarize Phase Zero — we have eleven tables handling the hospital setup, authentication, and role-based access. Nothing else works without this."

---

## Phase 1 — Core Operations

"Now the hospital is set up. Patients start walking in. This is Phase One."

"A patient arrives at the front desk. The Receptionist opens the registration form and enters the patient's details — name, date of birth, gender, blood group, phone number, address."

"The system automatically generates a unique patient ID. Something like PAT-2026-00001. It also prints an ID card with a barcode or QR code. The patient keeps this card for all future visits."

"The patient signs a consent form. That gets stored. They can also upload documents — like an Aadhaar card or an insurance card."

"Now the Receptionist needs to book an appointment. They check which doctors are available. The system shows each doctor's weekly schedule — which days, which time slots, and how many patients per slot. It also shows if the doctor is on leave."

"The Receptionist books the appointment. The system logs the status — first it's 'Booked', then 'Checked-in' when the patient arrives, then 'In-progress' during consultation, and finally 'Completed'."

"The patient moves to the waiting room. They get a queue number. The queue tracks priority and estimated wait time. When it's their turn, the Nurse calls them in, and the Doctor starts the consultation."

"Each doctor has a profile in the system — their specialization, qualifications, license number, and consultation fees for different visit types like OPD, follow-up, or emergency."

"Phase One uses twelve tables. It covers patient registration, doctor management, appointment booking, and the live queue system."

---

## Phase 2 — Clinical Workflows

"The patient is now with the Doctor. This is Phase Two — clinical workflows."

"The Doctor opens the patient's appointment and writes a prescription. They enter the diagnosis, clinical notes, and a follow-up date if needed."

"Each medicine in the prescription is a separate line item — the medicine name, dosage, how often to take it, and for how many days."

"Doctors can also save templates. If they frequently prescribe the same set of medicines for a common condition, they save it as a template and reuse it. Every time a prescription is edited, the system saves a version — so we always have a history."

"Once the prescription is ready, it goes to the Pharmacy. The Pharmacist looks up the medicine in the catalog, checks the available batches, and picks the batch that expires first. This is called First Expiry, First Out — or FEFO."

"The Pharmacist dispenses the medicines. The system records which batch was used, how many units, and the price. Stock goes down automatically."

"If a patient returns unused medicines — say they had a side effect and the Doctor changed the prescription — the Pharmacist processes the return. The stock goes back up to the original batch."

"For eye patients, there's an additional flow. The Doctor writes an optical prescription — sphere, cylinder, axis, and add power for each eye. The Optical Staff then creates an order — selecting frames and lenses from the optical product catalog."

"If a patient brings in broken glasses, the Optical Staff logs a repair request — the issue, estimated cost, and expected completion date."

"We also have lab orders in this phase. The Doctor orders a lab test, and the system tracks the test type, status, and results."

"Phase Two has sixteen tables. It covers prescriptions, pharmacy dispensing, pharmacy returns, optical prescriptions, optical orders, optical repairs, and lab tests."

---

## Phase 3 — Billing & Inventory

"The patient has been treated. Now they need to pay. This is Phase Three."

"The Cashier generates an invoice. Everything the patient received — consultation fee, medicines, lab tests, optical items — each one becomes a line item on the invoice. Tax is calculated automatically based on the rules we set up in Phase Zero."

"The patient pays. The system records the payment — whether it's cash, card, or UPI. The transaction reference is saved, and the invoice is marked as paid."

"If there's an overpayment or a cancellation, the Cashier creates a refund or a credit note. These are always linked back to the original invoice and payment, so there's a clear paper trail."

"At the end of the day, the Cashier runs a daily settlement. The system totals up everything collected — broken down by payment method — and flags any discrepancies."

"Now, for insured patients, there's an insurance workflow. The Receptionist selects the insurance provider and links the patient's policy. Before treatment, they can submit a pre-authorization request — basically asking the insurance company to approve the treatment plan and estimated cost. After treatment, they file the actual insurance claim with all the documents."

"On the inventory side, the Inventory Manager creates purchase orders and sends them to suppliers. When the goods arrive, they create a Goods Receipt Note — checking what was ordered versus what was received. The system automatically creates medicine batches with batch numbers and expiry dates."

"Every single stock movement is logged. Whether it's a dispense, a return, a transfer, or a manual adjustment — everything is tracked. Periodically, the team does cycle counts — physically counting stock and comparing it to the system to catch any discrepancies."

"Phase Three is the largest phase with nineteen tables. It covers billing, payments, refunds, daily settlements, insurance, purchase orders, goods receipts, and full stock tracking."

---

## Phase 4 — Notifications, Audit & Reports

"Finally, Phase Four ties everything together. This is the support layer."

"Every action in the system — every login, every patient created, every invoice paid — gets written to an audit log. The log captures who did it, what they did, when they did it, the before-and-after values, and even the IP address. This gives us full traceability."

"The Admin sets up notification templates. For example, an appointment reminder or a payment receipt. These templates have placeholders — like patient name, appointment date, amount paid — that get filled in automatically."

"When something happens — say an appointment is booked — the system creates an in-app notification for the relevant user. They can see it in the app, marked as read or unread."

"For external delivery — SMS, email, or WhatsApp — the notification goes into a queue. The system picks it up, sends it, and updates the status. If it fails, it retries automatically up to a maximum number of attempts."

"Admin can also pull reports by querying across all the tables from every phase. They can filter by date, department, doctor, or payment method."

"Phase Four is lean — just four tables. But it touches every other phase. Audit logs and notifications are the glue that holds the whole system together."

---

## Closing — The Full Patient Journey

"Let me quickly connect the dots with a real patient journey."

"A patient walks in. The Receptionist registers them and prints an ID card. That's Phase One."

"The Receptionist books an appointment. The patient waits in the queue. The Doctor sees them and writes a prescription. That's Phase Two."

"The patient goes to the Pharmacy, picks up medicines, maybe orders glasses from Optical. Then they go to the Cashier and pay the bill. If they have insurance, a claim is filed. That's Phase Three."

"And throughout all of this — every step is logged in the audit trail, and the patient gets notified at each stage. That's Phase Four."

"In total, the system uses sixty-two tables across five phases. Each phase builds on the previous one. Nothing is standalone — everything is connected."

"That's the complete flow of our Hospital Management System."

---

> **Tip:** Pause for 2-3 seconds between phases. Let the audience absorb each section before moving on. If someone asks a question mid-flow, answer it and then resume from where you left off.
