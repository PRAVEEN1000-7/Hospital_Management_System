import React from 'react';

export interface VitalsValues {
  bp: string;
  pulse: string;
  temp: string;
  weight: string;
  spo2: string;
}

interface VitalsCardProps {
  values: VitalsValues;
  onChange: (values: VitalsValues) => void;
  disabled?: boolean;
  // Optional 6th field, rendered inside this same card (not a separate box
  // elsewhere) — only shown when the caller passes both props, which only
  // eye hospitals do (NurseVitals.tsx / PrescriptionBuilder.tsx). Kept
  // separate from VitalsValues rather than folded in, so a non-eye-hospital
  // caller isn't forced to carry an unused field through its own state.
  // Stored/sent as a single "{number} {unit}" string (e.g. "110 mg/dL") —
  // unchanged externally — so the print template (which prints this string
  // as-is, see prescriptions.py's PDF route) always includes the unit with
  // no backend changes needed.
  bloodSugar?: string;
  onBloodSugarChange?: (value: string) => void;
}

const BLOOD_SUGAR_UNITS = ['mg/dL', 'mmol/L', 'dg/ml'];

// Splits "110 mg/dL" -> { amount: "110", unit: "mg/dL" }. Falls back to
// mg/dL when the string has no recognized unit yet (a brand-new entry, or
// an old value saved before this split existed) so the dropdown always has
// a valid selection.
const splitBloodSugar = (raw: string): { amount: string; unit: string } => {
  const trimmed = raw.trim();
  for (const unit of BLOOD_SUGAR_UNITS) {
    if (trimmed.toLowerCase().endsWith(unit.toLowerCase())) {
      return { amount: trimmed.slice(0, trimmed.length - unit.length).trim(), unit };
    }
  }
  return { amount: trimmed, unit: 'mg/dL' };
};

// Shared between the doctor's PrescriptionBuilder and the nurse's Vitals
// entry screen (NurseVitals.tsx) — same fields, same labels, same layout,
// so "enter vitals" looks and behaves identically wherever it's used.
const VitalsCard: React.FC<VitalsCardProps> = ({ values, onChange, disabled, bloodSugar, onBloodSugarChange }) => {
  const set = (key: keyof VitalsValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: e.target.value });

  const { amount: bsAmount, unit: bsUnit } = bloodSugar !== undefined ? splitBloodSugar(bloodSugar) : { amount: '', unit: 'mg/dL' };
  const emitBloodSugar = (amount: string, unit: string) => {
    if (!onBloodSugarChange) return;
    onBloodSugarChange(amount.trim() ? `${amount.trim()} ${unit}` : '');
  };

  // The unit shows inline inside the field, once a value is entered —
  // rather than only appearing in the label above it — so BP/Pulse/Temp/
  // Weight/SpO2 all display "value + unit" together, same idea as the
  // Blood Sugar field's unit dropdown alongside its amount.
  const field = (key: keyof VitalsValues, label: string, unit: string, placeholder: string) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <div className="relative">
        <input type="text" value={values[key]} onChange={set(key)} placeholder={placeholder} disabled={disabled}
          className="input-field pr-14" />
        {values[key] && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{unit}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-sm">vital_signs</span> Vitals
      </h3>
      {/* Blood sugar (when the caller supplies it) joins this same single
          row as a 6th field instead of a separate row below — grid-cols-6
          only kicks in once it's actually present, so non-eye-hospital
          callers (5 fields only) keep the original 5-column row. */}
      <div className={`grid grid-cols-2 gap-4 ${bloodSugar !== undefined && onBloodSugarChange ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
        {field('bp', 'BP', 'mmHg', '120/80')}
        {field('pulse', 'Pulse', 'bpm', '72')}
        {field('temp', 'Temp', '°F', '98.6')}
        {field('weight', 'Weight', 'kg', '70')}
        {field('spo2', 'SpO2', '%', '98')}
        {bloodSugar !== undefined && onBloodSugarChange && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Blood Sugar</label>
            <div className="flex gap-1.5">
              <input type="text" value={bsAmount} onChange={(e) => emitBloodSugar(e.target.value, bsUnit)} disabled={disabled}
                placeholder="110" className="input-field flex-1 min-w-0" />
              <select value={bsUnit} onChange={(e) => emitBloodSugar(bsAmount, e.target.value)} disabled={disabled}
                className="input-field w-[5.5rem] shrink-0 px-1.5">
                {BLOOD_SUGAR_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VitalsCard;
