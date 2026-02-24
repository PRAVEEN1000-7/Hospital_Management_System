# Appointment Booking System – Functional Requirements Document

## Overview

This document outlines the functional requirements for the Appointment Booking System module of the Hospital Management System. It includes support for scheduled appointments, walk-in registrations, Zoom integration, waitlist management, and configurable hospital settings.

---

## Core Functional Requirements

### 1. Doctor Schedule Management

- Define weekly availability (weekday, start/end times, slot duration, consultation type: online/offline/both).
- Slot duration and capacity configurable per doctor or globally.
- Block off holidays, leaves, or unavailable periods.
- Support for recurring weekly schedules and one-time overrides.

---

### 2. Appointment Booking

- Patients book appointments online (web/app) or at the front desk.
- Book with any or preferred doctor.
- Slot/time validation to prevent overbooking and double-booking.
- Configurable buffer time between appointments.
- Configurable advance booking window (e.g., max 30 days ahead).
- Real-time slot availability checking.
- Appointment confirmation and tracking.

---

### 3. Walk-in Appointment Support

#### 3.1 Walk-in Registration
Patients arrive at hospital without prior booking and register for walk-in appointment at reception desk.

#### 3.2 Queue Management
Walk-in patients added to same-day queue for available doctors or specific specialists.

#### 3.3 Dual Queue System
System manages both scheduled and walk-in queues to ensure fairness and balanced doctor workload.

#### 3.4 Real-time Assignment
Reception/admin staff can assign walk-in patients to available slots or doctors in real time.

#### 3.5 Queue Status Tracking
Walk-in queue status visible to hospital staff and optionally to patients with estimated wait time.

#### 3.6 Priority Handling
Configurable rules for walk-in priority (first-come-first-served, urgent cases, etc.).

#### 3.7 Queue Number Generation
System generates unique queue number for each walk-in patient.

#### 3.8 Waiting Area Management
Track which queue/area patient is waiting in.

---

### 4. Online Consultation Support

- For online appointments, Zoom integration with auto-generated meeting links.
- Meeting link generated at booking time and sent to patient and doctor.
- Support for joining Zoom meeting directly from hospital portal.
- Recording capability option (if enabled by hospital).

---

### 5. Waitlist Management

- Patients can join waitlist if preferred slot is full.
- First-come-first-served waitlist processing.
- Automatic notification to waitlisted patients when slot becomes available.
- One-click confirmation for available slots.
- Waitlist history and status tracking.

---

### 6. Notifications

Email notifications for:
- Appointment confirmations (scheduled, walk-in, online)
- Appointment reminders (configurable timing, e.g., 1 day, 1 hour before)
- Cancellations and rescheduling
- Waitlist slot availability
- Walk-in queue position and estimated wait time

Email contains appointment details, doctor info, location (if offline), Zoom link (if online).

---

### 7. Patient Features

- View all upcoming and past appointments (scheduled, walk-in, online).
- Reschedule appointments (subject to cancellation deadline).
- Cancel appointments with configurable cancellation deadline.
- View and track waitlist status.
- Search and filter doctors by name, specialty, availability.
- Download appointment confirmation as PDF.
- Appointment history with notes and outcomes.

---

### 8. Admin & Doctor Features

#### 8.1 Admin Dashboard

- View all appointments (scheduled, walk-in) across all doctors.
- Manage doctor availability and holiday/leave periods.
- Assign walk-in patients to available doctors.
- Monitor waitlists and process confirmations.
- View daily/weekly/monthly schedules.
- Manage hospital-wide settings and configurations.

#### 8.2 Doctor Dashboard

- View personal schedule and appointments for the day/week.
- See both scheduled and walk-in appointments.
- Manage availability and block-out periods.
- Access patient notes and medical history (if integrated).
- Update appointment status (completed, no-show, rescheduled).

---

### 9. Payment and Insurance (Optional/Configurable)

- Support for optional payment/insurance verification during booking.
- Payment can be enabled/disabled via admin settings.
- Not mandatory for all appointments (can be bypassed per hospital policy).
- Integration hooks for future payment gateway integration.
- Insurance verification API integration (optional).

---

### 10. Reporting & Analytics

#### 10.1 Appointment Statistics
- Total appointments (scheduled vs. walk-in)
- Completion rate and no-show rate
- Cancellation rate with reasons
- Doctor utilization rate
- Average wait time for walk-ins
- Waitlist statistics

#### 10.2 Doctor Performance Reports
- Appointments per doctor
- Patient satisfaction (if rating integrated)
- Busy time slots and patterns

#### 10.3 Hospital-wide Insights
- Peak appointment times
- Department-wise appointment volume
- Trend analysis (weekly/monthly/yearly)

---

### 11. Configurable Settings

All settings manageable via admin panel:

| Setting | Description | Example |
|---------|-------------|---------|
| Default Slot Duration | Time per appointment slot | 30 minutes |
| Advance Booking Window | Max days in advance to book | 30 days |
| Cancellation Deadline | Hours before appointment to cancel | 24 hours |
| Buffer Time Between Appointments | Minimum gap between consecutive appointments | 10 minutes |
| Walk-in Queue Enabled | Enable/disable walk-in feature | Yes/No |
| Max Walk-in Patients Per Day | Daily cap per doctor | 20 patients |
| Walk-in Priority Level | Queue processing method | FIFO / Urgent First |
| Walk-in Waiting Time Estimate | Show estimated wait time | Yes/No |
| Walk-in Fee | Charge for walk-in vs. scheduled | Optional |
| Doctor Availability for Walk-ins | Which doctors accept walk-ins | Configurable per doctor |
| Max Queue Length | Stop accepting walk-ins after N patients | 50 patients |
| Appointment Reminder Timing | When to send email reminder | 1 day, 1 hour before |
| Payment Enabled | Enable payment during booking | Yes/No |
| Insurance Verification | Check insurance during booking | Yes/No |

---

## Walk-in Specific Features to Configure

### Walk-in Configuration Panel (Admin)

- Toggle walk-in appointments on/off
- Set maximum walk-in capacity per doctor per day
- Configure priority rules (FIFO, urgent cases, department-based)
- Set wait time estimation algorithm
- Configure walk-in specific fees (if applicable)
- Manage which doctors/departments accept walk-ins
- Set maximum queue length before blocking new walk-ins

### Walk-in Registration Form

- Patient Name
- Contact Number
- Email Address
- Preferred Doctor/Department (optional)
- Reason for Visit
- Urgency Level (routine, urgent, emergency)
- Insurance Information (if enabled)

### Walk-in Queue Status

| Field | Description |
|-------|-------------|
| **Queue Number** | Unique identifier for the walk-in patient |
| **Estimated Wait Time** | Dynamic calculation based on current queue |
| **Current Position** | Show patient their position in queue |
| **Doctor Assignment** | Show assigned doctor once matched |
| **Appointment Details** | Time slot and appointment ID once assigned |

---

## Document Information

- **Module**: Appointment Booking System
- **System**: Hospital Management System
- **Version**: 1.0
- **Last Updated**: 2026-02-23