import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import patientService from '../services/patientService';
import prescriptionService from '../services/prescriptionService';
import type { Patient } from '../types/patient';
import { useToast } from '../contexts/ToastContext';
import VitalsCard, { type VitalsValues } from '../components/prescription/VitalsCard';

const emptyVitals: VitalsValues = { bp: '', pulse: '', temp: '', weight: '', spo2: '' };

// Nurse-facing vitals entry, reached from Walk-in Queue's "Enter Vitals"
// action. Saves to the same Prescription record (as a draft) the doctor's
// Prescription Builder will later open for this same appointment, via the
// shared VitalsCard fields and the PUT /prescriptions/draft-vitals endpoint
// (rx.vitals: edit, deliberately narrower than full prescription authoring).
const NurseVitals: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const patientId = searchParams.get('patient_id') || '';
  const appointmentId = searchParams.get('appointment_id') || '';

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vitals, setVitals] = useState<VitalsValues>(emptyVitals);

  useEffect(() => {
    if (!patientId || !appointmentId) {
      toast.error('Missing patient or appointment - open this from the Walk-in Queue');
      navigate('/appointments/queue');
      return;
    }
    setLoading(true);
    Promise.all([
      patientService.getPatient(patientId),
      // An existing draft (e.g. re-opening to correct a value already saved)
      // pre-fills the form instead of starting blank every time.
      prescriptionService.getPrescriptionByAppointment(appointmentId).catch(() => null),
    ])
      .then(([p, rx]) => {
        setPatient(p);
        if (rx) {
          setVitals({
            bp: rx.vitals_bp || '',
            pulse: rx.vitals_pulse || '',
            temp: rx.vitals_temp || '',
            weight: rx.vitals_weight || '',
            spo2: rx.vitals_spo2 || '',
          });
        }
      })
      .catch(() => {
        toast.error('Failed to load patient');
        navigate('/appointments/queue');
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, appointmentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await prescriptionService.saveDraftVitals({
        patient_id: patientId,
        appointment_id: appointmentId,
        vitals_bp: vitals.bp || undefined,
        vitals_pulse: vitals.pulse || undefined,
        vitals_temp: vitals.temp || undefined,
        vitals_weight: vitals.weight || undefined,
        vitals_spo2: vitals.spo2 || undefined,
      });
      toast.success('Vitals saved as draft - the doctor will see these when the consultation starts');
      navigate('/appointments/queue');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save vitals');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (!patient) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/appointments/queue')} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Enter Vitals</h1>
          <p className="mt-1 text-sm text-slate-500">{patient.first_name} {patient.last_name}</p>
        </div>
      </div>

      <VitalsCard values={vitals} onChange={setVitals} disabled={saving} />

      <div className="sticky bottom-4 z-10 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Saved as a draft - the doctor can still edit these before finalizing.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => navigate('/appointments/queue')}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NurseVitals;
