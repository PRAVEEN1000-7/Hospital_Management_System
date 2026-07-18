import React from 'react';
import { isPatientVerified } from '../../utils/patientVerification';

interface VerifiedBadgeProps {
  patient?: { is_email_verified?: boolean; is_phone_verified?: boolean } | null;
  className?: string;
}

// Green checkmark shown next to a patient's name wherever it appears
// (BRD_OP_1 §3.2.3) — only when BOTH email and phone are verified.
const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ patient, className = '' }) => {
  if (!isPatientVerified(patient)) return null;
  return (
    <span
      className={`material-icons text-emerald-500 text-base align-middle ${className}`}
      title="Email and phone verified."
    >
      check_circle
    </span>
  );
};

export default VerifiedBadge;
