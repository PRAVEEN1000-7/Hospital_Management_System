/**
 * Shared module/role permission matrix, transcribed directly from the
 * client's "HMS Roles & Permissions.xlsx". Mirrors
 * backend/app/core/module_roles.py — keep both in sync.
 *
 * Decisions confirmed with the client (see
 * docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md):
 *   - Implemented literally, including the unusually broad cells (pharmacist
 *     edit on "rx.all", doctor edit on "general.staff_directory").
 *   - "Edit" implies delete — there is no separate delete tier.
 *   - The Lab role (lab_technician) is intentionally absent from this
 *     matrix; Layout.tsx's canAccessLab / App.tsx's lab routes are untouched.
 *   - super_admin is not listed per-row; it is added automatically and
 *     always gets edit access to every key.
 */

export type AccessLevel = 'none' | 'view' | 'edit';

const LEVELS: Record<Exclude<AccessLevel, 'none'>, number> = { view: 0, edit: 1 };

export const MODULE_ROLES: Record<string, Partial<Record<string, Exclude<AccessLevel, 'none'>>>> = {
  'general.dashboard': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'general.patients': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'general.staff_directory': {
    admin: 'edit', doctor: 'edit', nurse: 'view', receptionist: 'view',
    report_viewer: 'view',
  },
  'general.analytics': {
    admin: 'edit', doctor: 'edit',
    report_viewer: 'view',
  },
  'appt.opd_assignment': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.walkin_queue': {
    admin: 'edit', doctor: 'edit', visiting_doctor: 'view',
    nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.queue_display': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.doctor_schedule': {
    admin: 'edit', doctor: 'edit', visiting_doctor: 'edit',
    nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.manage': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.waitlist': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.reports': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
    report_viewer: 'view',
  },
  'appt.settings': {
    admin: 'edit', doctor: 'edit', nurse: 'edit', receptionist: 'edit',
  },
  'rx.all': {
    admin: 'edit', doctor: 'edit', nurse: 'view', pharmacist: 'edit',
  },
  'rx.new': {
    admin: 'view', doctor: 'edit', visiting_doctor: 'edit',
  },
  pharmacy: {
    admin: 'edit', pharmacist: 'edit', inventory_manager: 'view',
  },
  optical: {
    admin: 'edit', optical_staff: 'edit',
  },
  inventory: {
    admin: 'edit', pharmacist: 'view', inventory_manager: 'edit',
  },
  billing: {
    admin: 'edit', cashier: 'edit',
  },
  'system.subscription': {
    admin: 'edit',
  },
  'system.user_management': {
    admin: 'edit',
  },
  'system.settings': {
    admin: 'edit',
  },
};

function normalize(roles: string[]): string[] {
  return roles.map(r => String(r).trim().toLowerCase());
}

/** Highest access level any of `roles` has for `key`. super_admin always gets 'edit'. */
export function getAccess(key: string, roles: string[] | undefined | null): AccessLevel {
  const normalized = normalize(roles || []);
  if (normalized.includes('super_admin')) return 'edit';
  const entry = MODULE_ROLES[key];
  if (!entry) return 'none';
  let best: AccessLevel = 'none';
  for (const role of normalized) {
    const level = entry[role];
    if (level && (best === 'none' || LEVELS[level] > LEVELS[best as Exclude<AccessLevel, 'none'>])) {
      best = level;
    }
  }
  return best;
}

export function hasAccess(key: string, roles: string[] | undefined | null): boolean {
  return getAccess(key, roles) !== 'none';
}

export function canEdit(key: string, roles: string[] | undefined | null): boolean {
  return getAccess(key, roles) === 'edit';
}

/** Role list for a given key, for ProtectedRoute's allowedRoles — always includes super_admin. */
export function allowedRoles(key: string, minLevel: Exclude<AccessLevel, 'none'> = 'view'): string[] {
  const entry = MODULE_ROLES[key] || {};
  const threshold = LEVELS[minLevel];
  const roles = Object.entries(entry)
    .filter(([, level]) => level !== undefined && LEVELS[level] >= threshold)
    .map(([role]) => role);
  roles.push('super_admin');
  return roles;
}
