import React from 'react';

interface DRSCardProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// DRS = Diabetic Retinopathy Screening. Nurse-entered, positioned directly
// below the Vitals section (see NurseVitals.tsx / VitalsDialog.tsx) —
// eye-hospital only, same gating as VitalsCard's Blood Sugar field. Shared
// with PrescriptionBuilder.tsx so the doctor sees exactly what the nurse
// recorded for this same visit with no re-entry required; the doctor can
// still amend it before finalizing.
const DRSCard: React.FC<DRSCardProps> = ({ value, onChange, disabled }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
    <h3 className="font-semibold mb-4 flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-sm">visibility</span>
      DRS (Diabetic Retinopathy Screening)
    </h3>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={3}
      placeholder="Screening finding per eye (e.g. RE: No DR, LE: Mild NPDR)..."
      className="input-field resize-none"
    />
  </div>
);

export default DRSCard;
