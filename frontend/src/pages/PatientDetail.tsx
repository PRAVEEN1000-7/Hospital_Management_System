import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, differenceInYears } from 'date-fns';
import patientService from '../services/patientService';
import labService from '../services/labService';
import opticalService from '../services/opticalService';
import type { Patient } from '../types/patient';
import type { PatientLabResult } from '../types/lab';
import type { OpticalPrescription } from '../types/optical';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { hasAccess } from '../config/modulePermissions';
import ImageCropModal from '../components/common/ImageCropModal';
import VerifiedBadge from '../components/patients/VerifiedBadge';
import EmailVerificationField from '../components/patients/EmailVerificationField';
import PhoneVerificationField from '../components/patients/PhoneVerificationField';
import PrescriptionHistoryGrid from '../components/patients/PrescriptionHistoryGrid';
import PatientBillingSection from '../components/patients/PatientBillingSection';
import { canEdit as canEditModule } from '../config/modulePermissions';
import { useConfirm } from '../contexts/ConfirmContext';

// Returns the section heading to render above rows[idx] (or undefined) — a
// heading only appears when a row's non-empty section differs from the
// previous row's, so items with no sections at all render with no headings.
const sectionHeadingFor = (rows: { section?: string | null }[], idx: number): string | undefined => {
  const section = rows[idx].section?.trim();
  if (!section) return undefined;
  const prevSection = idx > 0 ? rows[idx - 1].section?.trim() : '';
  return section !== prevSection ? section : undefined;
};

const PatientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { user, isModuleEnabled, hasRole, isEyeHospitalFeatureEnabled } = useAuth();
  const canEdit = canEditModule('general.patients', user?.roles);
  // Lab is deliberately outside the shared module-permission matrix (see
  // modulePermissions.ts) — mirrors LabOrderDetail.tsx's own STAFF_ROLES.
  const canDeleteLabOrder = hasRole('super_admin', 'admin', 'lab_technician');
  const [labResults, setLabResults] = useState<PatientLabResult[]>([]);
  const [opticalPrescriptions, setOpticalPrescriptions] = useState<OpticalPrescription[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('photo.jpg');

  const refreshPatient = async () => {
    try {
      const data = await patientService.getPatient(id!);
      setPatient(data);
    } catch {
      setFetchError('Patient not found');
    }
  };

  useEffect(() => {
    setLoading(true);
    refreshPatient().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Lab results — only when the lab module is enabled; non-fatal on failure.
  useEffect(() => {
    if (!id || !isModuleEnabled('lab')) return;
    labService.getPatientResults(id).then(setLabResults).catch(() => {});
  }, [id, isModuleEnabled]);

  // Optical prescriptions — eye-hospital feature pack only; non-fatal on
  // failure (e.g. a role with no optical access at all still sees the rest
  // of the page).
  useEffect(() => {
    if (!id || !isModuleEnabled('optical') || !isEyeHospitalFeatureEnabled) return;
    opticalService.getPrescriptions(1, 50, id).then(res => setOpticalPrescriptions(res.data)).catch(() => {});
  }, [id, isModuleEnabled, isEyeHospitalFeatureEnabled]);

  const [deletingLabOrderId, setDeletingLabOrderId] = useState<string | null>(null);

  const handleDeleteLabOrder = async (orderId: string, orderNumber: string) => {
    const ok = await confirm({
      title: 'Delete Lab Order?',
      message: `Delete lab order ${orderNumber}? This cannot be undone.`,
      confirmLabel: 'Delete Order',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingLabOrderId(orderId);
    try {
      await labService.deleteOrder(orderId);
      setLabResults(prev => prev.filter(o => o.id !== orderId));
      toast.success('Lab order deleted');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to delete lab order');
    } finally {
      setDeletingLabOrderId(null);
    }
  };

  // Reset the broken-image flag whenever the photo actually changes (e.g. after a new upload).
  useEffect(() => {
    setPhotoFailed(false);
  }, [patient?.photo_url]);

  const MAX_PHOTO_SIZE_MB = 2;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG and PNG images are allowed');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    // Matches the server-side limit (patient_service.save_patient_photo) —
    // checking here avoids the crop step succeeding only for the upload to
    // fail afterward with no indication beforehand of why.
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      toast.error(`Image is too large. Maximum size: ${MAX_PHOTO_SIZE_MB}MB`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setCropFileName(file.name);
    setCropSrc(URL.createObjectURL(file));
  };

  const closeCropper = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropped = async (file: File) => {
    closeCropper();
    setUploading(true);
    try {
      const updatedPatient = await patientService.uploadPhoto(id!, file);
      setPatient(updatedPatient);
      toast.success('Photo uploaded successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-20">
        <span className="material-icons text-5xl text-red-300 mb-4">error_outline</span>
        <p className="text-lg font-bold text-slate-900">{fetchError || 'Patient not found'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-primary hover:underline text-sm font-semibold">
          Back
        </button>
      </div>
    );
  }

  const age = differenceInYears(new Date(), new Date(patient.date_of_birth));
  const photoUrl = patientService.getPhotoUrl(patient.photo_url);
  const initials = `${patient.first_name[0]}${patient.last_name[0]}`.toUpperCase();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <span className="material-icons text-lg">arrow_back</span>
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => navigate(`/patients/${id}/edit`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors active:scale-95"
            >
              <span className="material-icons text-lg">edit</span>
              Edit Patient
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => navigate(`/patients/${id}/id-card`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors active:scale-95"
            >
              <span className="material-icons text-lg">badge</span>
              View ID Card
            </button>
          )}
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-primary rounded-t-xl p-6 md:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-white/20 border-4 border-white/30 flex items-center justify-center">
              {photoUrl && !photoFailed ? (
                <img
                  src={photoUrl}
                  alt={`${patient.first_name} ${patient.last_name}`}
                  className="w-full h-full object-cover"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <span className="text-3xl font-bold text-white/80">{initials}</span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title={`Upload photo — JPEG or PNG, max ${MAX_PHOTO_SIZE_MB}MB`}
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <span className="material-icons text-white">camera_alt</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {cropSrc && (
              <ImageCropModal imageSrc={cropSrc} fileName={cropFileName} onCancel={closeCropper} onCropped={handleCropped} />
            )}
            {canEdit && (
              <p className="mt-1.5 text-center text-[10px] text-white/70">JPEG/PNG, max {MAX_PHOTO_SIZE_MB}MB</p>
            )}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold flex items-center justify-center sm:justify-start gap-1.5">
              {patient.first_name} {patient.last_name}
              <VerifiedBadge patient={patient} />
            </h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20">
                <span className="material-icons text-xs">tag</span> {patient.patient_reference_number}
              </span>
              <span className="text-sm text-white/80">{patient.gender}</span>
              <span className="text-sm text-white/80">DOB: {format(new Date(patient.date_of_birth), 'dd MMM yyyy')} ({age} yrs)</span>
              {patient.blood_group && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/80">
                  <span className="material-icons text-xs">water_drop</span> {patient.blood_group}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Sections */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 divide-y divide-slate-100">
        {/* Personal Information */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Information</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            <InfoItem icon="badge" label="First Name" value={patient.first_name} />
            <InfoItem icon="badge" label="Last Name" value={patient.last_name} />
            <InfoItem icon="wc" label="Gender" value={patient.gender} />
            <InfoItem icon="cake" label="Date of Birth" value={format(new Date(patient.date_of_birth), 'dd MMM yyyy')} />
            <InfoItem icon="water_drop" label="Blood Group" value={patient.blood_group || '—'} />
            <InfoItem
              icon="event_upcoming"
              label="Next Follow-up"
              value={patient.next_follow_up_date ? format(new Date(patient.next_follow_up_date), 'dd MMM yyyy') : '—'}
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Contact Information</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem
              icon="phone"
              label="Mobile"
              value={`${patient.phone_country_code} ${patient.phone_number}`}
              action={canEdit && (
                <PhoneVerificationField
                  patientId={patient.id}
                  isPhoneVerified={patient.is_phone_verified}
                  onVerified={refreshPatient}
                />
              )}
            />
            <InfoItem
              icon="email"
              label="Email"
              value={patient.email || '—'}
              action={canEdit && patient.email && (
                <EmailVerificationField
                  patientId={patient.id}
                  email={patient.email}
                  isEmailVerified={patient.is_email_verified}
                  onVerified={refreshPatient}
                />
              )}
            />
          </div>
        </div>

        {/* Address */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Address</h2>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-lg">location_on</span>
            </div>
            <p className="text-sm text-slate-700 pt-2">
              {[patient.address_line_1, patient.address_line_2, patient.city, patient.state, patient.pin_code, patient.country]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
        </div>

        {/* Prescription History — GET /prescriptions/patient/{id} is guarded by
            view_roles('rx.all'), which excludes receptionist/report_viewer even
            though they can open this page via general.patients. */}
        {isModuleEnabled('prescriptions') && hasAccess('rx.all', user?.roles) && (
          <PrescriptionHistoryGrid patientId={patient.id} />
        )}

        {/* Optical Prescriptions — eye-hospital feature pack only. GET
            /optical/prescriptions?patient_id=... accepts a doctor's narrower
            "optical.exam" permission when patient_id is given (see
            optical.py's list_optical_prescriptions), same tier of access a
            doctor already has to open any single optical prescription. */}
        {isModuleEnabled('optical') && isEyeHospitalFeatureEnabled && opticalPrescriptions.length > 0 && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Optical Prescriptions</h2>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Rx #</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Doctor</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {opticalPrescriptions.map((rx) => (
                    <tr
                      key={rx.id}
                      onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}
                      className="cursor-pointer hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{rx.prescription_number}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {(() => { try { return format(new Date(rx.created_at), 'dd MMM yyyy'); } catch { return ''; } })()}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{rx.doctor_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          rx.is_finalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {rx.is_finalized ? 'Finalized' : 'Draft'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Billing History (BRD-001) — GET /invoices/patient/{id} requires
            billing view (admin/cashier only). */}
        {isModuleEnabled('billing') && hasAccess('billing', user?.roles) && (
          <PatientBillingSection patientId={patient.id} />
        )}

        {/* Lab Results */}
        {labResults.length > 0 && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-[2px] bg-primary/20 rounded-full"></span>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Lab Results</h2>
            </div>
            <div className="space-y-4">
              {labResults.map(order => (
                <div key={order.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <div className="text-sm">
                      <span className="font-mono text-slate-600">{order.order_number}</span>
                      {order.doctor_name && <span className="text-slate-400"> · {order.doctor_name}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">
                        {(() => { try { return format(new Date(order.created_at), 'dd MMM yyyy'); } catch { return ''; } })()}
                      </span>
                      <button
                        onClick={() => navigate(`/lab/orders/${order.id}`)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View Full Report
                      </button>
                      {canDeleteLabOrder && (
                        <button
                          onClick={() => handleDeleteLabOrder(order.id, order.order_number)}
                          disabled={deletingLabOrderId === order.id}
                          title="Delete this lab order"
                          className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                        >
                          {deletingLabOrderId === order.id ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 uppercase">
                          <th className="px-4 py-2 font-medium">Parameter</th>
                          <th className="px-4 py-2 font-medium">Result</th>
                          <th className="px-4 py-2 font-medium">Reference</th>
                          <th className="px-4 py-2 font-medium">Flag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {order.items.flatMap(item => (
                          item.parameters.length > 0 ? item.parameters.map((p, idx) => {
                            const heading = sectionHeadingFor(item.parameters, idx);
                            return (
                            <React.Fragment key={`${item.id}-${idx}`}>
                              {heading && (
                                <tr>
                                  <td colSpan={4} className="px-4 pt-3 pb-1 text-xs text-slate-600 uppercase font-bold">
                                    {heading}
                                  </td>
                                </tr>
                              )}
                              <tr>
                                <td className="px-4 py-2 text-slate-800">{p.name}</td>
                                <td className="px-4 py-2 text-slate-800">
                                  {p.value}{p.unit ? ` ${p.unit}` : ''}
                                </td>
                                <td className="px-4 py-2 text-slate-500">{p.reference_range || '—'}</td>
                                <td className="px-4 py-2">
                                  {p.flag ? (
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                                      p.flag === 'normal' ? 'bg-emerald-50 text-emerald-700'
                                        : p.flag === 'high' ? 'bg-red-50 text-red-600'
                                        : p.flag === 'low' ? 'bg-amber-50 text-amber-700'
                                        : 'bg-orange-50 text-orange-700'
                                    }`}>
                                      {p.flag}
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            </React.Fragment>
                            );
                          }) : [(
                            <tr key={item.id}>
                              <td className="px-4 py-2 text-slate-800">{item.test_name}</td>
                              <td className="px-4 py-2 text-slate-400 italic" colSpan={3}>Pending</td>
                            </tr>
                          )]
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {order.confirmatory_diagnosis && (
                    <div className="px-4 py-2.5 bg-primary/5 border-t border-slate-100 text-sm">
                      <span className="font-semibold text-primary">Confirmatory Diagnosis: </span>
                      <span className="text-slate-700">{order.confirmatory_diagnosis}</span>
                    </div>
                  )}
                  {(order.finalized_by_name || order.finalized_at) && (
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
                      Finalized{order.finalized_by_name ? ` by ${order.finalized_by_name}` : ''}
                      {order.finalized_at ? ` on ${(() => { try { return format(new Date(order.finalized_at as string), 'dd MMM yyyy, hh:mm a'); } catch { return ''; } })()}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Emergency Contact */}
        {patient.emergency_contact_name && (
          <div className="p-6 bg-amber-50/50">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-[2px] bg-amber-400/40 rounded-full"></span>
              <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider">Emergency Contact</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InfoItem icon="person" label="Name" value={patient.emergency_contact_name} />
              <InfoItem icon="favorite" label="Relationship" value={patient.emergency_contact_relation || '—'} />
              <InfoItem icon="phone" label="Mobile" value={patient.emergency_contact_phone ? `${patient.emergency_contact_country_code || '+91'} ${patient.emergency_contact_phone}` : '—'} />
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="p-6 bg-slate-50">
          <div className="flex flex-wrap gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="material-icons text-xs">tag</span> patient_reference_number: {patient.patient_reference_number}</span>
            <span className="flex items-center gap-1"><span className="material-icons text-xs">schedule</span> Created: {format(new Date(patient.created_at), 'dd MMM yyyy, hh:mm a')}</span>
            <span className="flex items-center gap-1"><span className="material-icons text-xs">update</span> Updated: {format(new Date(patient.updated_at), 'dd MMM yyyy, hh:mm a')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ icon: string; label: string; value: string; action?: React.ReactNode }> = ({ icon, label, value, action }) => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </div>
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
      {action}
    </div>
  </div>
);

export default PatientDetail;
