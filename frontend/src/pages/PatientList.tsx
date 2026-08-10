import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import patientService from '../services/patientService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Patient, PatientCreateData } from '../types/patient';
import { format } from 'date-fns';
import VerifiedBadge from '../components/patients/VerifiedBadge';
import { canEdit } from '../config/modulePermissions';
import {
  TITLE_OPTIONS, GENDER_OPTIONS, BLOOD_GROUP_OPTIONS, RELATIONSHIP_OPTIONS, COUNTRIES,
} from '../utils/constants';

// Mirrors backend/app/schemas/patient.py's CHILD_TITLES/ADULT_ONLY_TITLES —
// used by the bulk-upload template's lenient title auto-correction below.
const CHILD_TITLES = ['Baby', 'Master'];
const ADULT_ONLY_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'];
const VALID_BLOOD_SUGAR_UNITS = ['mg/dL', 'mmol/L'];

const PatientList: React.FC = () => {
  const navigate = useNavigate();
  const { user, isEyeHospitalFeatureEnabled } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [genderFilter, setGenderFilter] = useState('');
  const [bloodGroupFilter, setBloodGroupFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const limit = 10;
  const searchTimeoutRef = useRef<number | null>(null);
  const canRegister = canEdit('general.patients', user?.roles);
  const canDelete = canEdit('general.patients', user?.roles);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await patientService.getPatients(
        page, limit, search,
        { gender: genderFilter, blood_group: bloodGroupFilter, city: cityFilter, status: statusFilter },
        sortBy,
        sortOrder,
      );
      setPatients(response.data);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      // Silent fail - patients list will remain empty
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortOrder, genderFilter, bloodGroupFilter, cityFilter, statusFilter]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Dynamic search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
      // Sync URL params
      if (searchInput) {
        setSearchParams({ search: searchInput }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 500);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, setSearchParams]);

  // Sync from URL when navigating from header search
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    if (urlSearch !== searchInput) {
      setSearchInput(urlSearch);
      setSearch(urlSearch);
      setPage(1);
    }
  }, [searchParams]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    try {
      await patientService.deletePatient(deleteConfirm.id);
      fetchPatients();
    } catch (err) {
      // Silent fail - deletion error will not show
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const getInitials = (p: Patient) => {
    return `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
  };

  // ── Bulk upload: Download Template ──────────────────────────────────────
  // Mirrors pages/pharmacy/MedicineList.tsx's handleDownloadMedicineTemplate
  // exactly: a "Patients" sheet with headers + realistic filled-in example
  // rows, plus a separate "Field Guide" sheet documenting every dropdown's
  // exact allowed values (pulled from utils/constants.ts — the same source
  // Register.tsx uses — so this can never drift out of sync with the real
  // form) and any conditional-requirement rules.
  const handleDownloadPatientTemplate = () => {
    // Column set matches Register.tsx (the canonical single-patient form)
    // field-for-field: Personal Details, Contact Details, Address, Emergency
    // Contact, plus the eye-hospital-only Patient History block. marital_status
    // and age_years/age_months exist on the backend schema but are not
    // collected anywhere in the UI (not even Register.tsx), so they're left
    // out of the template rather than inventing an input no other screen has.
    const patientHeaders = [
      'title', 'first_name', 'last_name', 'gender', 'date_of_birth', 'blood_group',
      'phone_country_code', 'phone_number', 'email',
      'address_line_1', 'address_line_2', 'city', 'state', 'pin_code', 'country',
      'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_country_code', 'emergency_contact_phone',
      'reason_for_visit', 'symptoms', 'blood_sugar_value', 'blood_sugar_unit',
    ];

    const guideRows = [
      {
        field: 'title',
        allowed_values: `${TITLE_OPTIONS.join(', ')}. Optional. "Baby"/"Master" are only valid for patients under 5 years old (based on date_of_birth); other titles are only valid for 5+. A title that doesn't match the patient's age is dropped (left blank) rather than rejecting the whole row.`,
      },
      {
        field: 'gender',
        allowed_values: `${GENDER_OPTIONS.join(', ')} (case-insensitive). Required.`,
      },
      {
        field: 'blood_group',
        allowed_values: `${BLOOD_GROUP_OPTIONS.join(', ')}. Optional — an unrecognized value is dropped (left blank), not rejected.`,
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
        allowed_values: 'Format YYYY-MM-DD. Optional but recommended (used to auto-check the title field). Must be a real past date — invalid or future dates are dropped (left blank), not rejected.',
      },
      {
        field: 'first_name / last_name',
        allowed_values: 'Letters only (spaces, apostrophes and hyphens allowed). last_name must be at least 3 characters. Both required.',
      },
      {
        field: 'pin_code',
        allowed_values: 'Exactly 6 digits if provided. Optional — an invalid value is dropped (left blank), not rejected.',
      },
      {
        field: 'emergency_contact_relation',
        allowed_values: `${RELATIONSHIP_OPTIONS.join(', ')}. Optional — an unrecognized value is dropped (left blank), not rejected.`,
      },
      {
        field: 'emergency_contact_phone',
        allowed_values: 'Exactly 10 digits if provided, and must differ from phone_number. Optional — an invalid or matching value is dropped (left blank), not rejected.',
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
        allowed_values: 'first_name, last_name, gender and phone_number are mandatory; every other column is optional.',
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
        date_of_birth: '2023-03-10', blood_group: '',
        phone_country_code: '+91', phone_number: '9123456780', email: '',
        address_line_1: '45 Lake View Street', address_line_2: '', city: 'Bengaluru',
        state: 'Karnataka', pin_code: '560001', country: 'India',
        emergency_contact_name: 'Priya Sharma', emergency_contact_relation: 'Mother',
        emergency_contact_country_code: '+91', emergency_contact_phone: '9988776655',
      },
    ];
    // Eye hospitals get one additional example showing the Patient History
    // block filled in — mirrors MedicineList's eye-hospital-only example rows.
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

  // ── Bulk upload: shared lenient-coercion helpers ────────────────────────
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

  const normalizePinCode = (value: unknown): string | undefined => {
    const text = String(value ?? '').trim();
    return /^\d{6}$/.test(text) ? text : undefined;
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

  // ── Bulk upload: Bulk Upload ─────────────────────────────────────────────
  const handleBulkPatientUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) {
        toast.error('Uploaded file is empty');
        return;
      }

      const rowErrors: string[] = [];
      const namePattern = /^[A-Za-z][A-Za-z\s'-]*$/;

      // Hard-required fields (first_name, last_name, gender, phone_number) get
      // a per-row error and abort the WHOLE upload if any row fails — same
      // two-tier design as MedicineList's bulk upload (see its comment above
      // `for (const row of parsedRows)`): a template-shaped mistake is caught
      // up front before anything is created, while everything else below is
      // coerced leniently so one odd cell never blocks the import.
      const parsedRows = rows
        .map((row, index): PatientCreateData | null => {
          const rowNumber = index + 2; // +2 because row 1 is the header

          const firstName = String(row.first_name ?? '').trim();
          if (!firstName || !namePattern.test(firstName)) {
            rowErrors.push(`Row ${rowNumber}: 'first_name' is required and must contain letters only.`);
            return null;
          }
          const lastName = String(row.last_name ?? '').trim();
          if (!lastName || lastName.length < 3 || !namePattern.test(lastName)) {
            rowErrors.push(`Row ${rowNumber}: 'last_name' is required, letters only, and at least 3 characters.`);
            return null;
          }
          const gender = matchOption(row.gender, GENDER_OPTIONS);
          if (!gender) {
            rowErrors.push(`Row ${rowNumber}: 'gender' is required and must be one of ${GENDER_OPTIONS.join(', ')}.`);
            return null;
          }
          const phoneNumber = normalizePhone10(row.phone_number);
          if (!phoneNumber) {
            rowErrors.push(`Row ${rowNumber}: 'phone_number' is required and must be exactly 10 digits.`);
            return null;
          }

          const dob = asValidDob(row.date_of_birth);
          const title = normalizeTitle(row.title, dob, gender);
          const bloodGroup = matchOption(row.blood_group, BLOOD_GROUP_OPTIONS);
          const emergencyRelation = matchOption(row.emergency_contact_relation, RELATIONSHIP_OPTIONS);

          let emergencyPhone = normalizePhone10(row.emergency_contact_phone);
          if (emergencyPhone === phoneNumber) emergencyPhone = undefined; // must differ per backend rule
          const emergencyCountryCode = emergencyPhone ? normalizePhoneCode(row.emergency_contact_country_code) : undefined;

          const symptoms = String(row.symptoms ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

          const bloodSugarValue = asOptionalNumber(row.blood_sugar_value, { min: 0, max: 1000 });
          const bloodSugarUnit = bloodSugarValue != null
            ? (matchOption(row.blood_sugar_unit, VALID_BLOOD_SUGAR_UNITS) || 'mg/dL')
            : undefined;

          const patient: PatientCreateData = {
            title,
            first_name: firstName,
            last_name: lastName,
            gender,
            date_of_birth: dob,
            blood_group: bloodGroup,
            phone_country_code: normalizePhoneCode(row.phone_country_code),
            phone_number: phoneNumber,
            email: asOptionalText(row.email),
            address_line_1: asOptionalText(row.address_line_1),
            address_line_2: asOptionalText(row.address_line_2),
            city: asOptionalText(row.city),
            state: asOptionalText(row.state),
            pin_code: normalizePinCode(row.pin_code),
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
          return patient;
        })
        .filter((item): item is PatientCreateData => Boolean(item));

      if (rowErrors.length > 0) {
        const preview = rowErrors.slice(0, 5).join(' ');
        const suffix = rowErrors.length > 5 ? ` (+${rowErrors.length - 5} more)` : '';
        toast.error(`Template validation failed. ${preview}${suffix}`);
        return;
      }

      if (parsedRows.length === 0) {
        toast.error('No valid rows found. Use the patient template format.');
        return;
      }

      // Rows are created ONE AT A TIME, not in parallel — mirrors the
      // medicine bulk-upload pattern. Patients don't have a server-generated
      // sequential code the way medicines' SKU does, but sequential
      // processing is kept anyway for consistency and because it makes
      // per-row error attribution simple and safe regardless.
      let createdCount = 0;
      let failedCount = 0;
      const failureMessages: string[] = [];
      for (let i = 0; i < parsedRows.length; i++) {
        try {
          await patientService.createPatient(parsedRows[i]);
          createdCount += 1;
        } catch (err: unknown) {
          failedCount += 1;
          const axiosError = err as { response?: { data?: { detail?: string | Array<{ msg: string }> } } };
          const detail = axiosError.response?.data?.detail;
          const message = Array.isArray(detail)
            ? detail.map((d) => d.msg).join('; ')
            : (typeof detail === 'string' ? detail : 'Unknown error');
          failureMessages.push(`Row ${i + 2}: ${message}`);
        }
      }

      if (createdCount > 0) {
        toast.success(`Created ${createdCount} patient(s), failed ${failedCount}`);
        fetchPatients();
      } else {
        toast.error('Bulk upload failed for all rows. Please verify the template and required fields.');
      }
      if (failureMessages.length > 0) {
        console.error('Patient bulk upload row failures:', failureMessages);
      }
    } catch (err) {
      console.error('Patient bulk upload parse error:', err);
      toast.error('Failed to parse file. Please upload a valid CSV or Excel file.');
    } finally {
      setBulkUploading(false);
      event.target.value = '';
    }
  };

  // ── Export: download the currently-filtered patient list as .xlsx ──────
  // Client-side only (no new backend endpoint) — mirrors the established
  // "export data already fetched for this page" pattern (e.g.
  // PurchaseOrdersPage.tsx's handleExportPdf). The list endpoint caps each
  // page at 100 rows, so this walks every page matching the current filters
  // (capped at 50 pages / ~5,000 rows) rather than exporting only the 10
  // rows currently on screen.
  const handleExportPatients = async () => {
    setExporting(true);
    try {
      const filters = { gender: genderFilter, blood_group: bloodGroupFilter, city: cityFilter, status: statusFilter };
      const pageSize = 100;
      const first = await patientService.getPatients(1, pageSize, search, filters, sortBy, sortOrder);
      const all = [...first.data];
      const maxPages = Math.min(first.total_pages, 50);
      for (let p = 2; p <= maxPages; p++) {
        const next = await patientService.getPatients(p, pageSize, search, filters, sortBy, sortOrder);
        all.push(...next.data);
      }

      if (all.length === 0) {
        toast.error('No patients to export');
        return;
      }

      const exportRows = all.map((p) => ({
        'PRN': p.patient_reference_number,
        'Title': p.title || '',
        'First Name': p.first_name,
        'Last Name': p.last_name,
        'Gender': p.gender,
        'Date of Birth': p.date_of_birth ? p.date_of_birth.slice(0, 10) : '',
        'Age (Years)': p.age_years ?? '',
        'Blood Group': p.blood_group || '',
        'Phone': `${p.phone_country_code} ${p.phone_number}`,
        'Email': p.email || '',
        'City': p.city || '',
        'Verified': p.is_verified ? 'Yes' : 'No',
        'Registered On': p.created_at ? format(new Date(p.created_at), 'yyyy-MM-dd HH:mm') : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Patients');
      XLSX.writeFile(workbook, `patient_list_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`Exported ${all.length} patient(s)`);
    } catch (err) {
      console.error('Patient export failed:', err);
      toast.error('Failed to export patient list');
    } finally {
      setExporting(false);
    }
  };

  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patient Directory</h1>
          <p className="text-slate-500 text-sm">Manage and track all patient records in one place.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleExportPatients}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <span className={`material-icons text-lg ${exporting ? 'animate-spin' : ''}`}>
              {exporting ? 'progress_activity' : 'file_download'}
            </span>
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          {/* Bulk Upload / Download Template are gated the same as Register New
              Patient (general.patients edit permission) — they create patient
              records the same way Register New Patient does. */}
          {canRegister && (
            <>
              <button
                type="button"
                onClick={handleDownloadPatientTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="material-icons text-lg">download</span>
                Download Template
              </button>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer">
                <span className="material-icons text-lg">upload_file</span>
                {bulkUploading ? 'Uploading...' : 'Bulk Upload'}
                <input
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={handleBulkPatientUpload}
                  disabled={bulkUploading}
                />
              </label>
              <button
                onClick={() => navigate('/register')}
                className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                <span className="material-icons text-lg">person_add</span>
                <span>Register New Patient</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Patients</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Current Page</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{patients.length}</span>
            <span className="text-slate-400 text-xs pb-1">records</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Pages</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{totalPages}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Active Filters</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">
              {[genderFilter, bloodGroupFilter, cityFilter, statusFilter, search].filter(Boolean).length || '—'}
            </span>
            {[genderFilter, bloodGroupFilter, cityFilter, statusFilter, search].filter(Boolean).length > 0 && (
              <span className="text-slate-400 text-xs pb-1">applied</span>
            )}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6 p-4">
        {/* Search Row */}
        <div className="mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5 relative">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
                placeholder="Search by name, ID, or phone..."
              />
              {searchInput && (
                <button
                  onClick={() => { setSearch(''); setSearchInput(''); setPage(1); setSearchParams({}, { replace: true }); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-icons text-lg">close</span>
                </button>
              )}
            </div>
            <div className="lg:col-span-4">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm font-medium text-slate-700"
              >
                <option value="created_at">Registration Date</option>
                <option value="updated_at">Last Updated</option>
                <option value="first_name">Name</option>
                <option value="patient_reference_number">PRN</option>
              </select>
            </div>
            <div className="lg:col-span-3">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm font-medium text-slate-700"
              >
                {sortBy === 'first_name' || sortBy === 'patient_reference_number'
                  ? (<>
                      <option value="asc">A → Z</option>
                      <option value="desc">Z → A</option>
                    </>)
                  : (<>
                      <option value="desc">↓ Newest First</option>
                      <option value="asc">↑ Oldest First</option>
                    </>)
                }
              </select>
            </div>
          </div>
        </div>
        
        {/* Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <select
              value={genderFilter}
              onChange={(e) => { setGenderFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <select
              value={bloodGroupFilter}
              onChange={(e) => { setBloodGroupFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            >
              <option value="">All Blood Groups</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="A1B+">A1B+</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
          <div>
            <input
              type="text"
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
              placeholder="Filter by City"
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        
        {/* Active Filters Display */}
        {(genderFilter || bloodGroupFilter || cityFilter || statusFilter) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500">Active Filters:</span>
            {genderFilter && (
              <button
                onClick={() => setGenderFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
              >
                Gender: {genderFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            {bloodGroupFilter && (
              <button
                onClick={() => setBloodGroupFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
              >
                Blood: {bloodGroupFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            {cityFilter && (
              <button
                onClick={() => setCityFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200"
              >
                City: {cityFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            {statusFilter && (
              <button
                onClick={() => setStatusFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200"
              >
                Status: {statusFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            <button
              onClick={() => {
                setGenderFilter('');
                setBloodGroupFilter('');
                setCityFilter('');
                setStatusFilter('');
              }}
              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              <span className="material-icons text-sm">filter_alt_off</span>
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <span className="material-icons text-4xl text-slate-300 mb-3">person_search</span>
            <p className="text-lg font-medium">No patients found</p>
            <p className="text-sm mt-1">Try adjusting your search or add a new patient.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">PRN</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gender</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Blood</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {sortBy === 'updated_at' ? 'Last Updated' : 'Registered'}
                  </th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold font-mono text-slate-400">{patient.patient_reference_number}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase flex-shrink-0">
                          {getInitials(patient)}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-sm font-bold text-primary hover:underline cursor-pointer truncate flex items-center gap-1"
                            onClick={() => navigate(`/patients/${patient.id}`)}
                          >
                          {patient.first_name} {patient.last_name}
                          <VerifiedBadge patient={patient} />
                          </p>
                          <p className="text-xs text-slate-500 truncate">{patient.email || `${patient.phone_country_code} ${patient.phone_number}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm">{patient.gender}</span>
                    </td>
                    <td className="px-4 py-4">
                      {patient.blood_group ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 uppercase tracking-wide">
                          {patient.blood_group}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {sortBy === 'updated_at' ? (
                        <span className="text-sm">{format(new Date(patient.updated_at), 'MMM dd, yyyy, hh:mm a')}</span>
                      ) : (
                        <span className="text-sm">{format(new Date(patient.created_at), 'MMM dd, yyyy, hh:mm a')}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/patients/${patient.id}`)}
                          className="px-2.5 py-1.5 text-xs font-semibold hover:bg-primary/10 rounded-lg text-primary transition-colors"
                        >
                          View
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteConfirm({ id: patient.id, name: `${patient.first_name} ${patient.last_name}` })}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <span className="material-icons text-base">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between border-t border-slate-200 gap-4">
            <p className="text-sm text-slate-500">
              Showing <span className="font-bold text-slate-900">{startRecord}</span> to{' '}
              <span className="font-bold text-slate-900">{endRecord}</span> of{' '}
              <span className="font-bold text-slate-900">{total.toLocaleString()}</span> results
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="material-icons text-lg">chevron_left</span>
              </button>
              {getPageNumbers().map((pg, i) =>
                pg === '...' ? (
                  <span key={`dots-${i}`} className="px-2 text-slate-400">...</span>
                ) : (
                  <button
                    key={pg}
                    onClick={() => setPage(pg as number)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                      page === pg
                        ? 'bg-primary text-white'
                        : 'border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {pg}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="material-icons text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-red-500 text-3xl">delete</span>
              </div>
              <h3 id="delete-dialog-title" className="text-lg font-bold text-slate-900 mb-1">Delete Patient</h3>
              <p className="text-sm text-slate-500 mb-6">
                Are you sure you want to delete <span className="font-semibold text-slate-700">{deleteConfirm.name}</span>?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors active:scale-[0.98] disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientList;
