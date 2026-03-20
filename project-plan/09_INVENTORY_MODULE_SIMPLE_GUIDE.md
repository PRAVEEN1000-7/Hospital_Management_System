# Inventory Module - Simple Guide

## 1) What this module does

The Inventory module controls all stock used by Pharmacy and Optical.
It answers these questions:
- What items do we have?
- How much stock is available now?
- What was bought and from which supplier?
- What was received, sold, dispensed, adjusted, transferred, or expired?
- Which items are low stock or near expiry?

In short: it is the central stock control system.

---

## 2) What is what (main records)

### Supplier
Company/vendor that sells items to the hospital.
Example: Medico Distributors.

### Purchase Order (PO)
Order sent to supplier to request items.
Status flow: draft -> submitted -> partially_received -> received (or cancelled).

### PO Items
Line items inside a PO.
Each line has item, quantity, and price.

### Goods Receipt Note (GRN)
Record created when goods physically arrive.
Used to verify what was received and accepted.
Status flow: pending -> verified -> accepted/rejected.

### GRN Items
Line items in GRN, with batch details.
For medicines: batch number, manufacturing date, expiry date, quantity accepted/rejected.

### Stock Movement
History log of every stock change.
Movement examples:
- stock_in
- dispensing
- sale
- return
- adjustment
- transfer
- expired
- damaged

This is the audit trail for stock.

### Stock Adjustment
Manual stock correction (increase/decrease/write-off).
Usually for damage, breakage, or mismatch.
Status flow: pending -> approved/rejected.

### Cycle Count
Periodic physical counting of stock.
System quantity is compared with counted quantity.
Variance is tracked and verified.

### Alerts
- Reorder alert: item is below reorder level.
- Expiry alert: item is close to expiry date.

---

## 3) How user access works

Access is role + permission based.
Main inventory-related permissions in the plan:
- inventory:manage
- inventory:approve_po

Role summary:
- Inventory Manager: manages day-to-day inventory operations.
- Admin: can manage inventory and approve important actions.
- Pharmacist: can read inventory items and expiry alerts relevant to pharmacy.
- Optical Staff: can read inventory item lists (for optical product usage).

Endpoint-level access (simplified):
- Item list: Inventory, Pharmacist, Optical Staff, Admin
- Create/update items: Inventory, Admin
- Suppliers: Inventory, Admin
- PO create: Inventory
- PO approve: Admin
- GRN create: Inventory
- GRN verify: Inventory Manager, Admin
- Stock adjustment create: Inventory
- Stock adjustment approve: Admin
- Reorder/expiry alerts: Inventory (expiry also visible to Pharmacist)
- Cycle count create/update: Inventory
- Cycle count verify: Inventory Manager, Admin

---

## 4) Planned use-case flow (from project plan)

Inventory implementation is planned mainly in Phase 3 (Billing & Inventory).
Team C handles full-stack inventory delivery.

Planned deliverables:
- Backend models: Supplier, PO, GRN, StockMovement, etc.
- Backend business logic: PO, GRN, movements, alerts, cycle counts.
- Backend routes: inventory APIs.
- Frontend pages: dashboard, items, suppliers, PO, GRN, adjustments, cycle counts.
- Components: reorder alerts, expiry alerts, stock movement log.

Planned outcome:
- Full lifecycle works end-to-end:
  PO -> GRN -> Stock -> Dispense/Sale
- Low stock and expiry alerts are active.
- Cycle count and variance reporting are active.

---

## 5) End-to-end flow of use (how work happens daily)

### Flow A: Procurement to available stock
1. Inventory user creates supplier (if new).
2. Inventory user creates PO with item lines.
3. Admin approves PO (if approval is required).
4. Supplier delivers goods.
5. Inventory user creates GRN from delivered items.
6. Inventory user enters accepted/rejected quantities and batch/expiry.
7. Inventory manager or admin verifies GRN.
8. System creates stock_in movement and updates balance.
9. Items are now available for Pharmacy/Optical usage.

### Flow B: Consumption and auto stock reduction
1. Pharmacy dispenses medicine or makes a counter sale.
2. Inventory stock is reduced automatically.
3. System records movement as dispensing/sale.
4. If stock goes below reorder level, reorder alert appears.
5. If any batch is near expiry, expiry alert appears.

### Flow C: Correction and control
1. Inventory user starts cycle count.
2. Physical count is entered for each item/batch.
3. System calculates variance (counted - system).
4. Inventory manager/admin verifies the count.
5. If needed, adjustment is created and approved.
6. Movement log is updated, keeping full traceability.

---

## 6) Detailed but simple example flow

Scenario: Hospital needs Paracetamol 500mg refill.

Step 1 - PO
- Inventory creates PO-2026-00021 to supplier Medico.
- Item: Paracetamol 500mg
- Qty ordered: 1000 strips
- Unit price: 10.00

Step 2 - Approval
- Admin approves PO.

Step 3 - Delivery and GRN
- Supplier delivers 1000 strips in two batches:
  - Batch P500-A: 600 strips, expiry 2027-01-31
  - Batch P500-B: 400 strips, expiry 2026-10-31
- Inventory creates GRN-2026-00014.
- All quantity accepted.

Step 4 - Verify and stock in
- Inventory Manager verifies GRN.
- System posts stock_in movements.
- Current balance becomes 1000 strips.

Step 5 - Dispensing starts
- Doctor prescription is processed by Pharmacist.
- 120 strips dispensed during OPD day.
- System posts dispensing movement (-120).
- New balance becomes 880 strips.

Step 6 - FEFO usage
- Pharmacy should use the earliest expiry batch first.
- Batch P500-B (earlier expiry) is consumed before P500-A.

Step 7 - Alerts
- If reorder level is 300, no alert yet at 880.
- When balance reaches 290, reorder alert is generated.
- If P500-B reaches near-expiry window, expiry alert is generated.

Step 8 - Cycle count
- Monthly cycle count finds actual stock 875 (system says 880).
- Variance is -5.
- Inventory records reason: broken strips during handling.
- Approved adjustment updates stock and logs the event.

Result:
- Purchase, receipt, usage, adjustment, and alerts are all connected.
- Every change is traceable in stock movements.

---

## 7) Quick mental model

Think of inventory in 4 simple blocks:
- Input: Supplier -> PO -> GRN
- Storage: Current stock + batches + expiry
- Output: Dispense/sale/transfer/return
- Control: Alerts + cycle count + adjustments + movement audit trail

If these 4 blocks are healthy, inventory is healthy.
