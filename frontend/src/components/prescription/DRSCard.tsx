import React from 'react';

interface DRSCardProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

type DRSStatus = 'normal' | 'abnormal' | null;

// The Normal/Abnormal selection is encoded as a leading marker line in the
// same free-text `value` string (no backend schema change) — "Normal" or
// "Abnormal" on its own first line, followed by the doctor's typed details.
// A value with no such marker (every pre-existing record) simply parses as
// status=null with the whole string as details, so old records still show
// exactly what was recorded, just with neither button highlighted.
function parseDRS(raw: string): { status: DRSStatus; details: string } {
  const text = raw ?? '';
  const newlineIdx = text.indexOf('\n');
  const firstLine = (newlineIdx === -1 ? text : text.slice(0, newlineIdx)).trim();
  if (firstLine === 'Normal' || firstLine === 'Abnormal') {
    return {
      status: firstLine.toLowerCase() as DRSStatus,
      details: newlineIdx === -1 ? '' : text.slice(newlineIdx + 1),
    };
  }
  return { status: null, details: text };
}

function composeDRS(status: DRSStatus, details: string): string {
  if (!status) return details;
  const label = status === 'normal' ? 'Normal' : 'Abnormal';
  return details ? `${label}\n${details}` : label;
}

// DRS = Diabetic Retinopathy Screening. Nurse-entered, positioned directly
// below the Vitals section (see NurseVitals.tsx / VitalsDialog.tsx) —
// eye-hospital only, same gating as VitalsCard's Blood Sugar field. Shared
// with PrescriptionBuilder.tsx so the doctor sees exactly what the nurse
// recorded for this same visit with no re-entry required; the doctor can
// still amend it before finalizing.
const DRSCard: React.FC<DRSCardProps> = ({ value, onChange, disabled }) => {
  const { status, details } = parseDRS(value);

  const handleToggle = (clicked: 'normal' | 'abnormal') => {
    const next = status === clicked ? null : clicked;
    onChange(composeDRS(next, details));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-sm">visibility</span>
        DRS (Diabetic Retinopathy Screening)
      </h3>
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleToggle('normal')}
          className={`px-4 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
            status === 'normal' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-600 hover:border-primary/40'
          }`}
        >
          {status === 'normal' && <span className="material-symbols-outlined text-sm align-middle mr-1">check_circle</span>}
          Normal
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleToggle('abnormal')}
          className={`px-4 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
            status === 'abnormal' ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-200 text-slate-600 hover:border-red-300'
          }`}
        >
          {status === 'abnormal' && <span className="material-symbols-outlined text-sm align-middle mr-1">check_circle</span>}
          Abnormal
        </button>
      </div>
      <textarea
        value={details}
        onChange={(e) => onChange(composeDRS(status, e.target.value))}
        disabled={disabled}
        rows={3}
        placeholder="Screening finding per eye (e.g. RE: No DR, LE: Mild NPDR)..."
        className="input-field resize-none"
      />
    </div>
  );
};

export default DRSCard;
