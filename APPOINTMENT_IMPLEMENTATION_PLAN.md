# Appointment Booking System - Implementation Plan

## Project Overview
Implementation plan for the Appointment Booking System module in the Hospital Management System. This system will support scheduled appointments, walk-in registrations, online consultations (Zoom), waitlist management, and comprehensive admin configurations.

**Design Principle:** Maintain existing HMS theme, layout patterns, and design system. Follow established code architecture.

---

## Database Schema Design

### 1. `doctor_schedules` Table
Stores weekly availability for doctors.

```sql
CREATE TABLE doctor_schedules (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6), -- 0=Monday, 6=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration INTEGER NOT NULL DEFAULT 30, -- minutes
    consultation_type VARCHAR(20) NOT NULL DEFAULT 'both', -- 'online', 'offline', 'both'
    max_patients_per_slot INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(doctor_id, weekday, start_time)
);

CREATE INDEX idx_doctor_schedules_doctor ON doctor_schedules(doctor_id);
CREATE INDEX idx_doctor_schedules_weekday ON doctor_schedules(weekday);
```

### 2. `blocked_periods` Table
Manages holidays, leaves, and unavailable periods.

```sql
CREATE TABLE blocked_periods (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = hospital-wide holiday
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255),
    block_type VARCHAR(20) DEFAULT 'leave', -- 'leave', 'holiday', 'emergency', 'other'
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX idx_blocked_periods_doctor ON blocked_periods(doctor_id);
CREATE INDEX idx_blocked_periods_dates ON blocked_periods(start_date, end_date);
```

### 3. `appointments` Table
Core appointment records (scheduled and walk-in).

```sql
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    appointment_number VARCHAR(50) UNIQUE NOT NULL, -- APT-YYYYMMDD-#### or WLK-YYYYMMDD-####
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    appointment_type VARCHAR(20) NOT NULL, -- 'scheduled', 'walk-in'
    consultation_type VARCHAR(20) NOT NULL, -- 'online', 'offline'
    appointment_date DATE NOT NULL,
    appointment_time TIME,
    slot_duration INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled'
    
    -- Walk-in specific
    queue_number VARCHAR(20), -- Q001, Q002, etc.
    queue_position INTEGER,
    estimated_wait_time INTEGER, -- minutes
    walk_in_registered_at TIMESTAMP WITH TIME ZONE,
    urgency_level VARCHAR(20), -- 'routine', 'urgent', 'emergency'
    
    -- Online consultation
    zoom_meeting_id VARCHAR(255),
    zoom_meeting_link TEXT,
    zoom_password VARCHAR(50),
    
    -- General info
    reason_for_visit TEXT,
    doctor_notes TEXT,
    diagnosis TEXT,
    prescription TEXT,
    fees DECIMAL(10, 2),
    payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'partial', 'waived'
    
    -- Insurance (optional)
    insurance_provider VARCHAR(255),
    insurance_policy_number VARCHAR(100),
    insurance_verified BOOLEAN DEFAULT FALSE,
    
    -- Notifications
    confirmation_sent BOOLEAN DEFAULT FALSE,
    reminder_sent BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    booked_by INTEGER REFERENCES users(id), -- Staff who created the appointment
    cancelled_by INTEGER REFERENCES users(id),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE SEQUENCE appointment_sequence START 1;
CREATE SEQUENCE walk_in_sequence START 1;

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_type ON appointments(appointment_type);
```

### 4. `waitlist` Table
Manages waitlist for fully booked slots.

```sql
CREATE TABLE waitlist (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preferred_date DATE NOT NULL,
    preferred_time TIME,
    consultation_type VARCHAR(20) NOT NULL,
    reason_for_visit TEXT,
    status VARCHAR(20) DEFAULT 'waiting', -- 'waiting', 'notified', 'confirmed', 'expired', 'cancelled'
    priority INTEGER DEFAULT 0, -- Lower number = higher priority
    notified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE, -- Notification expiry time
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_waitlist_patient ON waitlist(patient_id);
CREATE INDEX idx_waitlist_doctor_date ON waitlist(doctor_id, preferred_date);
CREATE INDEX idx_waitlist_status ON waitlist(status);
```

### 5. `appointment_settings` Table
Global and per-doctor configurations.

```sql
CREATE TABLE appointment_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    value_type VARCHAR(20) DEFAULT 'string', -- 'string', 'integer', 'boolean', 'json'
    description TEXT,
    is_global BOOLEAN DEFAULT TRUE,
    doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL for global settings
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO appointment_settings (setting_key, setting_value, value_type, description) VALUES
('default_slot_duration', '30', 'integer', 'Default appointment duration in minutes'),
('advance_booking_days', '30', 'integer', 'Maximum days in advance for booking'),
('cancellation_deadline_hours', '24', 'integer', 'Minimum hours before appointment to cancel'),
('buffer_time_minutes', '10', 'integer', 'Buffer time between consecutive appointments'),
('walk_in_enabled', 'true', 'boolean', 'Enable walk-in appointments'),
('max_walk_ins_per_doctor_per_day', '20', 'integer', 'Daily walk-in capacity per doctor'),
('walk_in_priority', 'fifo', 'string', 'Queue priority: fifo, urgent_first'),
('walk_in_wait_time_visible', 'true', 'boolean', 'Show estimated wait time to patients'),
('max_queue_length', '50', 'integer', 'Maximum walk-in queue length'),
('reminder_timing_days', '1', 'integer', 'Days before appointment to send reminder'),
('reminder_timing_hours', '1', 'integer', 'Hours before appointment to send reminder'),
('payment_enabled', 'false', 'boolean', 'Require payment during booking'),
('insurance_verification_enabled', 'false', 'boolean', 'Enable insurance verification'),
('zoom_enabled', 'true', 'boolean', 'Enable Zoom integration for online consultations'),
('auto_confirm_appointments', 'true', 'boolean', 'Auto-confirm appointments or require manual confirmation');
```

### 6. `appointment_audit_log` Table
Track all appointment actions.

```sql
CREATE TABLE appointment_audit_log (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'cancelled', 'rescheduled', 'completed', 'no-show'
    performed_by INTEGER REFERENCES users(id),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_appointment_audit_appointment ON appointment_audit_log(appointment_id);
```

---

## Backend Implementation

### Phase 1: Models & Schemas

**Files to Create:**

1. **`backend/app/models/appointment.py`**
   - `DoctorSchedule` model
   - `BlockedPeriod` model
   - `Appointment` model
   - `Waitlist` model
   - `AppointmentSetting` model
   - `AppointmentAuditLog` model
   - Enums: `AppointmentType`, `ConsultationType`, `AppointmentStatus`, `UrgencyLevel`, `WaitlistStatus`

2. **`backend/app/schemas/appointment.py`**
   - Pydantic schemas for all models
   - Request/response schemas (Create, Update, List, Detail)
   - Validation logic

**Code Pattern:**
```python
# backend/app/models/appointment.py
from sqlalchemy import Column, Integer, String, Date, Time, Boolean, DateTime, ForeignKey, Text, DECIMAL, Sequence
from sqlalchemy.sql import func
from ..database import Base
import enum

class AppointmentType(str, enum.Enum):
    SCHEDULED = "scheduled"
    WALK_IN = "walk-in"

class ConsultationType(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BOTH = "both"

class AppointmentStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no-show"
    RESCHEDULED = "rescheduled"

# ... models following existing pattern
```

### Phase 2: Services

**Files to Create:**

1. **`backend/app/services/schedule_service.py`**
   - `create_doctor_schedule()` - Add weekly schedule
   - `get_doctor_availability()` - Check available slots
   - `get_available_time_slots()` - Generate time slots for a date
   - `block_period()` - Block doctor availability
   - `validate_slot_availability()` - Check slot capacity
   - `calculate_next_available_slot()` - Find next free slot

2. **`backend/app/services/appointment_service.py`**
   - `generate_appointment_number()` - APT-YYYYMMDD-#### or WLK-YYYYMMDD-####
   - `create_appointment()` - Book appointment
   - `update_appointment()` - Modify appointment
   - `cancel_appointment()` - Cancel with validation
   - `reschedule_appointment()` - Move to different slot
   - `get_doctor_appointments()` - List for specific doctor
   - `get_patient_appointments()` - List for specific patient
   - `check_double_booking()` - Prevent conflicts
   - `mark_appointment_status()` - Update status (completed, no-show, etc.)

3. **`backend/app/services/walk_in_service.py`**
   - `register_walk_in()` - Register walk-in patient
   - `generate_queue_number()` - Q001, Q002...
   - `get_queue_position()` - Current position in queue
   - `estimate_wait_time()` - Calculate wait time
   - `assign_walk_in_to_doctor()` - Admin assigns patient
   - `process_walk_in_queue()` - Auto-process queue
   - `get_walk_in_queue_status()` - Real-time queue info

4. **`backend/app/services/waitlist_service.py`**
   - `add_to_waitlist()` - Join waitlist
   - `notify_waitlist_patient()` - Send slot available notification
   - `confirm_waitlist_slot()` - Patient confirms
   - `process_waitlist()` - Auto-process when slot opens
   - `get_waitlist_position()` - Patient's position

5. **`backend/app/services/zoom_service.py`**
   - `generate_zoom_meeting()` - Create meeting via Zoom API
   - `get_meeting_link()` - Retrieve meeting URL
   - `send_meeting_invite()` - Email with Zoom link
   - Configuration for Zoom API credentials

6. **`backend/app/services/notification_service.py`**
   - `send_appointment_confirmation()` - Email on booking
   - `send_appointment_reminder()` - 1 day/1 hour before
   - `send_cancellation_notification()` - On cancel
   - `send_waitlist_notification()` - Slot available
   - `send_walk_in_status_update()` - Queue updates
   - Email templates for each type

### Phase 3: Routers (API Endpoints)

**Files to Create:**

1. **`backend/app/routers/schedules.py`**
   ```
   POST   /api/v1/schedules/doctors/{doctor_id}  - Create schedule
   GET    /api/v1/schedules/doctors/{doctor_id}  - Get doctor schedule
   PUT    /api/v1/schedules/{schedule_id}        - Update schedule
   DELETE /api/v1/schedules/{schedule_id}        - Delete schedule
   GET    /api/v1/schedules/available-slots      - Get available slots (query: doctor_id, date)
   POST   /api/v1/schedules/block-period         - Block time period
   GET    /api/v1/schedules/blocked-periods      - List blocked periods
   ```

2. **`backend/app/routers/appointments.py`**
   ```
   POST   /api/v1/appointments                   - Create appointment
   GET    /api/v1/appointments                   - List appointments (filters: doctor, patient, date, status, type)
   GET    /api/v1/appointments/{id}              - Get appointment details
   PUT    /api/v1/appointments/{id}              - Update appointment
   DELETE /api/v1/appointments/{id}              - Cancel appointment
   POST   /api/v1/appointments/{id}/reschedule   - Reschedule appointment
   PATCH  /api/v1/appointments/{id}/status       - Update status
   GET    /api/v1/appointments/my-appointments   - Patient's appointments
   GET    /api/v1/appointments/doctor/{doctor_id}/today - Doctor's today schedule
   ```

3. **`backend/app/routers/walk_ins.py`**
   ```
   POST   /api/v1/walk-ins                       - Register walk-in
   GET    /api/v1/walk-ins/queue                 - Current queue status
   GET    /api/v1/walk-ins/queue/{patient_id}    - Patient's queue position
   POST   /api/v1/walk-ins/{id}/assign-doctor    - Assign to doctor
   GET    /api/v1/walk-ins/today                 - Today's walk-ins
   ```

4. **`backend/app/routers/waitlist.py`**
   ```
   POST   /api/v1/waitlist                       - Join waitlist
   GET    /api/v1/waitlist/my-waitlist           - Patient's waitlist entries
   POST   /api/v1/waitlist/{id}/confirm          - Confirm available slot
   DELETE /api/v1/waitlist/{id}                  - Remove from waitlist
   GET    /api/v1/waitlist/doctor/{doctor_id}    - Doctor's waitlist
   ```

5. **`backend/app/routers/appointment_settings.py`**
   ```
   GET    /api/v1/appointment-settings           - Get all settings
   PUT    /api/v1/appointment-settings/{key}     - Update setting
   GET    /api/v1/appointment-settings/doctor/{doctor_id} - Doctor-specific settings
   ```

6. **`backend/app/routers/appointment_reports.py`**
   ```
   GET    /api/v1/reports/appointments/statistics        - Overall stats
   GET    /api/v1/reports/appointments/doctor/{id}       - Doctor performance
   GET    /api/v1/reports/appointments/trends            - Trends analysis
   GET    /api/v1/reports/appointments/walk-in-stats     - Walk-in specific stats
   ```

### Phase 4: Background Tasks & Schedulers

**Files to Create:**

1. **`backend/app/tasks/appointment_tasks.py`**
   - Cron job: Send appointment reminders (1 day, 1 hour before)
   - Cron job: Process waitlist for next day
   - Cron job: Auto-expire old waitlist entries
   - Cron job: Update walk-in queue positions
   - Cron job: Generate daily appointment statistics

---

## Frontend Implementation

### Phase 1: Services (API Client)

**Files to Create:**

1. **`frontend/src/services/scheduleService.ts`**
   - API calls for doctor schedules
   - Available slots fetching

2. **`frontend/src/services/appointmentService.ts`**
   - CRUD operations for appointments
   - Reschedule, cancel logic

3. **`frontend/src/services/walkInService.ts`**
   - Walk-in registration
   - Queue status fetching

4. **`frontend/src/services/waitlistService.ts`**
   - Join waitlist
   - Confirm slot

5. **`frontend/src/services/settingsService.ts`**
   - Get/update appointment settings

**Code Pattern:**
```typescript
// frontend/src/services/appointmentService.ts
import api from './api';

const appointmentService = {
  async getAppointments(page: number, limit: number, filters?: any) {
    const response = await api.get('/appointments', {
      params: { page, limit, ...filters }
    });
    return response.data;
  },
  
  async createAppointment(data: any) {
    const response = await api.post('/appointments', data);
    return response.data;
  },
  
  // ... other methods
};

export default appointmentService;
```

### Phase 2: Types & Constants

**Files to Create:**

1. **`frontend/src/types/appointment.ts`**
   - TypeScript interfaces for all appointment-related data

2. **`frontend/src/utils/appointmentConstants.ts`**
   - Constants, enums, labels for appointment system

### Phase 3: Pages (User Interfaces)

**Files to Create (Following Existing UI Patterns):**

#### 1. **`frontend/src/pages/DoctorSchedule.tsx`**
**Role Access:** Doctor, Admin, Super Admin  
**Purpose:** Doctors manage their weekly availability

**UI Components:**
- Weekly calendar view
- Time slot editor (start/end times, slot duration)
- Consultation type selector (online/offline/both)
- Block period form (holidays, leaves)
- Save/update schedule action

**Layout:** Similar to HospitalSetup.tsx (form-based with sections)

#### 2. **`frontend/src/pages/AppointmentBooking.tsx`**
**Role Access:** Patient, Receptionist  
**Purpose:** Book new appointments

**UI Components:**
- Doctor selection dropdown (with specialty filter)
- Date picker (within advance booking window)
- Available time slots display (grid/list)
- Consultation type selection
- Reason for visit text area
- Submit booking button

**Layout:** Modal-based similar to StaffDirectory add form

#### 3. **`frontend/src/pages/WalkInRegistration.tsx`**
**Role Access:** Receptionist, Admin  
**Purpose:** Register walk-in patients

**UI Components:**
- Patient search/select
- Quick patient registration form
- Department/doctor selection
- Urgency level selector
- Queue number display after registration
- Success confirmation with queue info

**Layout:** Drawer form similar to CreateStaffDrawer

#### 4. **`frontend/src/pages/WalkInQueue.tsx`**
**Role Access:** Receptionist, Admin, Doctor  
**Purpose:** Monitor and manage walk-in queue

**UI Components:**
- Real-time queue list (auto-refresh)
- Queue number, patient name, urgency, wait time
- Assign to doctor action (admin)
- Call next patient button (doctor)
- Filter by department/urgency
- Queue statistics (total waiting, average wait time)

**Layout:** Table view similar to PatientList.tsx

#### 5. **`frontend/src/pages/MyAppointments.tsx`**
**Role Access:** Patient  
**Purpose:** Patients view and manage their appointments

**UI Components:**
- Upcoming appointments list
- Past appointments history
- Appointment cards with details
- Reschedule button (if cancellation deadline not passed)
- Cancel button
- Join Zoom meeting link (for online consultations)
- Download appointment confirmation PDF

**Layout:** Card-based list similar to Dashboard.tsx stats cards

#### 6. **`frontend/src/pages/DoctorAppointments.tsx`**
**Role Access:** Doctor  
**Purpose:** Doctors view their appointment schedule

**UI Components:**
- Daily/weekly calendar view
- List of appointments (scheduled + walk-in)
- Appointment details modal
- Update status actions (completed, no-show)
- Add doctor notes
- View patient medical history link
- Zoom meeting link for online consultations

**Layout:** Calendar + list hybrid

#### 7. **`frontend/src/pages/AppointmentManagement.tsx`**
**Role Access:** Admin, Super Admin  
**Purpose:** Admin oversight of all appointments

**UI Components:**
- All appointments table (filters: doctor, date, status, type)
- Search by patient/doctor name
- Appointment statistics dashboard
- Assign walk-ins to doctors
- Process waitlist
- Cancel/reschedule any appointment
- Export appointments to CSV

**Layout:** Similar to UserManagement.tsx (table with filters)

#### 8. **`frontend/src/pages/WaitlistManagement.tsx`**
**Role Access:** Admin, Doctor  
**Purpose:** Manage waitlist entries

**UI Components:**
- Waitlist table (patient, doctor, preferred date, status)
- Notify patient action
- Remove from waitlist
- Priority adjustment
- Waitlist analytics

**Layout:** Table with actions

#### 9. **`frontend/src/pages/AppointmentSettings.tsx`**
**Role Access:** Admin, Super Admin  
**Purpose:** Configure appointment system settings

**UI Components:**
- Settings grouped by category:
  - General Settings (slot duration, advance booking)
  - Walk-in Settings (enabled, max capacity, priority)
  - Notification Settings (reminder timing)
  - Payment & Insurance (enable/disable)
  - Zoom Integration (API credentials)
- Form inputs for each setting
- Save changes button
- Reset to defaults

**Layout:** Form sections similar to HospitalSetup.tsx

#### 10. **`frontend/src/pages/AppointmentReports.tsx`**
**Role Access:** Admin, Super Admin, Doctor (own reports)  
**Purpose:** Analytics and reporting

**UI Components:**
- Date range selector
- Statistics cards:
  - Total appointments
  - Scheduled vs. walk-in breakdown
  - Completion rate
  - No-show rate
  - Average wait time
- Charts:
  - Appointments over time (line chart)
  - Doctor utilization (bar chart)
  - Peak hours heatmap
- Export report to PDF/Excel

**Layout:** Dashboard with cards and charts similar to Dashboard.tsx

### Phase 4: Components (Reusable UI Elements)

**Files to Create:**

1. **`frontend/src/components/appointments/AppointmentCard.tsx`**
   - Display appointment details in card format

2. **`frontend/src/components/appointments/TimeSlotPicker.tsx`**
   - Grid of available time slots for selection

3. **`frontend/src/components/appointments/QueueStatusBadge.tsx`**
   - Visual badge for queue position/status

4. **`frontend/src/components/appointments/AppointmentStatusBadge.tsx`**
   - Color-coded status indicator

5. **`frontend/src/components/appointments/DoctorScheduleCalendar.tsx`**
   - Calendar view for doctor schedules

6. **`frontend/src/components/appointments/WaitlistCard.tsx`**
   - Waitlist entry display

### Phase 5: Navigation & Routing

**Update Files:**

1. **`frontend/src/App.tsx`**
   - Add routes for all appointment pages

2. **`frontend/src/components/common/Layout.tsx`**
   - Add "Appointments" menu item in sidebar
   - Submenu:
     - Book Appointment (patient, receptionist)
     - My Appointments (patient)
     - Doctor Schedule (doctor)
     - Walk-in Registration (receptionist, admin)
     - Walk-in Queue (receptionist, admin, doctor)
     - Appointment Management (admin)
     - Waitlist (admin, doctor)
     - Reports (admin, doctor)
     - Settings (admin)

**Code Pattern:**
```tsx
// In Layout.tsx navigation
const appointmentSubmenu = [
  { to: '/appointments/book', label: 'Book Appointment', icon: 'calendar_add_on', roles: ['patient', 'receptionist'] },
  { to: '/appointments/my-appointments', label: 'My Appointments', icon: 'event_note', roles: ['patient'] },
  { to: '/appointments/doctor-schedule', label: 'My Schedule', icon: 'schedule', roles: ['doctor'] },
  { to: '/appointments/walk-in', label: 'Walk-in Registration', icon: 'person_add', roles: ['receptionist', 'admin'] },
  { to: '/appointments/queue', label: 'Walk-in Queue', icon: 'queue', roles: ['receptionist', 'admin', 'doctor'] },
  { to: '/appointments/manage', label: 'All Appointments', icon: 'event_available', roles: ['admin', 'super_admin'] },
  { to: '/appointments/waitlist', label: 'Waitlist', icon: 'hourglass_empty', roles: ['admin', 'doctor'] },
  { to: '/appointments/reports', label: 'Reports', icon: 'analytics', roles: ['admin', 'super_admin', 'doctor'] },
  { to: '/appointments/settings', label: 'Settings', icon: 'tune', roles: ['admin', 'super_admin'] },
];
```

---

## Implementation Phases & Timeline

### **Phase 1: Foundation (Week 1-2)**
**Tasks:**
1. Create database migration scripts for all tables
2. Implement backend models (`appointment.py`)
3. Implement backend schemas (`appointment.py` in schemas)
4. Create appointment settings table and seed default values
5. Set up database sequences for appointment numbering

**Deliverables:**
- All tables created
- Models and schemas ready
- Database migrations tested

### **Phase 2: Doctor Schedule & Availability (Week 2-3)**
**Tasks:**
1. Implement schedule service (`schedule_service.py`)
2. Create schedule router (`schedules.py`)
3. Build DoctorSchedule.tsx page (frontend)
4. Implement available slots API
5. Test schedule creation and slot generation

**Deliverables:**
- Doctors can set weekly schedules
- Available slots calculation works
- API returns correct time slots

### **Phase 3: Appointment Booking (Week 3-4)**
**Tasks:**
1. Implement appointment service (`appointment_service.py`)
2. Create appointment router (`appointments.py`)
3. Build AppointmentBooking.tsx (frontend)
4. Build MyAppointments.tsx (patient view)
5. Build DoctorAppointments.tsx (doctor view)
6. Implement double-booking prevention
7. Add reschedule/cancel logic

**Deliverables:**
- Patients can book appointments
- Doctors see their schedules
- Reschedule/cancel works with validations

### **Phase 4: Walk-in System (Week 4-5)**
**Tasks:**
1. Implement walk-in service (`walk_in_service.py`)
2. Create walk-in router (`walk_ins.py`)
3. Build WalkInRegistration.tsx (frontend)
4. Build WalkInQueue.tsx (frontend)
5. Implement queue number generation
6. Add wait time estimation logic
7. Test queue processing and assignment

**Deliverables:**
- Walk-in registration works
- Queue management functional
- Wait time calculation accurate

### **Phase 5: Waitlist Management (Week 5-6)**
**Tasks:**
1. Implement waitlist service (`waitlist_service.py`)
2. Create waitlist router (`waitlist.py`)
3. Build WaitlistManagement.tsx (frontend)
4. Implement notification logic for available slots
5. Add auto-processing for waitlist
6. Test slot confirmation flow

**Deliverables:**
- Waitlist join/leave works
- Notifications sent when slot available
- Priority processing functional

### **Phase 6: Zoom Integration (Week 6)**
**Tasks:**
1. Set up Zoom API credentials
2. Implement zoom service (`zoom_service.py`)
3. Add meeting link generation on appointment booking
4. Display Zoom link in appointment details
5. Test meeting creation and joining

**Deliverables:**
- Zoom meetings auto-created for online appointments
- Links sent to patient and doctor

### **Phase 7: Notifications (Week 7)**
**Tasks:**
1. Implement notification service (`notification_service.py`)
2. Create email templates (confirmation, reminder, cancellation, waitlist)
3. Set up cron jobs for reminders
4. Test email delivery for all scenarios

**Deliverables:**
- Email notifications working for all appointment actions
- Reminders sent 1 day and 1 hour before

### **Phase 8: Admin Features (Week 8)**
**Tasks:**
1. Build AppointmentManagement.tsx (admin view)
2. Build AppointmentSettings.tsx (configuration panel)
3. Implement settings router (`appointment_settings.py`)
4. Add bulk actions (cancel multiple, export)
5. Test admin override capabilities

**Deliverables:**
- Admins can manage all appointments
- Settings configurable via UI
- Bulk operations work

### **Phase 9: Reports & Analytics (Week 9)**
**Tasks:**
1. Implement report service logic
2. Create reports router (`appointment_reports.py`)
3. Build AppointmentReports.tsx (frontend)
4. Add charts (appointments over time, doctor utilization)
5. Export to PDF/CSV functionality

**Deliverables:**
- Statistics dashboard live
- Charts displaying trends
- Export functionality working

### **Phase 10: Testing & Polish (Week 10)**
**Tasks:**
1. End-to-end testing of all flows
2. Fix bugs and edge cases
3. Performance optimization (query optimization, caching)
4. UI/UX refinements
5. Documentation (API docs, user guide)

**Deliverables:**
- Fully tested system
- All bugs fixed
- Documentation complete

---

## Technology Stack & Dependencies

### Backend
- **Zoom SDK:** `pip install zoom-python`
- **Email:** Use existing SMTP config from `config.py`
- **Cron/Scheduler:** `pip install apscheduler`
- **PDF Generation (for reports):** `pip install reportlab`

### Frontend
- **Date Picker:** Already using `date-fns` - use for date selection
- **Charts:** `npm install recharts` (for reports)
- **Calendar View:** `npm install react-big-calendar` (for doctor schedules)

---

## Key Design Decisions

### 1. Theme & Layout Consistency
- **Use existing Tailwind classes** from current pages
- **Follow card-based layout** from Dashboard.tsx
- **Use table layout** from PatientList.tsx for list views
- **Use drawer/modal** patterns from StaffDirectory.tsx for forms
- **Material Icons** for all icons (already in use)
- **Color scheme:** Primary blue, status colors (green, yellow, red)

### 2. Code Organization
- **Services layer** separates business logic from routes
- **Schemas** handle all validation
- **Audit logging** tracks all changes
- **Error handling** consistent with existing patterns

### 3. Permissions & Access Control
- Leverage existing role-based system
- Appointment-specific permissions:
  - **Patient:** Book, view own, reschedule own, cancel own
  - **Doctor:** View own schedule, manage own appointments, update status
  - **Receptionist:** Register walk-ins, view queue, book for patients
  - **Admin/Super Admin:** Full access to all features

### 4. Real-time Features
- Walk-in queue: Auto-refresh every 30 seconds
- Appointment availability: Real-time validation before booking
- Waitlist: Immediate notification on slot opening

---

## API Documentation Structure

Each endpoint will follow this pattern:

```
Endpoint: POST /api/v1/appointments
Description: Create a new appointment
Auth Required: Yes
Roles: patient, receptionist, admin, super_admin

Request Body:
{
  "patient_id": 123,
  "doctor_id": 45,
  "appointment_type": "scheduled",
  "consultation_type": "online",
  "appointment_date": "2026-03-15",
  "appointment_time": "10:00",
  "reason_for_visit": "Regular checkup"
}

Response (201):
{
  "id": 789,
  "appointment_number": "APT-20260315-0001",
  "status": "confirmed",
  "zoom_meeting_link": "https://zoom.us/j/...",
  ...
}

Errors:
- 400: Invalid slot, doctor unavailable, double booking
- 401: Unauthorized
- 404: Patient or doctor not found
```

---

## Testing Strategy

### Unit Tests
- Service functions (schedule generation, slot validation, queue logic)
- Utility functions (appointment number generation, wait time calculation)

### Integration Tests
- API endpoints (all CRUD operations)
- Database transactions (concurrent bookings, waitlist processing)

### End-to-End Tests
- Complete booking flow (select doctor → choose slot → confirm)
- Walk-in registration → queue → assignment → completion
- Waitlist join → notification → confirmation

### Performance Tests
- Concurrent bookings stress test
- Queue processing under load
- Report generation with large datasets

---

## Future Enhancements (Post-MVP)

1. **SMS Notifications** (in addition to email)
2. **Payment Gateway Integration** (Stripe, Razorpay)
3. **Insurance API Integration**
4. **Telemedicine Video** (native video instead of Zoom)
5. **Mobile App** (React Native for iOS/Android)
6. **AI-Powered Scheduling** (suggest best appointment times)
7. **Multi-location Support** (if hospital has multiple branches)
8. **Patient Feedback System** (post-appointment ratings)

---

## Development Checklist

### Database
- [ ] Create all 6 tables via migration script
- [ ] Create sequences for appointment numbering
- [ ] Create indexes for performance
- [ ] Seed appointment_settings with defaults

### Backend
- [ ] Create all models in `models/appointment.py`
- [ ] Create all schemas in `schemas/appointment.py`
- [ ] Implement 6 service files
- [ ] Implement 6 router files
- [ ] Set up Zoom API integration
- [ ] Set up email templates
- [ ] Create background tasks/cron jobs
- [ ] Write unit tests for services

### Frontend
- [ ] Create 5 service files (API clients)
- [ ] Create types in `types/appointment.ts`
- [ ] Build 10 main pages
- [ ] Build 6 reusable components
- [ ] Update Layout.tsx navigation
- [ ] Update App.tsx routing
- [ ] Write integration tests

### Testing & Documentation
- [ ] API endpoint testing (Postman/Swagger)
- [ ] End-to-end flow testing
- [ ] Performance benchmarking
- [ ] User acceptance testing
- [ ] API documentation (Swagger annotations)
- [ ] User guide documentation

---

## Success Metrics

### Functionality
- ✅ Doctors can set and manage schedules
- ✅ Patients can book appointments online
- ✅ Walk-in system processes patients efficiently
- ✅ Waitlist auto-processes when slots open
- ✅ Zoom meetings auto-generate for online consultations
- ✅ Notifications sent reliably
- ✅ Admins have full oversight and control

### Performance
- ⚡ **Slot availability check:** < 500ms
- ⚡ **Appointment creation:** < 1s
- ⚡ **Queue position update:** < 200ms
- ⚡ **Report generation:** < 3s for 30-day data

### User Experience
- 🎯 **Booking flow:** < 3 clicks to book
- 🎯 **Walk-in registration:** < 2 minutes
- 🎯 **Queue visibility:** Real-time updates
- 🎯 **Mobile-friendly:** Responsive on all devices

---

**End of Implementation Plan**

This plan provides a complete roadmap to build the Appointment Booking System while maintaining consistency with the existing HMS codebase. Follow the phases sequentially for smooth implementation.
