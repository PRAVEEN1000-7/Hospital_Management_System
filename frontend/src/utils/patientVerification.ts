// BRD_OP_1 §3.2.3 — the checkmark next to a patient's name requires BOTH
// email AND phone verified. Single source of truth so this AND-logic can't
// drift out of sync across the frontend call sites (registration forms,
// patient list/detail, prescription dashboard, OPD search/dialog).
export function isPatientVerified(p?: { is_email_verified?: boolean; is_phone_verified?: boolean } | null): boolean {
  if (!p) return false;
  return !!p.is_email_verified && !!p.is_phone_verified;
}
