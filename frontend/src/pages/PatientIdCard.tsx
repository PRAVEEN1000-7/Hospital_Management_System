import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, differenceInYears } from 'date-fns';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import patientService from '../services/patientService';
import hospitalService from '../services/hospitalService';
import type { HospitalDetails } from '../services/hospitalService';
import type { Patient } from '../types/patient';
import { useToast } from '../contexts/ToastContext';

/* ── 12-Digit ID Parser (mirrors backend logic) ────────────────────────── */
const GENDER_DECODE: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other', N: 'Not Disclosed', U: 'Unknown' };
const MONTH_DECODE: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, A: 10, B: 11, C: 12 };

function parsePatientId(pid: string) {
  if (!pid || pid.length !== 12) return null;
  return {
    hospitalCode: pid.slice(0, 2),
    genderCode: pid[2],
    gender: GENDER_DECODE[pid[2]] || 'Unknown',
    year: 2000 + parseInt(pid.slice(3, 5), 10),
    monthCode: pid[5],
    month: MONTH_DECODE[pid[5]] || 0,
    checksum: pid[6],
    sequence: parseInt(pid.slice(7), 10),
    formatted: `${pid.slice(0, 2)}-${pid[2]}-${pid.slice(3, 5)}-${pid[5]}-${pid[6]}-${pid.slice(7)}`,
  };
}

const PatientIdCard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [hospital, setHospital] = useState<HospitalDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [patientData, hospitalData] = await Promise.all([
          patientService.getPatient(id!),
          hospitalService.getHospitalDetails(),
        ]);
        setPatient(patientData);
        setHospital(hospitalData);
      } catch {
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, toast]);

  const generatePDF = async (): Promise<jsPDF | null> => {
    if (!frontRef.current || !backRef.current) return null;
    const canvasOpts = { scale: 4, useCORS: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 0 };
    const frontCanvas = await html2canvas(frontRef.current, canvasOpts);
    const backCanvas = await html2canvas(backRef.current, canvasOpts);
    const frontImg = frontCanvas.toDataURL('image/png');
    const backImg = backCanvas.toDataURL('image/png');

    // Card layout: 90×58mm cards (slightly larger for readable text), 5mm margin, 9mm fold gap
    const cardW = 90;
    const frontAspect = frontCanvas.height / frontCanvas.width;
    const backAspect = backCanvas.height / backCanvas.width;
    const frontH = cardW * frontAspect;
    const backH = cardW * backAspect;
    const margin = 5, foldGap = 9;
    const pageW = cardW + margin * 2;
    const pageH = margin + frontH + foldGap + backH + margin;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, pageH] });

    // Explicit white background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');

    // Front card — preserves aspect ratio
    pdf.addImage(frontImg, 'PNG', margin, margin, cardW, frontH);

    // Fold line
    const foldY = margin + frontH + foldGap / 2;
    pdf.setFontSize(8);
    pdf.setTextColor(170, 170, 170);
    pdf.text('- - - - - - - - - -  Fold Here  - - - - - - - - - -', pageW / 2, foldY, { align: 'center' });

    // Back card — preserves aspect ratio
    const backY = margin + frontH + foldGap;
    pdf.addImage(backImg, 'PNG', margin, backY, cardW, backH);

    return pdf;
  };

  const handleDownload = async () => {
    const pdf = await generatePDF();
    if (pdf && patient) pdf.save(`ID-Card-${patient.patient_reference_number}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = async () => {
    if (!patient?.email) return;
    setSending(true);
    try {
      const pdf = await generatePDF();
      if (pdf) {
        const blob = pdf.output('blob');
        await patientService.emailIdCard(patient.id, blob);
        toast.success(`ID card sent to ${patient.email}`);
      }
    } catch {
      toast.error('Failed to send email');
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
        <p>Data not found</p>
      </div>
    );
  }

  const age = differenceInYears(new Date(), new Date(patient.date_of_birth));
  const photoUrl = patientService.getPhotoUrl(patient.photo_url);
  const parsed = parsePatientId(patient.patient_reference_number);

  // QR data: compact patient identification string
  const qrData = JSON.stringify({
    id: patient.patient_reference_number,
    name: `${patient.first_name} ${patient.last_name}`,
    dob: patient.date_of_birth,
    gender: patient.gender,
    blood: patient.blood_group || '-',
    mobile: `${patient.phone_country_code}${patient.phone_number}`,
  });

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/patients/${id}`)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <span className="material-icons">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-slate-900">Patient PRN Card</h1>
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

      {/* ID Breakdown Info */}
      {parsed && (
        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <p className="text-xs font-semibold text-blue-800 mb-2">12-Digit PRN Breakdown</p>
          <div className="flex flex-wrap items-center gap-1 font-mono text-sm">
            <span className="px-2 py-1 bg-blue-600 text-white rounded" title="Hospital Code">{parsed.hospitalCode}</span>
            <span className="px-2 py-1 bg-purple-600 text-white rounded" title="Gender">{parsed.genderCode}</span>
            <span className="px-2 py-1 bg-emerald-600 text-white rounded" title="Year">{String(parsed.year).slice(2)}</span>
            <span className="px-2 py-1 bg-amber-600 text-white rounded" title="Month">{parsed.monthCode}</span>
            <span className="px-2 py-1 bg-red-600 text-white rounded" title="Checksum">{parsed.checksum}</span>
            <span className="px-2 py-1 bg-slate-700 text-white rounded" title="Sequence">{String(parsed.sequence).padStart(5, '0')}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-blue-700">
            <span><strong className="text-blue-600">Hospital:</strong> {parsed.hospitalCode}</span>
            <span><strong className="text-purple-600">Gender:</strong> {parsed.gender}</span>
            <span><strong className="text-emerald-600">Year:</strong> {parsed.year}</span>
            <span><strong className="text-amber-600">Month:</strong> {new Date(parsed.year, parsed.month - 1).toLocaleString('default', { month: 'long' })}</span>
            <span><strong className="text-red-600">Check:</strong> {parsed.checksum}</span>
            <span><strong className="text-slate-600">Seq:</strong> {parsed.sequence}</span>
          </div>
        </div>
      )}

      {/* ID Card - Front */}
      <div className="flex flex-col items-center gap-4 print:block">
        <div
          ref={frontRef}
          className="print-area"
          style={{ width: 460, minHeight: 290, fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #e8f4ff 0%, #c4dfff 100%)', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #7ab8ff', position: 'relative', boxSizing: 'border-box' }}>
            {/* Hospital Header */}
            <div style={{ background: 'linear-gradient(90deg, #0d6efd, #137fec)', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15, letterSpacing: 0.3 }}>{hospital.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Patient ID Card</span>
            </div>

            {/* PRN Bar */}
            <div style={{ background: '#0b5ed7', padding: '5px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#a3cdff', fontSize: 9, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>PRN</span>
              <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 'bold', letterSpacing: 2.5, fontFamily: 'Consolas, monospace' }}>{patient.patient_reference_number}</span>
            </div>

            {/* Body: Photo + Info + QR */}
            <div style={{ padding: '12px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {/* Photo */}
              <div style={{ width: 80, height: 94, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #93c5fd', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {photoUrl ? (
                  <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 28, color: '#94a3b8', fontWeight: 'bold' }}>
                    {patient.first_name[0]}{patient.last_name[0]}
                  </span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', fontSize: `${patient.first_name.length + patient.last_name.length > 24 ? 13 : 15}px`, color: '#0f3b6e', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {patient.first_name} {patient.last_name}
                </div>
                <div style={{ color: '#475569', fontSize: 11 }}>
                  DOB: {format(new Date(patient.date_of_birth), 'dd MMM yyyy')} ({age} yrs)
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ color: '#475569', fontSize: 11 }}>Gender: {patient.gender}</span>
                  {patient.blood_group && (
                    <span style={{ color: '#475569', fontSize: 11 }}>Blood: <strong style={{ color: '#0f3b6e' }}>{patient.blood_group}</strong></span>
                  )}
                </div>
                <div style={{ color: '#475569', fontSize: 11 }}>
                  Mobile: {patient.phone_country_code} {patient.phone_number}
                </div>
              </div>

              {/* QR Code */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ background: 'white', padding: 5, borderRadius: 8, border: '1px solid #93c5fd', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                  <QRCodeSVG value={qrData} size={74} level="M" />
                </div>
                <span style={{ fontSize: 7, color: '#64748b', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5 }}>SCAN TO VERIFY</span>
              </div>
            </div>

            {/* Emergency Contact Footer */}
            {patient.emergency_contact_name && (
              <div style={{ background: 'rgba(255,255,255,0.5)', borderTop: '1px solid #b3d9ff', padding: '5px 18px', fontSize: 10, color: '#475569' }}>
                <strong style={{ color: '#334155' }}>Emergency:</strong> {patient.emergency_contact_name} ({patient.emergency_contact_relation || 'N/A'}) — {patient.emergency_contact_phone}
              </div>
            )}

            {/* Registration date footer */}
            <div style={{ padding: '4px 18px 6px', fontSize: 8, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(147,197,253,0.4)' }}>
              <span>Registered: {format(new Date(patient.created_at), 'dd MMM yyyy')}</span>
              <span>Valid: Until Discharge</span>
            </div>
          </div>
        </div>

        <div className="text-slate-400 text-sm font-mono print-fold-line">--- ✂ Fold Here ✂ ---</div>

        {/* ID Card - Back */}
        <div
          ref={backRef}
          className="print-area"
          style={{ width: 460, minHeight: 290, fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(90deg, #0d6efd, #137fec)', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15, letterSpacing: 0.3 }}>{hospital.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Hospital Info</span>
            </div>

            {/* Details */}
            <div style={{ padding: '14px 18px', flex: 1, fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ lineHeight: 1.4 }}><strong style={{ color: '#334155' }}>Address:</strong> {hospital.address_line_1}{hospital.address_line_2 ? `, ${hospital.address_line_2}` : ''}</div>
              <div><strong style={{ color: '#334155' }}>City/State:</strong> {hospital.city}, {hospital.state_province}</div>
              <div><strong style={{ color: '#334155' }}>Country:</strong> {hospital.country} — {hospital.postal_code}</div>
              <div><strong style={{ color: '#334155' }}>Phone:</strong> {hospital.phone}</div>
              <div><strong style={{ color: '#334155' }}>Email:</strong> {hospital.email}</div>
              {hospital.website && <div><strong style={{ color: '#334155' }}>Website:</strong> {hospital.website}</div>}
            </div>

            {/* ID Format Reference */}
            <div style={{ padding: '8px 18px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', fontSize: 9, color: '#64748b' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>PRN Format: HH-G-YY-M-C-SSSSS</div>
              <div>HH: Hospital &bull; G: Gender &bull; YY: Year &bull; M: Month &bull; C: Check &bull; SSSSS: Sequence</div>
            </div>

            {/* Footer */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '8px 18px', fontSize: 9, color: '#94a3b8', textAlign: 'center' }}>
              This card is property of {hospital.name}. If found, please return to the above address.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientIdCard;
