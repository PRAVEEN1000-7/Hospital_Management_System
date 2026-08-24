import React, { useEffect, useState } from 'react';
import opticalService from '../../services/opticalService';
import appointmentService from '../../services/appointmentService';
import { useToast } from '../../contexts/ToastContext';
import type { OpticalPrescriptionCreateData } from '../../types/optical';

interface OpticalDialogProps {
  patientId: string;
  appointmentId: string;
  patientName: string;
  onClose: () => void;
  onSaved: () => void;
}

type OpticalFields = Omit<OpticalPrescriptionCreateData, 'patient_id' | 'doctor_id' | 'appointment_id'>;

// Dialog version of the nurse's pre-consultation optical exam entry — same
// clinical fields and same create/update calls as the standalone
// /optical/prescriptions/new page (NewOpticalPrescription.tsx), but without
// that page's patient-search/doctor-picker/register-new-patient machinery,
// since the Walk-in Queue already knows exactly which patient+appointment
// this is for. Launched in place from the queue row instead of navigating
// away, and lays each eye's Exam + Spectacle fields out together in one
// compact card so the wide dialog space isn't spent on a long single column.
const OpticalDialog: React.FC<OpticalDialogProps> = ({ patientId, appointmentId, patientName, onClose, onSaved }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [complaint, setComplaint] = useState('');
  const [existingRxId, setExistingRxId] = useState<string | null>(null);
  const [existingRxFinalized, setExistingRxFinalized] = useState(false);
  const [rx, setRx] = useState<OpticalFields>({});

  const numField = (field: keyof OpticalFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRx(prev => ({ ...prev, [field]: value === '' ? undefined : Number(value) }));
  };
  const textField = (field: keyof OpticalFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRx(prev => ({ ...prev, [field]: value === '' ? undefined : value }));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      appointmentService.getAppointment(appointmentId).catch(() => null),
      opticalService.getPrescriptionByAppointment(appointmentId).catch(() => null),
    ]).then(([appt, existing]) => {
      if (cancelled) return;
      if (appt) setComplaint(appt.chief_complaint || '');
      if (existing) {
        setExistingRxId(existing.id);
        setExistingRxFinalized(!!existing.is_finalized);
        setRx({
          right_machine_sph: existing.right_machine_sph ?? undefined, right_machine_cyl: existing.right_machine_cyl ?? undefined,
          right_machine_axis: existing.right_machine_axis ?? undefined, right_machine_add: existing.right_machine_add ?? undefined,
          left_machine_sph: existing.left_machine_sph ?? undefined, left_machine_cyl: existing.left_machine_cyl ?? undefined,
          left_machine_axis: existing.left_machine_axis ?? undefined, left_machine_add: existing.left_machine_add ?? undefined,
          right_sph: existing.right_sph ?? undefined, right_cyl: existing.right_cyl ?? undefined,
          right_axis: existing.right_axis ?? undefined, right_add: existing.right_add ?? undefined, right_va: existing.right_va ?? undefined,
          right_vision: existing.right_vision ?? undefined, right_iop: existing.right_iop ?? undefined, right_nld: existing.right_nld ?? undefined,
          left_sph: existing.left_sph ?? undefined, left_cyl: existing.left_cyl ?? undefined,
          left_axis: existing.left_axis ?? undefined, left_add: existing.left_add ?? undefined, left_va: existing.left_va ?? undefined,
          left_vision: existing.left_vision ?? undefined, left_iop: existing.left_iop ?? undefined, left_nld: existing.left_nld ?? undefined,
          pd_distance: existing.pd_distance ?? undefined, pd_near: existing.pd_near ?? undefined,
          pd_right: existing.pd_right ?? undefined, pd_left: existing.pd_left ?? undefined,
          notes: existing.notes ?? undefined,
        });
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appointmentId]);

  const hasOpticalFields = Object.values(rx).some(v => v !== undefined && v !== '');

  const handleSave = async () => {
    if (!hasOpticalFields) { toast.error('Fill in at least one field of the eye exam/prescription'); return; }
    if (existingRxFinalized) { toast.error('This visit’s optical prescription has already been finalized and can no longer be edited'); return; }
    setSaving(true);
    try {
      await Promise.all([
        existingRxId
          ? opticalService.updatePrescription(existingRxId, rx)
          : opticalService.createPrescription({ patient_id: patientId, appointment_id: appointmentId, ...rx }),
        appointmentService.updateAppointment(appointmentId, { chief_complaint: complaint || undefined }),
      ]);
      toast.success('Optical exam saved as draft — the doctor will see these when the consultation starts');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save optical exam');
    } finally {
      setSaving(false);
    }
  };

  // Machine Prescribed — auto-refractometer reading, kept as its own set of
  // fields (SPH/CYL/Axis/Add only, no VA/Vision/IOP/NLD) separate from the
  // doctor-prescribed values in eyeCard() below.
  const machineCard = (side: 'left' | 'right', label: string) => (
    <div className="border border-slate-200 rounded-lg p-4">
      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-2 mb-3 border-b border-slate-100">{label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">SPH</label>
          <input type="number" step="0.25" value={(rx as any)[`${side}_machine_sph`] ?? ''} onChange={numField(`${side}_machine_sph` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">CYL</label>
          <input type="number" step="0.25" value={(rx as any)[`${side}_machine_cyl`] ?? ''} onChange={numField(`${side}_machine_cyl` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Axis</label>
          <input type="number" min={0} max={180} value={(rx as any)[`${side}_machine_axis`] ?? ''} onChange={numField(`${side}_machine_axis` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Add</label>
          <input type="number" step="0.25" value={(rx as any)[`${side}_machine_add`] ?? ''} onChange={numField(`${side}_machine_add` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
      </div>
    </div>
  );

  const eyeCard = (side: 'left' | 'right', label: string) => (
    <div className="border border-slate-200 rounded-lg p-4">
      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-2 mb-3 border-b border-slate-100">{label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Vision</label>
          <input value={(rx as any)[`${side}_vision`] || ''} onChange={textField(`${side}_vision` as keyof OpticalFields)} placeholder="6/9" className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">IOP (Schiotz)</label>
          <input value={(rx as any)[`${side}_iop`] || ''} onChange={textField(`${side}_iop` as keyof OpticalFields)} placeholder="16 mmHg" className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">NLD</label>
          <input value={(rx as any)[`${side}_nld`] || ''} onChange={textField(`${side}_nld` as keyof OpticalFields)} placeholder="Patent" className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">VA</label>
          <input value={(rx as any)[`${side}_va`] || ''} onChange={textField(`${side}_va` as keyof OpticalFields)} placeholder="6/6" className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">SPH</label>
          <input type="number" step="0.25" value={(rx as any)[`${side}_sph`] ?? ''} onChange={numField(`${side}_sph` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">CYL</label>
          <input type="number" step="0.25" value={(rx as any)[`${side}_cyl`] ?? ''} onChange={numField(`${side}_cyl` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Axis</label>
          <input type="number" min={0} max={180} value={(rx as any)[`${side}_axis`] ?? ''} onChange={numField(`${side}_axis` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Add</label>
          <input type="number" step="0.25" value={(rx as any)[`${side}_add`] ?? ''} onChange={numField(`${side}_add` as keyof OpticalFields)} className="input-field" disabled={saving} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Enter Optical Check</h3>
            <p className="text-xs text-slate-500 mt-0.5">{patientName}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : (
          <div className="space-y-5">
            {existingRxFinalized && (
              <div className="px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                This visit's optical prescription has already been finalized by the doctor and can no longer be edited here.
              </div>
            )}

            {/* Complaint (left) alongside PD/notes (right) on wide dialogs,
                so the top row uses the full width instead of a lone strip. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-2 mb-3 border-b border-slate-100 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-sm">symptoms</span> Complaint
                </h4>
                <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} disabled={saving}
                  rows={3} placeholder="What is the patient reporting? (e.g. eye redness, watering)"
                  className="input-field resize-none" />
              </div>
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide pb-2 mb-3 border-b border-slate-100">PD &amp; Notes</h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">PD Distance (mm)</label>
                    <input type="number" step="0.5" value={rx.pd_distance ?? ''} onChange={numField('pd_distance')} className="input-field" disabled={saving} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">PD Near (mm)</label>
                    <input type="number" step="0.5" value={rx.pd_near ?? ''} onChange={numField('pd_near')} className="input-field" disabled={saving} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">PD Right / OD (mm)</label>
                    <input type="number" step="0.5" value={rx.pd_right ?? ''} onChange={numField('pd_right')} className="input-field" disabled={saving} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">PD Left / OS (mm)</label>
                    <input type="number" step="0.5" value={rx.pd_left ?? ''} onChange={numField('pd_left')} className="input-field" disabled={saving} />
                  </div>
                </div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Optical Notes</label>
                <input value={rx.notes || ''} onChange={textField('notes')} className="input-field" disabled={saving} />
              </div>
            </div>

            {/* Machine Prescribed — auto-refractometer reading. */}
            <div>
              <h4 className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Machine Prescribed</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {machineCard('right', 'Right Eye (OD)')}
                {machineCard('left', 'Left Eye (OS)')}
              </div>
            </div>

            {/* Doctor Prescribed — Vision/IOP/NLD exam findings and
                SPH/CYL/Axis/Add/VA spectacle prescription together in one
                card per eye. */}
            <div>
              <h4 className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Doctor Prescribed</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Right Eye (OD) shown first (screen-left) per the clinical
                    convention of facing the patient. */}
                {eyeCard('right', 'Right Eye (OD)')}
                {eyeCard('left', 'Left Eye (OS)')}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || loading || existingRxFinalized}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpticalDialog;
