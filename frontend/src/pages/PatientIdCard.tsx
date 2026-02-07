import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientService } from '../services/patientService';
import { Patient } from '../types/patient';
import api from '../services/api';
import { ArrowLeft, Printer, Download, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';

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

export const PatientIdCard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [hospital, setHospital] = useState<HospitalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [patientData, hospitalData] = await Promise.all([
          patientService.getPatient(Number(id)),
          api.get<HospitalConfig>('/config/hospital').then((r) => r.data),
        ]);
        setPatient(patientData);
        setHospital(hospitalData);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchData();
  }, [id]);

  const handlePrint = async () => {
    setPdfGenerating(true);
    setError('');
    try {
      const blob = await generatePdfBlob();
      if (!blob) throw new Error('PDF generation returned null');
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      }
    } catch (err) {
      console.error('Print failed:', err);
      setError('Failed to generate printable PDF.');
    } finally {
      setPdfGenerating(false);
    }
  };

  /** Shared helper: render both card sides to a jsPDF instance and return the blob */
  const generatePdfBlob = async (): Promise<Blob | null> => {
    if (!frontRef.current || !backRef.current) return null;

    const scale = 3;
    const canvasOptions = {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    };

    const [frontCanvas, backCanvas] = await Promise.all([
      html2canvas(frontRef.current, canvasOptions),
      html2canvas(backRef.current, canvasOptions),
    ]);

    const cardWidthMM = 86;
    const cardHeightMM = 54;
    const marginMM = 10;
    const pageW = cardWidthMM + marginMM * 2;
    const pageH = (cardHeightMM + marginMM) * 2 + marginMM + 8;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pageW, pageH],
    });

    const frontImgData = frontCanvas.toDataURL('image/png');
    pdf.addImage(frontImgData, 'PNG', marginMM, marginMM, cardWidthMM, cardHeightMM);

    const foldY = marginMM + cardHeightMM + 4;
    pdf.setFontSize(7);
    pdf.setTextColor(160, 160, 160);
    pdf.text('- - - - - - - - - -  \u2702  Fold Here  \u2702  - - - - - - - - - -', pageW / 2, foldY, { align: 'center' });

    const backImgData = backCanvas.toDataURL('image/png');
    pdf.addImage(backImgData, 'PNG', marginMM, foldY + 4, cardWidthMM, cardHeightMM);

    return pdf.output('blob');
  };

  const handleDownloadPDF = async () => {
    if (!frontRef.current || !backRef.current || !patient) return;
    setPdfGenerating(true);
    setError('');
    try {
      const blob = await generatePdfBlob();
      if (!blob) throw new Error('PDF generation returned null');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ID-Card-${patient.prn || patient.first_name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError('Failed to generate PDF. Please try the Print option instead.');
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleEmail = async () => {
    if (!patient?.email) {
      setError('Patient does not have an email address');
      return;
    }
    setEmailSending(true);
    setError('');
    setEmailSuccess('');
    try {
      // Generate the same high-quality PDF used for download
      const pdfBlob = await generatePdfBlob();
      await patientService.emailIdCard(Number(id), pdfBlob ?? undefined);
      setEmailSuccess(`ID card sent to ${patient.email}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send email. SMTP may not be configured.');
    } finally {
      setEmailSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error && !patient) {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center text-primary-600 hover:text-primary-700 mb-6">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (!patient || !hospital) return null;

  const fullName = `${patient.title} ${patient.first_name} ${patient.last_name}`;
  const dob = patient.date_of_birth
    ? new Date(patient.date_of_birth).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'N/A';
  const age = patient.date_of_birth
    ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const emergencyInfo = patient.emergency_contact_name
    ? `${patient.emergency_contact_name}${patient.emergency_contact_relationship ? ` (${patient.emergency_contact_relationship})` : ''}${patient.emergency_contact_mobile ? ` | ${patient.emergency_contact_country_code || ''} ${patient.emergency_contact_mobile}` : ''}`
    : '';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Screen-only controls */}
      <div className="print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center text-primary-600 hover:text-primary-700 mb-6">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Patient ID Card</h1>
          <div className="flex space-x-3">
            <button
              onClick={handleDownloadPDF}
              disabled={pdfGenerating}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              {pdfGenerating ? 'Generating...' : 'Download PDF'}
            </button>
            <button
              onClick={handlePrint}
              disabled={pdfGenerating}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              <Printer className="w-4 h-4 mr-2" />
              {pdfGenerating ? 'Preparing...' : 'Print'}
            </button>
            <button
              onClick={handleEmail}
              disabled={emailSending || !patient.email}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Mail className="w-4 h-4 mr-2" />
              {emailSending ? 'Sending...' : 'Email to Patient'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 mr-2" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {emailSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 mr-2" />
            <p className="text-sm text-green-800">{emailSuccess}</p>
          </div>
        )}

        {!patient.email && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Patient does not have an email address. Email option is disabled.
          </div>
        )}
      </div>

      {/* ID Card - Printable area */}
      <div className="flex flex-col items-center space-y-4 print:space-y-6">
        {/* FRONT SIDE */}
        <div
          ref={frontRef}
          style={{
            width: '440px',
            height: '270px',
            border: '2px solid #0284c7',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: '#0284c7',
              color: 'white',
              padding: '10px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{hospital.hospital_name}</div>
              <div style={{ fontSize: '10px', opacity: 0.9 }}>Patient Identity Card</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '12px', fontFamily: 'monospace', letterSpacing: '1px' }}>
                {patient.prn}
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '14px 20px', display: 'flex' }}>
            {/* Photo */}
            <div
              style={{
                width: '80px',
                height: '96px',
                background: patient.photo_url ? 'transparent' : '#e0e7ff',
                border: '1px solid #c7d2fe',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {patient.photo_url ? (
                <img
                  src={`${API_BASE}${patient.photo_url}`}
                  alt={fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <span style={{ fontSize: '40px', color: '#6366f1' }}>&#128100;</span>
              )}
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
                {fullName}
              </div>
              <table style={{ fontSize: '11px', color: '#374151', lineHeight: '1.8', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ paddingRight: '8px', color: '#6b7280', verticalAlign: 'top' }}>DOB:</td>
                    <td>{dob}{age !== null ? ` (${age} yrs)` : ''}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: '8px', color: '#6b7280', verticalAlign: 'top' }}>Gender:</td>
                    <td>{patient.gender}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: '8px', color: '#6b7280', verticalAlign: 'top' }}>Blood:</td>
                    <td style={{ color: '#dc2626', fontWeight: 'bold' }}>{patient.blood_group || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: '8px', color: '#6b7280', verticalAlign: 'top' }}>Mobile:</td>
                    <td>{patient.country_code} {patient.mobile_number}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Emergency contact footer */}
          {emergencyInfo && (
            <div style={{ padding: '0 20px 10px', fontSize: '10px', color: '#6b7280' }}>
              <strong>Emergency:</strong> {emergencyInfo}
            </div>
          )}
        </div>

        {/* Fold line */}
        <div className="text-gray-400 text-xs print:my-2">--- &#9986; Fold Here &#9986; ---</div>

        {/* BACK SIDE */}
        <div
          ref={backRef}
          style={{
            width: '440px',
            height: '270px',
            border: '2px solid #0284c7',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#ffffff',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          <div
            style={{
              background: '#0284c7',
              color: 'white',
              padding: '10px 20px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{hospital.hospital_name}</div>
          </div>
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 'calc(100% - 44px)',
            }}
          >
            <table style={{ fontSize: '11px', color: '#374151', lineHeight: '2', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: '12px', color: '#6b7280', verticalAlign: 'top' }}>Address:</td>
                  <td>{hospital.hospital_address}</td>
                </tr>
                <tr>
                  <td></td>
                  <td>{hospital.hospital_city}, {hospital.hospital_state}</td>
                </tr>
                <tr>
                  <td></td>
                  <td>{hospital.hospital_country} - {hospital.hospital_pin_code}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: '12px', color: '#6b7280', verticalAlign: 'top' }}>Phone:</td>
                  <td>{hospital.hospital_phone}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: '12px', color: '#6b7280', verticalAlign: 'top' }}>Email:</td>
                  <td>{hospital.hospital_email}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: '12px', color: '#6b7280', verticalAlign: 'top' }}>Website:</td>
                  <td>{hospital.hospital_website}</td>
                </tr>
              </tbody>
            </table>
            <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
            <p style={{ fontSize: '9px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.6', margin: 0 }}>
              This card is the property of {hospital.hospital_name}.<br />
              If found, please return to the above address.<br />
              This is a system-generated ID card.
            </p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:hidden { display: none !important; }
          [class*="print:"] { break-inside: avoid; }
          .flex.flex-col.items-center,
          .flex.flex-col.items-center * { visibility: visible; }
          .flex.flex-col.items-center { position: absolute; left: 50%; top: 0; transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
