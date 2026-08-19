import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import labService from '../../services/labService';
import { patientService } from '../../services/patientService';
import hospitalService from '../../services/hospitalService';
import type { HospitalDetails } from '../../services/hospitalService';
import HospitalLogo from '../../components/common/HospitalLogo';
import type { Patient } from '../../types/patient';
import type { LabReferral } from '../../types/lab';
import { useToast } from '../../contexts/ToastContext';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';

const emptyForm = {
  recipient_title: 'THE CONSULTANT RADIOLOGIST',
  recipient_location: '',
  case_details: '',
  investigation: '',
  remarks: '',
  referring_doctor_name: '',
};

// Matches the scanned letter's own convention for an unfilled field — a
// dashed blank line — rather than omitting the line or showing an em-dash.
const blank = (value?: string | null, dashes = 40): string =>
  value && value.trim() ? value : '-'.repeat(dashes);

const LabReferralForm: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [hospital, setHospital] = useState<HospitalDetails | null>(null);

  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientDrop, setShowPatientDrop] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [referrals, setReferrals] = useState<LabReferral[]>([]);
  const [printReferral, setPrintReferral] = useState<LabReferral | null>(null);

  useEffect(() => {
    hospitalService.getHospitalDetails().then(setHospital).catch(() => {});
  }, []);

  const searchPatients = useCallback(async (q: string) => {
    try {
      // Empty query still resolves — most-recently-registered patients — so
      // focusing the field alone (before typing anything) already opens a
      // browsable dropdown instead of requiring 2+ characters first.
      const res = await patientService.getPatients(1, 6, q);
      setPatientResults(res.data);
    } catch { setPatientResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPatients(patientSearch), 280);
    return () => clearTimeout(t);
  }, [patientSearch, searchPatients]);

  const loadReferrals = useCallback(async (patientId: string) => {
    try {
      setReferrals(await labService.getPatientReferrals(patientId));
    } catch {
      setReferrals([]);
    }
  }, []);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setPatientSearch('');
    setPatientResults([]);
    setShowPatientDrop(false);
    loadReferrals(p.id);
  };
  const patientNav = useListKeyboardNav(patientResults, selectPatient);

  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const doPrint = () => {
    // Print fires after the DOM has the new referral's content painted.
    requestAnimationFrame(() => window.print());
  };

  const handleGenerate = async () => {
    if (!selectedPatient) { showToast('error', 'Select a patient first'); return; }
    if (!form.recipient_title.trim() || !form.investigation.trim() || !form.referring_doctor_name.trim()) {
      showToast('error', 'Recipient, investigation, and referring doctor are required');
      return;
    }
    setSubmitting(true);
    try {
      const referral = await labService.createReferral({
        patient_id: selectedPatient.id,
        recipient_title: form.recipient_title.trim(),
        recipient_location: form.recipient_location.trim() || undefined,
        case_details: form.case_details.trim() || undefined,
        investigation: form.investigation.trim(),
        remarks: form.remarks.trim() || undefined,
        referring_doctor_name: form.referring_doctor_name.trim(),
      });
      setPrintReferral(referral);
      setReferrals((prev) => [referral, ...prev]);
      showToast('success', 'Referral generated');
      doPrint();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to generate referral');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReprint = (referral: LabReferral) => {
    setPrintReferral(referral);
    doPrint();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Local print override — matches the pattern in LabOrderDetail.tsx /
          DispensingBilling.tsx: the global print stylesheet (index.css) hides
          the whole body by default and only reveals a designated print-area.
          It also hardcodes `@page { size: A4 landscape; margin: 0 }` for the
          ID-card print flow, which otherwise leaks into every print job in
          the app — this letter needs A4 PORTRAIT with real margins, so that
          @page rule is redeclared here (later in the cascade wins). */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 18mm 16mm; }
          html, body { width: auto; height: auto; }
          body * { visibility: hidden !important; }
          #lab-referral-print-area, #lab-referral-print-area * { visibility: visible !important; }
          #lab-referral-print-area {
            position: absolute;
            inset: 0;
            padding: 0;
            width: 100%;
          }
        }
      `}</style>

      <div className="print:hidden flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Concern Form</h1>
          <p className="text-sm text-slate-500 mt-1">
            Refer a patient to an external consultant (e.g. for an investigation this lab doesn't perform in-house).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Patient *</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
              <div className="text-sm">
                <span className="font-semibold text-slate-900">{selectedPatient.first_name} {selectedPatient.last_name}</span>
                <span className="text-slate-400 ml-2">{selectedPatient.patient_reference_number} · {selectedPatient.phone_number}</span>
              </div>
              <button onClick={() => { setSelectedPatient(null); setReferrals([]); }} className="text-slate-400 hover:text-red-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setShowPatientDrop(true); }}
                onFocus={() => setShowPatientDrop(true)}
                onBlur={() => window.setTimeout(() => setShowPatientDrop(false), 150)}
                onKeyDown={patientNav.onKeyDown}
                placeholder="Search, or click to browse recent patients"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {showPatientDrop && patientResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  {!patientSearch.trim() && (
                    <p className="px-4 py-1.5 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
                  )}
                  {patientResults.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectPatient(p)}
                      onMouseEnter={() => patientNav.setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 text-sm ${idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'}`}
                    >
                      {p.first_name} {p.last_name}
                      <span className="ml-2 text-slate-400 text-xs">{p.patient_reference_number} · {p.phone_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">To *</label>
            <input value={form.recipient_title} onChange={(e) => setField('recipient_title', e.target.value)}
              placeholder="THE CONSULTANT RADIOLOGIST"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <input value={form.recipient_location} onChange={(e) => setField('recipient_location', e.target.value)}
              placeholder="e.g. GOBI - 638 452"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">A Case Of</label>
          <input value={form.case_details} onChange={(e) => setField('case_details', e.target.value)}
            placeholder="Brief clinical case description"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">For (Investigation) *</label>
          <input value={form.investigation} onChange={(e) => setField('investigation', e.target.value)}
            placeholder="e.g. CT NECK/THYROID"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
          <input value={form.remarks} onChange={(e) => setField('remarks', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Referring Doctor *</label>
          <input value={form.referring_doctor_name} onChange={(e) => setField('referring_doctor_name', e.target.value)}
            placeholder="e.g. Dr. S. Saravanakumar"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <button onClick={handleGenerate} disabled={submitting}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">print</span>
          {submitting ? 'Generating...' : 'Generate & Print'}
        </button>
      </div>

      {/* Past referrals for this patient */}
      {selectedPatient && referrals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Past Referrals</h2>
          <div className="divide-y divide-slate-100">
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-mono text-slate-500 mr-2">{r.referral_number}</span>
                  <span className="text-slate-800">{r.investigation}</span>
                  <span className="text-slate-400 ml-2">to {r.recipient_title}</span>
                  <span className="text-slate-400 ml-2">
                    {(() => { try { return format(new Date(r.created_at), 'dd MMM yyyy'); } catch { return ''; } })()}
                  </span>
                </div>
                <button onClick={() => handleReprint(r)} className="text-primary font-semibold hover:underline">
                  Reprint
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printable referral letter — reproduces the customer's own referral
          letterhead layout/wording verbatim (see lab_template/consuren_form.jpeg);
          only the blank lines (patient, case, remarks, doctor) are filled in
          from the form. Hospital name/logo comes from real hospital settings
          instead of being hardcoded, since this app is multi-tenant — every
          other line, its wording, indentation, and ordering matches the scan. */}
      {printReferral && (
        <div id="lab-referral-print-area" className="hidden print:block bg-white">
          {/* @page already reserves the page margin (18mm/16mm) above — this
              wrapper just needs to fill the printable width, not add another
              layer of padding on top of it. */}
          <div className="w-full font-sans text-[15px] leading-8 text-black">
            <div className="mb-10 flex items-center gap-2">
              {hospital?.logo_url && (
                <HospitalLogo logoUrl={hospital.logo_url} name={hospital.name} className="w-10 h-10 rounded-lg shrink-0" />
              )}
              <span className="text-lg font-semibold">{hospital?.name || ''}</span>
            </div>

            <p className="font-bold">TO</p>
            <p className="font-bold ml-10">{printReferral.recipient_title}</p>
            <p className="font-bold ml-10">{blank(printReferral.recipient_location)}</p>

            <p className="font-bold mt-8">RESPECTED SIR,</p>
            <p className="font-bold ml-10">GREETINGS WITH PRAYERS!</p>

            <p className="font-bold mt-8 ml-10">
              HERE BY REFERRING MR/MRS. <span className="font-normal">{blank(printReferral.patient_name)}</span>
            </p>

            <p className="font-bold mt-8">
              A CASE OF <span className="font-normal">{blank(printReferral.case_details)}</span>
              {'  '}FOR {printReferral.investigation}
            </p>

            <p className="font-bold mt-8">
              REMARKS : <span className="font-normal">{blank(printReferral.remarks)}</span>
            </p>

            <p className="font-bold mt-10 ml-16">THANKING YOU,</p>

            <div className="flex justify-end mt-16">
              <div className="text-left">
                <p className="font-bold">WITH PRAYERS,</p>
                <p className="font-bold mt-10 uppercase">{printReferral.referring_doctor_name}</p>
              </div>
            </div>

            <div className="mt-10 flex justify-between text-[10px] text-slate-400">
              <span>{printReferral.referral_number}</span>
              <span>{(() => { try { return format(new Date(printReferral.created_at), 'dd MMM yyyy'); } catch { return ''; } })()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabReferralForm;
