import React, { useEffect, useState } from 'react';
import prescriptionService from '../../services/prescriptionService';
import appointmentService from '../../services/appointmentService';
import { useToast } from '../../contexts/ToastContext';
import VitalsCard, { type VitalsValues } from '../prescription/VitalsCard';

const emptyVitals: VitalsValues = { bp: '', pulse: '', temp: '', weight: '', spo2: '' };

interface VitalsDialogProps {
  patientId: string;
  appointmentId: string;
  patientName: string;
  isEyeHospital: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// Dialog version of the nurse's pre-consultation vitals entry — same fields,
// same PUT /prescriptions/draft-vitals save path as the standalone
// /prescriptions/vitals/new page (NurseVitals.tsx), just launched in place
// from the Walk-in Queue row instead of a full page navigation, so the
// nurse never leaves the queue to record a quick reading.
const VitalsDialog: React.FC<VitalsDialogProps> = ({ patientId, appointmentId, patientName, isEyeHospital, onClose, onSaved }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vitals, setVitals] = useState<VitalsValues>(emptyVitals);
  const [bloodSugar, setBloodSugar] = useState('');
  const [complaint, setComplaint] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      appointmentService.getAppointment(appointmentId).catch(() => null),
      prescriptionService.getPrescriptionByAppointment(appointmentId).catch(() => null),
    ]).then(([appt, rx]) => {
      if (cancelled) return;
      if (appt) setComplaint(appt.chief_complaint || '');
      if (rx) {
        setVitals({
          bp: rx.vitals_bp || '',
          pulse: rx.vitals_pulse || '',
          temp: rx.vitals_temp || '',
          weight: rx.vitals_weight || '',
          spo2: rx.vitals_spo2 || '',
        });
        setBloodSugar(rx.vitals_blood_sugar || '');
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appointmentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        prescriptionService.saveDraftVitals({
          patient_id: patientId,
          appointment_id: appointmentId,
          vitals_bp: vitals.bp || undefined,
          vitals_pulse: vitals.pulse || undefined,
          vitals_temp: vitals.temp || undefined,
          vitals_weight: vitals.weight || undefined,
          vitals_spo2: vitals.spo2 || undefined,
          vitals_blood_sugar: isEyeHospital ? (bloodSugar || undefined) : undefined,
        }),
        appointmentService.updateAppointment(appointmentId, { chief_complaint: complaint || undefined }),
      ]);
      toast.success('Vitals saved as draft — the doctor will see these when the consultation starts');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save vitals');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Enter Vitals</h3>
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
            {/* Complaint full-width above Vitals — VitalsCard's own internal
                grid (sm:grid-cols-5/6) is a viewport breakpoint, not a
                container-width one, so squeezing it into a side-by-side
                split column forced 5-6 fields into too little real pixel
                width and threw the field alignment off. Stacking keeps both
                cards at the dialog's full width, which is what VitalsCard is
                already designed and used for everywhere else in the app. */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-primary text-base">symptoms</span> Complaint
              </h4>
              <textarea value={complaint} onChange={e => setComplaint(e.target.value)} disabled={saving}
                rows={3} placeholder="What is the patient reporting? (e.g. headache, blurred vision)"
                className="input-field resize-none" />
            </div>
            <VitalsCard
              values={vitals}
              onChange={setVitals}
              disabled={saving}
              bloodSugar={isEyeHospital ? bloodSugar : undefined}
              onBloodSugarChange={isEyeHospital ? setBloodSugar : undefined}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || loading}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VitalsDialog;
