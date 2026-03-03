import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import prescriptionService from '../services/prescriptionService';
import type { Prescription, PrescriptionVersion } from '../types/prescription';

const statusColor: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  finalized: 'bg-blue-100 text-blue-700',
  dispensed: 'bg-green-100 text-green-700',
  partially_dispensed: 'bg-orange-100 text-orange-700',
};

const PrescriptionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [rx, setRx] = useState<Prescription | null>(null);
  const [versions, setVersions] = useState<PrescriptionVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);

  const role = user?.roles?.[0];

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await prescriptionService.getPrescription(id);
      setRx(data);
    } catch {
      showToast('error', 'Failed to load prescription');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  const loadVersions = async () => {
    if (!id) return;
    try {
      const v = await prescriptionService.getPrescriptionVersions(id);
      setVersions(v);
      setShowVersions(true);
    } catch {
      showToast('error', 'Failed to load version history');
    }
  };

  const handleFinalize = async () => {
    if (!id || !confirm('Finalize this prescription? It cannot be edited after finalization.')) return;
    try {
      await prescriptionService.finalizePrescription(id);
      showToast('success', 'Prescription finalized');
      fetch();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to finalize');
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Delete this prescription?')) return;
    try {
      await prescriptionService.deletePrescription(id);
      showToast('success', 'Prescription deleted');
      navigate('/prescriptions');
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Cannot delete');
    }
  };

  const handlePrint = async () => {
    if (!id) return;
    try {
      const html = await prescriptionService.getPrescriptionPdfUrl(id);
      // Open a new window, write the HTML, and trigger print
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        // Wait for content to render, then trigger print dialog
        win.onload = () => win.print();
        // Fallback if onload doesn't fire (some browsers)
        setTimeout(() => win.print(), 500);
      }
    } catch {
      showToast('error', 'Failed to load printable prescription');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!rx) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <span className="material-symbols-outlined text-4xl mb-2">error</span>
        <p className="text-sm">Prescription not found</p>
        <button onClick={() => navigate('/prescriptions')} className="mt-2 text-primary text-sm hover:underline">
          Back to list
        </button>
      </div>
    );
  }

  const canEdit = !rx.is_finalized && (role === 'doctor' || role === 'super_admin' || role === 'admin');

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/prescriptions')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{rx.patient_reference_number || rx.prescription_number}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                {rx.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Created {new Date(rx.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={handlePrint} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors">
            <span className="material-symbols-outlined text-sm">print</span>
            Print
          </button>
          <button onClick={loadVersions} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors">
            <span className="material-symbols-outlined text-sm">history</span>
            Versions
          </button>
          {canEdit && (
            <>
              <button onClick={() => navigate(`/prescriptions/${rx.id}/edit`)} className="px-3 py-2 rounded-lg border border-primary text-sm font-medium text-primary hover:bg-primary/5 flex items-center gap-1.5 transition-colors">
                <span className="material-symbols-outlined text-sm">edit</span>
                Edit
              </button>
              <button onClick={handleFinalize} className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5 transition-colors">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Finalize
              </button>
              <button onClick={handleDelete} className="px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50 flex items-center gap-1.5 transition-colors">
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Prescription Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Doctor Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">person</span>
              Patient & Doctor
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Patient</p>
                <p className="text-sm font-medium text-slate-800">{rx.patient_name || rx.patient_id}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Doctor</p>
                <p className="text-sm font-medium text-slate-800">{rx.doctor_name || rx.doctor_id}</p>
              </div>
              {rx.appointment_id && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Appointment</p>
                  <p className="text-sm text-slate-600">{rx.appointment_number || rx.appointment_id}</p>
                </div>
              )}
              {rx.valid_until && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Valid Until</p>
                  <p className="text-sm text-slate-600">
                    {new Date(rx.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Diagnosis & Notes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">stethoscope</span>
              Clinical Details
            </h2>
            <div className="space-y-3">
              {rx.diagnosis && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Diagnosis</p>
                  <p className="text-sm text-slate-800">{rx.diagnosis}</p>
                </div>
              )}
              {rx.clinical_notes && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Clinical Notes</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{rx.clinical_notes}</p>
                </div>
              )}
              {rx.advice && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Advice</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{rx.advice}</p>
                </div>
              )}
            </div>
          </div>

          {/* Medicines / Items */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">medication</span>
                Medicines ({rx.items?.length || 0})
              </h2>
            </div>
            {rx.items && rx.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {rx.items.map((item, idx) => (
                  <div key={item.id || idx} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-800">{idx + 1}. {item.medicine_name}</span>
                          {item.generic_name && (
                            <span className="text-xs text-slate-400">({item.generic_name})</span>
                          )}
                          {item.allow_substitution && (
                            <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-medium">Sub OK</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          {item.dosage && <span><strong className="text-slate-600">Dosage:</strong> {item.dosage}</span>}
                          <span><strong className="text-slate-600">Freq:</strong> {item.frequency}</span>
                          <span><strong className="text-slate-600">Duration:</strong> {item.duration_value} {item.duration_unit}</span>
                          <span><strong className="text-slate-600">Route:</strong> {item.route}</span>
                          {item.quantity && <span><strong className="text-slate-600">Qty:</strong> {item.quantity}</span>}
                        </div>
                        {item.instructions && (
                          <p className="text-xs text-slate-400 mt-1 italic">{item.instructions}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No medicines added</div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                  {rx.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">PRN</span>
                <span className="text-slate-700 font-medium">{rx.patient_reference_number || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Rx Number</span>
                <span className="text-slate-700 font-medium">{rx.prescription_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Medicines</span>
                <span className="text-slate-700 font-medium">{rx.items?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Version</span>
                <span className="text-slate-700 font-medium">{rx.version}</span>
              </div>
              {rx.finalized_at && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Finalized</span>
                  <span className="text-slate-700 text-xs">
                    {new Date(rx.finalized_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Version History (inline expand) */}
          {showVersions && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Version History</h2>
                <button onClick={() => setShowVersions(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              {versions.length === 0 ? (
                <p className="text-xs text-slate-400">No version history available</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {versions.map((v, idx) => (
                    <div key={v.id || idx} className="border border-slate-100 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-700">v{v.version}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(v.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {v.change_reason && <p className="text-xs text-slate-500">{v.change_reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button
                onClick={handlePrint}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Print Prescription
              </button>
              {rx.patient_id && (
                <button
                  onClick={() => navigate(`/patients/${rx.patient_id}`)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">person</span>
                  View Patient
                </button>
              )}
              <button
                onClick={() => navigate(`/prescriptions/new?patient_id=${rx.patient_id}`)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
                New Rx for Patient
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionDetail;
