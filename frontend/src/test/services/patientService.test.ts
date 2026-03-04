/**
 * TC-FE-PAT-001 to TC-FE-PAT-015
 * Real tests for patientService — verifies data-cleaning, HTTP parameters, and response handling.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import api from '../../services/api';
import patientService from '../../services/patientService';
import type { Patient } from '../../types/patient';

const mock = new MockAdapter(api);

const FAKE_PATIENT: Patient = {
  id: 'uuid-001',
  patient_reference_number: 'HCM262K00001',
  first_name: 'John',
  last_name: 'Doe',
  gender: 'Male',
  date_of_birth: '1990-01-01',
  phone_number: '9876543210',
  email: 'john@example.com',
  is_active: true,
  is_deleted: false,
  blood_group: 'O+',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
} as unknown as Patient;

beforeEach(() => {
  mock.reset();
  localStorage.clear();
});

// ─── createPatient — data cleaning ────────────────────────────────────────────

describe('TC-FE-PAT-001: createPatient() converts empty strings to undefined', () => {
  it('should strip empty string fields before posting', async () => {
    let capturedBody: Record<string, unknown> = {};
    mock.onPost('/patients').reply((config) => {
      capturedBody = JSON.parse(config.data);
      return [201, FAKE_PATIENT];
    });

    await patientService.createPatient({
      first_name: 'John',
      last_name: 'Doe',
      email: '',           // <-- must be stripped
      address_line_2: '',  // <-- must be stripped
      phone_number: '9876543210',
    } as any);

    // Empty strings must not appear in request body
    expect(capturedBody.email).toBeUndefined();
    expect(capturedBody.address_line_2).toBeUndefined();
  });
});

describe('TC-FE-PAT-002: createPatient() retains non-empty string fields', () => {
  it('should keep populated fields intact', async () => {
    let capturedBody: Record<string, unknown> = {};
    mock.onPost('/patients').reply((config) => {
      capturedBody = JSON.parse(config.data);
      return [201, FAKE_PATIENT];
    });

    await patientService.createPatient({
      first_name: 'John',
      last_name: 'Doe',
      phone_number: '9876543210',
      email: 'john@example.com',
    } as any);

    expect(capturedBody.first_name).toBe('John');
    expect(capturedBody.last_name).toBe('Doe');
    expect(capturedBody.email).toBe('john@example.com');
    expect(capturedBody.phone_number).toBe('9876543210');
  });
});

describe('TC-FE-PAT-003: createPatient() returns Patient from API response', () => {
  it('should return the patient object returned by the backend', async () => {
    mock.onPost('/patients').reply(201, FAKE_PATIENT);

    const result = await patientService.createPatient({
      first_name: 'John',
      last_name: 'Doe',
      phone_number: '9876543210',
    } as any);

    expect(result.id).toBe('uuid-001');
    expect(result.patient_reference_number).toBe('HCM262K00001');
    expect(result.first_name).toBe('John');
  });
});

// ─── updatePatient — data cleaning ────────────────────────────────────────────

describe('TC-FE-PAT-004: updatePatient() converts empty strings to undefined', () => {
  it('should strip empty strings in update payload', async () => {
    let capturedBody: Record<string, unknown> = {};
    mock.onPut('/patients/uuid-001').reply((config) => {
      capturedBody = JSON.parse(config.data);
      return [200, FAKE_PATIENT];
    });

    await patientService.updatePatient('uuid-001', {
      first_name: 'John',
      last_name: '',   // <-- empty
      email: 'john@example.com',
    } as any);

    expect(capturedBody.last_name).toBeUndefined();
    expect(capturedBody.email).toBe('john@example.com');
  });
});

// ─── getPatients — pagination params ─────────────────────────────────────────

describe('TC-FE-PAT-005: getPatients() sends correct page and limit params', () => {
  it('should include page and limit in query string', async () => {
    let capturedParams: Record<string, unknown> = {};
    mock.onGet('/patients').reply((config) => {
      capturedParams = config.params;
      return [200, { items: [], total: 0, page: 2, limit: 5, pages: 0 }];
    });

    await patientService.getPatients(2, 5);

    expect(capturedParams.page).toBe(2);
    expect(capturedParams.limit).toBe(5);
  });
});

describe('TC-FE-PAT-006: getPatients() includes search param when provided', () => {
  it('should add search to query params when non-empty', async () => {
    let capturedParams: Record<string, unknown> = {};
    mock.onGet('/patients').reply((config) => {
      capturedParams = config.params;
      return [200, { items: [], total: 0, page: 1, limit: 10, pages: 0 }];
    });

    await patientService.getPatients(1, 10, 'John');

    expect(capturedParams.search).toBe('John');
  });
});

describe('TC-FE-PAT-007: getPatients() omits search param when empty string', () => {
  it('should not add search param if search is empty', async () => {
    let capturedParams: Record<string, unknown> = {};
    mock.onGet('/patients').reply((config) => {
      capturedParams = config.params;
      return [200, { items: [], total: 0, page: 1, limit: 10, pages: 0 }];
    });

    await patientService.getPatients(1, 10, '');

    expect(capturedParams.search).toBeUndefined();
  });
});

// ─── getPatient ───────────────────────────────────────────────────────────────

describe('TC-FE-PAT-008: getPatient() fetches from /patients/:id', () => {
  it('should return patient data for valid id', async () => {
    mock.onGet('/patients/uuid-001').reply(200, FAKE_PATIENT);

    const result = await patientService.getPatient('uuid-001');

    expect(result.id).toBe('uuid-001');
    expect(result.first_name).toBe('John');
  });
});

describe('TC-FE-PAT-009: getPatient() throws on 404', () => {
  it('should reject when patient not found', async () => {
    mock.onGet('/patients/nonexistent').reply(404, { detail: 'Not found' });

    await expect(patientService.getPatient('nonexistent')).rejects.toThrow();
  });
});

// ─── deletePatient ────────────────────────────────────────────────────────────

describe('TC-FE-PAT-010: deletePatient() calls DELETE /patients/:id', () => {
  it('should hit the correct DELETE endpoint', async () => {
    let deleteCalled = false;
    mock.onDelete('/patients/uuid-001').reply(() => {
      deleteCalled = true;
      return [204];
    });

    await patientService.deletePatient('uuid-001');

    expect(deleteCalled).toBe(true);
  });
});

// ─── getPhotoUrl ──────────────────────────────────────────────────────────────

describe('TC-FE-PAT-011: getPhotoUrl() returns null for null input', () => {
  it('should return null when photoUrl is null', () => {
    expect(patientService.getPhotoUrl(null)).toBeNull();
  });
});

describe('TC-FE-PAT-012: getPhotoUrl() builds correct URL', () => {
  it('should prepend base URL (without /api/v1) to photo path', () => {
    const result = patientService.getPhotoUrl('/media/photo.jpg');
    // API_BASE_URL = 'http://localhost:8000/api/v1' → base = 'http://localhost:8000'
    expect(result).toBe('http://localhost:8000/media/photo.jpg');
  });
});
