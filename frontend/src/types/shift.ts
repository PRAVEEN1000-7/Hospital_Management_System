export interface Shift {
  id: string;
  hospital_id: string;
  name: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  created_at: string;
  updated_at: string;
}

export interface ShiftCreateData {
  name: string;
  start_time: string;
  end_time: string;
}

export type ShiftUpdateData = Partial<ShiftCreateData>;

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  shift_id: string;
  effective_from: string;
  effective_to: string | null;
  assigned_by: string;
  reason: string | null;
  created_at: string;
  employee_name: string | null;
  shift_name: string | null;
}

export interface ShiftAssignmentCreateData {
  employee_id: string;
  shift_id: string;
  effective_from: string;
  reason: string;
}
