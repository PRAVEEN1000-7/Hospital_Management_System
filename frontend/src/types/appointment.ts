// ── Enums / Literals ──────────────────────────────────────────────────────

export type AppointmentType = 'scheduled' | 'walk-in' | 'emergency' | 'follow_up';
export type VisitType = 'new_visit' | 'follow_up' | 'referral' | 'emergency';
export type AppointmentStatus = 'scheduled' | 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show' | 'rescheduled';
export type Priority = 'normal' | 'urgent' | 'emergency';

// ── Doctor Schedule ──────────────────────────────────────────────────────

export interface DoctorSchedule {
  id: string;
  doctor_id: string;
  day_of_week: number;  // 0=Sun
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  max_patients: number | null;
  break_start_time: string | null;
  break_end_time: string | null;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctorScheduleCreate {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes?: number;
  max_patients?: number;
  break_start_time?: string;
  break_end_time?: string;
  is_active?: boolean;
}

// ── Doctor Leave (replaces Blocked Period) ───────────────────────────────

export interface DoctorLeave {
  id: string;
  doctor_id: string;
  leave_date: string;
  leave_type: string;
  reason: string | null;
  is_half_day: boolean;
  half_day_period: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface DoctorLeaveCreate {
  doctor_id: string;
  leave_date: string;
  leave_type?: string;
  reason?: string;
  is_half_day?: boolean;
  half_day_period?: string;
}

// ── Appointment ──────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  hospital_id: string | null;
  appointment_number: string;
  patient_id: string;
  doctor_id: string | null;
  department_id: string | null;
  appointment_type: AppointmentType;
  visit_type: string | null;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  status: AppointmentStatus;
  priority: string | null;
  chief_complaint: string | null;
  consultation_fee: number | null;
  cancel_reason: string | null;
  reschedule_reason: string | null;
  reschedule_count: number;
  check_in_at: string | null;
  consultation_start_at: string | null;
  consultation_end_at: string | null;
  notes: string | null;
  created_by: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // Enriched fields
  patient_name?: string | null;
  doctor_name?: string | null;
  department_name?: string | null;
  patient_reference_number?: string | null;
  doctor_specialization?: string | null;
}

export interface AppointmentCreate {
  patient_id: string;
  doctor_id?: string | null;
  department_id?: string | null;
  appointment_type?: string;
  visit_type?: string;
  appointment_date: string;
  start_time?: string | null;
  chief_complaint?: string;
  priority?: string;
  consultation_fee?: number | null;
}

export interface AppointmentUpdate {
  doctor_id?: string | null;
  department_id?: string | null;
  appointment_date?: string;
  start_time?: string | null;
  visit_type?: string;
  chief_complaint?: string;
  priority?: string;
  consultation_fee?: number;
}

// ── Walk-in ──────────────────────────────────────────────────────────────

export interface WalkInRegister {
  patient_id: string;
  doctor_id: string;
  department_id?: string | null;
  chief_complaint?: string;
  priority?: string;
  consultation_fee?: number | null;
}

export interface QueueItem {
  queue_id: string;
  appointment_id: string;
  queue_number: number;
  position: number;
  status: string;
  priority: string;
  patient_name: string | null;
  patient_id: string | null;
  patient_reference_number: string | null;
  patient_phone: string | null;
  patient_gender: string | null;
  patient_date_of_birth: string | null;
  patient_age: number | null;
  patient_blood_group: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  chief_complaint: string | null;
  check_in_at: string | null;
  called_at: string | null;
  consultation_start_at: string | null;
  consultation_end_at: string | null;
}

export interface QueueStatus {
  doctor_id: string | null;
  queue_date: string;
  total_waiting: number;
  total_in_progress: number;
  total_completed: number;
  items: QueueItem[];
}

// ── Time Slot ────────────────────────────────────────────────────────────

export interface TimeSlot {
  time: string;
  available: boolean;
  current_bookings: number;
  max_bookings: number;
}

export interface AvailableSlots {
  doctor_id: string;
  date: string;
  slots: TimeSlot[];
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
  doctor_id: string;
  user_id: string;
  name: string;
  specialization: string | null;
  department_id: string | null;
  consultation_fee: number | null;
}

// ── Generic Paginated ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}

// ── Enhanced Stats ───────────────────────────────────────────────────────

export interface DoctorUtilization {
  doctor_id: string;
  doctor_name: string;
  department: string | null;
  total_appointments: number;
  completed: number;
  cancelled: number;
  no_shows: number;
  utilization_rate: number;
}

export interface DepartmentBreakdown {
  department: string;
  total: number;
  completed: number;
  cancelled: number;
  no_shows: number;
}

export interface TrendDataPoint {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  no_shows: number;
}

export interface PeakTimeSlot {
  hour: number;
  count: number;
  label: string;
}

export interface CancellationReason {
  reason: string;
  count: number;
}

export interface EnhancedAppointmentStats extends AppointmentStats {
  doctor_utilization: DoctorUtilization[];
  department_breakdown: DepartmentBreakdown[];
  trends: TrendDataPoint[];
  peak_times: PeakTimeSlot[];
  cancellation_reasons: CancellationReason[];
}

// ── Waitlist ─────────────────────────────────────────────────────────────

export type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'cancelled' | 'expired';

export interface WaitlistEntry {
  id: string;
  hospital_id: string;
  patient_id: string;
  doctor_id: string;
  department_id: string | null;
  preferred_date: string;
  preferred_time: string | null;
  appointment_type: string;
  priority: string;
  chief_complaint: string | null;
  reason: string | null;
  status: WaitlistStatus;
  position: number;
  booked_appointment_id: string | null;
  notified_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  patient_name: string | null;
  patient_reference_number: string | null;
  patient_phone: string | null;
  doctor_name: string | null;
  doctor_specialization: string | null;
}

export interface WaitlistCreate {
  patient_id: string;
  doctor_id: string;
  department_id?: string | null;
  preferred_date: string;
  preferred_time?: string | null;
  appointment_type?: string;
  priority?: string;
  chief_complaint?: string;
  reason?: string;
}

export interface PaginatedWaitlist {
  total: number;
  page: number;
  limit: number;
  data: WaitlistEntry[];
}

export interface WaitlistStats {
  total_waiting: number;
  total_booked: number;
  total_cancelled: number;
  total_expired: number;
  total: number;
}

export interface WalkInResponse {
  // Normal walk-in fields
  id?: string;
  appointment_number?: string;
  queue_number?: number | null;
  queue_position?: number | null;
  // Waitlist auto-add fields
  waitlisted?: boolean;
  message?: string;
  waitlist_entry?: WaitlistEntry;
  [key: string]: unknown;
}
