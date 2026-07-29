// ─────────────────────────────────────────────────────────────────────────────
// Roles & Permissions admin UI — types mirroring backend/app/schemas/role_permission.py
// ─────────────────────────────────────────────────────────────────────────────

export type AccessLevel = 'none' | 'view' | 'edit';

export interface PermissionCell {
  access_level: AccessLevel;
  is_override: boolean;
}

export interface PermissionKeyRow {
  key: string;
  label: string;
  cells: Record<string, PermissionCell>; // role_name -> cell
}

export interface EffectiveMatrixResponse {
  roles: string[];
  rows: PermissionKeyRow[];
}

export interface PermissionOverrideChange {
  key: string;
  role: string;
  access_level: AccessLevel;
}

export interface MatrixUpdateResponse {
  applied: number;
  skipped: string[];
}
