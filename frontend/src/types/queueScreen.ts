// BRD-005 — multi-screen Queue Display configuration.

export interface QueueDisplayScreen {
  id: string;
  hospital_id: string;
  slug: string;
  display_name: string;
  department_id?: string;
  department_name?: string;
  doctor_id?: string;
  doctor_name?: string;
  show_doctor2: boolean;
  doctor2_id?: string;
  doctor2_name?: string;
  show_pharmacy: boolean;
  show_opthal: boolean;
  token_format: string;
  refresh_seconds: number;
  is_active: boolean;
  is_configured: boolean;
  public_url_path: string;
  created_at: string;
  updated_at: string;
}

export interface QueueDisplayScreenCreateData {
  slug: string;
  display_name: string;
  department_id?: string;
  doctor_id?: string;
  show_doctor2?: boolean;
  doctor2_id?: string;
  show_pharmacy?: boolean;
  show_opthal?: boolean;
  token_format?: string;
  refresh_seconds?: number;
}

export interface QueueDisplayScreenUpdateData {
  slug?: string;
  display_name?: string;
  department_id?: string;
  doctor_id?: string;
  show_doctor2?: boolean;
  doctor2_id?: string;
  show_pharmacy?: boolean;
  show_opthal?: boolean;
  token_format?: string;
  refresh_seconds?: number;
  is_active?: boolean;
}
