**Business Requirements Document**

OPD & Prescription Management System

| **Document Title** | Business Requirements Document - OPD & Prescription Management System |
| ------------------ | --------------------------------------------------------------------- |
| **Version**        | 1.0                                                                   |
| **Date**           | 16 July 2026                                                          |
| **Prepared For**   | Mecandria                                                             |
| **Status**         | Draft - For Review                                                    |

# **1\. Introduction**

## **1.1 Purpose**

This Business Requirements Document (BRD) defines the functional and business requirements for three components of the Hospital / Clinic Management System: the Prescription Dashboard, the Patient Registration verification workflow, and the OPD (Out-Patient Department) Assignment module. It is intended to guide design, development, and acceptance testing, and to serve as a shared reference between business stakeholders and the delivery team.

## **1.2 Scope**

This document covers the requirements for:

- A Prescription Dashboard presented as a data grid summarizing patient visits and prescriptions.
- A Patient Registration flow that adds email and mobile number verification, with a verified indicator against the patient's name.
- An OPD Assignment flow that allows staff to search and select a registered patient and view their details in a dialog box before assignment.

Requirements outside these three areas (e.g., billing/invoicing engine, pharmacy inventory, doctor scheduling) are referenced only where they intersect with the scope above; see Section 6, Out of Scope.

## **1.3 Intended Audience**

- Hospital / clinic administration and operations stakeholders
- Product owner and business analysts
- UI/UX and development teams
- QA / testing team

## **1.4 Definitions & Abbreviations**

| **OPD**        | Out-Patient Department - the unit where walk-in / non-admitted patients are seen.             |
| -------------- | --------------------------------------------------------------------------------------------- |
| **OTP**        | One-Time Password - a time-bound numeric code sent to verify a mobile number.                 |
| **BRD**        | Business Requirements Document.                                                               |
| **Data Grid**  | A tabular UI component supporting sorting, filtering, and pagination of records.              |
| **Dialog Box** | A modal/overlay window that displays details without navigating away from the current screen. |

# **2\. Business Objectives**

- Give front-desk and clinical staff a single, at-a-glance view of daily patient visits, prescriptions, and tablet billing to reduce manual cross-referencing.
- Improve data quality and reduce fraudulent or duplicate patient records by verifying email and mobile number at the point of registration.
- Provide a clear, visual confirmation (checkmark) that a patient's contact details are verified, so staff can trust the record before OPD assignment or communication.
- Speed up OPD assignment by letting staff find an existing patient quickly through search-as-you-type, and confirm identity via a details dialog before proceeding.

# **3\. Functional Requirements**

## **3.1 Prescription Dashboard (Data Grid)**

A data grid on the main dashboard that lists patient visits with their prescription and billing summary, allowing staff and clinicians to review activity at a glance.

**3.1.1 Data Grid Columns**

| **Column**                    | **Description**                                                                                          | **Notes**                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Patient Name**              | Full name of the patient associated with the visit.                                                      | Clickable - opens patient detail view. Displays verified checkmark per Section 3.2.4 if applicable.               |
| **Reason for Visit**          | Free-text or coded reason captured at check-in / consultation (e.g., fever, follow-up, routine checkup). | Should support filtering by common visit reasons.                                                                 |
| **Past Prescribed Medicines** | Medicine(s) / treatment prescribed by the physician for this visit.                                      | May contain multiple items; display as a truncated list with an expand-on-hover or "+N more" indicator.           |
| **Billed Tablets**            | Quantity and/or cost of tablets billed to the patient for this visit.                                    | Should reconcile with the pharmacy/billing module; format as quantity (e.g., "20 tabs") with amount if available. |

**3.1.2 Grid Behaviour & Business Rules**

- The grid must support sorting on every column and text search across Patient Name.
- The grid must support filtering by date range, reason for visit, and doctor (if captured elsewhere).
- The grid must support pagination or virtual scrolling for large record volumes.
- Each row must be clickable to open a read-only detail view or the OPD/consultation record for that visit.
- Data must refresh in near real time (or on manual refresh) as new prescriptions are entered.

**3.1.3 Acceptance Criteria**

- Given a completed consultation, the corresponding row appears in the dashboard grid with Patient Name, Reason for Visit, Prescribed Medicine, and Billed Tablets populated.
- Given a patient with a verified email and phone, a checkmark icon is visible next to their name in the grid.
- Sorting, filtering, and search on the grid return correct, consistent results.

## **3.2 Patient Registration & Verification**

The patient registration form is extended to verify the patient's email address and mobile number at the time of registration, before the record is treated as fully verified.

**3.2.1 Email Verification Flow**

- Adjacent to the Email field, a "Send Email Verification" button/link is displayed once a syntactically valid email address has been entered.
- On click, the system sends a verification email (link or code) to the entered address and disables the button for a short cooldown period to prevent spam.
- Once the patient confirms via the link (or enters the code, if code-based), the field status updates to "Verified Email" with a green check indicator.
- If the email address is edited after verification, the verified status is cleared and re-verification is required.
- Unverified emails are still saved with the record but flagged as unverified.

**3.2.2 Mobile Number Verification Flow**

- Adjacent to the Mobile Number field, a "Send Mobile Number" / "Send OTP" button is displayed once a syntactically valid number has been entered.
- On click, the system sends a one-time password (OTP) via SMS to the entered number.
- An "Enter OTP" input appears for the patient/staff to key in the received code, with a limited validity window (e.g., 5-10 minutes) and a limited number of attempts.
- On successful match, the field status updates to "Verified Phone Number" with a green check indicator; on repeated failure or expiry, the patient can request the OTP again (subject to a resend cooldown / daily limit).
- If the mobile number is edited after verification, the verified status is cleared and re-verification is required.

**3.2.3 Verified Indicator on Patient Name**

- Once both email and mobile number are verified, a checkmark icon is appended immediately after the patient's name wherever it is displayed (registration form, patient list, prescription dashboard, OPD search results, patient detail dialog).
- If only one of the two (email or phone) is verified, no checkmark is shown - both must be verified to display the indicator (see open question in Section 5).
- Hovering/tapping the checkmark shows a tooltip: "Email and phone verified."

**3.2.4 Acceptance Criteria**

- Given a patient enters a valid email and clicks "Send Email Verification," a verification email is sent and the button enters a cooldown state.
- Given a patient completes the email link/code flow, the email field shows "Verified Email."
- Given a patient enters a valid mobile number and requests an OTP, an SMS is sent and the OTP entry field is shown.
- Given a correct OTP is entered within the validity window, the phone field shows "Verified Phone Number."
- Given both email and phone are verified, a checkmark appears next to the patient's name across the application.
- Given the patient edits an already-verified email or phone number, the verified status resets.

## **3.3 OPD Assignment**

Staff assigning a patient to OPD must be able to quickly locate an existing patient and confirm identity before completing the assignment.

**3.3.1 Search & Select Patient**

- A search-select (type-ahead) input allows staff to search registered patients by name, phone number, or patient ID.
- Results update as the user types (minimum 2-3 characters), showing a dropdown list of matching patients with name, age/gender, and phone number for disambiguation.
- Matching patient names in the results display the verified checkmark (per Section 3.2.3) when applicable.
- If no match is found, the list offers a "Register new patient" shortcut into the registration flow.

**3.3.2 Patient Detail Dialog Box**

- Selecting a patient from the search results opens a dialog box (modal) showing key patient details: name (with verified checkmark if applicable), age/gender, contact number, email, last visit date, and any critical medical flags (e.g., allergies), without navigating away from the OPD assignment screen.
- The dialog includes actions to "Confirm & Assign to OPD" or "Cancel" and return to search.
- Staff can review the details before confirming, reducing the risk of assigning the wrong patient record.

**3.3.3 Acceptance Criteria**

- Given staff types a patient name or phone number in the OPD assignment search, matching patients appear in a dropdown within an acceptable response time (see Section 4).
- Given staff selects a patient from the dropdown, a dialog box opens displaying that patient's details.
- Given staff confirms in the dialog, the patient is assigned to OPD and the dialog closes.
- Given staff cancels in the dialog, no assignment is made and control returns to the search.

# **4\. Non-Functional Requirements**

| **Category**           | **Requirement**                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Performance**        | Dashboard grid loads within 2 seconds for up to 1,000 visible records; patient search results return within 1 second of the last keystroke (debounced).                                                            |
| **Security & Privacy** | Patient data, OTPs, and verification tokens are transmitted over encrypted channels (HTTPS) and stored in compliance with applicable healthcare data protection regulations. OTPs are single-use and time-limited. |
| **Availability**       | Verification services (email/SMS) and OPD assignment must be available during clinic operating hours with a target uptime of 99.5%.                                                                                |
| **Usability**          | Verification status and the verified checkmark must be visually clear and consistent across all screens where the patient name appears.                                                                            |
| **Auditability**       | All verification attempts (sent, verified, failed, expired) and OPD assignments are logged with timestamp and user for audit purposes.                                                                             |
| **Scalability**        | The dashboard grid and search must remain performant as patient and visit volumes grow (pagination/virtualization, indexed search).                                                                                |

# **5\. Assumptions, Constraints & Open Questions**

## **5.1 Assumptions**

- Patients already exist in a central registration database that the Prescription Dashboard and OPD Assignment module both read from.
- An SMS gateway and an email service provider are available (existing or to be procured) for OTP and verification email delivery.
- "Billed Tablet" refers to tablets billed as part of the pharmacy/billing process linked to a visit; exact costing logic resides in the billing module and is out of scope here.

## **5.2 Constraints**

- Verification flows depend on third-party SMS/email delivery reliability and cost; delays are outside the application's direct control.
- Regulatory requirements for patient data handling (regional health data protection laws) must be confirmed with legal/compliance before implementation.

## **5.3 Open Questions for Stakeholders**

- Should the verified checkmark appear once either email or phone is verified, or only when both are verified (this document assumes both are required)?
- Should unverified patients be blocked from OPD assignment, or only flagged?
- What is the required OTP length, expiry duration, and resend cooldown?
- Should "Reason for Visit" be free text, a coded dropdown, or both?

# **6\. Out of Scope**

- Pharmacy inventory management and stock-level tracking.
- Detailed billing/invoice generation logic beyond the "Billed Tablets" summary shown on the dashboard.
- Doctor scheduling and appointment booking workflows.
- Electronic Medical Record (EMR) clinical documentation beyond prescription summary.

# **7\. Success Criteria**

- Staff can view patient name, reason for visit, prescribed medicine, and billed tablets for any visit on a single dashboard without cross-referencing other screens.
- A measurable reduction in duplicate or invalid patient records after email/phone verification is introduced.
- Verified patients are visually distinguishable (checkmark) in all relevant lists and searches.
- Average time to complete an OPD assignment for an existing patient decreases, measured via search-to-confirm duration.