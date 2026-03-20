# Post-Deployment Bug Check Note

## What was fixed
- Fixed patient age display in Pharmacy Dispensing (no more missing age when DOB exists).
- Doctors can finalize prescriptions even if medicine stock is low/out of stock.
- Out-of-stock medicines are clearly highlighted in Prescription Builder.
- Consultation invoice is auto-created for completed consultation (when fee is configured).
- Receptionist can collect consultation fee from Appointment Management.
- Collect Fee icon is hidden after full payment.
- Collection amount is fixed to invoice balance (no increase/decrease controls).
- Duplicate fee collection is blocked (UI + backend validation).

## Quick test after deployment
1. Open Pharmacy Dispensing for a patient with DOB and check age is shown correctly.
2. Finalize a prescription that has an out-of-stock medicine and confirm finalize still works.
3. In Prescription Builder, verify out-of-stock medicine shows warning/highlight.
4. Complete a consultation and check consultation invoice is created.
5. Login as receptionist, open completed appointment, click Collect Fee, and record payment.
6. Refresh Appointment Management and confirm Collect Fee icon is no longer visible for paid appointment.
7. Try collecting again for the same invoice and confirm system blocks duplicate/overpayment.
