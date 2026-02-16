# HMS — Complete API & Frontend Integration Reference

> **Purpose:** This document contains every detail needed to rebuild the frontend with a new UI  
> **Backend:** Unchanged — all endpoints, request/response schemas, validation rules remain the same  
> **Base URL:** `http://localhost:8000/api/v1`  
> **Swagger Docs:** `http://localhost:8000/api/docs`

---

## Table of Contents

1. [API Setup & Authentication Mechanism](#1-api-setup--authentication-mechanism)
2. [TypeScript Interfaces (Copy-Ready)](#2-typescript-interfaces-copy-ready)
3. [API Service Layer (Copy-Ready)](#3-api-service-layer-copy-ready)
4. [Auth Context (Copy-Ready)](#4-auth-context-copy-ready)
5. [Validation Schemas (Copy-Ready)](#5-validation-schemas-copy-ready)
6. [Constants & Country Data (Copy-Ready)](#6-constants--country-data-copy-ready)
7. [Endpoint Details — Authentication](#7-endpoint-details--authentication)
8. [Endpoint Details — Patients](#8-endpoint-details--patients)
9. [Endpoint Details — Users (Super Admin)](#9-endpoint-details--users-super-admin)
10. [Endpoint Details — Hospital](#10-endpoint-details--hospital)
11. [Endpoint Details — Utility](#11-endpoint-details--utility)
12. [Form Field Specifications](#12-form-field-specifications)
13. [Role-Based UI Visibility Rules](#13-role-based-ui-visibility-rules)
14. [Error Handling Reference](#14-error-handling-reference)
15. [Pages & Their API Dependencies](#15-pages--their-api-dependencies)

---

## 1. API Setup & Authentication Mechanism

### Axios Instance Configuration

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-redirect on 401 (token expired/invalid)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Authentication Flow

```
LOGIN:
1. POST /api/v1/auth/login  { username, password }
2. Receive: { access_token, token_type, expires_in, user }
3. Store access_token in localStorage key: "access_token"
4. Store user JSON in localStorage key: "user"
5. All subsequent requests: Header → Authorization: Bearer <token>

LOGOUT:
1. POST /api/v1/auth/logout  (with token)
2. Remove "access_token" and "user" from localStorage
3. Redirect to /login

ON PAGE LOAD:
1. Check localStorage for "access_token" and "user"
2. If both exist → user is authenticated
3. If either missing → redirect to /login

ON 401 RESPONSE:
1. Clear localStorage
2. Redirect to /login
```

### JWT Token Details

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Expiry | 60 minutes (3600 seconds) |
| Token Type | Bearer |
| Header Format | `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...` |
| Payload Fields | `user_id`, `username`, `role`, `exp`, `type` |

---

## 2. TypeScript Interfaces (Copy-Ready)

### Auth Types

```typescript
// types/auth.ts
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'doctor' | 'nurse' | 'staff' 
      | 'receptionist' | 'pharmacist' | 'cashier' | 'inventory_manager';
}

export interface AuthResponse {
  access_token: string;
  token_type: string;     // always "bearer"
  expires_in: number;     // seconds (3600)
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

### Patient Types

```typescript
// types/patient.ts

// Full patient object (returned by GET /patients/:id and POST /patients)
export interface Patient {
  id?: number;
  prn?: string;                          // Auto-generated: "HMS-000001"
  title: string;                         // "Mr." | "Mrs." | "Ms." | "Master" | "Dr." | "Prof." | "Baby"
  first_name: string;
  last_name: string;
  date_of_birth: string;                 // "YYYY-MM-DD"
  gender: 'Male' | 'Female' | 'Other';
  blood_group?: string;                  // "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"
  country_code: string;                  // "+91", "+1", "+44", etc.
  mobile_number: string;                 // digits only: "9876543210"
  email?: string;
  address_line1: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;                      // "India", "United States", etc.
  emergency_contact_name?: string;
  emergency_contact_country_code?: string;
  emergency_contact_mobile?: string;
  emergency_contact_relationship?: string;
  full_name?: string;                    // Computed: "Mr. Praveen S"
  is_active?: boolean;
  created_at?: string;                   // ISO datetime
  updated_at?: string;                   // ISO datetime
}

// Compact patient (returned in list endpoints)
export interface PatientListItem {
  id: number;
  prn: string;
  title: string;
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
  email?: string;
  city?: string;
  blood_group?: string;
  created_at: string;
  full_name: string;                     // Computed by backend
}

// Paginated wrapper (used for GET /patients)
export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
```

### User Types

```typescript
// types/user.ts

export interface UserData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;    // ISO datetime or null
  created_at: string;
  updated_at: string;
}

export interface UserCreateData {
  username: string;     // 3-50 chars, alphanumeric + underscore only
  email: string;        // valid email
  password: string;     // 8-128 chars, must have: uppercase, lowercase, digit, special char
  full_name: string;    // 1-255 chars
  role: string;         // one of the 9 valid roles
}

export interface UserUpdateData {
  email?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export interface PasswordResetData {
  new_password: string;  // same validation as UserCreateData.password
}

export interface UserListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: UserData[];
}
```

### Hospital Types

```typescript
// types/hospital.ts

export interface Hospital {
  id?: number;
  hospital_name: string;
  hospital_code?: string;
  registration_number?: string;
  established_date?: string;           // "YYYY-MM-DD"
  hospital_type?: string;              // default: "General"
  
  primary_phone_country_code?: string; // "+91"
  primary_phone: string;               // digits only
  secondary_phone_country_code?: string;
  secondary_phone?: string;
  email: string;
  website?: string;
  emergency_hotline_country_code?: string;
  emergency_hotline?: string;
  
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  
  logo_path?: string;
  logo_filename?: string;
  logo_mime_type?: string;
  logo_size_kb?: number;
  
  gst_number?: string;                // India only, 15 chars
  pan_number?: string;                // India only, 10 chars
  drug_license_number?: string;
  medical_registration_number?: string;
  
  working_hours_start?: string;       // "HH:MM:SS"
  working_hours_end?: string;         // "HH:MM:SS"
  working_days?: string[];            // ["Monday", "Tuesday", ...]
  emergency_24_7?: boolean;
  
  is_configured?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  updated_by?: number;
}

export interface HospitalCreate {
  hospital_name: string;
  hospital_code?: string;
  registration_number?: string;
  established_date?: string;
  hospital_type?: string;
  primary_phone_country_code?: string;
  primary_phone: string;
  secondary_phone_country_code?: string;
  secondary_phone?: string;
  email: string;
  website?: string;
  emergency_hotline_country_code?: string;
  emergency_hotline?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  medical_registration_number?: string;
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: string[];
  emergency_24_7?: boolean;
}

export interface HospitalUpdate {
  // All fields optional — send only changed fields
  hospital_name?: string;
  hospital_code?: string;
  registration_number?: string;
  established_date?: string;
  hospital_type?: string;
  primary_phone_country_code?: string;
  primary_phone?: string;
  secondary_phone_country_code?: string;
  secondary_phone?: string;
  email?: string;
  website?: string;
  emergency_hotline_country_code?: string;
  emergency_hotline?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  pin_code?: string;
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  medical_registration_number?: string;
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: string[];
  emergency_24_7?: boolean;
}

export interface HospitalStatus {
  is_configured: boolean;
  message: string;
}

export interface HospitalLogoUpload {
  logo_path: string;
  logo_filename: string;
  logo_size_kb: number;
  message: string;
}
```

---

## 3. API Service Layer (Copy-Ready)

### Auth Service

```typescript
// services/authService.ts
import api from './api';
import { LoginCredentials, AuthResponse } from '../types/auth';

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  async logout(): Promise<void> {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  },

  saveAuthData(data: AuthResponse): void {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
  },

  getStoredUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getStoredToken() {
    return localStorage.getItem('access_token');
  },
};
```

### Patient Service

```typescript
// services/patientService.ts
import api from './api';
import { Patient, PatientListItem, PaginatedResponse } from '../types/patient';

export const patientService = {
  // Create new patient → returns full patient with auto-generated PRN
  async createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'updated_at' | 'is_active'>): Promise<Patient> {
    const response = await api.post<Patient>('/patients', patient);
    return response.data;
  },

  // Get single patient by ID
  async getPatient(id: number): Promise<Patient> {
    const response = await api.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  // List patients with pagination + search
  async listPatients(page = 1, limit = 10, search?: string): Promise<PaginatedResponse<PatientListItem>> {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (search) params.append('search', search);
    const response = await api.get<PaginatedResponse<PatientListItem>>(`/patients?${params.toString()}`);
    return response.data;
  },

  // Update patient (full object required — not partial)
  async updatePatient(id: number, patient: Patient): Promise<Patient> {
    const response = await api.put<Patient>(`/patients/${id}`, patient);
    return response.data;
  },

  // Soft-delete patient (returns 204 No Content)
  async deletePatient(id: number): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  // Email patient's ID card to their email address
  async emailIdCard(id: number): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/patients/${id}/email-id-card`);
    return response.data;
  },
};
```

### User Service

```typescript
// services/userService.ts
import api from './api';
import { UserData, UserCreateData, UserUpdateData, PasswordResetData, UserListResponse } from '../types/user';

export const userService = {
  // List users (Super Admin only)
  async listUsers(page = 1, limit = 10, search?: string): Promise<UserListResponse> {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (search) params.append('search', search);
    const response = await api.get<UserListResponse>(`/users?${params.toString()}`);
    return response.data;
  },

  // Get single user by ID (Super Admin only)
  async getUser(id: number): Promise<UserData> {
    const response = await api.get<UserData>(`/users/${id}`);
    return response.data;
  },

  // Create user (Super Admin only) — sendEmail=true sends credentials via SMTP
  async createUser(user: UserCreateData, sendEmail = false): Promise<UserData> {
    const response = await api.post<UserData>(`/users?send_email=${sendEmail}`, user);
    return response.data;
  },

  // Update user (Super Admin only)
  async updateUser(id: number, user: UserUpdateData): Promise<UserData> {
    const response = await api.put<UserData>(`/users/${id}`, user);
    return response.data;
  },

  // Soft-delete user (Super Admin only, returns 204 No Content)
  async deleteUser(id: number): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  // Reset user password (Super Admin only)
  async resetPassword(id: number, data: PasswordResetData, sendEmail = false): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/reset-password?send_email=${sendEmail}`, data);
    return response.data;
  },

  // Set new password and send via email (Super Admin only)
  async sendPassword(id: number, data: PasswordResetData): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/send-password`, data);
    return response.data;
  },
};
```

### Hospital Service

```typescript
// services/hospitalService.ts
import api from './api';
import { Hospital, HospitalCreate, HospitalUpdate, HospitalStatus, HospitalLogoUpload } from '../types/hospital';

export const hospitalService = {
  // Check if hospital is configured (public — no auth needed)
  checkStatus: async (): Promise<HospitalStatus> => {
    const response = await api.get('/hospital/status');
    return response.data;
  },

  // Get hospital public info (no auth needed)
  getHospital: async (): Promise<Hospital> => {
    const response = await api.get('/hospital');
    return response.data;
  },

  // Get full hospital details (Admin/Super Admin only)
  getHospitalFull: async (): Promise<Hospital> => {
    const response = await api.get('/hospital/full');
    return response.data;
  },

  // IMPORTANT: Clean empty strings before sending to backend
  _cleanData: (data: Record<string, any>): Record<string, any> => {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === '' || value === undefined) continue; // skip empties
      cleaned[key] = value;
    }
    if (cleaned.working_days && !Array.isArray(cleaned.working_days)) {
      cleaned.working_days = [cleaned.working_days];
    }
    if ('emergency_24_7' in cleaned) {
      cleaned.emergency_24_7 = Boolean(cleaned.emergency_24_7);
    }
    return cleaned;
  },

  // Create hospital (one-time setup, Admin/Super Admin only)
  createHospital: async (data: HospitalCreate): Promise<Hospital> => {
    const response = await api.post('/hospital', hospitalService._cleanData(data));
    return response.data;
  },

  // Update hospital (Admin/Super Admin only)
  updateHospital: async (data: HospitalUpdate): Promise<Hospital> => {
    const response = await api.put('/hospital', hospitalService._cleanData(data));
    return response.data;
  },

  // Upload logo (Admin/Super Admin only) — multipart/form-data
  uploadLogo: async (file: File): Promise<HospitalLogoUpload> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/hospital/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Get logo image URL (public)
  getLogoUrl: (): string => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    return `${apiBaseUrl}/hospital/logo`;
  },

  // Delete logo (Admin/Super Admin only)
  deleteLogo: async (): Promise<{ message: string }> => {
    const response = await api.delete('/hospital/logo');
    return response.data;
  },
};
```

---

## 4. Auth Context (Copy-Ready)

```typescript
// contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState } from '../types/auth';
import { authService } from '../services/authService';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null, token: null, isAuthenticated: false, isLoading: true,
  });

  useEffect(() => {
    const token = authService.getStoredToken();
    const user = authService.getStoredUser();
    if (token && user) {
      setState({ user, token, isAuthenticated: true, isLoading: false });
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (username: string, password: string) => {
    const response = await authService.login({ username, password });
    authService.saveAuthData(response);
    setState({ user: response.user, token: response.access_token, isAuthenticated: true, isLoading: false });
  };

  const logout = async () => {
    try { await authService.logout(); } finally {
      setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

---

## 5. Validation Schemas (Copy-Ready)

```typescript
// utils/validation.ts
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const patientSchema = z.object({
  title: z.enum(['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'], {
    errorMap: () => ({ message: 'Please select a title' }),
  }),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  gender: z.enum(['Male', 'Female', 'Other'], {
    errorMap: () => ({ message: 'Please select a gender' }),
  }),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
    errorMap: () => ({ message: 'Please select a blood group' }),
  }).optional().or(z.literal('')),
  country_code: z.string().regex(/^\+[0-9]{1,4}$/, 'Invalid country code').default('+91'),
  mobile_number: z.string()
    .min(4, 'Mobile number must be at least 4 digits')
    .max(15, 'Mobile number must be at most 15 digits')
    .regex(/^\d{4,15}$/, 'Enter a valid phone number (digits only, 4-15 digits)'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address_line1: z.string().min(5, 'Address must be at least 5 characters'),
  address_line2: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pin_code: z.string()
    .regex(/^[A-Za-z0-9 \-]{3,10}$/, 'Invalid postal/ZIP code')
    .optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  emergency_contact_name: z.string().optional().or(z.literal('')),
  emergency_contact_country_code: z.string()
    .regex(/^\+[0-9]{1,4}$/, 'Invalid country code')
    .optional().or(z.literal('')),
  emergency_contact_mobile: z.string()
    .regex(/^\d{4,15}$/, 'Enter a valid phone number (digits only)')
    .optional().or(z.literal('')),
  emergency_contact_relationship: z.enum([
    'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
    'Brother', 'Sister', 'Friend', 'Guardian', 'Other',
  ], {
    errorMap: () => ({ message: 'Please select a relationship' }),
  }).optional().or(z.literal('')),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type PatientFormData = z.infer<typeof patientSchema>;
```

---

## 6. Constants & Country Data (Copy-Ready)

### Dropdown Options

```typescript
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;
export const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'] as const;
export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const RELATIONSHIP_OPTIONS = [
  'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
  'Brother', 'Sister', 'Friend', 'Guardian', 'Other',
] as const;
export const ROLE_OPTIONS = [
  'super_admin', 'admin', 'doctor', 'nurse', 'staff',
  'receptionist', 'pharmacist', 'cashier', 'inventory_manager',
] as const;
export const WORKING_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;
```

### Country Data (35+ countries with phone codes, postal labels, states)

```typescript
export interface CountryInfo {
  name: string;           // "India"
  code: string;           // "IN"
  phoneCode: string;      // "+91"
  postalCodeLabel: string; // "PIN Code" | "ZIP Code" | "Postcode" etc.
  states: string[];       // Array of state/province names
}

export const COUNTRIES: CountryInfo[] = [
  { name: 'India', code: 'IN', phoneCode: '+91', postalCodeLabel: 'PIN Code',
    states: ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'] },
  { name: 'United States', code: 'US', phoneCode: '+1', postalCodeLabel: 'ZIP Code',
    states: ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','District of Columbia'] },
  { name: 'United Kingdom', code: 'GB', phoneCode: '+44', postalCodeLabel: 'Postcode',
    states: ['England','Scotland','Wales','Northern Ireland','Greater London','Greater Manchester','West Midlands','West Yorkshire','South Yorkshire','Merseyside','Tyne and Wear'] },
  { name: 'Canada', code: 'CA', phoneCode: '+1', postalCodeLabel: 'Postal Code',
    states: ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon'] },
  { name: 'Australia', code: 'AU', phoneCode: '+61', postalCodeLabel: 'Postcode',
    states: ['Australian Capital Territory','New South Wales','Northern Territory','Queensland','South Australia','Tasmania','Victoria','Western Australia'] },
  { name: 'United Arab Emirates', code: 'AE', phoneCode: '+971', postalCodeLabel: 'Postal Code',
    states: ['Abu Dhabi','Ajman','Dubai','Fujairah','Ras Al Khaimah','Sharjah','Umm Al Quwain'] },
  { name: 'Saudi Arabia', code: 'SA', phoneCode: '+966', postalCodeLabel: 'Postal Code',
    states: ['Riyadh','Makkah','Madinah','Eastern Province','Asir','Tabuk','Hail','Northern Borders','Jazan','Najran','Al Bahah','Al Jawf','Qassim'] },
  { name: 'Germany', code: 'DE', phoneCode: '+49', postalCodeLabel: 'Postleitzahl',
    states: ['Baden-Württemberg','Bavaria','Berlin','Brandenburg','Bremen','Hamburg','Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia','Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt','Schleswig-Holstein','Thuringia'] },
  { name: 'Malaysia', code: 'MY', phoneCode: '+60', postalCodeLabel: 'Postcode',
    states: ['Johor','Kedah','Kelantan','Malacca','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Sabah','Sarawak','Selangor','Terengganu','Kuala Lumpur','Labuan','Putrajaya'] },
  { name: 'Nepal', code: 'NP', phoneCode: '+977', postalCodeLabel: 'Postal Code',
    states: ['Province No. 1','Madhesh Province','Bagmati Province','Gandaki Province','Lumbini Province','Karnali Province','Sudurpashchim Province'] },
  { name: 'Sri Lanka', code: 'LK', phoneCode: '+94', postalCodeLabel: 'Postal Code',
    states: ['Central','Eastern','North Central','Northern','North Western','Sabaragamuwa','Southern','Uva','Western'] },
  { name: 'Bangladesh', code: 'BD', phoneCode: '+880', postalCodeLabel: 'Postal Code',
    states: ['Barishal','Chattogram','Dhaka','Khulna','Mymensingh','Rajshahi','Rangpur','Sylhet'] },
  { name: 'Pakistan', code: 'PK', phoneCode: '+92', postalCodeLabel: 'Postal Code',
    states: ['Punjab','Sindh','Khyber Pakhtunkhwa','Balochistan','Islamabad Capital Territory','Gilgit-Baltistan','Azad Kashmir'] },
  { name: 'Singapore', code: 'SG', phoneCode: '+65', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Qatar', code: 'QA', phoneCode: '+974', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Oman', code: 'OM', phoneCode: '+968', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Kuwait', code: 'KW', phoneCode: '+965', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Bahrain', code: 'BH', phoneCode: '+973', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'France', code: 'FR', phoneCode: '+33', postalCodeLabel: 'Code Postal', states: [] },
  { name: 'Japan', code: 'JP', phoneCode: '+81', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'China', code: 'CN', phoneCode: '+86', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'South Korea', code: 'KR', phoneCode: '+82', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Italy', code: 'IT', phoneCode: '+39', postalCodeLabel: 'CAP', states: [] },
  { name: 'Spain', code: 'ES', phoneCode: '+34', postalCodeLabel: 'Código Postal', states: [] },
  { name: 'Brazil', code: 'BR', phoneCode: '+55', postalCodeLabel: 'CEP', states: [] },
  { name: 'Mexico', code: 'MX', phoneCode: '+52', postalCodeLabel: 'Código Postal', states: [] },
  { name: 'South Africa', code: 'ZA', phoneCode: '+27', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Nigeria', code: 'NG', phoneCode: '+234', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Egypt', code: 'EG', phoneCode: '+20', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Russia', code: 'RU', phoneCode: '+7', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Indonesia', code: 'ID', phoneCode: '+62', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Thailand', code: 'TH', phoneCode: '+66', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Vietnam', code: 'VN', phoneCode: '+84', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Philippines', code: 'PH', phoneCode: '+63', postalCodeLabel: 'ZIP Code', states: [] },
  { name: 'Turkey', code: 'TR', phoneCode: '+90', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'New Zealand', code: 'NZ', phoneCode: '+64', postalCodeLabel: 'Postcode', states: [] },
  { name: 'Afghanistan', code: 'AF', phoneCode: '+93', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Iran', code: 'IR', phoneCode: '+98', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Iraq', code: 'IQ', phoneCode: '+964', postalCodeLabel: 'Postal Code', states: [] },
];
```

### Helper Functions

```typescript
// Build phone code dropdown options (deduplicated)
export const COUNTRY_CODE_OPTIONS = COUNTRIES.map(c => ({
  code: c.phoneCode,
  label: `${c.phoneCode} (${c.name})`,
  country: c.name,
})).filter((v, i, a) => a.findIndex(t => t.code === v.code) === i);

// Get states for a country
export function getStatesForCountry(countryName: string): string[] {
  return COUNTRIES.find(c => c.name === countryName)?.states || [];
}

// Get postal code label for a country
export function getPostalCodeLabel(countryName: string): string {
  return COUNTRIES.find(c => c.name === countryName)?.postalCodeLabel || 'Postal Code';
}

// Get phone code for a country
export function getPhoneCodeForCountry(countryName: string): string {
  return COUNTRIES.find(c => c.name === countryName)?.phoneCode || '+1';
}
```

---

## 7. Endpoint Details — Authentication

### POST `/auth/login`

| Property | Value |
|----------|-------|
| Auth Required | No |
| Content-Type | application/json |

**Request Body:**
```json
{
  "username": "superadmin",
  "password": "<YOUR_PASSWORD>"
}
```

**Success Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "username": "superadmin",
    "email": "superadmin@hms.com",
    "full_name": "Super Administrator",
    "role": "super_admin"
  }
}
```

**Error Responses:**
| Code | Detail |
|------|--------|
| 401 | "Incorrect username or password" |
| 403 | "Account is inactive" |

---

### POST `/auth/logout`

| Property | Value |
|----------|-------|
| Auth Required | Yes (Bearer token) |

**Success Response (200):**
```json
{ "message": "Successfully logged out" }
```

---

### POST `/auth/refresh`

| Property | Value |
|----------|-------|
| Auth Required | Yes (Bearer token) |

**Success Response (200):**
```json
{
  "access_token": "eyJhbGci...(new token)",
  "token_type": "bearer",
  "expires_in": 3600
}
```

---

## 8. Endpoint Details — Patients

### POST `/patients` — Create Patient

| Property | Value |
|----------|-------|
| Auth Required | Yes (any role) |
| Content-Type | application/json |
| Success Code | 201 Created |

**Request Body (all required fields marked with *):**
```json
{
  "title": "Mr.",                              // * enum
  "first_name": "Praveen",                     // * 1-100 chars
  "last_name": "S",                            // * 1-100 chars
  "date_of_birth": "1985-03-15",               // * YYYY-MM-DD, cannot be future
  "gender": "Male",                            // * "Male" | "Female" | "Other"
  "blood_group": "O+",                         // optional enum
  "country_code": "+91",                       // default "+91", pattern: ^\+[0-9]{1,4}$
  "mobile_number": "9876543210",               // * 4-15 digits only
  "email": "praveen@example.com",              // optional, valid email
  "address_line1": "123 MG Road",              // * min 5 chars
  "address_line2": "Near Park",                // optional
  "city": "Mumbai",                            // optional
  "state": "Maharashtra",                      // optional
  "pin_code": "400001",                        // optional, 3-10 alphanumeric
  "country": "India",                          // optional, default "India"
  "emergency_contact_name": "Lakshmi S",       // optional
  "emergency_contact_country_code": "+91",     // optional
  "emergency_contact_mobile": "9876543200",    // optional, 4-15 digits
  "emergency_contact_relationship": "Mother"   // optional enum
}
```

**Success Response (201):**
```json
{
  "id": 5,
  "prn": "HMS-000005",                         // AUTO-GENERATED
  "title": "Mr.",
  "first_name": "Praveen",
  "last_name": "S",
  "full_name": "Mr. Praveen S",                // COMPUTED
  "date_of_birth": "1985-03-15",
  "gender": "Male",
  "blood_group": "O+",
  "country_code": "+91",
  "mobile_number": "9876543210",
  "email": "praveen@example.com",
  "address_line1": "123 MG Road",
  "address_line2": "Near Park",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pin_code": "400001",
  "country": "India",
  "emergency_contact_name": "Lakshmi S",
  "emergency_contact_country_code": "+91",
  "emergency_contact_mobile": "9876543200",
  "emergency_contact_relationship": "Mother",
  "is_active": true,
  "created_at": "2026-02-12T10:30:00.000Z",
  "updated_at": "2026-02-12T10:30:00.000Z"
}
```

**Error Responses:**
| Code | Detail |
|------|--------|
| 400 | "A patient with this mobile number already exists" |
| 400 | "A patient with this email already exists" |
| 422 | Validation errors (Pydantic) |

---

### GET `/patients` — List Patients (Paginated)

| Property | Value |
|----------|-------|
| Auth Required | Yes (any role) |

**Query Parameters:**
| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `page` | int | 1 | ≥ 1 | Page number |
| `limit` | int | 10 | 1-100 | Items per page |
| `search` | string | — | — | Searches: first_name, last_name, mobile_number, email, prn |

**Example:** `GET /patients?page=1&limit=10&search=praveen`

**Success Response (200):**
```json
{
  "total": 42,
  "page": 1,
  "limit": 10,
  "total_pages": 5,
  "data": [
    {
      "id": 5,
      "prn": "HMS-000005",
      "title": "Mr.",
      "first_name": "Praveen",
      "last_name": "S",
      "full_name": "Mr. Praveen S",
      "country_code": "+91",
      "mobile_number": "9876543210",
      "email": "praveen@example.com",
      "city": "Mumbai",
      "blood_group": "O+",
      "created_at": "2026-02-12T10:30:00.000Z"
    }
  ]
}
```

---

### GET `/patients/{patient_id}` — Get Patient Detail

| Property | Value |
|----------|-------|
| Auth Required | Yes (any role) |

**Success Response (200):** Same as POST response (full `PatientResponse` object)

**Error:** 404 "Patient not found"

---

### PUT `/patients/{patient_id}` — Update Patient

| Property | Value |
|----------|-------|
| Auth Required | Yes (any role) |
| Content-Type | application/json |

**Request Body:** Same structure as POST (full object, NOT partial — all required fields must be present)

**Important:** The `prn` field is NOT in the request body — it cannot be changed.

**Error Responses:**
| Code | Detail |
|------|--------|
| 400 | "Mobile number already exists" |
| 400 | "Email already exists" |
| 404 | "Patient not found" |

---

### DELETE `/patients/{patient_id}` — Soft Delete Patient

| Property | Value |
|----------|-------|
| Auth Required | Yes (any role) |
| Success Code | 204 No Content |

**Error:** 404 "Patient not found"

---

### POST `/patients/{patient_id}/email-id-card` — Email ID Card

| Property | Value |
|----------|-------|
| Auth Required | Yes (any role) |

**Success Response (200):**
```json
{ "message": "ID card sent to praveen@example.com" }
```

**Error Responses:**
| Code | Detail |
|------|--------|
| 400 | "Patient does not have an email address" |
| 404 | "Patient not found" |
| 500 | "Failed to send email. SMTP may not be configured." |

---

## 9. Endpoint Details — Users (Super Admin)

> **All endpoints require: `role == "super_admin"`**  
> Other roles get: `403 "Super Admin access required"`

### GET `/users` — List Users

**Query Parameters:**
| Param | Type | Default | Range |
|-------|------|---------|-------|
| `page` | int | 1 | ≥ 1 |
| `limit` | int | 10 | 1-100 |
| `search` | string | — | Searches: username, full_name, email |

**Success Response (200):**
```json
{
  "total": 4,
  "page": 1,
  "limit": 10,
  "total_pages": 1,
  "data": [
    {
      "id": 1,
      "username": "superadmin",
      "email": "superadmin@hms.com",
      "full_name": "Super Administrator",
      "role": "super_admin",
      "is_active": true,
      "last_login": "2026-02-12T08:00:00.000Z",
      "created_at": "2026-02-10T09:00:00.000Z",
      "updated_at": "2026-02-12T08:00:00.000Z"
    }
  ]
}
```

---

### POST `/users?send_email={bool}` — Create User

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `send_email` | bool | false | Send credentials via email |

**Request Body:**
```json
{
  "username": "doctor2",          // 3-50 chars, alphanumeric + underscore
  "email": "doctor2@hms.com",    // valid email
  "password": "Doctor@123",      // 8-128 chars, uppercase + lowercase + digit + special
  "full_name": "Dr. Kumar",      // 1-255 chars
  "role": "doctor"               // one of 9 valid roles
}
```

**Password Validation Rules:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character: `!@#$%^&*(),.?":{}|<>`

**Username Validation Rules:**
- 3-50 characters
- Only letters, numbers, and underscores
- Auto-converted to lowercase by backend

**Valid Roles:**
`super_admin`, `admin`, `doctor`, `nurse`, `staff`, `receptionist`, `pharmacist`, `cashier`, `inventory_manager`

**Success Response (201):** Full `UserData` object

**Error Responses:**
| Code | Detail |
|------|--------|
| 400 | "Username already exists" |
| 400 | "Email already exists" |
| 422 | Password/username/role validation errors |

---

### GET `/users/{user_id}` — Get User

**Success Response (200):** Full `UserData` object  
**Error:** 404 "User not found"

---

### PUT `/users/{user_id}` — Update User

**Request Body (all fields optional):**
```json
{
  "email": "newemail@hms.com",
  "full_name": "New Name",
  "role": "admin",
  "is_active": true
}
```

**Error Responses:**
| Code | Detail |
|------|--------|
| 400 | "Email already exists" |
| 404 | "User not found" |

---

### DELETE `/users/{user_id}` — Soft Delete User

| Success Code | 204 No Content |
|---|---|

**Business Rules:**
- Cannot delete your own account → 400 "Cannot delete your own account"
- Cannot delete last Super Admin → 400 "Cannot delete the last Super Admin account"

---

### POST `/users/{user_id}/reset-password?send_email={bool}` — Reset Password

**Request Body:**
```json
{ "new_password": "NewPass@123" }
```

**Success Response (200):**
```json
{ "message": "Password reset successfully", "email_sent": false }
```

---

### POST `/users/{user_id}/send-password` — Set + Email Password

**Request Body:**
```json
{ "new_password": "NewPass@123" }
```

**Success Response (200):**
```json
{ "message": "Password updated and sent via email", "email_sent": true }
```

---

## 10. Endpoint Details — Hospital

### GET `/hospital/status` — Check Setup Status

| Auth Required | No |
|---|---|

**Response (200):**
```json
{ "is_configured": false, "message": "Hospital setup required" }
// or
{ "is_configured": true, "message": "Hospital configured" }
```

---

### GET `/hospital` — Get Public Info

| Auth Required | No |
|---|---|

**Response (200):** `HospitalPublicInfo` — subset of fields for ID cards

```json
{
  "id": 1,
  "hospital_name": "City General Hospital",
  "primary_phone_country_code": "+91",
  "primary_phone": "2212345678",
  "email": "info@hospital.com",
  "website": "www.hospital.com",
  "emergency_hotline_country_code": null,
  "emergency_hotline": null,
  "address_line1": "123 Medical Center Road",
  "address_line2": null,
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pin_code": "400001",
  "logo_path": "/path/to/logo",
  "registration_number": "REG-12345"
}
```

---

### GET `/hospital/full` — Get Complete Details

| Auth Required | Admin or Super Admin |
|---|---|

**Response (200):** Full `HospitalResponse` with all fields including legal, operations, metadata

---

### POST `/hospital` — Create Hospital (One-Time Setup)

| Auth Required | Admin or Super Admin |
|---|---|
| Success Code | 201 Created |

**Request Body (required fields marked with *):**
```json
{
  "hospital_name": "City General Hospital",         // * min 3 chars
  "hospital_code": "CGH",                           // optional
  "registration_number": "REG-12345",               // optional
  "established_date": "2000-01-15",                 // optional
  "hospital_type": "General",                       // default "General"
  "primary_phone_country_code": "+91",              // default "+91"
  "primary_phone": "2212345678",                    // * 4-15 digits
  "secondary_phone_country_code": "+91",            // optional
  "secondary_phone": "2298765432",                  // optional
  "email": "info@hospital.com",                     // * valid email
  "website": "www.hospital.com",                    // optional
  "emergency_hotline_country_code": "+91",          // optional
  "emergency_hotline": "1800123456",                // optional
  "address_line1": "123 Medical Center Road",       // * min 5 chars
  "address_line2": "",                              // optional
  "city": "Mumbai",                                 // * min 2 chars
  "state": "Maharashtra",                           // * min 2 chars
  "country": "India",                               // * min 2 chars
  "pin_code": "400001",                             // * 3-10 chars
  "gst_number": "27AAAAA0000A1Z5",                  // optional (15 chars for India)
  "pan_number": "ABCDE1234F",                       // optional (10 chars for India)
  "drug_license_number": "",                        // optional
  "medical_registration_number": "",                // optional
  "working_hours_start": "09:00:00",               // optional HH:MM:SS
  "working_hours_end": "18:00:00",                 // optional HH:MM:SS
  "working_days": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
  "emergency_24_7": false
}
```

**IMPORTANT:** Empty strings for optional fields are auto-converted to `null` by the backend.

**Error:** 400 "Hospital record already exists. Use update endpoint to modify."

---

### PUT `/hospital` — Update Hospital

| Auth Required | Admin or Super Admin |
|---|---|

**Request Body:** Same as POST but ALL fields optional — send only what changed.

---

### POST `/hospital/logo` — Upload Logo

| Auth Required | Admin or Super Admin |
|---|---|
| Content-Type | multipart/form-data |

**Request:** FormData with field name `file`

```typescript
const formData = new FormData();
formData.append('file', fileObject);
// POST with Content-Type: multipart/form-data
```

**Constraints:**
- Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.svg`
- Max size: **2 MB**

**Success Response (200):**
```json
{
  "logo_path": "/path/to/hospital_logo.png",
  "logo_filename": "hospital_logo.png",
  "logo_size_kb": 245,
  "message": "Logo uploaded successfully"
}
```

---

### GET `/hospital/logo` — Get Logo Image

| Auth Required | No |
|---|---|
| Returns | Binary file (image) |

Use as image `src`: 
```typescript
const logoUrl = `${API_BASE_URL}/hospital/logo`;
// <img src={logoUrl} alt="Hospital Logo" />
```

---

### DELETE `/hospital/logo` — Delete Logo

| Auth Required | Admin or Super Admin |
|---|---|

**Response (200):**
```json
{ "message": "Logo deleted successfully" }
```

---

## 11. Endpoint Details — Utility

### GET `/` — App Info (No Auth)
```json
{ "name": "Hospital Management System", "version": "1.0.0", "status": "operational" }
```

### GET `/health` — Health Check (No Auth)
```json
{ "status": "healthy" }
```

### GET `/api/v1/config/hospital` — Hospital Config from Env (No Auth)
```json
{
  "hospital_name": "City General Hospital",
  "hospital_address": "123 Medical Center Road",
  "hospital_city": "Mumbai",
  "hospital_state": "Maharashtra",
  "hospital_country": "India",
  "hospital_pin_code": "400001",
  "hospital_phone": "+91 22 1234 5678",
  "hospital_email": "info@hospital.com",
  "hospital_website": "www.hospital.com"
}
```

---

## 12. Form Field Specifications

### Patient Registration Form

| Field | Type | Required | Validation | UI Element |
|-------|------|:--------:|------------|------------|
| title | enum | ✅ | Mr./Mrs./Ms./Master/Dr./Prof./Baby | Dropdown |
| first_name | string | ✅ | 1-100 chars | Text input |
| last_name | string | ✅ | 1-100 chars | Text input |
| date_of_birth | date | ✅ | ≤ today, max age 150 | Date picker |
| gender | enum | ✅ | Male/Female/Other | Radio/Dropdown |
| blood_group | enum | ❌ | A+/A-/B+/B-/AB+/AB-/O+/O- | Dropdown |
| country_code | string | ✅ | `^\+[0-9]{1,4}$`, default "+91" | Phone code dropdown |
| mobile_number | string | ✅ | 4-15 digits only | Text input (digits only) |
| email | email | ❌ | Valid email format | Email input |
| address_line1 | string | ✅ | min 5 chars | Text input |
| address_line2 | string | ❌ | max 255 chars | Text input |
| city | string | ❌ | max 100 chars | Text input |
| state | string | ❌ | max 100 chars | Dropdown (if country has states) or text |
| pin_code | string | ❌ | 3-10 alphanumeric `^[A-Za-z0-9 \-]{3,10}$` | Text input |
| country | string | ❌ | default "India" | Dropdown (35+ countries) |
| emergency_contact_name | string | ❌ | max 255 chars | Text input |
| emergency_contact_country_code | string | ❌ | `^\+[0-9]{1,4}$` | Phone code dropdown |
| emergency_contact_mobile | string | ❌ | 4-15 digits | Text input |
| emergency_contact_relationship | enum | ❌ | Father/Mother/Husband/Wife/Son/Daughter/Brother/Sister/Friend/Guardian/Other | Dropdown |

**Dynamic Behavior:**
- When **country** changes → update **state** dropdown options and **postal code label**
- When **country** changes → auto-set **country_code** to matching phone code
- State dropdown → show list for countries with states data, free text input for others

### User Create Form (Super Admin Only)

| Field | Type | Required | Validation |
|-------|------|:--------:|------------|
| username | string | ✅ | 3-50 chars, alphanumeric + underscore only |
| email | email | ✅ | Valid email |
| password | string | ✅ | 8-128 chars, uppercase + lowercase + digit + special |
| full_name | string | ✅ | 1-255 chars |
| role | enum | ✅ | One of 9 roles |

### Hospital Setup Form (Admin/Super Admin)

| Section | Field | Required | Notes |
|---------|-------|:--------:|-------|
| **Basic** | hospital_name | ✅ | 3-200 chars |
| | hospital_code | ❌ | 20 chars max |
| | registration_number | ❌ | |
| | established_date | ❌ | Date picker |
| | hospital_type | ❌ | Default "General" |
| **Contact** | primary_phone_country_code | ✅ | Default "+91" |
| | primary_phone | ✅ | 4-15 digits |
| | secondary_phone_country_code | ❌ | |
| | secondary_phone | ❌ | |
| | email | ✅ | Valid email |
| | website | ❌ | |
| | emergency_hotline_country_code | ❌ | |
| | emergency_hotline | ❌ | |
| **Address** | address_line1 | ✅ | min 5 chars |
| | address_line2 | ❌ | |
| | city | ✅ | |
| | state | ✅ | |
| | country | ✅ | Dropdown |
| | pin_code | ✅ | 3-10 chars |
| **Legal** | gst_number | ❌ | India: 15 chars strict format |
| | pan_number | ❌ | India: 10 chars strict format |
| | drug_license_number | ❌ | |
| | medical_registration_number | ❌ | |
| **Operations** | working_hours_start | ❌ | Time picker |
| | working_hours_end | ❌ | Time picker |
| | working_days | ❌ | Checkbox group (Mon-Sun) |
| | emergency_24_7 | ❌ | Toggle/checkbox |
| **Logo** | file | ❌ | .jpg/.jpeg/.png/.svg, max 2MB |

---

## 13. Role-Based UI Visibility Rules

### Sidebar/Navigation

| Menu Item | Visible To |
|-----------|-----------|
| Dashboard | All authenticated users |
| Patients | All authenticated users |
| Register Patient | All authenticated users |
| Hospital Profile | `admin`, `super_admin` |
| User Management | `super_admin` only |

### Implementation Logic

```typescript
const { user } = useAuth();

const showHospitalProfile = user?.role === 'admin' || user?.role === 'super_admin';
const showUserManagement = user?.role === 'super_admin';
```

### Dashboard Cards

| Card | Visible To |
|------|-----------|
| Register Patient | All |
| View Patients | All |
| System Status | All |
| Security | All |
| User Management | `super_admin` |
| Hospital Profile | `admin`, `super_admin` |

### API-Level Enforcement (Backend will reject anyway)

| Action | Required Role | Error if wrong role |
|--------|--------------|---------------------|
| Patient CRUD | Any authenticated | 401 if no token |
| Hospital full view | admin / super_admin | 403 |
| Hospital create/update | admin / super_admin | 403 |
| Hospital logo manage | admin / super_admin | 403 |
| All user management | super_admin | 403 "Super Admin access required" |

---

## 14. Error Handling Reference

### Error Response Format

All API errors return:
```json
{
  "detail": "Human-readable error message"
}
```

For validation errors (422):
```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "mobile_number"],
      "msg": "String should match pattern '^\\d{4,15}$'",
      "input": "abc",
      "ctx": { "pattern": "^\\d{4,15}$" }
    }
  ]
}
```

### Common HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | Success | GET, PUT, POST (non-create) |
| 201 | Created | POST (create patient, user, hospital) |
| 204 | No Content | DELETE |
| 400 | Bad Request | Duplicate data, business rule violation |
| 401 | Unauthorized | Missing/invalid/expired JWT |
| 403 | Forbidden | Insufficient role |
| 404 | Not Found | Resource doesn't exist |
| 422 | Validation Error | Pydantic validation failed |
| 500 | Server Error | Unhandled exception |

### Frontend Error Handling Pattern

```typescript
try {
  const result = await patientService.createPatient(data);
  // success
} catch (err: any) {
  if (err.response?.status === 422) {
    // Validation errors — err.response.data.detail is an array
    const errors = err.response.data.detail;
  } else {
    // General error — err.response.data.detail is a string
    const message = err.response?.data?.detail || 'An error occurred';
  }
}
```

---

## 15. Pages & Their API Dependencies

### Login Page
| API Call | When |
|----------|------|
| `POST /auth/login` | Form submit |

**State:** username, password, error message, loading  
**On success:** Save auth data → navigate to `/dashboard`

---

### Dashboard Page
No API calls — displays user info from `useAuth()` context.

---

### Patient Registration Page (Register)
| API Call | When |
|----------|------|
| `POST /patients` | Form submit |

**On success:** Show success with PRN → link to view patient  
**Form uses:** `patientSchema` (Zod), all dropdown constants

---

### Patient List Page
| API Call | When |
|----------|------|
| `GET /patients?page=X&limit=Y&search=Z` | On load, on page change, on search |
| `DELETE /patients/{id}` | Delete button click (with confirmation) |

**Displays:** Table with PRN, name, mobile, email, blood group, date, actions  
**Features:** Search input (debounced), pagination controls, view/delete per row

---

### Patient Detail Page
| API Call | When |
|----------|------|
| `GET /patients/{id}` | On load |

**Displays:** Full patient info (personal, contact, address, emergency, metadata)  
**Links to:** ID card page, edit (if implementing)

---

### Patient ID Card Page
| API Call | When |
|----------|------|
| `GET /patients/{id}` | On load (for patient data) |
| `GET /hospital` | On load (for hospital branding info) |
| `POST /patients/{id}/email-id-card` | "Email" button click |

**Features:** Print button (`window.print()`), email button  
**Layout:** Front card (patient info) + Back card (hospital info)

---

### User Management Page (Super Admin)
| API Call | When |
|----------|------|
| `GET /users?page=X&limit=Y&search=Z` | On load, pagination, search |
| `POST /users?send_email=X` | Create user modal submit |
| `PUT /users/{id}` | Edit user modal submit |
| `DELETE /users/{id}` | Delete button (with confirmation) |
| `POST /users/{id}/reset-password?send_email=X` | Reset password modal submit |
| `POST /users/{id}/send-password` | Send password button |

**Features:** User table, create/edit/delete modals, password reset modal, search, pagination

---

### Hospital Setup Page (Admin/Super Admin)
| API Call | When |
|----------|------|
| `GET /hospital/status` | On load (check if already configured) |
| `POST /hospital` | Form submit (first-time setup) |
| `POST /hospital/logo` | Logo file selected |

**Redirect:** If already configured → redirect to Hospital Profile

---

### Hospital Profile Page (Admin/Super Admin)
| API Call | When |
|----------|------|
| `GET /hospital/full` | On load |
| `PUT /hospital` | Save changes |
| `POST /hospital/logo` | Upload new logo |
| `DELETE /hospital/logo` | Delete logo |
| `GET /hospital/logo` | Display current logo (as img src) |

**Features:** View mode (default) → Edit mode (toggle), logo preview/upload/delete

---

## Quick Start Checklist for New Frontend

1. **Install dependencies:** axios, react-router-dom, react-hook-form, zod, @hookform/resolvers, date-fns, and your UI library
2. **Copy files from this document:** `types/`, `services/`, `contexts/AuthContext`, `utils/validation.ts`, `utils/constants.ts`
3. **Set up routing:** Login (public), all others wrapped in ProtectedRoute
4. **Set up AuthProvider** at root level wrapping Router
5. **Set environment variable:** `VITE_API_BASE_URL=http://localhost:8000/api/v1`
6. **Build pages** using the API calls listed per page in Section 15
7. **Handle errors** using the pattern in Section 14
8. **Apply role-based visibility** using rules in Section 13
9. **Default login:** `superadmin` / `<see seed_data.sql comments — change after first login>`
