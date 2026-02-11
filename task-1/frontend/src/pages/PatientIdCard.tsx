import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientService } from '../services/patientService';
import { hospitalService } from '../services/hospitalService';
import { Patient } from '../types/patient';
import { Hospital } from '../types/hospital';
import { ArrowLeft, Printer, Mail, AlertCircle, CheckCircle } from 'lucide-react';

export const PatientIdCard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [patientData, hospitalData] = await Promise.all([
          patientService.getPatient(Number(id)),
          hospitalService.getHospital(),
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

  const handlePrint = () => {
    window.print();
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
      await patientService.emailIdCard(Number(id));
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
              onClick={handlePrint}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print / Download
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
        <div className="w-[440px] h-[270px] border-2 border-sky-600 rounded-xl overflow-hidden bg-gradient-to-br from-sky-50 to-blue-50 shadow-lg print:shadow-none">
          {/* Header */}
          <div className="bg-sky-600 text-white px-5 py-2.5 flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">{hospital.hospital_name}</div>
              <div className="text-[10px] opacity-90">Patient Identity Card</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-xs font-mono tracking-wider">{patient.prn}</div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 flex">
            {/* Photo placeholder */}
            <div className="w-20 h-24 bg-indigo-100 border border-indigo-200 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
              <span className="text-4xl text-indigo-400">&#128100;</span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-gray-900 mb-2 truncate">{fullName}</div>
              <table className="text-[11px] text-gray-700 leading-relaxed">
                <tbody>
                  <tr>
                    <td className="pr-2 text-gray-500 align-top">DOB:</td>
                    <td>{dob}{age !== null ? ` (${age} yrs)` : ''}</td>
                  </tr>
                  <tr>
                    <td className="pr-2 text-gray-500 align-top">Gender:</td>
                    <td>{patient.gender}</td>
                  </tr>
                  <tr>
                    <td className="pr-2 text-gray-500 align-top">Blood:</td>
                    <td className="text-red-600 font-bold">{patient.blood_group || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="pr-2 text-gray-500 align-top">Mobile:</td>
                    <td>{patient.country_code} {patient.mobile_number}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Emergency contact footer */}
          {emergencyInfo && (
            <div className="px-5 pb-2 text-[10px] text-gray-500">
              <strong>Emergency:</strong> {emergencyInfo}
            </div>
          )}
        </div>

        {/* Fold line */}
        <div className="text-gray-400 text-xs print:my-2">--- &#9986; Fold Here &#9986; ---</div>

        {/* BACK SIDE */}
        <div className="w-[440px] h-[270px] border-2 border-sky-600 rounded-xl overflow-hidden bg-white shadow-lg print:shadow-none">
          <div className="bg-sky-600 text-white px-5 py-2.5 text-center">
            <div className="font-bold text-sm">{hospital.hospital_name}</div>
          </div>
          <div className="p-5 flex flex-col items-center justify-center h-[calc(100%-44px)]">
            <table className="text-[11px] text-gray-700 leading-loose">
              <tbody>
                <tr>
                  <td className="pr-3 text-gray-500 align-top">Address:</td>
                  <td>{hospital.address_line1}</td>
                </tr>
                {hospital.address_line2 && (
                  <tr>
                    <td></td>
                    <td>{hospital.address_line2}</td>
                  </tr>
                )}
                <tr>
                  <td></td>
                  <td>{hospital.city}, {hospital.state}</td>
                </tr>
                <tr>
                  <td></td>
                  <td>{hospital.country} - {hospital.pin_code}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-gray-500 align-top">Phone:</td>
                  <td>{hospital.primary_phone}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-gray-500 align-top">Email:</td>
                  <td>{hospital.email}</td>
                </tr>
                {hospital.website && (
                  <tr>
                    <td className="pr-3 text-gray-500 align-top">Website:</td>
                    <td>{hospital.website}</td>
                  </tr>
                )}
                {hospital.emergency_hotline && (
                  <tr>
                    <td className="pr-3 text-gray-500 align-top">Emergency:</td>
                    <td className="text-red-600 font-bold">{hospital.emergency_hotline}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <hr className="w-full border-gray-200 my-3" />
            <p className="text-[9px] text-gray-400 text-center leading-relaxed">
              This card is the property of {hospital.hospital_name}.<br />
              If found, please return to the above address.<br />
              {hospital.registration_number && (<>Reg. No: {hospital.registration_number}<br /></>)}
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
