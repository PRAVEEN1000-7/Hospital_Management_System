# Phase 4 — Reports & Support: Use Cases & Wireframe Flow

> **Tables (4):** notifications, notification_templates, notification_queue, audit_logs
> **Focus:** Notifications, Audit Logging, Reports (built on Phase 0-3 data)

---

## Eraser.io Use Case Diagram

Copy the code below into [eraser.io](https://app.eraser.io) → Diagram as Code:

```eraser
// =============================================================================
// PHASE 4: REPORTS & SUPPORT — USE CASE DIAGRAM
// =============================================================================

// Actors
Super Admin [icon: shield, color: red]
Admin [icon: user-check, color: orange]
Any User [icon: user, color: blue]
System [icon: cpu, color: gray]

// ─────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────

View In App Notifications [icon: bell, color: gray] {
  description: "View bell icon alerts: appointments, prescriptions, billing, system"
}

Manage Notification Templates [icon: mail, color: gray] {
  description: "Create/edit message templates with {{variables}} for SMS/email/WhatsApp"
}

Send Scheduled Notification [icon: send, color: gray] {
  description: "Queue SMS/email/WhatsApp messages with retry logic"
}

// ─────────────────────────────────────────────
// Audit Logs
// ─────────────────────────────────────────────

Log Audit Entry [icon: eye, color: gray] {
  description: "Auto-record every create/update/delete with before/after state"
}

View Audit Logs [icon: search, color: gray] {
  description: "Filter audit trail by user, entity, action, date range"
}

// ─────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────

Generate Revenue Reports [icon: bar-chart, color: emerald] {
  description: "Daily/monthly/yearly revenue from invoices, payments, refunds"
}

Generate Operational Reports [icon: activity, color: emerald] {
  description: "Patient count, appointment stats, pharmacy sales, stock levels"
}

Export Report Data [icon: download, color: emerald] {
  description: "Export reports as PDF, CSV, or Excel"
}

// ─────────────────────────────────────────────
// Relationships
// ─────────────────────────────────────────────

Any User > View In App Notifications

Admin > Manage Notification Templates
Admin > Generate Revenue Reports
Admin > Generate Operational Reports
Admin > Export Report Data

Super Admin > View Audit Logs
Super Admin > Generate Revenue Reports
Super Admin > Generate Operational Reports

System > Send Scheduled Notification
System > Log Audit Entry
```

---

## Use Case Descriptions

### UC-4.1: View In-App Notifications
| Field | Detail |
|-------|--------|
| **Actor** | Any User |
| **Tables** | `notifications` |
| **Main Flow** | 1. User clicks bell icon in the header<br>2. System shows unread notifications (badge count)<br>3. Each notification has: title, message, type, priority<br>4. Click notification → navigate to the referenced entity<br>&nbsp;&nbsp;&nbsp;(e.g., type="appointment", reference_id → appointment detail page)<br>5. Mark as read → `is_read` = true, `read_at` set |
| **Notification Types** | appointment, prescription, billing, inventory, system |
| **Priority Levels** | low, normal, high, urgent (urgent may trigger sound) |

### UC-4.2: Manage Notification Templates
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `notification_templates` |
| **Main Flow** | 1. View existing templates by channel (SMS, email, WhatsApp, in-app)<br>2. Create/edit template with:<br>&nbsp;&nbsp;&nbsp;• Code identifier (e.g., "appointment_reminder")<br>&nbsp;&nbsp;&nbsp;• Channel: sms, email, whatsapp, in_app<br>&nbsp;&nbsp;&nbsp;• Locale: en, es, ar (multi-language)<br>&nbsp;&nbsp;&nbsp;• Subject (email only)<br>&nbsp;&nbsp;&nbsp;• Body with `{{variables}}`: `{{patient_name}}`, `{{doctor_name}}`, `{{time}}`<br>3. Activate/deactivate templates |
| **Example Template** | Code: "appointment_reminder"<br>Body: "Dear {{patient_name}}, your appointment with Dr. {{doctor_name}} is at {{time}} on {{date}}. Please arrive 15 minutes early." |

### UC-4.3: Send Scheduled Notification
| Field | Detail |
|-------|--------|
| **Actor** | System (automated) |
| **Tables** | `notification_queue` |
| **Main Flow** | 1. Event triggers notification (e.g., appointment booked)<br>2. System selects template by code + channel<br>3. Fills `{{variables}}` with actual data<br>4. Creates queue entry: recipient, subject, body, channel<br>5. Set `scheduled_at` (e.g., 1 hour before appointment)<br>6. Background worker processes queue:<br>&nbsp;&nbsp;&nbsp;• "pending" → attempts delivery<br>&nbsp;&nbsp;&nbsp;• Success → status = "sent", `sent_at` set<br>&nbsp;&nbsp;&nbsp;• Failure → increment `attempts`, log `error_message`<br>&nbsp;&nbsp;&nbsp;• Max 3 retries before status = "failed" |

### UC-4.4: Log Audit Entry
| Field | Detail |
|-------|--------|
| **Actor** | System (automated) |
| **Tables** | `audit_logs` |
| **Main Flow** | Every significant action auto-logged:<br>1. **Create**: entity_type, entity_id, new_values (JSON)<br>2. **Update**: entity_type, entity_id, old_values + new_values (JSON diff)<br>3. **Delete**: entity_type, entity_id, old_values<br>4. **Login/Logout**: user_id, ip_address, user_agent<br>5. **Export/Print**: what was exported/printed<br><br>Each entry records: user_id, ip_address, user_agent, request_path, timestamp<br>Entries are **immutable** — never updated or deleted |
| **Entities Tracked** | patients, users, invoices, prescriptions, appointments, medicines, purchase_orders, insurance_claims, and all major tables across phases |

### UC-4.5: View Audit Logs
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `audit_logs` |
| **Main Flow** | 1. Open audit log viewer<br>2. Filter by: user, entity_type, action, date range<br>3. View entries: who did what, to which record, when, from where<br>4. Expand entry to see `old_values` → `new_values` diff<br>5. Use for: security investigations, compliance audits, dispute resolution |

### UC-4.6: Generate Revenue Reports
| Field | Detail |
|-------|--------|
| **Actor** | Admin, Super Admin |
| **Tables** | `invoices`, `payments`, `refunds`, `daily_settlements` (reads, not writes) |
| **Main Flow** | 1. Select report type: daily, monthly, yearly, custom range<br>2. System aggregates from billing tables:<br>&nbsp;&nbsp;&nbsp;• Total invoiced, total paid, total outstanding<br>&nbsp;&nbsp;&nbsp;• Breakdown by payment mode (cash/card/online)<br>&nbsp;&nbsp;&nbsp;• Total refunds issued<br>&nbsp;&nbsp;&nbsp;• Revenue by department, by doctor<br>&nbsp;&nbsp;&nbsp;• Insurance claims summary<br>3. Display charts and summary tables<br>4. Export as PDF/CSV/Excel |

### UC-4.7: Generate Operational Reports
| Field | Detail |
|-------|--------|
| **Actor** | Admin, Super Admin |
| **Tables** | `appointments`, `patients`, `pharmacy_dispensing`, `stock_movements`, etc. (reads) |
| **Main Flow** | 1. Select report category:<br>&nbsp;&nbsp;&nbsp;• **Patient**: new registrations, demographics, visit frequency<br>&nbsp;&nbsp;&nbsp;• **Appointment**: booked vs completed vs cancelled, avg wait time<br>&nbsp;&nbsp;&nbsp;• **Pharmacy**: top medicines, stock levels, expiring items<br>&nbsp;&nbsp;&nbsp;• **Optical**: orders by status, avg delivery time<br>&nbsp;&nbsp;&nbsp;• **Inventory**: stock value, turnover, reorder alerts<br>2. System queries across Phase 0-3 tables<br>3. Display dashboards with KPI cards and trend charts |

### UC-4.8: Export Report Data
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | Any read-only access to Phase 0-3 tables |
| **Main Flow** | 1. Generate report (revenue or operational)<br>2. Click "Export" → choose format: PDF, CSV, Excel<br>3. System generates file with report data<br>4. Download triggers `audit_log` entry (action = "export") |

---

## Data Flow: Event → Notification Delivery

```
Event occurs (e.g., appointment booked)
        │
        ▼
┌─ notifications ──────────────────────┐
│  Create in-app notification:         │
│  title: "New Appointment"            │
│  message: "Patient Rahul at 3:00 PM" │
│  type: "appointment"                 │
│  reference_id: appointment.id        │
│  → Shows in bell icon (unread)       │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ notification_templates ─────────────┐
│  Lookup: code="appointment_reminder" │
│  channel="sms", locale="en"          │
│  body: "Dear {{patient_name}}..."    │
│  Fill: variables with actual data    │
└───────────┬──────────────────────────┘
            │
            ▼
┌─ notification_queue ─────────────────┐
│  channel: "sms"                      │
│  recipient: "+919876543210"          │
│  body: "Dear Rahul, your appt..."    │
│  scheduled_at: 1 hour before appt   │
│  status: "pending"                   │
│                                      │
│  Background Worker:                  │
│    → Send via SMS provider           │
│    → Success: status="sent"          │
│    → Failure: attempts++, retry      │
│    → Max retries: status="failed"    │
└──────────────────────────────────────┘
```

## Data Flow: Audit Log Lifecycle

```
User performs action (e.g., update patient)
        │
        ▼
┌─ audit_logs ─────────────────────────┐
│  user_id: "uuid-of-receptionist"     │
│  action: "update"                    │
│  entity_type: "patient"              │
│  entity_id: "uuid-of-patient"        │
│  entity_name: "Rahul Kumar"          │
│  old_values: {                       │
│    "phone": "+911234567890"          │
│  }                                   │
│  new_values: {                       │
│    "phone": "+919876543210"          │
│  }                                   │
│  ip_address: "192.168.1.101"         │
│  user_agent: "Chrome 120 / Win 11"   │
│  request_path: "/api/v1/patients/x"  │
│  created_at: "2026-02-24T14:30:00Z"  │
│                                      │
│  ⚠ IMMUTABLE — never updated/deleted  │
└──────────────────────────────────────┘
```

## Cross-Phase Integration: Complete System Flow

```
PHASE 0 (Foundation)                    PHASE 4 (Support)
┌────────────────────┐                  ┌────────────────────────┐
│ hospitals           │                  │                        │
│ departments         │──── ALL ───────→│ audit_logs             │
│ users, roles        │   ACTIONS       │   (who, what, when)    │
│ hospital_settings   │                  │                        │
└────────┬───────────┘                  │ notifications          │
         │                              │   (bell icon alerts)   │
         ▼                              │                        │
PHASE 1 (Core)                          │ notification_queue     │
┌────────────────────┐                  │   (SMS, email, WA)     │
│ patients            │                  │                        │
│ doctors             │──── ALL ───────→│ notification_templates │
│ appointments        │   EVENTS        │   ({{variable}} msgs)  │
│ appointment_queue   │                  │                        │
│ id_cards            │                  │ ─── REPORTS ────────── │
└────────┬───────────┘                  │ Revenue: invoices,     │
         │                              │   payments, refunds    │
         ▼                              │ Operations: patients,  │
PHASE 2 (Clinical)                      │   appointments, stock  │
┌────────────────────┐                  │ Exports: PDF, CSV,     │
│ prescriptions       │                  │   Excel                │
│ medicines           │──── ALL ───────→│                        │
│ pharmacy_dispensing  │   TRANSACTIONS  │                        │
│ optical_orders      │                  └────────────────────────┘
│ optical_repairs     │
└────────┬───────────┘
         │
         ▼
PHASE 3 (Billing & Inventory)
┌────────────────────┐
│ invoices            │
│ payments            │──── ALL ──────→ (to Phase 4)
│ insurance_claims    │   FINANCIALS
│ purchase_orders     │
│ stock_movements     │
└────────────────────┘
```
