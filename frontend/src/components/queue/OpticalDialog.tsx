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
          pd: existing.pd ?? existing.pd_distance ?? undefined,
          add: existing.add ?? existing.right_add ?? existing.left_add ?? undefined,
          machine_add: existing.machine_add ?? existing.right_machine_add ?? existing.left_machine_add ?? undefined,
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

  // Compact RE/LE × SPH/CYL/AXIS grid — one card per prescribed block (AR
  // machine reading or the doctor's final call), matching the printed
  // spectacle-prescription layout instead of two separate per-eye cards, to
  // save vertical space in this already-compact dialog. `showExam` also
  // renders the exam-findings row (Vision/IOP/NLD/VA) below the grid —
  // Doctor Prescribed only, since an auto-refractometer produces none of
  // those. `addField` is the single shared Add power for this block.
  const rxGrid = (prefix: 'machine' | '', addField: 'add' | 'machine_add', showExam: boolean) => {
    const rf = (base: string) => `right_${prefix ? prefix + '_' : ''}${base}` as keyof OpticalFields;
    const lf = (base: string) => `left_${prefix ? prefix + '_' : ''}${base}` as keyof OpticalFields;
    const cellInput = (field: keyof OpticalFields, extraProps: Record<string, any> = {}) => (
      <input
        type="number"
        value={(rx as any)[field] ?? ''}
        onChange={numField(field)}
        disabled={saving}
        className="w-full px-2 py-1.5 text-sm text-center border-0 cursor-text focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
        {...extraProps}
      />
    );
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 text-center text-xs font-bold text-slate-600 uppercase tracking-wide bg-slate-50">
          <div className="py-1.5 border-r border-slate-200">RE</div>
          <div className="py-1.5">LE</div>
        </div>
        {/* Field labels use text-[11px] — same size as PD/Optical Notes/
            Complaint elsewhere in this dialog — so nothing in this table
            reads as a different scale from the rest of the form. */}
        <div className="grid grid-cols-6 text-center text-[11px] font-semibold text-slate-500 uppercase border-t border-slate-200">
          <div className="py-1 border-r border-slate-100">SPH</div>
          <div className="py-1 border-r border-slate-100">CYL</div>
          <div className="py-1 border-r border-slate-200">Axis</div>
          <div className="py-1 border-r border-slate-100">SPH</div>
          <div className="py-1 border-r border-slate-100">CYL</div>
          <div className="py-1">Axis</div>
        </div>
        <div className="grid grid-cols-6 gap-px bg-slate-200 border-t border-slate-200">
          <div className="bg-white">{cellInput(rf('sph'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(rf('cyl'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(rf('axis'), { min: 0, max: 180 })}</div>
          <div className="bg-white">{cellInput(lf('sph'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(lf('cyl'), { step: '0.25' })}</div>
          <div className="bg-white">{cellInput(lf('axis'), { min: 0, max: 180 })}</div>
        </div>
        {showExam && (
          <div className="grid grid-cols-2 gap-px bg-slate-200 border-t border-slate-200">
            {(['right', 'left'] as const).map((side) => (
              <div key={side} className="bg-white p-2 space-y-2">
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
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Visual Acuity</label>
                  <input value={(rx as any)[`${side}_va`] || ''} onChange={textField(`${side}_va` as keyof OpticalFields)} placeholder="6/6" className="input-field" disabled={saving} />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-slate-200 p-2">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Add</label>
          <input type="number" step="0.25" value={(rx as any)[addField] ?? ''} onChange={numField(addField)} className="input-field" disabled={saving} />
        </div>
      </div>
    );
  };

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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">PD (mm)</label>
                    <input type="number" step="0.5" value={rx.pd ?? ''} onChange={numField('pd')} className="input-field" disabled={saving} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Optical Notes</label>
                    <input value={rx.notes || ''} onChange={textField('notes')} className="input-field" disabled={saving} />
                  </div>
                </div>
              </div>
            </div>

            {/* AR Prescribed and Doctor Prescribed used to be two identical-
                looking cards — collapsed to the one grid that matters for
                the issued prescription, no label above it, plus the
                Vision/IOP/NLD/VA exam findings per eye below it. The old
                machine-reading fields (right_machine_sph etc., machine_add)
                stay in the data model for backward compatibility with
                existing records; this dialog just no longer has separate
                inputs for them. */}
            {rxGrid('', 'add', true)}
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
