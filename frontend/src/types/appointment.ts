// ── Enums / Literals ──────────────────────────────────────────────────────

export type AppointmentType = 'scheduled' | 'walk-in';
export type ConsultationType = 'online' | 'offline' | 'both';
export type AppointmentStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show' | 'rescheduled';
export type UrgencyLevel = 'routine' | 'urgent' | 'emergency';
export type WaitlistStatus = 'waiting' | 'notified' | 'confirmed' | 'expired' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'waived';
export type BlockType = 'leave' | 'holiday' | 'emergency' | 'other';

// ── Doctor Schedule ──────────────────────────────────────────────────────

export interface DoctorSchedule {
  id: number;
  doctor_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration: number;
  consultation_type: ConsultationType;
  max_patients_per_slot: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DoctorScheduleCreate {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration?: number;
  consultation_type?: string;
  max_patients_per_slot?: number;
  is_active?: boolean;
}

// ── Blocked Period ───────────────────────────────────────────────────────

export interface BlockedPeriod {
  id: number;
  doctor_id: number | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  block_type: string;
  created_by: number | null;
  created_at: string;
}

export interface BlockedPeriodCreate {
  doctor_id?: number | null;
  start_date: string;
  end_date: string;
  reason?: string;
  block_type?: string;
}

// ── Appointment ──────────────────────────────────────────────────────────

export interface Appointment {
  id: number;
  appointment_number: string;
  patient_id: number;
  doctor_id: number | null;
  appointment_type: AppointmentType;
  consultation_type: string;
  appointment_date: string;
  appointment_time: string | null;
  slot_duration: number;
  status: AppointmentStatus;
  queue_number: string | null;
  queue_position: number | null;
  estimated_wait_time: number | null;
  walk_in_registered_at: string | null;
  urgency_level: string | null;
  zoom_meeting_link: string | null;
  reason_for_visit: string | null;
  doctor_notes: string | null;
  diagnosis: string | null;
  prescription: string | null;
  fees: number | null;
  payment_status: string | null;
  confirmation_sent: boolean;
  reminder_sent: boolean;
  booked_by: number | null;
  cancelled_by: number | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  patient_name?: string | null;
  doctor_name?: string | null;
}

export interface AppointmentCreate {
  patient_id: number;
  doctor_id?: number | null;
  appointment_type?: string;
  consultation_type?: string;
  appointment_date: string;
  appointment_time?: string | null;
  reason_for_visit?: string;
  urgency_level?: string;
  fees?: number | null;
}

export interface AppointmentUpdate {
  doctor_id?: number | null;
  appointment_date?: string;
  appointment_time?: string | null;
  consultation_type?: string;
  reason_for_visit?: string;
  doctor_notes?: string;
  diagnosis?: string;
  prescription?: string;
  fees?: number;
  payment_status?: string;
  urgency_level?: string;
}

// ── Walk-in ──────────────────────────────────────────────────────────────

export interface WalkInRegister {
  patient_id: number;
  doctor_id?: number | null;
  reason_for_visit?: string;
  urgency_level?: string;
  fees?: number | null;
}

export interface QueueStatus {
  total_waiting: number;
  total_in_progress: number;
  total_completed_today: number;
  average_wait_time: number;
  queue: Appointment[];
}

// ── Waitlist ─────────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: number;
  patient_id: number;
  doctor_id: number;
  preferred_date: string;
  preferred_time: string | null;
  consultation_type: string;
  reason_for_visit: string | null;
  status: WaitlistStatus;
  priority: number;
  notified_at: string | null;
  expires_at: string | null;
  joined_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  patient_name?: string | null;
  doctor_name?: string | null;
}

export interface WaitlistCreate {
  patient_id: number;
  doctor_id: number;
  preferred_date: string;
  preferred_time?: string | null;
  consultation_type?: string;
  reason_for_visit?: string;
}

// ── Time Slot ────────────────────────────────────────────────────────────

export interface TimeSlot {
  time: string;
  available: boolean;
  current_bookings: number;
  max_bookings: number;
  consultation_type: string;
}

export interface AvailableSlots {
  doctor_id: number;
  date: string;
  slots: TimeSlot[];
}

// ── Settings ─────────────────────────────────────────────────────────────

export interface AppointmentSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  value_type: string;
  description: string | null;
  is_global: boolean;
  doctor_id: number | null;
  updated_at: string;
}

// ── Stats ────────────────────────────────────────────────────────────────

export interface AppointmentStats {
  total_appointments: number;
  total_scheduled: number;
  total_walk_ins: number;
  total_completed: number;
  total_cancelled: number;
  total_no_shows: number;
  total_pending: number;
  completion_rate: number;
  cancellation_rate: number;
  no_show_rate: number;
  average_wait_time: number;
}

// ── Doctor (for dropdowns) ───────────────────────────────────────────────

export interface DoctorOption {
  id: number;
  full_name: string;
  department: string | null;
  employee_id: string | null;
}

// ── Generic Paginated ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
