# HMS — Frontend UI/UX Specification

## 1. Design System

### 1.1 Color Palette (Configurable per hospital)
```
Primary:     #1E40AF (Blue 800)     — Primary actions, headers
Primary Light: #3B82F6 (Blue 500)   — Hover states, links
Secondary:   #059669 (Emerald 600)  — Success, confirmations
Warning:     #D97706 (Amber 600)    — Warnings, pending states
Danger:      #DC2626 (Red 600)      — Errors, delete actions, critical alerts
Info:        #0284C7 (Sky 600)      — Information badges
Neutral:     #6B7280 (Gray 500)     — Secondary text, borders
Background:  #F9FAFB (Gray 50)     — Page background
Surface:     #FFFFFF               — Card/panel background
Text Primary: #111827 (Gray 900)   — Main text
Text Secondary: #6B7280 (Gray 500) — Secondary text
```

### 1.2 Typography
```
Font Family:  Inter (Latin), Noto Sans (CJK), Noto Sans Arabic (Arabic)
Heading 1:    24px / 32px line-height / font-weight 700
Heading 2:    20px / 28px / 600
Heading 3:    16px / 24px / 600
Body:         14px / 20px / 400
Body Small:   12px / 16px / 400
Caption:      11px / 14px / 400
```

### 1.3 Spacing Scale (Tailwind default)
`4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px`

### 1.4 Breakpoints (Responsive)
| Breakpoint | Width | Target Device |
|-----------|-------|---------------|
| `xs` | < 640px | Small phones (portrait) |
| `sm` | ≥ 640px | Large phones (landscape) |
| `md` | ≥ 768px | Tablets (portrait) |
| `lg` | ≥ 1024px | Tablets (landscape), laptops |
| `xl` | ≥ 1280px | Desktops |
| `2xl` | ≥ 1536px | Large desktops |

### 1.5 Component Sizes
| Component | Size | Touch Target |
|-----------|------|-------------|
| Button (sm) | h-8 (32px) | — |
| Button (md) | h-10 (40px) | 44px tap area |
| Button (lg) | h-12 (48px) | — |
| Input | h-10 (40px) | 44px tap area |
| Table row | h-12 (48px) | 44px tap area |
| Sidebar item | h-10 (40px) | 44px tap area |
| Icon button | 36×36px | 44×44px tap area |

---

## 2. Layout Structure

### 2.1 Authenticated Layout (MainLayout)

```
┌─────────────────────────────────────────────────────┐
│ Header (h-14, fixed top, z-50)                      │
│ [☰ Hamburger] [Logo + Name] ... [🔔 Bell] [🌐] [👤]│
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │  Main Content Area                       │
│ (w-64)   │  ┌────────────────────────────────────┐  │
│ (w-16    │  │ Breadcrumb                         │  │
│ collapsed)│  ├────────────────────────────────────┤  │
│          │  │ Page Header (title + actions)       │  │
│ [Dashboard] │ ├────────────────────────────────────┤  │
│ [Patients]│  │                                    │  │
│ [Doctors] │  │ Page Content                       │  │
│ [Appts]  │  │ (scrollable)                       │  │
│ [Rx]     │  │                                    │  │
│ [Pharmacy]│  │                                    │  │
│ [Optical] │  │                                    │  │
│ [Billing] │  │                                    │  │
│ [Inventory]│ │                                    │  │
│ [Reports] │  │                                    │  │
│ [Admin]  │  │                                    │  │
│          │  └────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────┘
```

**Mobile (< 768px):**
- Sidebar becomes a slide-out drawer triggered by hamburger
- Header is always visible
- Content takes full width
- Tables switch to card/list view
- Forms become single-column

**Tablet (768px - 1024px):**
- Sidebar collapsed by default (icons only, w-16)
- Expands on hover or hamburger click
- Content area responsive

**Desktop (> 1024px):**
- Sidebar expanded by default
- User can toggle collapse/expand
- Preference saved to localStorage

### 2.2 Auth Layout
```
┌─────────────────────────────────────┐
│       Hospital Logo                  │
│       Hospital Name                  │
│  ┌─────────────────────────────────┐ │
│  │                                 │ │
│  │   Login Form / Reset Form       │ │
│  │                                 │ │
│  └─────────────────────────────────┘ │
│       © Hospital Name 2026           │
└─────────────────────────────────────┘
```
- Centered card on background
- Configurable hospital logo/name
- Responsive (card goes full width on mobile)

---

## 3. Page-by-Page UI Specification

### 3.1 Login Page
**URL:** `/login`

**Elements:**
- Hospital logo (configurable)
- Hospital name
- Email/Username input
- Password input (with show/hide toggle)
- "Remember me" checkbox
- "Login" button (primary, full width)
- "Forgot password?" link
- Language selector dropdown (bottom corner)

**Interactions:**
- Enter key submits form
- Loading spinner on button while submitting
- Error toast for invalid credentials: "Invalid email or password"
- If MFA enabled → redirect to MFA verification page
- If account locked → show "Account locked. Try again in X minutes."
- If `must_change_password` → redirect to password change page
- After successful login → redirect to role-based dashboard

**Validation (client-side):**
- Email: required, valid format
- Password: required, min 1 char (actual policy validated server-side)

---

### 3.2 Dashboard Page
**URL:** `/dashboard`

**Varies by role. Widgets shown based on permissions:**

#### Admin Dashboard:
```
┌──────────┬──────────┬──────────┬──────────┐
│ Today's  │ Revenue  │ Patients │ Low Stock│
│ Appts: 45│ ₹12,500  │ Served:32│ Alerts: 5│
│ [↑12%]   │ [↑8%]    │ [New: 8] │ [View]   │
├──────────┴──────────┴──────────┴──────────┤
│  Revenue Chart (Line/Bar - last 7 days)    │
│  [Day | Week | Month toggle]               │
├────────────────────┬───────────────────────┤
│ Live Queue Status  │ Recent Activities     │
│ Dr.A: 5 waiting    │ • Patient registered  │
│ Dr.B: 3 waiting    │ • Invoice #123 paid   │
│ Dr.C: 7 waiting    │ • Rx #456 dispensed   │
├────────────────────┴───────────────────────┤
│ Department-wise Revenue (Pie Chart)         │
│ [OPD: 40%] [Pharmacy: 35%] [Optical: 25%] │
└─────────────────────────────────────────────┘
```

#### Doctor Dashboard:
- Today's appointments list
- Current queue (who's next)
- Patients seen today count
- Quick "Start Consultation" button
- Recent prescriptions

#### Receptionist Dashboard:
- Quick patient search
- Today's appointment queue
- New registration button
- Walk-in booking button
- Upcoming appointments list

#### Pharmacist Dashboard:
- Pending prescriptions count
- Today's dispensing count
- Low stock alerts
- Expiring soon alerts
- Quick counter sale button

---

### 3.3 Patient List Page
**URL:** `/patients`

**Elements:**
- Page header: "Patients" + "Register New Patient" button (primary)
- Search bar: universal search (name, phone, ID) with debounce (300ms)
- Filters row: Gender dropdown, Date range (registered), Status (active/inactive)
- Data table:
  - Columns: Photo (avatar), PRN (12-digit), Name, Phone, Gender, Age, Last Visit, Actions
  - Row click → navigate to detail
  - Actions: View, Edit, ID Card (🆔), Print Card
- Pagination: Page size selector (10, 20, 50), page navigation
- Empty state: illustration + "No patients found" + CTA

**Mobile view:**
- Search and filters in collapsible panel
- Card list instead of table:
```
┌─────────────────────────────────────┐
│ [📷] Jane Doe          PRN: HCF265...│
│          F, 32 yrs                  │
│          📞 +1-202-555-1234         │
│          Last visit: Feb 10, 2026   │
│          [View] [Edit] [🆔 ID Card]  │
└─────────────────────────────────────┘
```

---

### 3.4 Patient Registration Page
**URL:** `/patients/new`

**Form sections (multi-step on mobile, all visible on desktop):**

**Step 1 — Personal Information:**
- Photo capture area:
  - Webcam preview with capture button (if camera available)
  - "Upload Photo" fallback button
  - Crop/preview of captured/uploaded photo
  - Remove button
- First Name* (text, max 100)
- Last Name* (text, max 100)
- Date of Birth (date picker — if entered, auto-calculates age)
- OR Age Years + Age Months (number inputs — shown if DOB not entered)
- Gender* (radio: Male, Female, Other, Prefer not to say)
- Blood Group (select: A+, A-, B+, B-, AB+, AB-, O+, O-)
- Marital Status (select: Single, Married, Divorced, Widowed)

**Step 2 — Contact Information:**
- Country Code* (searchable select with flag, default from hospital country)
- Phone Number* (input, validated per country)
- Secondary Phone (optional)
- Email (optional, validated)

**Step 3 — Identification:**
- National ID Type (select: based on hospital country — SSN, Passport, Aadhaar, etc.)
- National ID Number (text — masked display after save)

**Step 4 — Address:**
- Address Line 1
- Address Line 2
- City
- State/Province (select or text based on country)
- Postal/ZIP Code
- Country* (select, defaults to hospital country)

**Step 5 — Emergency Contact:**
- Contact Name
- Contact Phone (with country code)
- Relationship (select: Spouse, Parent, Child, Sibling, Friend, Other)

**Step 6 — Medical Info:**
- Known Allergies (textarea or tag input)
- Chronic Conditions (textarea or tag input)
- Notes (textarea)

**Step 7 — Consent:**
- Registration consent checkbox with text
- Data usage consent checkbox
- Photo consent checkbox (if photo taken)
- Digital signature pad (optional)

**Form Actions:**
- "Register Patient" (primary button)
- "Save as Draft" (secondary — future feature)
- "Cancel" (text button → confirm discard dialog)

**After successful registration:**
- Success toast: "Patient HCF265GP000148 registered successfully"
- Dialog with options:
  - "🆔 Generate ID Card?" → Opens ID Card preview with front/back
  - "📧 Email ID Card?" → Sends PDF to patient's email
  - "🖨️ Print ID Card?" → Print-optimized card opens
  - "Skip" → Redirect to patient detail page
- The 12-digit PRN is auto-generated and displayed immediately

**Error handling:**
- Duplicate detection: after phone number entry, async check → warning banner: "A patient with this phone number already exists: [Name]. [View Existing] or [Continue Anyway]"
- Real-time field validation with inline error messages
- Scroll to first error on submit

---

### 3.5 Patient Detail Page
**URL:** `/patients/:id`

**Header:** Patient photo, name, PRN (12-digit), age, gender, status badge
**Tab navigation:**
- **Overview**: Contact info, address, emergency contact, medical info
- **Appointments**: List of all appointments with status, doctor
- **Prescriptions**: List of prescriptions with diagnosis, doctor
- **Invoices**: List of invoices with amount, status, payment
- **Documents**: Uploaded documents grid/list
- **ID Card**: View/generate/download/email/print soft ID card (see Section 3.15 below)
- **Timeline**: Chronological activity log
- **Insurance**: Insurance policies

---

### 3.6 Appointment Booking Page
**URL:** `/appointments/new`

**Step 1 — Select Patient:**
- Patient search (by name/phone/ID)
- Selected patient card shows basic info
- "Register New Patient" quick link

**Step 2 — Select Doctor:**
- Department filter
- Doctor cards with name, specialization, availability status
- Or dropdown select

**Step 3 — Select Date & Time:**
- Date picker (calendar view)
- Available slots displayed as clickable chips:
  ```
  Morning:    [09:00] [09:15] [09:30] [09:45] [10:00] ...
  Afternoon:  [14:00] [14:15] [14:30] ...
  ```
- Unavailable slots grayed out
- Doctor on leave → show "Not available on this date"

**Step 4 — Appointment Details:**
- Visit Type: New / Follow-up
- Appointment Type: Scheduled / Walk-in / Emergency
- Priority: Normal / Urgent / Emergency
- Chief Complaint (textarea)

**Step 5 — Confirm:**
- Summary card with all details
- Consultation fee display
- "Book Appointment" button
- After booking: option to send confirmation SMS/Email

---

### 3.7 Queue Management Page
**URL:** `/appointments/queue`

**Layout: Kanban-style board**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   WAITING   │   CALLED    │ CONSULTING  │  COMPLETED  │
├─────────────┤─────────────┤─────────────┤─────────────┤
│ #12 Patient │ #14 Patient │ #13 Patient │ #10 Patient │
│ 10:00 AM    │ 10:15 AM    │ 10:05 AM    │ 09:45 AM    │
│ Walk-in     │ Scheduled   │ Scheduled   │ Scheduled   │
│ [Call]      │             │ [Done]      │             │
│             │             │             │             │
│ #15 Patient │             │             │ #11 Patient │
│ 10:30 AM    │             │             │ 09:50 AM    │
│ Emergency🔴 │             │             │             │
│ [Call]      │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Features:**
- Filter by doctor
- Live updates via WebSocket
- Queue number displays for waiting room screens
- Emergency patients shown with red badge
- Drag and drop to reorder (admin only)
- "Call Next" button for doctor view
- Time waiting displayed
- Audio notification when patient is called (for doctor view)

**Mobile:** Vertical swim-lane layout, swipeable

---

### 3.8 Prescription Creation Page
**URL:** `/prescriptions/new?appointment_id=xxx`

**Layout:**
```
┌────────────────────────────────────────────────┐
│ Patient: Jane Doe (F, 32) | PAT-001           │
│ Doctor: Dr. Smith | Date: Feb 15, 2026         │
├────────────────────────────────────────────────┤
│ Diagnosis:  [________________________]         │
│                                                │
│ Clinical Notes:                                │
│ [________________________________________]     │
│                                                │
│ Template: [Select template ▼] [Load]           │
├────────────────────────────────────────────────┤
│ Medicines:                        [+ Add Item] │
│ ┌──────────────────────────────────────────┐   │
│ │ 1. [Medicine Search ▼] [500mg] [1-0-1]  │   │
│ │    Duration: [5] [days ▼]  Route: [Oral] │   │
│ │    Instructions: [After food        ]    │   │
│ │    ☐ Allow substitution          [🗑 Del]│   │
│ ├──────────────────────────────────────────┤   │
│ │ 2. [Medicine Search ▼] ...               │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│ ⚠️ Drug Interaction Alert (if any)             │
│ Warfarin + Aspirin: High risk of bleeding      │
│                                                │
│ Advice to Patient:                             │
│ [________________________________________]     │
│                                                │
│ Lab Orders:                     [+ Add Order]  │
│ ┌──────────────────────────────────────────┐   │
│ │ 1. [Test Name] [Urgency ▼] [Instructions]│  │
│ └──────────────────────────────────────────┘   │
│                                                │
│ [Save Draft]  [Finalize & Print]  [Cancel]     │
└────────────────────────────────────────────────┘
```

**Medicine search:** Autocomplete dropdown searching by brand name, generic name, or composition. Shows available stock.

**Drug interaction check:** Triggered automatically when 2+ medicines added. Shows warning alert if interactions found.

---

### 3.9 Pharmacy Dispensing Page
**URL:** `/pharmacy/dispensing`

**Layout:**
```
┌────────────────────────────────────────────────────┐
│ Pending Prescriptions              [Counter Sale]  │
├────────────────────────────────────────────────────┤
│ RX-001 | Jane Doe | Dr. Smith | 3 items | [View]  │
│ RX-002 | John Doe | Dr. Lee   | 5 items | [View]  │
│ RX-003 | Mary J.  | Dr. Smith | 2 items | [View]  │
├────────────────────────────────────────────────────┤
│                                                    │
│ Dispensing: RX-001 — Jane Doe                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ Medicine        │ Qty │ Batch      │ Price   │   │
│ ├──────────────────────────────────────────────┤   │
│ │ Paracetamol     │ 10  │ B2026-001  │ $5.50   │   │
│ │  500mg          │     │ Exp: 12/27 │         │   │
│ │ ☐ Substitute    │     │ [Select ▼] │         │   │
│ ├──────────────────────────────────────────────┤   │
│ │ Cough Syrup     │ 1   │ B2026-045  │ $8.99   │   │
│ │                 │     │ Exp: 03/27 │         │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ Subtotal: $14.49                                   │
│ Tax (5%): $0.72                                    │
│ Total:    $15.21                                   │
│                                                    │
│ [Dispense & Create Invoice]  [Save Draft]          │
└────────────────────────────────────────────────────┘
```

**Batch selection:** Auto-selects FEFO (First Expiry First Out). Pharmacist can override. Expired batches shown with red badge and disabled.

**Barcode scanning:** Button to activate camera for barcode scan → auto-fills medicine + batch.

---

### 3.10 Billing / Invoice Creation Page
**URL:** `/billing/invoices/new`

**Layout:**
```
┌────────────────────────────────────────────────────┐
│ New Invoice                                        │
├────────────────────────────────────────────────────┤
│ Patient: [Search patient ▼]                        │
│ Invoice Type: (○ OPD) (○ Pharmacy) (○ Optical)    │
│ Invoice Date: [Feb 15, 2026]                       │
├────────────────────────────────────────────────────┤
│ Items:                              [+ Add Item]   │
│ ┌─────────────────────────────────────────────┐    │
│ │ # │ Description    │ Qty │ Price │ Tax  │Total│  │
│ ├─────────────────────────────────────────────┤    │
│ │ 1 │ Consultation   │ 1   │$150  │ 0%   │$150│  │
│ │ 2 │ BP Check       │ 1   │$ 25  │ 0%   │$ 25│  │
│ │ 3 │ Paracetamol x10│ 1   │$  6  │ 5%   │$  6│  │
│ └─────────────────────────────────────────────┘    │
│                                                    │
│                      Subtotal:    $181.00          │
│                      Discount:   -$ 10.00          │
│                      Tax:        +$  0.30          │
│                      ─────────────────────         │
│                      Total:       $171.30          │
│                                                    │
│ Payment:                                           │
│ Mode: (○ Cash) (○ Card) (○ UPI) (○ Online)        │
│ Amount: [$171.30        ]                          │
│ Reference: [____________] (for card/online)        │
│                                                    │
│ [Issue & Pay]  [Save Draft]  [Cancel]              │
└────────────────────────────────────────────────────┘
```

**Auto-linking:** When opened from appointment or dispensing, items are pre-populated.

**Tax calculation:** Auto-applied based on tax configuration per item type.

**Print:** After payment, auto-prompt to print receipt. Receipt includes hospital logo, address, line items, payment details, QR code.

---

### 3.11 Reports Dashboard
**URL:** `/reports`

**Layout:**
```
┌────────────────────────────────────────────────────┐
│ Reports & Analytics                                │
│ Date Range: [Feb 1] to [Feb 28, 2026]  [Apply]    │
├────────────────────────────────────────────────────┤
│ ┌──────────┬──────────┬──────────┬──────────┐      │
│ │ Total    │ OPD      │ Pharmacy │ Optical  │      │
│ │$125,000  │ $45,000  │ $55,000  │ $25,000  │      │
│ │ ↑12%     │ ↑8%      │ ↑15%     │ ↑10%     │      │
│ └──────────┴──────────┴──────────┴──────────┘      │
│                                                    │
│ Revenue Trend (Line chart — daily or monthly)      │
│ ┌──────────────────────────────────────────────┐   │
│ │  📈                                          │   │
│ │                                              │   │
│ └──────────────────────────────────────────────┘   │
│ [Day view | Month view]                            │
│                                                    │
│ ┌─────────────────────┬────────────────────────┐   │
│ │ Top Selling Medicines│ Doctor Performance    │   │
│ │ 1. Paracetamol: 500 │ Dr.Smith: 120 consults│   │
│ │ 2. Amoxicillin: 350 │ Dr.Lee: 98 consults   │   │
│ │ 3. Omeprazole: 280  │ Dr.Chen: 87 consults  │   │
│ └─────────────────────┴────────────────────────┘   │
│                                                    │
│ [Export CSV]  [Export XLSX]  [Export PDF]           │
└────────────────────────────────────────────────────┘
```

---

### 3.12 Admin — User Management Page
**URL:** `/admin/users`

**Table columns:** Avatar, Reference # (12-digit), Name, Email, Role(s) (badges), Status (badge), Last Login, Actions
**Actions per row:** Edit, Activate/Deactivate, Reset Password, Send Password, 🆔 ID Card (with confirm dialog)

**Create user form (Full page or modal):**
- Personal info: First Name*, Last Name*, Email*, Username*
- Contact: Phone (with country code)
- Role assignment: Multi-select role checkboxes
- Department: Select dropdown
- Password: Super Admin sets initial password
  - Password field with generate random password button
  - "Send password via email" checkbox (checked by default)
- Photo upload: Upload photo for staff ID card
  - Webcam capture option
  - Upload from file option
  - Crop/preview
- On submit: User is created, password optionally emailed, 12-digit reference number auto-generated

**Reset Password dialog (Super Admin only):**
```
┌────────────────────────────────────┐
│ Reset Password for Dr. Smith       │
├────────────────────────────────────┤
│ New Password: [____________] [🎲]  │
│ ☑ Send password via email          │
│ ☑ Force password change on login    │
│                                    │
│ [Cancel]           [Reset & Send]  │
└────────────────────────────────────┘
```

**Send Password feature:**
- Button on user row: "📧 Send Password"
- Opens dialog: Enter password (or generate), add optional message
- Sends email with: login URL, username/email, password, instructions
- Toast confirmation: "Password sent to dr.smith@hospital.com"
- Audit logged

### 3.13 Admin — Role & Permission Page
**URL:** `/admin/roles`

**Permission Matrix UI:**
```
┌─────────────────────────────────────────────────┐
│ Role: Receptionist                              │
├─────────────────────────────────────────────────┤
│ Module      │ Create │ Read │ Update │ Delete   │
├─────────────┼────────┼──────┼────────┼──────────┤
│ Patients    │  ☑     │  ☑   │  ☑     │  ☐     │
│ Appointments│  ☑     │  ☑   │  ☑     │  ☐     │
│ Prescriptions│ ☐     │  ☑   │  ☐     │  ☐     │
│ Pharmacy    │  ☐     │  ☐   │  ☐     │  ☐     │
│ Billing     │  ☑     │  ☑   │  ☐     │  ☐     │
│ Reports     │  ☐     │  ☐   │  ☐     │  ☐     │
│ Admin       │  ☐     │  ☐   │  ☐     │  ☐     │
└─────────────┴────────┴──────┴────────┴──────────┘
│ [Save Permissions]                               │
└──────────────────────────────────────────────────┘
```

### 3.14 Admin — Hospital Settings
**URL:** `/admin/settings`

**Tabs:**
- **General**: Hospital name, address, contact, timezone, currency
- **Branding**: Logo upload, primary/secondary colors, print header/footer
- **Appointments**: Slot duration, buffer time, max per doctor, walk-in/emergency toggle
- **ID Formats**: Hospital code (2-char), Patient start sequence, Staff start sequence, Invoice prefix, Prescription prefix
- **Notifications**: Enable/disable SMS, Email, WhatsApp; test send
- **Tax Configuration**: CRUD for tax rules
- **Data Retention**: Archival period setting

---

### 3.15 Patient/Staff ID Card Page
**URL:** `/patients/:id/id-card` (also accessible from patient detail tab and user detail)

**Layout:**
```
┌────────────────────────────────────────────────┐
│ ID Card — Jane Doe                                │
│ PRN: HCF265GP000148                               │
├────────────────────────────────────────────────┤
│                                                    │
│  ┌─────────── FRONT SIDE ─────────────┐        │
│  │  🏥 HMS CORE HOSPITAL              │        │
│  │  ┌─────────┐                        │        │
│  │  │ [PHOTO] │   JANE DOE            │        │
│  │  │         │   DOB: May 15, 1990    │        │
│  │  │         │   Gender: ♀ Female     │        │
│  │  └─────────┘   Blood: O+           │        │
│  │                                     │        │
│  │  PRN: HCF265GP000148               │        │
│  │  ┌─────────┐                        │        │
│  │  │ [QR    ]│  Dept: General (GP)   │        │
│  │  │ [CODE  ]│  [██ GRAY BAND ██]     │        │
│  │  └─────────┘                        │        │
│  │  Registered: May 2026              │        │
│  └─────────────────────────────────────┘        │
│                                                    │
│  ┌─────────── BACK SIDE ──────────────┐        │
│  │  HMS Core Hospital                  │        │
│  │  123 Medical Ave, Chennai, India    │        │
│  │  Phone: +91-44-12345678            │        │
│  │  Email: info@hmscore.com           │        │
│  │  Web: www.hmscore.com              │        │
│  │                                     │        │
│  │  Emergency: 1800-123-4567          │        │
│  │  Reg #: HOSP/TN/2024/1234          │        │
│  │                                     │        │
│  │  Terms: This card is for identity   │        │
│  │  verification only. Report lost     │        │
│  │  cards immediately.                 │        │
│  │                                     │        │
│  │  Issued: Feb 19, 2026  v1          │        │
│  └─────────────────────────────────────┘        │
│                                                    │
│ Upload Photo:                                      │
│ [📷 Webcam Capture]  [📁 Upload Image]              │
│ (Max 5MB, JPG/PNG. Photo appears on front side)     │
│                                                    │
│ Actions:                                           │
│ [🔄 Regenerate]  [📧 Email to Patient]              │
│ [⬇️ Download PDF]  [🖨️ Print]                       │
└────────────────────────────────────────────────┘
```

**ID Card Design Details:**
- Modern credit-card-ratio layout with rounded corners
- Subtle gradient background matching department color (see dept color coding)
- Clean sans-serif typography (Inter font)
- QR code encodes the 12-digit PRN for quick scanning
- Department color band at bottom of front side
- Hospital logo fetched from Hospital Detail module settings
- Both sides rendered on one printable page

**Photo Upload Interactions:**
- Webcam capture: Opens camera preview, click to capture, confirm/retake
- File upload: Drag-and-drop zone or file picker
- Crop: Fixed ratio (1:1 square) crop tool after capture/upload
- Preview: Shows how photo will appear on ID card
- Max 5MB, JPEG/PNG only, auto-compressed to max 500KB

**Email ID Card:**
- Opens dialog with pre-filled patient email
- Custom message field (optional)
- Attaches PDF version of ID card
- Toast: "ID card sent to jane@example.com"

**Print:**
- Opens print-optimized view (both sides on one page)
- Standard credit-card size for cutting
- High contrast for clear printing

---

## 4. Shared UI Components Spec

### 4.1 DataTable Component
**Props:**
- `columns`: Column definitions (header, accessor, sortable, filterable, cell renderer)
- `data`: Array of row data
- `loading`: Boolean
- `pagination`: { page, perPage, total }
- `onPageChange`, `onSort`, `onFilter`
- `onRowClick`: Navigate to detail
- `emptyState`: Custom empty message
- `mobileCard`: Render function for mobile card view
- `selectable`: Enable row selection (checkbox)
- `actions`: Row action buttons
- `exportable`: Show export button

**Behavior:**
- Desktop: Standard table with sortable headers
- Mobile (<768px): Switches to card list automatically
- Loading: Shows skeleton rows
- Empty: Shows empty state illustration
- Sort indicators: ▲ ▼ on headers

### 4.2 Form Field Component
**Props:**
- `label`: Field label (i18n key)
- `name`: Form field name
- `type`: text, email, number, tel, date, select, textarea, checkbox, radio
- `required`: Show asterisk
- `error`: Error message (i18n key)
- `hint`: Help text
- `disabled`: Boolean

**Rendered:**
```
Label *
[________________]
Hint text shown here
✖ Error message shown in red
```

### 4.3 Phone Input Component
- Country code selector with flag icons
- Auto-format phone number based on country
- Validation using `libphonenumber-js`
- Default country from hospital settings

### 4.4 Address Form Component
- Adapts fields based on selected country
- US: Street, City, State (dropdown of 50 states), ZIP
- UK: Street, City, County, Postcode
- India: Street, City, State (dropdown), PIN
- Generic: Line 1, Line 2, City, State/Province (text), Postal Code

### 4.5 Currency Input Component
- Shows currency symbol based on hospital currency
- Thousand separators
- Max 2 decimal places
- Doesn't allow negative (unless refund context)

### 4.6 DatePicker Component
- Calendar popup
- Configurable date format per locale
- Min/max date constraints
- Keyboard navigation
- "Today" quick button

### 4.7 Confirmation Dialog
- Title, message, confirm/cancel buttons
- Destructive variant (red confirm button)
- Loading state on confirm
- `useConfirm()` hook returns `confirm()` Promise

### 4.8 Toast Notifications
- Positions: top-right
- Types: success (green), error (red), warning (amber), info (blue)
- Auto-dismiss: 5 seconds (configurable)
- Max 3 visible simultaneously
- Swipe to dismiss on mobile

### 4.9 Print Layout Component
- Wrapper that provides print-optimized CSS
- Hides navigation, headers, buttons
- Shows hospital logo, name, address
- Page breaks for multi-page content
- Triggered via `usePrint()` hook → `window.print()`

---

## 5. Accessibility (WCAG 2.1 AA)

- All interactive elements keyboard-navigable
- Focus indicators visible (ring-2 ring-blue-500)
- Color contrast ratio ≥ 4.5:1 for text
- ARIA labels on icon-only buttons
- Screen reader announcements for toasts and alerts
- Form errors linked to fields via `aria-describedby`
- Skip navigation link
- Heading hierarchy maintained (h1 → h2 → h3)
- Reduced motion support (`prefers-reduced-motion`)
- No information conveyed by color alone (always with icon/text)

---

## 6. RTL (Right-to-Left) Support

- `dir="rtl"` applied to `<html>` when Arabic/Hebrew/Urdu locale selected
- Tailwind RTL plugin for automatic LTR→RTL flipping
- Sidebar appears on right
- Text alignment flips
- Icons that imply direction (arrows, chevrons) flip
- Numbers remain LTR
- Tested languages: Arabic (ar), Hebrew (he), Urdu (ur)

---

## 7. Theme Support

- Light mode only initially (medical context — high readability)
- CSS custom properties for colors → easy dark mode addition later
- Hospital branding colors override primary/secondary via CSS variables
- Print always uses light theme with high contrast

---

## 8. Keyboard Shortcuts (Power Users)

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Global search |
| `Ctrl+N` | New (context-dependent: patient, appointment) |
| `Ctrl+P` | Print current page/document |
| `Esc` | Close modal/drawer |
| `Enter` | Submit form (when form focused) |
| `Tab/Shift+Tab` | Navigate fields |
| `←/→` | Navigate date picker |
| `↑/↓` | Navigate dropdown options |
