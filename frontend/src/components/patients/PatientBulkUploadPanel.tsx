import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import patientService from '../../services/patientService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { PatientCreateData } from '../../types/patient';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS, RELATIONSHIP_OPTIONS, COUNTRIES,
} from '../../utils/constants';

// Mirrors backend/app/schemas/patient.py's CHILD_TITLES/ADULT_ONLY_TITLES —
// used by the bulk-upload template's lenient title auto-correction below.
const CHILD_TITLES = ['Baby', 'Master'];
const ADULT_ONLY_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'];
const VALID_BLOOD_SUGAR_UNITS = ['mg/dL', 'mmol/L'];

// Column set matches Register.tsx (the canonical single-patient form)
// field-for-field — shared by the template download AND the review table
// below, so the two can never drift apart.
const PATIENT_HEADERS = [
  'title', 'first_name', 'last_name', 'gender', 'date_of_birth', 'blood_group',
  'phone_country_code', 'phone_number', 'email',
  'address_line_1', 'address_line_2', 'city', 'state', 'pin_code', 'country',
  'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_country_code', 'emergency_contact_phone',
  'reason_for_visit', 'symptoms', 'blood_sugar_value', 'blood_sugar_unit',
] as const;

const HEADER_LABELS: Record<string, string> = {
  title: 'Title', first_name: 'First Name', last_name: 'Last Name', gender: 'Gender',
  date_of_birth: 'Date of Birth', blood_group: 'Blood Group',
  phone_country_code: 'Phone Code', phone_number: 'Phone', email: 'Email',
  address_line_1: 'Address 1', address_line_2: 'Address 2', city: 'City', state: 'State',
  pin_code: 'Pin Code', country: 'Country',
  emergency_contact_name: 'Emergency Contact', emergency_contact_relation: 'Emergency Relation',
  emergency_contact_country_code: 'Emergency Code', emergency_contact_phone: 'Emergency Phone',
  reason_for_visit: 'Reason for Visit', symptoms: 'Symptoms',
  blood_sugar_value: 'Blood Sugar', blood_sugar_unit: 'Sugar Unit',
};

// Cells from cellDates:true arrive as Date objects for date-formatted
// columns; everything else arrives as a string. Purely for display in the
// review table — actual coercion/validation happens in parseRow below.
const formatRawCell = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  return text || '—';
};

interface ReviewRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  data: PatientCreateData | null;
  errors: string[];
}

interface UploadResult {
  created: number;
  failed: number;
  failures: string[];
}

// Settings-page home for patient bulk upload (moved out of the Patient
// Directory per product decision — see PatientList.tsx, which no longer has
// its own Bulk Upload/Download Template buttons). Unlike the previous
// behavior (any hard-required-field failure aborted the entire file), every
// row is now validated up front and shown for review — valid and invalid
// rows side by side — and only the rows marked valid are actually created
// once the user confirms.
const PatientBulkUploadPanel: React.FC = () => {
  const { isEyeHospitalFeatureEnabled } = useAuth();
  const toast = useToast();
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  // ── Download Template ─────────────────────────────────────────────────
  // A "Patients" sheet with headers + realistic filled-in example rows, plus
  // a "Field Guide" sheet documenting every dropdown's exact allowed values
  // (pulled from utils/constants.ts — the same source Register.tsx uses, so
  // this can never drift out of sync with the real form).
  const handleDownloadPatientTemplate = () => {
    const patientHeaders: string[] = [...PATIENT_HEADERS];

    const guideRows = [
      {
        field: 'title',
        allowed_values: `${TITLE_OPTIONS.join(', ')}. REQUIRED (matches the single-patient Register form, which also requires it). "Baby"/"Master" are only valid for patients under 5 years old (based on date_of_birth); other titles are only valid for 5+. A child given an adult title is auto-corrected to Baby/Master; an adult given a child-only title is rejected — fix the value.`,
      },
      {
        field: 'gender',
        allowed_values: `${GENDER_OPTIONS.join(', ')} (case-insensitive). Required.`,
      },
      {
        field: 'blood_group',
        allowed_values: `${BLOOD_GROUP_OPTIONS.join(', ')}. REQUIRED (matches the single-patient Register form, which also requires it).`,
      },
      {
        field: 'phone_number',
        allowed_values: 'Exactly 10 digits, no spaces/dashes/symbols. Required. Must be unique within this hospital.',
      },
      {
        field: 'phone_country_code / emergency_contact_country_code',
        allowed_values: `Format +<1-4 digits>. Examples: ${COUNTRIES.slice(0, 6).map((c) => `${c.phoneCode} (${c.name})`).join(', ')}, etc. Defaults to +91 if left blank or invalid.`,
      },
      {
        field: 'date_of_birth',
        allowed_values: 'Format YYYY-MM-DD. REQUIRED (matches the single-patient Register form, which also requires it). Must be a real past date, not more than 150 years ago.',
      },
      {
        field: 'first_name',
        allowed_values: 'Letters only (spaces, apostrophes and hyphens allowed). Required.',
      },
      {
        field: 'last_name',
        allowed_values: 'Optional. If provided, letters only (spaces, apostrophes and hyphens allowed) — a malformed value rejects the row rather than being dropped.',
      },
      {
        field: 'address_line_1',
        allowed_values: 'Optional. If provided, must be at least 5 characters and must contain letters, not just numbers — a malformed value rejects the row rather than being dropped.',
      },
      {
        field: 'email',
        allowed_values: 'Optional. If provided, must be a valid email address (e.g. name@example.com) — a malformed value rejects the row rather than being dropped.',
      },
      {
        field: 'pin_code',
        allowed_values: 'Optional. If provided, must be exactly 6 digits — an invalid value rejects the row rather than being dropped.',
      },
      {
        field: 'emergency_contact_relation',
        allowed_values: `${RELATIONSHIP_OPTIONS.join(', ')}. Optional — an unrecognized value is dropped (left blank), not rejected.`,
      },
      {
        field: 'emergency_contact_phone',
        allowed_values: 'Optional. If provided, must be exactly 10 digits and differ from phone_number — an invalid or matching value rejects the row rather than being dropped.',
      },
      {
        field: 'country',
        allowed_values: 'Free text, defaults to "India" if left blank. Not restricted to a fixed list.',
      },
      {
        field: 'reason_for_visit / symptoms / blood_sugar_value / blood_sugar_unit',
        allowed_values: 'Patient History block — only applied for hospitals with the eye-hospital feature pack enabled; silently ignored for every other hospital. symptoms is a comma-separated list, e.g. "Redness, Watering, Itching". blood_sugar_unit must be mg/dL or mmol/L (defaults to mg/dL when a value is given); blood_sugar_value must be 0–1000.',
      },
      {
        field: 'required_field',
        allowed_values: 'first_name, gender, date_of_birth, blood_group, phone_number and title are mandatory — exactly the same fields the single-patient Register form requires. Every other column, including last_name and address_line_1, is optional. A row missing a required field, or failing any check above, is marked invalid and skipped during upload — it will not block the rest of the file.',
      },
    ];

    const genericExampleRows = [
      {
        title: 'Mr.', first_name: 'Ramesh', last_name: 'Kumar', gender: 'Male',
        date_of_birth: '1985-06-15', blood_group: 'B+',
        phone_country_code: '+91', phone_number: '9876543210', email: 'ramesh.kumar@example.com',
        address_line_1: '12 MG Road', address_line_2: 'Near City Hospital', city: 'Chennai',
        state: 'Tamil Nadu', pin_code: '600001', country: 'India',
        emergency_contact_name: 'Suresh Kumar', emergency_contact_relation: 'Brother',
        emergency_contact_country_code: '+91', emergency_contact_phone: '9876500000',
      },
      {
        // Child example — shows the Master/Baby title convention in use.
        title: 'Master', first_name: 'Aarav', last_name: 'Sharma', gender: 'Male',
        date_of_birth: '2023-03-10', blood_group: 'O+',
        phone_country_code: '+91', phone_number: '9123456780', email: '',
        address_line_1: '45 Lake View Street', address_line_2: '', city: 'Bengaluru',
        state: 'Karnataka', pin_code: '560001', country: 'India',
        emergency_contact_name: 'Priya Sharma', emergency_contact_relation: 'Mother',
        emergency_contact_country_code: '+91', emergency_contact_phone: '9988776655',
      },
    ];
    const eyeExampleRows = isEyeHospitalFeatureEnabled
      ? [
          {
            title: 'Mrs.', first_name: 'Lakshmi', last_name: 'Iyer', gender: 'Female',
            date_of_birth: '1970-11-02', blood_group: 'O+',
            phone_country_code: '+91', phone_number: '9090909090', email: 'lakshmi.iyer@example.com',
            address_line_1: '9 Temple Street', address_line_2: '', city: 'Madurai',
            state: 'Tamil Nadu', pin_code: '625001', country: 'India',
            emergency_contact_name: 'Ravi Iyer', emergency_contact_relation: 'Husband',
            emergency_contact_country_code: '+91', emergency_contact_phone: '9090909091',
            reason_for_visit: 'Blurred vision and eye irritation',
            symptoms: 'Redness, Watering, Distance Vision (Both Eyes)',
            blood_sugar_value: '110', blood_sugar_unit: 'mg/dL',
          },
        ]
      : [];
    const exampleRows = [...genericExampleRows, ...eyeExampleRows].map((row) =>
      patientHeaders.map((h) => (row as Record<string, string>)[h] ?? '')
    );

    const worksheet = XLSX.utils.aoa_to_sheet([patientHeaders, ...exampleRows]);
    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Patients');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Field Guide');
    XLSX.writeFile(workbook, 'patient_bulk_template.xlsx');
  };

  // ── Lenient-coercion helpers ─────────────────────────────────────────────
  const asOptionalText = (value: unknown): string | undefined => {
    const text = String(value ?? '').trim();
    return text || undefined;
  };

  const asOptionalNumber = (value: unknown, bounds?: { min?: number; max?: number }): number | undefined => {
    const text = String(value ?? '').trim();
    if (!text) return undefined;
    const num = Number(text);
    if (!Number.isFinite(num)) return undefined;
    if (bounds?.min != null && num < bounds.min) return undefined;
    if (bounds?.max != null && num > bounds.max) return undefined;
    return num;
  };

  // Excel date-formatted cells arrive as Date objects (cellDates:true below);
  // plain text cells arrive as strings. Normalize both to YYYY-MM-DD.
  const asDateString = (value: unknown): string | undefined => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const text = String(value ?? '').trim();
    if (!text) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
  };

  // Mirrors backend PatientBase.validate_dob: not in the future, not >150
  // years old. An out-of-range or unparseable DOB is dropped (left blank)
  // rather than failing the row — date_of_birth is optional server-side.
  const asValidDob = (value: unknown): string | undefined => {
    const iso = asDateString(value);
    if (!iso) return undefined;
    const dob = new Date(iso);
    const today = new Date();
    if (Number.isNaN(dob.getTime()) || dob > today) return undefined;
    const ageYears = (today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return ageYears <= 150 ? iso : undefined;
  };

  const matchOption = (value: unknown, options: string[]): string | undefined => {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return undefined;
    return options.find((o) => o.toLowerCase() === text);
  };

  const normalizePhoneCode = (value: unknown): string => {
    const text = String(value ?? '').trim();
    return /^\+[0-9]{1,4}$/.test(text) ? text : '+91';
  };

  const normalizePhone10 = (value: unknown): string | undefined => {
    const text = String(value ?? '').trim();
    return /^\d{10}$/.test(text) ? text : undefined;
  };

  // Same age-vs-title cross-check Register.tsx runs live (see its isChild
  // effects) — an out-of-range title is dropped rather than failing the row,
  // since title is optional on the backend.
  const normalizeTitle = (rawTitle: unknown, dob: string | undefined, gender: string | undefined): string | undefined => {
    const matched = matchOption(rawTitle, TITLE_OPTIONS);
    if (!matched || !dob) return matched;
    const ageYears = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const isChild = ageYears < 5;
    if (isChild && ADULT_ONLY_TITLES.includes(matched)) {
      return gender === 'Male' ? 'Master' : 'Baby';
    }
    if (!isChild && CHILD_TITLES.includes(matched)) {
      return undefined;
    }
    return matched;
  };

  // ── Parse + validate every row (no abort-on-first-error) ────────────────
  // Mirrors Register.tsx's validateAll exactly (the canonical single-patient
  // creation form) — NOT just the backend's more permissive schema. Register
  // requires title/date_of_birth/blood_group client-side even
  // though the backend schema itself marks them Optional[str], and it BLOCKS
  // submission (rather than silently coercing) on a malformed email/pin_code/
  // emergency_contact_phone. A bulk-uploaded row must be held to the exact
  // same bar — every check below has a 1:1 comment pointing at the matching
  // line in Register.tsx's validateAll so the two can't quietly drift apart.
  // Every row is classified independently: a failure marks ONLY that row
  // invalid, with every reason collected in `errors` (not just the first) —
  // it no longer blocks the rest of the file.
  const parseRow = (row: Record<string, unknown>, rowNumber: number): ReviewRow => {
    const errors: string[] = [];
    const namePattern = /^[A-Za-z][A-Za-z\s'-]*$/;

    // Register.tsx validateAll: first_name required; last_name optional
    const firstName = String(row.first_name ?? '').trim();
    if (!firstName || !namePattern.test(firstName)) {
      errors.push(`'first_name' is required and must contain letters only.`);
    }
    const lastName = String(row.last_name ?? '').trim();
    if (lastName && !namePattern.test(lastName)) {
      errors.push(`'last_name' must contain letters only.`);
    }

    // Register.tsx validateAll: date_of_birth is required, must be in the past
    const dobRaw = row.date_of_birth;
    const dobProvided = asDateString(dobRaw) !== undefined || String(dobRaw ?? '').trim() !== '';
    const dob = asValidDob(dobRaw);
    if (!dobProvided) {
      errors.push(`'date_of_birth' is required.`);
    } else if (!dob) {
      errors.push(`'date_of_birth' must be a valid past date (not in the future, not more than 150 years ago).`);
    }

    // Register.tsx validateAll: gender is required
    const gender = matchOption(row.gender, GENDER_OPTIONS);
    if (!gender) {
      errors.push(`'gender' is required and must be one of ${GENDER_OPTIONS.join(', ')}.`);
    }

    // Register.tsx validateAll: blood_group is required
    const bloodGroup = matchOption(row.blood_group, BLOOD_GROUP_OPTIONS);
    if (!bloodGroup) {
      errors.push(`'blood_group' is required and must be one of ${BLOOD_GROUP_OPTIONS.join(', ')}.`);
    }

    // Register.tsx validateAll: phone_number required, exactly 10 digits
    const phoneNumber = normalizePhone10(row.phone_number);
    if (!phoneNumber) {
      errors.push(`'phone_number' is required and must be exactly 10 digits.`);
    }

    // Register.tsx validateAll: email format, only checked when provided
    const emailRaw = String(row.email ?? '').trim();
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.push(`'email' is not a valid email address.`);
    }

    // Register.tsx validateAll: address_line_1 optional; when provided, >= 5 chars and must contain a letter
    const addressLine1 = String(row.address_line_1 ?? '').trim();
    if (addressLine1) {
      if (addressLine1.length < 5) {
        errors.push(`'address_line_1' must be at least 5 characters.`);
      } else if (!/[A-Za-z]/.test(addressLine1)) {
        errors.push(`'address_line_1' must contain letters, not just numbers.`);
      }
    }

    // Register.tsx validateAll: pin_code, only checked when provided
    const pinCodeRaw = String(row.pin_code ?? '').trim();
    if (pinCodeRaw && !/^\d{6}$/.test(pinCodeRaw)) {
      errors.push(`'pin_code' must be exactly 6 digits.`);
    }

    // Register.tsx validateAll: emergency_contact_phone, only checked when provided
    const emergencyPhoneRaw = String(row.emergency_contact_phone ?? '').trim();
    if (emergencyPhoneRaw) {
      if (!/^\d{10}$/.test(emergencyPhoneRaw)) {
        errors.push(`'emergency_contact_phone' must be exactly 10 digits.`);
      } else if (phoneNumber && emergencyPhoneRaw === phoneNumber) {
        errors.push(`'emergency_contact_phone' must differ from the patient's phone number.`);
      }
    }

    // Register.tsx validateAll: title is required, plus the title-vs-age cross-check.
    // normalizeTitle auto-corrects a fixable mismatch (child given an adult
    // title) exactly like Register's live auto-correct effect does; the
    // unfixable direction (adult given a child-only title) comes back empty,
    // same as Register's effect clearing the field — which then correctly
    // fails the required check below, exactly as it would block Submit there.
    const rawTitleText = String(row.title ?? '').trim();
    const title = dob ? normalizeTitle(row.title, dob, gender) : matchOption(row.title, TITLE_OPTIONS);
    if (!title) {
      if (!rawTitleText) {
        errors.push(`'title' is required.`);
      } else if (!matchOption(row.title, TITLE_OPTIONS)) {
        errors.push(`'title' must be one of ${TITLE_OPTIONS.join(', ')}.`);
      } else {
        errors.push(`'title' ("${rawTitleText}") doesn't match the patient's age — use Baby/Master for under 5, or Mr./Mrs./Ms./Dr./Prof. for 5+.`);
      }
    }

    if (errors.length > 0) {
      return { rowNumber, raw: row, data: null, errors };
    }

    const emergencyPhone = emergencyPhoneRaw || undefined;
    const emergencyCountryCode = emergencyPhone ? normalizePhoneCode(row.emergency_contact_country_code) : undefined;
    const emergencyRelation = matchOption(row.emergency_contact_relation, RELATIONSHIP_OPTIONS);

    const symptoms = String(row.symptoms ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const bloodSugarValue = asOptionalNumber(row.blood_sugar_value, { min: 0, max: 1000 });
    const bloodSugarUnit = bloodSugarValue != null
      ? (matchOption(row.blood_sugar_unit, VALID_BLOOD_SUGAR_UNITS) || 'mg/dL')
      : undefined;

    const data: PatientCreateData = {
      title,
      first_name: firstName,
      last_name: lastName,
      gender: gender as string,
      date_of_birth: dob,
      blood_group: bloodGroup,
      phone_country_code: normalizePhoneCode(row.phone_country_code),
      phone_number: phoneNumber as string,
      email: emailRaw || undefined,
      address_line_1: addressLine1,
      address_line_2: asOptionalText(row.address_line_2),
      city: asOptionalText(row.city),
      state: asOptionalText(row.state),
      pin_code: pinCodeRaw || undefined,
      country: asOptionalText(row.country) || 'India',
      emergency_contact_name: asOptionalText(row.emergency_contact_name),
      emergency_contact_phone: emergencyPhone,
      emergency_contact_country_code: emergencyCountryCode,
      emergency_contact_relation: emergencyRelation,
      reason_for_visit: asOptionalText(row.reason_for_visit),
      symptoms: symptoms.length ? symptoms : undefined,
      blood_sugar_value: bloodSugarValue,
      blood_sugar_unit: bloodSugarUnit,
    };
    return { rowNumber, raw: row, data, errors: [] };
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) {
        toast.error('Uploaded file is empty');
        return;
      }

      const parsed = rows.map((row, index) => parseRow(row, index + 2)); // +2: row 1 is the header
      setReviewRows(parsed);
    } catch (err) {
      console.error('Patient bulk upload parse error:', err);
      toast.error('Failed to parse file. Please upload a valid CSV or Excel file.');
    } finally {
      setParsing(false);
      event.target.value = '';
    }
  };

  // ── Confirm: upload only the rows that passed validation ────────────────
  const handleConfirmUpload = async () => {
    if (!reviewRows) return;
    const validRows = reviewRows.filter((r) => r.data);
    if (validRows.length === 0) return;

    setUploading(true);
    let created = 0;
    let failed = 0;
    const failures: string[] = [];
    // Sequential, not parallel — mirrors the medicine bulk-upload pattern,
    // and keeps per-row error attribution simple (a row can still fail here
    // even after passing client-side validation, e.g. a phone number that's
    // a duplicate already in the database, or a duplicate within this same
    // file — that only surfaces once the earlier row has actually committed).
    for (const row of validRows) {
      try {
        await patientService.createPatient(row.data as PatientCreateData);
        created += 1;
      } catch (err: unknown) {
        failed += 1;
        const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } } };
        const detail = axiosError.response?.data?.detail;
        const message = Array.isArray(detail)
          ? detail.map((d) => d.msg).join('; ')
          : (typeof detail === 'string' ? detail : 'Unknown error');
        const rowName = [row.raw.first_name, row.raw.last_name].map((v) => String(v ?? '').trim()).filter(Boolean).join(' ') || '(no name)';
        failures.push(`Row ${row.rowNumber} (${rowName}): ${message}`);
      }
    }

    setUploading(false);
    setResult({ created, failed, failures });
    if (created > 0) toast.success(`Created ${created} patient(s)${failed > 0 ? `, ${failed} failed` : ''}`);
    else toast.error('Upload failed for every row. See details below.');
  };

  const closeReview = () => {
    setReviewRows(null);
    setResult(null);
  };

  const validCount = reviewRows?.filter((r) => r.data).length ?? 0;
  const invalidCount = (reviewRows?.length ?? 0) - validCount;

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={handleDownloadPatientTemplate}
        title="Download the patient bulk-upload template"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <span className="material-icons text-lg">download</span>
        Download Template
      </button>
      <label
        title="Upload patient details in bulk — every row is validated and reviewed before anything is created"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer"
      >
        <span className="material-icons text-lg">upload_file</span>
        {parsing ? 'Reading file...' : 'Bulk Upload'}
        <input
          type="file"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          className="hidden"
          onChange={handleFileSelected}
          disabled={parsing}
        />
      </label>

      {reviewRows && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="bulk-review-title">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !uploading && closeReview()} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-[95vw] max-w-[1600px] mx-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 id="bulk-review-title" className="text-lg font-bold text-slate-900">
                  {result ? 'Upload Result' : 'Review Before Upload'}
                </h3>
                {!result && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-semibold text-emerald-600">{validCount} valid</span>
                    {' · '}
                    <span className="font-semibold text-red-600">{invalidCount} invalid</span>
                    {' · '}{reviewRows.length} total rows
                  </p>
                )}
              </div>
              <button onClick={closeReview} disabled={uploading} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {result ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <p className="text-2xl font-bold text-emerald-700">{result.created}</p>
                      <p className="text-[11px] uppercase font-medium text-emerald-600 mt-0.5">Created</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                      <p className="text-[11px] uppercase font-medium text-red-600 mt-0.5">Failed on Upload</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-2xl font-bold text-slate-700">{invalidCount}</p>
                      <p className="text-[11px] uppercase font-medium text-slate-500 mt-0.5">Skipped (Invalid)</p>
                    </div>
                  </div>
                  {result.failures.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1.5">Rows that failed during upload</p>
                      <ul className="text-xs text-red-600 space-y-1 bg-red-50 border border-red-100 rounded-lg p-3">
                        {result.failures.map((msg) => <li key={msg}>{msg}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="text-sm border-separate border-spacing-0 w-max min-w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-left text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                      <th className="py-2 pr-3 sticky left-0 bg-white w-12">Row</th>
                      <th className="py-2 pr-3 sticky left-12 bg-white">Status</th>
                      {PATIENT_HEADERS.map((h) => (
                        <th key={h} className="py-2 pr-3 whitespace-nowrap">{HEADER_LABELS[h] || h}</th>
                      ))}
                      <th className="py-2 pr-3 whitespace-nowrap">Reason (if invalid)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reviewRows.map((row) => (
                      <tr key={row.rowNumber} className={row.data ? '' : 'bg-red-50/40'}>
                        <td className={`py-2 pr-3 text-slate-400 font-mono text-xs sticky left-0 w-12 ${row.data ? 'bg-white' : 'bg-red-50'}`}>{row.rowNumber}</td>
                        <td className={`py-2 pr-3 sticky left-12 ${row.data ? 'bg-white' : 'bg-red-50'}`}>
                          {row.data ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 whitespace-nowrap">
                              <span className="material-symbols-outlined text-xs">check_circle</span> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 whitespace-nowrap">
                              <span className="material-symbols-outlined text-xs">error</span> Invalid
                            </span>
                          )}
                        </td>
                        {PATIENT_HEADERS.map((h) => (
                          <td key={h} className="py-2 pr-3 text-slate-600 whitespace-nowrap">{formatRawCell(row.raw[h])}</td>
                        ))}
                        <td className="py-2 pr-3 text-xs text-red-600 min-w-[220px]">{row.errors.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
              {result ? (
                <button
                  onClick={closeReview}
                  className="px-4 py-2.5 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={closeReview}
                    disabled={uploading}
                    className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmUpload}
                    disabled={uploading || validCount === 0}
                    className="px-4 py-2.5 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90 transition-colors active:scale-[0.98] disabled:opacity-60"
                  >
                    {uploading ? 'Uploading...' : `Confirm & Upload ${validCount} Valid Row${validCount === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientBulkUploadPanel;
