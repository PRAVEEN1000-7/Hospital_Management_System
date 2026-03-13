import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import type { Prescription, PrescriptionVersion } from '../types/prescription';

const PrescriptionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [versions, setVersions] = useState<PrescriptionVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [printLang, setPrintLang] = useState('en');
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>([]);
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    prescriptionService.getPrescriptionLanguages()
      .then(setLanguages)
      .catch(() => setLanguages([{ code: 'en', name: 'English' }]));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    prescriptionService.getPrescription(id)
      .then(setPrescription)
      .catch(() => {
        showToast('error', 'Prescription not found');
        navigate('/prescriptions');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const loadVersions = async () => {
    if (!id) return;
    try {
      const v = await prescriptionService.getPrescriptionVersions(id);
      setVersions(v);
      setShowVersions(true);
    } catch {
      showToast('error', 'Failed to load versions');
    }
  };

  const handleFinalize = async () => {
    if (!id || !prescription) return;
    try {
      const result = await prescriptionService.finalizePrescription(id);
      setPrescription(result);
      showToast('success', 'Prescription finalized');
    } catch {
      showToast('error', 'Failed to finalize');
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this draft?')) return;
    try {
      await prescriptionService.deletePrescription(id);
      showToast('success', 'Prescription deleted');
      navigate('/prescriptions');
    } catch {
      showToast('error', 'Failed to delete');
    }
  };

  const handlePrint = async (lang?: string) => {
    if (!id) return;
    try {
      const html = await prescriptionService.getPrescriptionPdfUrl(id, lang || printLang);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } catch {
      showToast('error', 'Failed to generate print view');
    }
  };

  const statusColor: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    finalized: 'bg-blue-100 text-blue-700 border-blue-300',
    dispensed: 'bg-green-100 text-green-700 border-green-300',
    partially_dispensed: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!prescription) return null;

  const rx = prescription;
  const userRole = user?.roles?.[0];
  const canEdit = !rx.is_finalized && (userRole === 'doctor' || userRole === 'super_admin' || userRole === 'admin');
  const canFinalize = !rx.is_finalized && (userRole === 'doctor' || userRole === 'super_admin');

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <nav className="flex text-sm text-slate-400 mb-1">
            <button onClick={() => navigate('/prescriptions')} className="hover:text-primary">Prescriptions</button>
            <span className="mx-2">/</span>
            <span className="text-slate-600">{rx.prescription_number}</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            Prescription {rx.prescription_number}
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusColor[rx.status] || ''}`}>
              {rx.status?.replace('_', ' ')}
            </span>
          </h1>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <div className="flex">
              <button
                onClick={() => handlePrint()}
                className="px-4 py-2 rounded-l-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">print</span> Print
                {printLang !== 'en' && (
                  <span className="text-xs text-primary font-semibold">
                    ({languages.find(l => l.code === printLang)?.name})
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="px-2 py-2 rounded-r-lg border border-l-0 border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center"
              >
                <span className="material-symbols-outlined text-sm">translate</span>
              </button>
            </div>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setPrintLang(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                      printLang === lang.code ? 'bg-primary/5 text-primary font-medium' : 'text-slate-700'
                    }`}
                  >
                    <span>{lang.name}</span>
                    {printLang === lang.code && (
                      <span className="material-symbols-outlined text-primary text-sm">check</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => navigate(`/prescriptions/${id}/edit`)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">edit</span> Edit
            </button>
          )}
          {canFinalize && (
            <button
              onClick={handleFinalize}
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">verified</span> Finalize
            </button>
          )}
          {canEdit && rx.status === 'draft' && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">delete</span> Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Doctor Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="grid grid-cols-2 gap-6">
              {/* Patient */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Patient</h4>
                <p className="text-sm font-semibold text-slate-900">{rx.patient_name || rx.patient_id}</p>
                {rx.patient_reference_number && (
                  <p className="text-[11px] text-slate-500 mt-0.5">PRN: {rx.patient_reference_number}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {rx.patient_age != null && rx.patient_gender && (
                    <span className="text-[11px] text-slate-500">{rx.patient_age}y / {rx.patient_gender}</span>
                  )}
                  {rx.patient_blood_group && (
                    <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-red-400" style={{ fontSize: '12px' }}>water_drop</span>
                      {rx.patient_blood_group}
                    </span>
                  )}
                  {rx.patient_phone && (
                    <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '12px' }}>call</span>
                      {rx.patient_phone}
                    </span>
                  )}
                </div>
              </div>
              {/* Doctor */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Doctor</h4>
                <p className="text-sm font-semibold text-slate-900">{rx.doctor_name || rx.doctor_id}</p>
              </div>
            </div>

            {/* Allergies & Chronic Conditions */}
            {(rx.patient_known_allergies || rx.patient_chronic_conditions) && (
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                {rx.patient_known_allergies && (
                  <div>
                    <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-red-500" style={{ fontSize: '14px' }}>allergy</span>
                      Allergies
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {rx.patient_known_allergies.split(',').map((a: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-medium">{a.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                {rx.patient_chronic_conditions && (
                  <div>
                    <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-amber-500" style={{ fontSize: '14px' }}>monitor_heart</span>
                      Chronic Conditions
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {rx.patient_chronic_conditions.split(',').map((c: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-medium">{c.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Appointment reference */}
            {rx.appointment_id && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Appointment</h4>
                <span className="text-xs text-slate-500">{rx.appointment_number || rx.appointment_id}</span>
              </div>
            )}
          </div>

          {/* Vitals */}
          {(rx.vitals_bp || rx.vitals_pulse || rx.vitals_temp || rx.vitals_weight || rx.vitals_spo2) && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">vital_signs</span>
                Vitals
              </h3>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'BP', value: rx.vitals_bp, unit: 'mmHg', icon: 'bloodtype' },
                  { label: 'Pulse', value: rx.vitals_pulse, unit: 'bpm', icon: 'heart_check' },
                  { label: 'Temp', value: rx.vitals_temp, unit: '°F', icon: 'thermostat' },
                  { label: 'Weight', value: rx.vitals_weight, unit: 'kg', icon: 'monitor_weight' },
                  { label: 'SpO2', value: rx.vitals_spo2, unit: '%', icon: 'spo2' },
                ].map(v => (
                  <div key={v.label} className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">{v.label}</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{v.value || '—'}</p>
                    {v.value && <p className="text-[10px] text-slate-400">{v.unit}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clinical Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">clinical_notes</span>
              Clinical Details
            </h3>

            {rx.diagnosis && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Diagnosis</h4>
                <p className="text-sm text-slate-700">{rx.diagnosis}</p>
              </div>
            )}

            {rx.clinical_notes && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Clinical Notes</h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{rx.clinical_notes}</p>
              </div>
            )}

            {rx.advice && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Advice</h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{rx.advice}</p>
              </div>
            )}
          </div>

          {/* Medicines */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">medication</span>
              Medicines ({rx.items?.length || 0})
            </h3>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[40px_1fr_80px_100px_100px_80px_1fr] gap-2 bg-slate-100 border-b border-slate-200 px-4 py-2.5">
                <div className="text-[10px] font-semibold text-slate-500 uppercase">#</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Medicine</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Dosage</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Frequency</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Duration</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Route</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Instructions</div>
              </div>

              {rx.items?.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="grid grid-cols-[40px_1fr_80px_100px_100px_80px_1fr] gap-2 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="text-xs text-slate-400 font-medium">{idx + 1}</div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.medicine_name}</p>
                    {item.generic_name && <p className="text-[10px] text-slate-400">{item.generic_name}</p>}
                    {item.allow_substitution === false && (
                      <span className="text-[9px] text-red-500 font-medium">No substitution</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-700">{item.dosage}</div>
                  <div className="text-xs text-slate-700">{item.frequency}</div>
                  <div className="text-xs text-slate-700">
                    {item.duration_value ? `${item.duration_value} ${item.duration_unit || 'days'}` : '—'}
                  </div>
                  <div className="text-xs text-slate-700">{item.route || '—'}</div>
                  <div className="text-xs text-slate-600">{item.instructions || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Prescription Metadata */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-3">Details</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Rx Number</span>
                <span className="font-medium text-slate-700">{rx.prescription_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor[rx.status] || ''}`}>
                  {rx.status?.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Version</span>
                <span className="font-medium text-slate-700">{rx.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Created</span>
                <span className="font-medium text-slate-700">
                  {new Date(rx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {rx.finalized_at && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Finalized</span>
                  <span className="font-medium text-slate-700">
                    {new Date(rx.finalized_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Version History */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <button
              onClick={() => showVersions ? setShowVersions(false) : loadVersions()}
              className="w-full flex justify-between items-center"
            >
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">history</span>
                Version History
              </h4>
              <span className="material-symbols-outlined text-slate-400 text-sm">
                {showVersions ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {showVersions && (
              <div className="mt-3 space-y-2">
                {versions.length > 0 ? versions.map(v => (
                  <div key={v.id} className="p-2 bg-slate-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">Version {v.version}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {v.change_reason && <p className="text-[10px] text-slate-500 mt-0.5">{v.change_reason}</p>}
                  </div>
                )) : (
                  <p className="text-xs text-slate-400">No previous versions</p>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h4 className="text-sm font-semibold mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button
                onClick={() => handlePrint()}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">print</span> Print Prescription
              </button>
              <button
                onClick={() => navigate(`/patients/${rx.patient_id}`)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2 mt-2"
              >
                <span className="material-symbols-outlined text-sm">person</span> View Patient
              </button>
              <button
                onClick={() => navigate(`/prescriptions/new?patient_id=${rx.patient_id}`)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 flex items-center gap-2 mt-2"
              >
                <span className="material-symbols-outlined text-sm">add</span> New Prescription
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionDetail;
