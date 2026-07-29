**MECANDRIA IT SERVICES AND SOLUTIONS** 

# **Business Requirements Document** 

**Hospital Management System (HMS) — Enhancement Batch** 

|**Document Title**|BRD – HMS Enhancements (Walk-in Queue, Lab Reports, Procurement, Patent<br>History, Purchase Orders)|
|---|---|
|**Version**|1.4|
|**Date**|29-Jul-2026|
|**Status**|Draf — Pending Review & Sign-of|



_Confidential — Internal Use Only_ 

HMS Enhancement BRD 

## **1. Introduction** 

This document defines the business and functional requirements for a batch of enhancements to the Mecandria Hospital Management System (HMS). The enhancements span the Walk-in Queue module, Lab Reports module, Purchase Order (PO) and Goods Receipt Note (GRN) workflows, Patient History module, and the Purchase Orders listing. These changes are intended to close operational gaps identified during ongoing product usage and stakeholder feedback. 

## **2. Purpose** 

To provide the development and QA teams with a single, unambiguous reference for the requested changes so that they can be estimated, built, tested, and released as a coordinated enhancement batch. 

## **3. Scope** 

In Scope: 

- Walk-in Queue — Consultation fee collection 

- Walk-in Queue — OPD Assignment navigation button 

- Lab Reports — New report formats/fields as per reference specification 

- Purchase Order (PO) — Download option post-creation 

- Goods Receipt Note (GRN) — Edit and Download options post-creation 

- Patient History — New "Prescribed Medicine" column; rename existing "Medicines" column to "Dispensed Medicine" 

- Purchase Orders — New "Payment Status" column (Completed / Incomplete / Partial) 

Out of Scope: Any changes to modules not explicitly listed above; billing/finance module redesign; third-party lab integration (unless separately scoped). 

## **4. Stakeholders** 

|**Business Owner**|Mecandria HMS Product Team|
|---|---|
|**Prepared By**|Meena S, Digital Transformaton Manager / AI Intern|
|**Reviewed By**|[To be flled]|
|**Approved By**|[To be flled]|
|**Development Team**|Mecandria Engineering Team|
|**QA Team**|Mecandria QA Team|



## **5. Business Requirements** 

Page 2 of 7 

HMS Enhancement BRD 

Each requirement below is documented with current behavior, the proposed change, functional requirements, and acceptance criteria to guide development and testing. 

### **5.1 Consultation Fee Collection in Walk-in Queue** 

Consultation fee collection is currently available through the standard appointment/registration flow, but is not available directly from the Walk-in Queue **Current Behavior** screen. Front-desk staff handling walk-in patients must navigate away from the queue to collect the consultation fee. Add a consultation fee collection action directly within the Walk-in Queue screen so **Proposed** front-desk staff can collect payment for a walk-in patient without leaving the queue **Enhancement** view. 

#### **Functional Requirements** 

- Add a "Collect Fee" action against each patient row in the Walk-in Queue list. 

- On click, open a fee collection panel/modal showing patient name, consulting doctor, department, and applicable consultation fee (auto-fetched from fee master). 

- Support payment modes consistent with the rest of the system (Cash, Card, UPI/Online, Insurance where applicable). 

- On successful payment, update the patient's payment status in the queue row (e.g., Paid / Unpaid indicator) and generate a receipt. 

- Log the transaction in the billing/finance ledger against the patient visit record. 

- Restrict access to users with billing/front-desk permissions as per existing role-based access control. 

#### **Acceptance Criteria** 

- Front-desk user can collect consultation fee from within the Walk-in Queue without navigating to another module. 

- Payment status is visibly reflected against the patient's row in the queue immediately after collection. 

- A receipt is generated and is retrievable/printable from the same screen. 

- Transaction is correctly recorded in billing records and reconciles with existing finance reports. 

- Unpaid walk-in patients remain clearly distinguishable in the queue from paid ones. 

#### **UI / UX Notes** 

- Fee collection modal should be lightweight (single screen) to keep the queue workflow fast during high patient inflow. 

- Fee amount field should be editable only where discount/override permissions apply. 

### **5.2 OPD Assignment Button in Walk-in Queue** 

|**Current Behavior**|There is currently no direct path from the Walk-in Queue to OPD (Out-Patent<br>Department) assignment; staf must locate the patent separately in the OPD<br>assignment module.|
|---|---|
|**Proposed**<br>**Enhancement**|Add an "OPD Assignment" buton against each patent in the Walk-in Queue that<br>navigates directly to the OPD Assignment screen for that patent, carrying the<br>patent context forward.|



#### **Functional Requirements** 

Page 3 of 7 

HMS Enhancement BRD 

- Add an "OPD Assignment" button/action on each row of the Walk-in Queue list. 

- On click, navigate to the OPD Assignment screen with the selected patient's details (patient ID, name, department preference if captured) pre-populated. 

- If a consultation fee is required before OPD assignment, the button should be enabled/disabled based on the patient's payment status (configurable rule). 

- After successful OPD assignment, allow the user to return to the Walk-in Queue with the queue status updated (e.g., "Assigned"). 

#### **Acceptance Criteria** 

- Clicking "OPD Assignment" from the queue opens the OPD Assignment screen for the correct patient with no manual re-entry of patient details. 

- Queue status updates to reflect that OPD assignment is complete for that patient. 

- Button behavior (enabled/disabled) correctly respects fee-payment dependency, if configured. 

- No duplicate OPD assignment records are created if the button is clicked more than once for the same patient. 

#### **UI / UX Notes** 

- Button should be positioned consistently with the "Collect Fee" action for a natural front-desk workflow (fee → OPD assignment). 

### **5.3 Lab Reports — New Report Formats** 

The Lab Reports module currently supports a limited/base set of report layouts and **Current Behavior** fields. Introduce the lab report formats and fields as defined in the reference specification **Proposed** (Excel) shared by the business team, covering the specific test panels, parameter **Enhancement** lists, units, reference ranges, and layout per report type. 

#### **Functional Requirements** 

- Implement each lab report type listed in the reference specification, with the exact fields, units, and normal/reference ranges as defined. 

- Support entry of test results by lab staff and generation of a formatted, printable report per patient/test. 

- Include standard report header details (patient name, age/gender, patient ID, referring doctor, sample collection date/time, report date) consistent with existing HMS report templates. 

- Ensure each new report type is selectable from the existing Lab module workflow (test order → sample → result entry → report generation). 

#### **Acceptance Criteria** 

- Each lab report type in the reference specification is available for selection and generates a report matching the specified layout and fields. 

- Reference ranges and units match the source specification exactly. 

- Generated reports are downloadable/printable in the same manner as existing lab reports. 

_Note: The specific report names, parameters, units, and reference ranges for Section 5.3 are to be finalized against the Excel specification referenced in this request. Please share that file so this section can be completed with the exact field-level detail; the structure above is a placeholder pending that input._ 

Page 4 of 7 

HMS Enhancement BRD 

### **5.4 Download Option After PO Creation** 

Once a Purchase Order (PO) is created in the system, there is no option to download **Current Behavior** the PO document. Users must rely on other means to share/print the PO. **Proposed** Enable a "Download" option on the PO confirmation/detail screen (and in the PO **Enhancement** listing) once a PO has been created, allowing the user to download the PO as a PDF. 

#### **Functional Requirements** 

- Add a "Download" action on the PO detail/confirmation screen immediately after successful PO creation. 

- Add the same "Download" action against each PO row in the PO listing screen for previously created POs. 

- Downloaded PDF should include all standard PO fields: PO number, date, vendor details, item list with quantity/rate/amount, tax, total, and authorized signatory section, consistent with existing Mecandria document branding. 

#### **Acceptance Criteria** 

- User can download a correctly formatted PDF of the PO immediately after creation. 

- User can download the PDF for any previously created PO from the PO listing at any time. 

- Downloaded PO content matches the PO data stored in the system exactly (no stale or mismatched values). 

### **5.5 Edit and Download Options After GRN Creation** 

Once a Goods Receipt Note (GRN) is created, it currently cannot be edited or **Current Behavior** downloaded from within the system. **Proposed** Enable both "Edit" and "Download" options on the GRN detail screen and GRN listing **Enhancement** after a GRN has been created. 

#### **Functional Requirements** 

- Add an "Edit" action allowing authorized users to modify a created GRN (e.g., quantity received, batch/expiry details, discrepancy notes), subject to role-based permissions and any business rule on edit window (e.g., before stock is posted to inventory). 

- Maintain an audit trail of edits made to a GRN post-creation (who edited, what changed, when). 

- Add a "Download" action to export the GRN as a PDF, including GRN number, PO reference, vendor, item-wise received quantity, batch/expiry, and receiving personnel details. 

- Make both actions available from the GRN detail screen and the GRN listing screen. 

#### **Acceptance Criteria** 

- Authorized users can edit a previously created GRN, and the change is reflected correctly in linked inventory/stock records. 

- An audit trail entry is created for every edit to a GRN. 

- Users can download a correctly formatted PDF of any created GRN from both the detail screen and the listing. 

- Edit access is restricted according to role-based permissions and any configured edit-window rule. 

Page 5 of 7 

HMS Enhancement BRD 

### **5.6 Patient History — Add "Prescribed Medicine" Column & Rename "Medicines" to "Dispensed Medicine"** 

The Patient History screen currently shows a single "Medicines" column, which is **Current Behavior** used to represent medicines associated with a visit. It does not distinguish between what the doctor prescribed and what was actually dispensed by the pharmacy. Add a new "Prescribed Medicine" column showing the medicines prescribed by the **Proposed** doctor at consultation, and rename the existing "Medicines" column to "Dispensed **Enhancement** Medicine" to accurately reflect that it shows medicines actually dispensed by the pharmacy. 

#### **Functional Requirements** 

- Add a new column titled "Prescribed Medicine" to the Patient History table/view, sourced from the doctor's prescription record for that visit. 

- Rename the existing "Medicines" column to "Dispensed Medicine", with no change to its existing data source (pharmacy dispensing records). 

- Ensure both columns are visible together so staff can compare prescribed vs. dispensed medicines at a glance for each visit. 

- Apply the same labeling change consistently across any exports, printouts, or reports that reference this Patient History view. 

#### **Acceptance Criteria** 

- Patient History displays both "Prescribed Medicine" and "Dispensed Medicine" as distinct columns for every visit record. 

- "Prescribed Medicine" accurately reflects the doctor's prescription for that visit. 

- "Dispensed Medicine" (renamed) continues to show the correct pharmacy-dispensed data with no data loss from the rename. 

- Column rename is reflected in any downstream exports/printouts of Patient History. 

### **5.7 Purchase Orders — Add "Payment Status" Column** 

|**Current Behavior**|The Purchase Orders listng does not currently show payment status against each<br>PO, making it difcult to track which POs are fully paid, partally paid, or unpaid at a<br>glance.|
|---|---|
|**Proposed**|Add a "Payment Status" column to the Purchase Orders listng with values:<br>|
|**Enhancement**|Completed, Incomplete, and Partal.|



#### **Functional Requirements** 

- Add a "Payment Status" column to the Purchase Orders listing table. 

- Status values: "Completed" (fully paid), "Incomplete" (no payment made), "Partial" (some payment made against total PO value). 

- Status should be computed automatically based on payments recorded against the PO (linked to finance/payment records), or manually settable where no automated payment linkage exists — to be confirmed with the finance/billing module owner. 

- Use distinct visual indicators (e.g., color-coded tags) for the three statuses for quick scanning of the PO list. 

Page 6 of 7 

HMS Enhancement BRD 

- Make the column filterable and sortable within the PO listing. 

#### **Acceptance Criteria** 

- Every PO in the listing displays the correct payment status among Completed / Incomplete / Partial. 

- Status updates automatically (or via defined manual process) as payments are recorded against a PO. 

- Users can filter and sort the PO listing by payment status. 

- Status values and their computation logic are consistent with actual finance records — no mismatches during reconciliation. 

## **6. Assumptions** 

- Existing role-based access control (RBAC) framework will be extended to govern the new actions (fee collection, OPD assignment, PO/GRN edit-download) rather than a new permission system being built. 

- Fee master, PO, GRN, and Patient History data models can accommodate the new fields/columns without a major schema redesign. 

- The lab report specification (Excel) will be provided to finalize Section 5.3 in detail. 

- Payment status computation for Purchase Orders (Section 5.7) will reuse the existing finance/payment linkage used elsewhere in the system. 

## **7. Dependencies** 

- Section 5.2 (OPD Assignment button) depends on the existing OPD Assignment module accepting a prepopulated patient context. 

- Section 5.7 (Payment Status on PO) depends on payment data being captured against POs in the finance module. 

- Section 5.3 (Lab Reports) is dependent on receipt of the reference Excel specification for exact fieldlevel detail. 

## **8. Out of Scope** 

- Redesign of the core billing/finance module. 

- Third-party lab equipment or LIS integration, unless separately scoped in a future BRD. 

- Changes to inventory valuation logic beyond what is required to support GRN edit. 

## **9. Sign-off** 

|**Prepared By**|Meena S — Digital Transformaton Manager / AI Intern, Mecandria IT Services and<br>Solutons|
|---|---|
|**Reviewed By**|[Name, Designaton]|
|**Approved By**|[Name, Designaton]|
|**Date**|[To be flled]|



Page 7 of 7 

