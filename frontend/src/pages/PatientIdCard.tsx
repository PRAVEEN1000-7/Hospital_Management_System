import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, differenceInYears } from 'date-fns';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import patientService from '../services/patientService';
import type { Patient } from '../types/patient';
import api from '../services/api';

interface HospitalConfig {
  hospital_name: string;
  hospital_address: string;
  hospital_city: string;
  hospital_state: string;
  hospital_country: string;
  hospital_pin_code: string;
  hospital_phone: string;
  hospital_email: string;
  hospital_website: string;
}

const PatientIdCard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [hospital, setHospital] = useState<HospitalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [patientData, hospitalRes] = await Promise.all([
          patientService.getPatient(Number(id)),
          api.get<HospitalConfig>('/config/hospital'),
        ]);
        setPatient(patientData);
        setHospital(hospitalRes.data);
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const generatePDF = async (): Promise<jsPDF | null> => {
    if (!frontRef.current || !backRef.current) return null;
    const frontCanvas = await html2canvas(frontRef.current, { scale: 3, useCORS: true });
    const backCanvas = await html2canvas(backRef.current, { scale: 3, useCORS: true });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [96, 164] });
    const frontImg = frontCanvas.toDataURL('image/png');
    const backImg = backCanvas.toDataURL('image/png');
    pdf.addImage(frontImg, 'PNG', 5, 5, 86, 54);
    pdf.text('--- ✂ Fold Here ✂ ---', 48, 63, { align: 'center' });
    pdf.addImage(backImg, 'PNG', 5, 68, 86, 54);
    return pdf;
  };

  const handleDownload = async () => {
    const pdf = await generatePDF();
    if (pdf && patient) pdf.save(`ID-Card-${patient.prn}.pdf`);
  };

  const handlePrint = async () => {
    const pdf = await generatePDF();
    if (pdf) {
      const blobUrl = pdf.output('bloburl');
      const printWindow = window.open(blobUrl as unknown as string);
      printWindow?.print();
    }
  };

  const handleEmail = async () => {
    if (!patient?.email) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const pdf = await generatePDF();
      if (pdf) {
        const blob = pdf.output('blob');
        await patientService.emailIdCard(patient.id, blob);
        setSuccess(`ID card sent to ${patient.email}`);
      }
    } catch {
      setError('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!patient || !hospital) {
    return (
      <div className="text-center py-20 text-slate-500">
        <span className="material-icons text-5xl text-red-300 mb-4">error_outline</span>
        <p>{error || 'Data not found'}</p>
      </div>
    );
  }

  const age = differenceInYears(new Date(), new Date(patient.date_of_birth));
  const photoUrl = patientService.getPhotoUrl(patient.photo_url);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/patients/${id}`)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <span className="material-icons">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-slate-900">Patient ID Card</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload} className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-colors active:scale-95">
            <span className="material-icons text-lg">download</span> Download PDF
          </button>
          <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors active:scale-95">
            <span className="material-icons text-lg">print</span> Print
          </button>
          <button
            onClick={handleEmail}
            disabled={!patient.email || sending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold transition-colors active:scale-95"
          >
            <span className="material-icons text-lg">email</span> {sending ? 'Sending...' : 'Email'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {!patient.email && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
          <span className="material-icons text-amber-600">warning</span>
          <p className="text-sm text-amber-700">Patient does not have an email address on file.</p>
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-3">
          <span className="material-icons text-red-500">error</span> {error}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-3">
          <span className="material-icons text-emerald-500">check_circle</span> {success}
        </div>
      )}

      {/* ID Card - Front */}
      <div className="flex flex-col items-center gap-4">
        <div
          ref={frontRef}
          className="print-area"
          style={{ width: 440, height: 270, fontFamily: 'Arial, sans-serif' }}
        >
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #e0f0ff, #b3d9ff)', borderRadius: 12, overflow: 'hidden', border: '1px solid #80bfff', position: 'relative' }}>
            {/* Header */}
            <div style={{ background: '#137fec', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>{hospital.hospital_name}</span>
              <span style={{ color: 'white', fontSize: 10 }}>Patient Identity Card</span>
            </div>
            {/* PRN Bar */}
            <div style={{ background: '#0f6dd6', padding: '4px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ color: '#e0f0ff', fontSize: 11, fontWeight: 'bold' }}>{patient.prn}</span>
            </div>
            {/* Body */}
            <div style={{ padding: '12px 16px', display: 'flex', gap: 16 }}>
              {/* Photo */}
              <div style={{ width: 80, height: 96, background: '#cbd5e1', borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {photoUrl ? (
                  <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 28, color: '#94a3b8', fontWeight: 'bold' }}>{patient.first_name[0]}{patient.last_name[0]}</span>
                )}
              </div>
              {/* Info */}
              <div style={{ flex: 1, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontWeight: 'bold', fontSize: 15, color: '#0f3b6e' }}>{patient.full_name || `${patient.title} ${patient.first_name} ${patient.last_name}`}</div>
                <div style={{ color: '#475569' }}>DOB: {format(new Date(patient.date_of_birth), 'dd MMM yyyy')} ({age} yrs)</div>
                <div style={{ color: '#475569' }}>Gender: {patient.gender}</div>
                {patient.blood_group && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#475569' }}>Blood:</span>
                    <span style={{ background: '#ef4444', color: 'white', padding: '1px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold' }}>{patient.blood_group}</span>
                  </div>
                )}
                <div style={{ color: '#475569' }}>Mobile: {patient.country_code} {patient.mobile_number}</div>
              </div>
            </div>
            {/* Footer */}
            {patient.emergency_contact_name && (
              <div style={{ background: '#ebf5ff', borderTop: '1px solid #b3d9ff', padding: '6px 16px', fontSize: 10, color: '#64748b' }}>
                Emergency: {patient.emergency_contact_name} ({patient.emergency_contact_relationship || 'N/A'}) — {patient.emergency_contact_country_code} {patient.emergency_contact_mobile}
              </div>
            )}
          </div>
        </div>

        <div className="text-slate-400 text-sm font-mono">--- ✂ Fold Here ✂ ---</div>

        {/* ID Card - Back */}
        <div
          ref={backRef}
          className="print-area"
          style={{ width: 440, height: 270, fontFamily: 'Arial, sans-serif' }}
        >
          <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ background: '#137fec', padding: '10px 16px' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>{hospital.hospital_name}</span>
            </div>
            {/* Details */}
            <div style={{ padding: 16, flex: 1, fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><strong>Address:</strong> {hospital.hospital_address}</div>
              <div><strong>City/State:</strong> {hospital.hospital_city}, {hospital.hospital_state}</div>
              <div><strong>Country:</strong> {hospital.hospital_country} — {hospital.hospital_pin_code}</div>
              <div><strong>Phone:</strong> {hospital.hospital_phone}</div>
              <div><strong>Email:</strong> {hospital.hospital_email}</div>
              {hospital.hospital_website && <div><strong>Website:</strong> {hospital.hospital_website}</div>}
            </div>
            {/* Footer */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '8px 16px', fontSize: 9, color: '#94a3b8', textAlign: 'center' }}>
              This card is property of {hospital.hospital_name}. If found, please return to the above address.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientIdCard;
