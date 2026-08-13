import React from 'react';
import { format } from 'date-fns';
import VerifiedBadge from '../patients/VerifiedBadge';
import type { Patient } from '../../types/patient';

interface OpdAssignConfirmDialogProps {
  patient: Patient;
  // Reference "now" for the age calculation, computed once by the caller in
  // an event handler (not here) — calling Date.now()/new Date() directly
  // during render is a React purity violation.
  asOf: Date;
  lastVisitDate: string | null;
  loadingLastVisit: boolean;
  // MC1/MC2/.../MCR for today's visit (see appointment_service.compute_follow_up_label)
  // — null for a genuine first-ever visit or while still loading.
  followUpLabel: string | null;
  loadingFollowUpLabel: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Patient detail confirmation dialog before OPD assignment (BRD_OP_1
// §3.3.2). Verification status is shown but never blocks assignment — the
// user decided unverified patients are flagged only, per BRD §5.3.
const OpdAssignConfirmDialog: React.FC<OpdAssignConfirmDialogProps> = ({
  patient, asOf, lastVisitDate, loadingLastVisit, followUpLabel, loadingFollowUpLabel, onConfirm, onCancel,
}) => {
  const age = patient.age_years ?? (patient.date_of_birth
    ? Math.floor((asOf.getTime() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null);
  const hasFlags = !!(patient.known_allergies?.trim() || patient.chronic_conditions?.trim());
  const isFreeFollowUp = !!followUpLabel && followUpLabel !== 'MCR' && followUpLabel.startsWith('MC');

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">person_search</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Confirm Patient</h3>
              <p className="text-[11px] text-slate-400">Review details before assigning to OPD</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              {patient.first_name[0]}{patient.last_name[0]}
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 flex items-center gap-1.5 truncate">
                {patient.first_name} {patient.last_name}
                <VerifiedBadge patient={patient} />
              </p>
              <p className="text-xs text-slate-500">PRN: {patient.patient_reference_number}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Age / Gender</p>
              <p className="text-slate-700">{age != null ? `${age} yrs` : '—'} · {patient.gender || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Contact</p>
              <p className="text-slate-700 flex items-center gap-1">
                {patient.phone_country_code} {patient.phone_number}
                {patient.is_phone_verified && (
                  <span className="material-icons text-emerald-500 text-sm align-middle" title="Phone verified">
                    check_circle
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Email</p>
              <p className="text-slate-700 flex items-center gap-1 truncate">
                <span className="truncate">{patient.email || '—'}</span>
                {patient.email && patient.is_email_verified && (
                  <span className="material-icons text-emerald-500 text-sm align-middle shrink-0" title="Email verified">
                    check_circle
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Last Visit</p>
              <p className="text-slate-700">
                {loadingLastVisit
                  ? 'Loading…'
                  : lastVisitDate ? format(new Date(lastVisitDate), 'dd MMM yyyy') : 'First visit'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">OPD Assignment</p>
              <p className="text-slate-700">
                {loadingFollowUpLabel
                  ? 'Loading…'
                  : followUpLabel ? (followUpLabel === 'MCR' ? `${followUpLabel} — Renewal` : followUpLabel) : 'First visit'}
              </p>
            </div>
          </div>

          {isFreeFollowUp && (
            <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              Free consultation ({followUpLabel}) — within the follow-up window, no fee will be collected
            </p>
          )}

          {hasFlags && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">warning</span>
                Critical Medical Flags
              </p>
              {patient.known_allergies?.trim() && (
                <p className="text-xs text-red-700"><span className="font-semibold">Allergies:</span> {patient.known_allergies}</p>
              )}
              {patient.chronic_conditions?.trim() && (
                <p className="text-xs text-red-700"><span className="font-semibold">Chronic conditions:</span> {patient.chronic_conditions}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">how_to_reg</span>
            Confirm &amp; Assign to OPD
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpdAssignConfirmDialog;
