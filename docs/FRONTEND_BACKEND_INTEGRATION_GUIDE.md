# Hospital Management System — Frontend-Backend Integration Guide

> **Purpose**: This document contains EVERYTHING needed to integrate a new frontend UI with the existing HMS backend. Use this in a new chat to implement all API connections, services, types, auth, and data flows.

---

## TABLE OF CONTENTS

1. [Architecture Overview](#1-architecture-overview)
2. [Backend Base URL & CORS](#2-backend-base-url--cors)
3. [Authentication System](#3-authentication-system)
4. [All API Endpoints (21 Total)](#4-all-api-endpoints-21-total)
5. [Endpoint Details with Request/Response Schemas](#5-endpoint-details-with-requestresponse-schemas)
6. [TypeScript Types (Copy-Paste Ready)](#6-typescript-types-copy-paste-ready)
7. [Service Layer Files (Copy-Paste Ready)](#7-service-layer-files-copy-paste-ready)
8. [AuthContext Provider](#8-authcontext-provider)
9. [Validation Schemas (Zod)](#9-validation-schemas-zod)
10. [Constants & Dropdown Data](#10-constants--dropdown-data)
11. [File Uploads (Photo & PDF)](#11-file-uploads-photo--pdf)
12. [Error Handling Patterns](#12-error-handling-patterns)
13. [Pagination & Search](#13-pagination--search)
14. [Role-Based Access Control](#14-role-based-access-control)
15. [Photo URL Construction](#15-photo-url-construction)
16. [Patient ID Card (Print & Email)](#16-patient-id-card-print--email)
17. [Environment Variables](#17-environment-variables)
18. [Page-to-Endpoint Mapping](#18-page-to-endpoint-mapping)
19. [Database Schema Reference](#19-database-schema-reference)
20. [Setup & Running](#20-setup--running)

---

## 1. Architecture Overview

```
Frontend (React + Vite)          Backend (FastAPI + Python)         Database (PostgreSQL 15+)
┌─────────────────────┐        ┌──────────────────────────┐      ┌───────────────────────┐
│  React 19 + TS 5.3  │──API──▶│  FastAPI 0.109.0         │─────▶│  hospital_management  │
│  Tailwind CSS 3.4   │◀──────│  SQLAlchemy 2.0.25       │      │  Tables:              │
│  Axios HTTP Client  │        │  Pydantic 2.5.3          │      │  - users              │
│  react-hook-form    │        │  bcrypt + python-jose JWT│      │  - patients           │
│  Zod validation     │        │  xhtml2pdf (PDF emails)  │      │  - audit_logs         │
│  Port: 3000/5173    │        │  Port: 8000              │      │  - refresh_tokens     │
└─────────────────────┘        └──────────────────────────┘      └───────────────────────┘
```

- **Auth**: Stateless JWT Bearer tokens (HS256), stored in `localStorage`
- **API prefix**: All endpoints under `/api/v1/`
- **Uploaded files**: Served at `/uploads/` (static mount)
- **CORS**: `http://localhost:3000` and `http://localhost:5173` allowed

---

## 2. Backend Base URL & CORS

| Setting | Value |
|---------|-------|
| Backend URL | `http://localhost:8000` |
| API Base | `http://localhost:8000/api/v1` |
| API Docs (Swagger) | `http://localhost:8000/api/docs` |
| API Docs (ReDoc) | `http://localhost:8000/api/redoc` |
| Static files (photos) | `http://localhost:8000/uploads/` |
| CORS Origins | `["http://localhost:3000", "http://localhost:5173"]` |

The frontend should set `VITE_API_BASE_URL=http://localhost:8000/api/v1` (or use proxy).

---

## 3. Authentication System

### How It Works
1. User submits `username` + `password` to `POST /api/v1/auth/login`
2. Backend returns JWT `access_token` + user object
3. Frontend stores `access_token` in `localStorage` key `"access_token"` and user object in `"user"`
4. Every subsequent API request includes header: `Authorization: Bearer <token>`
5. On 401 response, clear localStorage and redirect to `/login`

### JWT Token Details
- **Algorithm**: HS256
- **Expiry**: 60 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- **Payload**: `{ user_id, username, role, exp, type: "access" }`

### Token Refresh
- Call `POST /api/v1/auth/refresh` with current valid token to get a new one
- No refresh token rotation implemented — just re-issues access token

### localStorage Keys
| Key | Value |
|-----|-------|
| `access_token` | JWT string |
| `user` | JSON stringified user object `{ id, username, email, full_name, role }` |

---

## 4. All API Endpoints (21 Total)

### Auth (4 endpoints) — No role restriction (any authenticated user)

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 1 | POST | `/api/v1/auth/login` | ❌ No | Login, returns JWT + user |
| 2 | POST | `/api/v1/auth/change-password` | ✅ Yes | Change own password |
| 3 | POST | `/api/v1/auth/logout` | ✅ Yes | Logout (client discards token) |
| 4 | POST | `/api/v1/auth/refresh` | ✅ Yes | Get fresh access token |

### Patients (7 endpoints) — Any authenticated user

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 5 | POST | `/api/v1/patients` | ✅ Yes | Create patient (auto-generates PRN) |
| 6 | GET | `/api/v1/patients` | ✅ Yes | List patients (paginated + searchable) |
| 7 | GET | `/api/v1/patients/{patient_id}` | ✅ Yes | Get single patient |
| 8 | PUT | `/api/v1/patients/{patient_id}` | ✅ Yes | Update patient |
| 9 | DELETE | `/api/v1/patients/{patient_id}` | ✅ Yes | Soft-delete patient |
| 10 | POST | `/api/v1/patients/{patient_id}/photo` | ✅ Yes | Upload patient photo |
| 11 | POST | `/api/v1/patients/{patient_id}/email-id-card` | ✅ Yes | Email ID card to patient |

### Users (7 endpoints) — Super Admin only

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 12 | GET | `/api/v1/users` | ✅ super_admin | List all users |
| 13 | POST | `/api/v1/users?send_email={bool}` | ✅ super_admin | Create user |
| 14 | GET | `/api/v1/users/{user_id}` | ✅ super_admin | Get user by ID |
| 15 | PUT | `/api/v1/users/{user_id}` | ✅ super_admin | Update user |
| 16 | DELETE | `/api/v1/users/{user_id}` | ✅ super_admin | Soft-delete user |
| 17 | POST | `/api/v1/users/{user_id}/reset-password?send_email={bool}` | ✅ super_admin | Reset password |
| 18 | POST | `/api/v1/users/{user_id}/send-password` | ✅ super_admin | Set password & email it |

### Config & Health (3 endpoints) — No auth required

| # | Method | Endpoint | Auth | Description |
|---|--------|----------|------|-------------|
| 19 | GET | `/` | ❌ No | App info |
| 20 | GET | `/health` | ❌ No | Health check |
| 21 | GET | `/api/v1/config/hospital` | ❌ No | Hospital details for ID cards |

---

## 5. Endpoint Details with Request/Response Schemas

### 5.1 POST `/api/v1/auth/login`

**No auth required.**

Request body:
```json
{
  "username": "string",
  "password": "string"
}
```

Success response (200):
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

Error (401): `{ "detail": "Incorrect username or password" }`
Error (403): `{ "detail": "Account is inactive" }`

---

### 5.2 POST `/api/v1/auth/change-password`

**Auth required.** Changes the current user's own password.

Request body:
```json
{
  "current_password": "string",
  "new_password": "string"
}
```

**Password rules** (enforced by backend):
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character from `!@#$%^&*(),.?":{}|<>`
- Must differ from current password

Success (200): `{ "message": "Password changed successfully" }`
Error (400): `{ "detail": "Current password is incorrect" }`
Error (400): `{ "detail": "New password must be different from current password" }`
Error (422): Validation errors array (see Error Handling section)

---

### 5.3 POST `/api/v1/auth/logout`

**Auth required.** Backend is stateless — just returns success. Frontend must clear localStorage.

Success (200): `{ "message": "Successfully logged out" }`

---

### 5.4 POST `/api/v1/auth/refresh`

**Auth required.** Returns a fresh JWT (does NOT require refresh token, just a valid access token).

Success (200):
```json
{
  "access_token": "new-jwt-string",
  "token_type": "bearer",
  "expires_in": 3600
}
```

---

### 5.5 POST `/api/v1/patients` — Create Patient

**Auth required.**

Request body (all fields):
```json
{
  "title": "Mr.",
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "1990-05-15",
  "gender": "Male",
  "blood_group": "O+",
  "country_code": "+91",
  "mobile_number": "9876543210",
  "email": "john@example.com",
  "address_line1": "123 Main St",
  "address_line2": "Apt 4B",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pin_code": "400001",
  "country": "India",
  "emergency_contact_name": "Jane Doe",
  "emergency_contact_country_code": "+91",
  "emergency_contact_mobile": "9876543211",
  "emergency_contact_relationship": "Wife"
}
```

**Field validations** (enforced by backend):
| Field | Rule |
|-------|------|
| `title` | One of: `Mr.`, `Mrs.`, `Ms.`, `Master`, `Dr.`, `Prof.`, `Baby` |
| `first_name` | 1-100 chars, required |
| `last_name` | 1-100 chars, required |
| `date_of_birth` | ISO date (`YYYY-MM-DD`), cannot be future, max age 150 |
| `gender` | One of: `Male`, `Female`, `Other` |
| `blood_group` | Optional. One of: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |
| `country_code` | Pattern `^\+[0-9]{1,4}$` (e.g., `+91`, `+1`). Default `+91` |
| `mobile_number` | Pattern `^\d{4,15}$` (digits only, 4-15 digits). **UNIQUE** |
| `email` | Optional. Valid email format. **UNIQUE** |
| `address_line1` | 5-255 chars, required |
| `address_line2` | Optional, max 255 chars |
| `city` | Optional, max 100 chars |
| `state` | Optional, max 100 chars |
| `pin_code` | Optional, pattern `^[A-Za-z0-9 \-]{3,10}$` |
| `country` | Optional, max 100 chars. Default `India` |
| `emergency_contact_name` | Optional, max 255 chars |
| `emergency_contact_country_code` | Optional, pattern `^\+[0-9]{1,4}$`. Default `+91` |
| `emergency_contact_mobile` | Optional, pattern `^\d{4,15}$` |
| `emergency_contact_relationship` | Optional. One of: `Father`, `Mother`, `Husband`, `Wife`, `Son`, `Daughter`, `Brother`, `Sister`, `Friend`, `Guardian`, `Other` |

Success (201) — Returns full `PatientResponse`:
```json
{
  "id": 1,
  "prn": "HMS-000001",
  "title": "Mr.",
  "first_name": "John",
  "last_name": "Doe",
  "full_name": "Mr. John Doe",
  "date_of_birth": "1990-05-15",
  "gender": "Male",
  "blood_group": "O+",
  "country_code": "+91",
  "mobile_number": "9876543210",
  "email": "john@example.com",
  "address_line1": "123 Main St",
  "address_line2": "Apt 4B",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pin_code": "400001",
  "country": "India",
  "emergency_contact_name": "Jane Doe",
  "emergency_contact_country_code": "+91",
  "emergency_contact_mobile": "9876543211",
  "emergency_contact_relationship": "Wife",
  "photo_url": null,
  "is_active": true,
  "created_at": "2026-02-15T10:30:00.000Z",
  "updated_at": "2026-02-15T10:30:00.000Z"
}
```

Error (400): `{ "detail": "A patient with this mobile number already exists" }`
Error (400): `{ "detail": "A patient with this email already exists" }`

---

### 5.6 GET `/api/v1/patients` — List Patients

**Auth required.** Query params for pagination and search.

Query parameters:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number (≥ 1) |
| `limit` | int | 10 | Items per page (1-100) |
| `search` | string | null | Search across first_name, last_name, mobile_number, email, prn |

Example: `GET /api/v1/patients?page=1&limit=10&search=praveen`

Success (200):
```json
{
  "total": 25,
  "page": 1,
  "limit": 10,
  "total_pages": 3,
  "data": [
    {
      "id": 1,
      "prn": "HMS-000001",
      "title": "Mr.",
      "first_name": "Praveen",
      "last_name": "S",
      "full_name": "Mr. Praveen S",
      "country_code": "+91",
      "mobile_number": "9876543210",
      "email": "praveen.s@example.com",
      "city": "Mumbai",
      "blood_group": "O+",
      "created_at": "2026-02-15T10:30:00.000Z"
    }
  ]
}
```

Note: List items have fewer fields than the full patient response. The `full_name` is computed on the response schema.

---

### 5.7 GET `/api/v1/patients/{patient_id}` — Get Patient

**Auth required.**

Success (200): Returns full `PatientResponse` (same shape as create response above).
Error (404): `{ "detail": "Patient not found" }`

---

### 5.8 PUT `/api/v1/patients/{patient_id}` — Update Patient

**Auth required.** Request body has the same shape as create (all fields in `PatientBase` required).

Success (200): Returns updated `PatientResponse`.
Error (400): `{ "detail": "Mobile number already exists" }`
Error (400): `{ "detail": "Email already exists" }`
Error (404): `{ "detail": "Patient not found" }`

---

### 5.9 DELETE `/api/v1/patients/{patient_id}` — Soft Delete

**Auth required.** Sets `is_active = false` (does not physically remove).

Success: **204 No Content** (empty body).
Error (404): `{ "detail": "Patient not found" }`

---

### 5.10 POST `/api/v1/patients/{patient_id}/photo` — Upload Photo

**Auth required.** Multipart form data.

Request: `multipart/form-data` with field `photo` (file)
- Allowed types: `image/jpeg`, `image/png`, `image/jpg`, `image/webp`
- Max size: 5 MB (configurable)
- Old photo is automatically deleted

Success (200): Returns full `PatientResponse` with updated `photo_url`.
Error (400): `{ "detail": "Invalid file type. Allowed: JPEG, PNG, WebP" }`
Error (400): `{ "detail": "File too large. Maximum size: 5MB" }`
Error (404): `{ "detail": "Patient not found" }`

---

### 5.11 POST `/api/v1/patients/{patient_id}/email-id-card` — Email ID Card

**Auth required.** Can optionally include a frontend-rendered PDF.

Request option A (no PDF — backend generates):
```
POST /api/v1/patients/{id}/email-id-card
Content-Type: application/json (or empty body)
```

Request option B (with frontend PDF):
```
POST /api/v1/patients/{id}/email-id-card
Content-Type: multipart/form-data
Field: pdf_file = <blob>
```

Success (200): `{ "message": "ID card sent to john@example.com" }`
Error (400): `{ "detail": "Patient does not have an email address" }`
Error (400): `{ "detail": "SMTP not configured..." }`
Error (404): `{ "detail": "Patient not found" }`

---

### 5.12 GET `/api/v1/users` — List Users (Super Admin)

**Auth required: super_admin role.**

Query params: `page`, `limit`, `search` (searches username, full_name, email).

Success (200):
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
      "last_login": "2026-02-15T10:00:00.000Z",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-02-15T10:00:00.000Z"
    }
  ]
}
```

Error (403): `{ "detail": "Super Admin access required" }`

---

### 5.13 POST `/api/v1/users?send_email=true` — Create User (Super Admin)

**Auth required: super_admin role.**

Request body:
```json
{
  "username": "doctor2",
  "email": "doctor2@hms.com",
  "password": "SecurePass@123",
  "full_name": "Dr. Smith",
  "role": "doctor"
}
```

**Field validations**:
| Field | Rule |
|-------|------|
| `username` | 3-50 chars, only letters/numbers/underscores, auto-lowercased. **UNIQUE** |
| `email` | Valid email. **UNIQUE** |
| `password` | 8-128 chars, must have uppercase + lowercase + digit + special char |
| `full_name` | 1-255 chars |
| `role` | One of: `super_admin`, `admin`, `doctor`, `nurse`, `staff`, `receptionist`, `pharmacist`, `cashier`, `inventory_manager` |

Query param: `send_email` (bool, default `true`) — sends credentials via email if SMTP configured.

Success (201): Returns `UserResponse`.
Error (400): `{ "detail": "Username already exists" }`
Error (400): `{ "detail": "Email already exists" }`

---

### 5.14 GET `/api/v1/users/{user_id}` — Get User (Super Admin)

Success (200): Returns `UserResponse`.
Error (404): `{ "detail": "User not found" }`

---

### 5.15 PUT `/api/v1/users/{user_id}` — Update User (Super Admin)

Request body (all optional):
```json
{
  "email": "newemail@hms.com",
  "full_name": "Updated Name",
  "role": "admin",
  "is_active": true
}
```

Success (200): Returns updated `UserResponse`.
Error (400): `{ "detail": "Email already exists" }`
Error (404): `{ "detail": "User not found" }`

---

### 5.16 DELETE `/api/v1/users/{user_id}` — Delete User (Super Admin)

Soft-deletes user (sets `is_active = false`).

Success: **204 No Content**.
Error (400): `{ "detail": "Cannot delete your own account" }`
Error (400): `{ "detail": "Cannot delete the last Super Admin account" }`
Error (404): `{ "detail": "User not found" }`

---

### 5.17 POST `/api/v1/users/{user_id}/reset-password?send_email=false` — Reset Password

**Auth required: super_admin role.**

Request body:
```json
{
  "new_password": "NewSecurePass@456"
}
```

Password validation: same rules as user creation.

Query param: `send_email` (bool, default `false`) — emails new password to user.

Success (200):
```json
{
  "message": "Password reset successfully",
  "email_sent": false
}
```

---

### 5.18 POST `/api/v1/users/{user_id}/send-password`

**Auth required: super_admin role.** Sets new password AND sends it via email.

Request body:
```json
{
  "new_password": "NewSecurePass@789"
}
```

Success (200):
```json
{
  "message": "Password updated and sent via email",
  "email_sent": true
}
```

---

### 5.19 GET `/` — Root

No auth. Returns:
```json
{
  "name": "Hospital Management System",
  "version": "1.0.0",
  "status": "operational"
}
```

---

### 5.20 GET `/health`

No auth. Returns: `{ "status": "healthy" }`

---

### 5.21 GET `/api/v1/config/hospital` — Hospital Config

No auth. Returns hospital details for ID cards and reports:
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

## 6. TypeScript Types (Copy-Paste Ready)

### `types/auth.ts`
```typescript
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'doctor' | 'nurse' | 'staff' | 'receptionist' | 'pharmacist' | 'cashier' | 'inventory_manager';
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

### `types/patient.ts`
```typescript
export interface Patient {
  id?: number;
  prn?: string;
  title: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;      // "YYYY-MM-DD"
  gender: 'Male' | 'Female' | 'Other';
  blood_group?: string;
  country_code: string;        // "+91"
  mobile_number: string;       // digits only "9876543210"
  email?: string;
  address_line1: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_country_code?: string;
  emergency_contact_mobile?: string;
  emergency_contact_relationship?: string;
  photo_url?: string;          // "/uploads/photos/HMS-000001_abc123.jpg"
  full_name?: string;          // computed: "Mr. John Doe"
  is_active?: boolean;
  created_at?: string;         // ISO datetime
  updated_at?: string;         // ISO datetime
}

export interface PatientListItem {
  id: number;
  prn: string;
  title: string;
  first_name: string;
  last_name: string;
  full_name: string;           // computed: "Mr. John Doe"
  country_code: string;
  mobile_number: string;
  email?: string;
  city?: string;
  blood_group?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: T[];
}
```

### `types/user.ts`
```typescript
export interface UserData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: string;
}

export interface UserUpdateData {
  email?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export interface PasswordResetData {
  new_password: string;
}

export interface UserListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: UserData[];
}
```

---

## 7. Service Layer Files (Copy-Paste Ready)

### `services/api.ts` — Axios Instance with Auth Interceptor

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// On 401, clear auth and redirect to login
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

### `services/authService.ts`

```typescript
import api from './api';
import { LoginCredentials, AuthResponse } from '../types/auth';

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors during logout
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },

  async refreshToken(): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const response = await api.post('/auth/refresh');
    return response.data;
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

### `services/patientService.ts`

```typescript
import api from './api';
import { Patient, PatientListItem, PaginatedResponse } from '../types/patient';

export const patientService = {
  async createPatient(patient: Omit<Patient, 'id' | 'prn' | 'full_name' | 'photo_url' | 'is_active' | 'created_at' | 'updated_at'>): Promise<Patient> {
    const response = await api.post<Patient>('/patients', patient);
    return response.data;
  },

  async getPatient(id: number): Promise<Patient> {
    const response = await api.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  async listPatients(
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<PaginatedResponse<PatientListItem>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    const response = await api.get<PaginatedResponse<PatientListItem>>(
      `/patients?${params.toString()}`
    );
    return response.data;
  },

  async updatePatient(id: number, patient: Omit<Patient, 'id' | 'prn' | 'full_name' | 'photo_url' | 'is_active' | 'created_at' | 'updated_at'>): Promise<Patient> {
    const response = await api.put<Patient>(`/patients/${id}`, patient);
    return response.data;
  },

  async deletePatient(id: number): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  async uploadPhoto(id: number, file: File): Promise<Patient> {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post<Patient>(`/patients/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async emailIdCard(id: number, pdfBlob?: Blob): Promise<{ message: string }> {
    if (pdfBlob) {
      const formData = new FormData();
      formData.append('pdf_file', pdfBlob, 'ID-Card.pdf');
      const response = await api.post<{ message: string }>(
        `/patients/${id}/email-id-card`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    }
    const response = await api.post<{ message: string }>(`/patients/${id}/email-id-card`);
    return response.data;
  },
};
```

### `services/userService.ts`

```typescript
import api from './api';
import {
  UserData,
  UserCreateData,
  UserUpdateData,
  PasswordResetData,
  UserListResponse,
} from '../types/user';

export const userService = {
  async listUsers(
    page = 1,
    limit = 10,
    search?: string
  ): Promise<UserListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) params.append('search', search);
    const response = await api.get<UserListResponse>(
      `/users?${params.toString()}`
    );
    return response.data;
  },

  async getUser(id: number): Promise<UserData> {
    const response = await api.get<UserData>(`/users/${id}`);
    return response.data;
  },

  async createUser(user: UserCreateData, sendEmail = true): Promise<UserData> {
    const response = await api.post<UserData>(
      `/users?send_email=${sendEmail}`,
      user
    );
    return response.data;
  },

  async updateUser(id: number, user: UserUpdateData): Promise<UserData> {
    const response = await api.put<UserData>(`/users/${id}`, user);
    return response.data;
  },

  async deleteUser(id: number): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async resetPassword(
    id: number,
    data: PasswordResetData,
    sendEmail = false
  ): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(
      `/users/${id}/reset-password?send_email=${sendEmail}`,
      data
    );
    return response.data;
  },

  async sendPassword(
    id: number,
    data: PasswordResetData
  ): Promise<{ message: string; email_sent: boolean }> {
    const response = await api.post(`/users/${id}/send-password`, data);
    return response.data;
  },
};
```

---

## 8. AuthContext Provider

```tsx
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
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
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
    setState({
      user: response.user,
      token: response.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
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
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

---

## 9. Validation Schemas (Zod)

```typescript
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

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one digit')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Must contain at least one special character'),
  confirm_password: z.string(),
}).refine(data => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

export const userCreateSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores'),
  email: z.string().email('Invalid email'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain a digit')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Must contain special character'),
  full_name: z.string().min(1, 'Full name is required').max(255),
  role: z.enum([
    'super_admin', 'admin', 'doctor', 'nurse', 'staff',
    'receptionist', 'pharmacist', 'cashier', 'inventory_manager',
  ]),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type PatientFormData = z.infer<typeof patientSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type UserCreateFormData = z.infer<typeof userCreateSchema>;
```

---

## 10. Constants & Dropdown Data

### Core Options (match backend enums exactly)

```typescript
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;

export const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'] as const;

export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const RELATIONSHIP_OPTIONS = [
  'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
  'Brother', 'Sister', 'Friend', 'Guardian', 'Other',
] as const;

export const USER_ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'staff', label: 'Staff' },
] as const;
```

### Country & Phone Code Data (38 Countries)

```typescript
export interface CountryInfo {
  name: string;
  code: string;         // ISO 2-letter code
  phoneCode: string;    // e.g., "+91"
  postalCodeLabel: string;
  states: string[];     // empty = free text input for state
}

export const COUNTRIES: CountryInfo[] = [
  {
    name: 'India', code: 'IN', phoneCode: '+91', postalCodeLabel: 'PIN Code',
    states: [
      'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
      'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
      'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
      'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
      'Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
      'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh',
      'Lakshadweep','Puducherry',
    ],
  },
  {
    name: 'United States', code: 'US', phoneCode: '+1', postalCodeLabel: 'ZIP Code',
    states: [
      'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
      'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
      'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
      'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
      'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
      'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
      'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
      'Wisconsin','Wyoming','District of Columbia',
    ],
  },
  {
    name: 'United Kingdom', code: 'GB', phoneCode: '+44', postalCodeLabel: 'Postcode',
    states: ['England','Scotland','Wales','Northern Ireland','Greater London','Greater Manchester','West Midlands','West Yorkshire','South Yorkshire','Merseyside','Tyne and Wear'],
  },
  {
    name: 'Canada', code: 'CA', phoneCode: '+1', postalCodeLabel: 'Postal Code',
    states: ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon'],
  },
  {
    name: 'Australia', code: 'AU', phoneCode: '+61', postalCodeLabel: 'Postcode',
    states: ['Australian Capital Territory','New South Wales','Northern Territory','Queensland','South Australia','Tasmania','Victoria','Western Australia'],
  },
  {
    name: 'United Arab Emirates', code: 'AE', phoneCode: '+971', postalCodeLabel: 'Postal Code',
    states: ['Abu Dhabi','Ajman','Dubai','Fujairah','Ras Al Khaimah','Sharjah','Umm Al Quwain'],
  },
  {
    name: 'Saudi Arabia', code: 'SA', phoneCode: '+966', postalCodeLabel: 'Postal Code',
    states: ['Riyadh','Makkah','Madinah','Eastern Province','Asir','Tabuk','Hail','Northern Borders','Jazan','Najran','Al Bahah','Al Jawf','Qassim'],
  },
  {
    name: 'Germany', code: 'DE', phoneCode: '+49', postalCodeLabel: 'Postleitzahl',
    states: ['Baden-Württemberg','Bavaria','Berlin','Brandenburg','Bremen','Hamburg','Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia','Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt','Schleswig-Holstein','Thuringia'],
  },
  {
    name: 'Malaysia', code: 'MY', phoneCode: '+60', postalCodeLabel: 'Postcode',
    states: ['Johor','Kedah','Kelantan','Malacca','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Sabah','Sarawak','Selangor','Terengganu','Kuala Lumpur','Labuan','Putrajaya'],
  },
  {
    name: 'Nepal', code: 'NP', phoneCode: '+977', postalCodeLabel: 'Postal Code',
    states: ['Province No. 1','Madhesh Province','Bagmati Province','Gandaki Province','Lumbini Province','Karnali Province','Sudurpashchim Province'],
  },
  {
    name: 'Sri Lanka', code: 'LK', phoneCode: '+94', postalCodeLabel: 'Postal Code',
    states: ['Central','Eastern','North Central','Northern','North Western','Sabaragamuwa','Southern','Uva','Western'],
  },
  {
    name: 'Bangladesh', code: 'BD', phoneCode: '+880', postalCodeLabel: 'Postal Code',
    states: ['Barishal','Chattogram','Dhaka','Khulna','Mymensingh','Rajshahi','Rangpur','Sylhet'],
  },
  {
    name: 'Pakistan', code: 'PK', phoneCode: '+92', postalCodeLabel: 'Postal Code',
    states: ['Punjab','Sindh','Khyber Pakhtunkhwa','Balochistan','Islamabad Capital Territory','Gilgit-Baltistan','Azad Kashmir'],
  },
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

// Helper: deduplicated phone codes for country code dropdown
export const COUNTRY_CODE_OPTIONS = COUNTRIES.map((c) => ({
  code: c.phoneCode,
  label: `${c.phoneCode} (${c.name})`,
  country: c.name,
})).filter((v, i, a) => a.findIndex((t) => t.code === v.code) === i);

// Helper: get states for a country
export function getStatesForCountry(countryName: string): string[] {
  return COUNTRIES.find((c) => c.name === countryName)?.states || [];
}

// Helper: get postal code label for a country
export function getPostalCodeLabel(countryName: string): string {
  return COUNTRIES.find((c) => c.name === countryName)?.postalCodeLabel || 'Postal Code';
}

// Helper: get phone code for a country
export function getPhoneCodeForCountry(countryName: string): string {
  return COUNTRIES.find((c) => c.name === countryName)?.phoneCode || '+1';
}
```

---

## 11. File Uploads (Photo & PDF)

### Patient Photo Upload

```typescript
// Upload a photo for patient ID 5
const file: File = /* from <input type="file"> */;
const updatedPatient = await patientService.uploadPhoto(5, file);
// updatedPatient.photo_url = "/uploads/photos/HMS-000005_abc123.jpg"
```

**Backend constraints**:
- Allowed MIME types: `image/jpeg`, `image/png`, `image/jpg`, `image/webp`
- Max size: 5 MB
- File field name in FormData: `photo`
- Stored at `backend/uploads/photos/`
- Old photo auto-deleted when uploading new one

### Email ID Card with PDF

```typescript
// Option A: Let backend generate PDF
await patientService.emailIdCard(5);

// Option B: Send frontend-generated PDF
const pdfBlob = /* generated via html2canvas + jsPDF */;
await patientService.emailIdCard(5, pdfBlob);
```

**FormData field name**: `pdf_file`

---

## 12. Error Handling Patterns

### Standard Error Response

Most errors return:
```json
{
  "detail": "Human-readable error message"
}
```

### Validation Error (422)

Pydantic validation errors return:
```json
{
  "detail": [
    {
      "loc": ["body", "mobile_number"],
      "msg": "Enter a valid phone number (digits only, 4-15 digits)",
      "type": "value_error"
    }
  ]
}
```

### How to Handle in Frontend

```typescript
try {
  await patientService.createPatient(formData);
} catch (error: any) {
  if (error.response) {
    const status = error.response.status;
    const detail = error.response.data?.detail;

    if (status === 422 && Array.isArray(detail)) {
      // Validation errors - show field-specific messages
      detail.forEach((err: any) => {
        const field = err.loc?.[err.loc.length - 1];
        const message = err.msg;
        // Set form error for `field` with `message`
      });
    } else if (typeof detail === 'string') {
      // Business logic error (400, 404, etc.)
      toast.error(detail);
    }
  }
}
```

### HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (new patient/user) |
| 204 | No Content (delete success — empty body) |
| 400 | Bad request (business logic error) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (inactive account or insufficient role) |
| 404 | Not found |
| 422 | Validation error (field-level) |
| 500 | Server error |

---

## 13. Pagination & Search

Both patient list and user list use the same pagination pattern:

### Request
```
GET /api/v1/patients?page=2&limit=10&search=john
```

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `page` | int | 1 | ≥ 1 |
| `limit` | int | 10 | 1-100 |
| `search` | string | null | Optional text to search |

### Response Structure
```json
{
  "total": 56,        // total matching records
  "page": 2,          // current page
  "limit": 10,        // items per page
  "total_pages": 6,   // ceil(total / limit)
  "data": [...]       // array of items
}
```

### Search Fields
- **Patients**: `first_name`, `last_name`, `mobile_number`, `email`, `prn` (case-insensitive partial match)
- **Users**: `username`, `full_name`, `email` (case-insensitive partial match)

---

## 14. Role-Based Access Control

### 9 Available Roles

| Role | Key | Access Level |
|------|-----|-------------|
| Super Admin | `super_admin` | Full access + User Management |
| Admin | `admin` | System administration |
| Doctor | `doctor` | Clinical access |
| Nurse | `nurse` | Nursing access |
| Receptionist | `receptionist` | Front desk operations |
| Pharmacist | `pharmacist` | Pharmacy operations |
| Cashier | `cashier` | Billing operations |
| Inventory Manager | `inventory_manager` | Inventory management |
| Staff | `staff` | General staff access |

### Backend Route Protection

| Dependency | Who Can Access |
|------------|---------------|
| `get_current_active_user` | Any authenticated + active user |
| `require_super_admin` | Only `super_admin` role |

### Frontend Role Checks

```typescript
const { user } = useAuth();

// Check if user is super admin
const isSuperAdmin = user?.role === 'super_admin';

// Show/hide User Management menu item
{isSuperAdmin && <Link to="/users">User Management</Link>}

// Protect route
<Route path="/users" element={
  user?.role === 'super_admin' ? <UserManagement /> : <Navigate to="/dashboard" />
} />
```

---

## 15. Photo URL Construction

The backend returns `photo_url` as a relative path like `/uploads/photos/HMS-000001_abc123.jpg`.

To display the photo, prepend the backend base URL:

```typescript
const BACKEND_URL = 'http://localhost:8000';

function getPhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  return `${BACKEND_URL}${photoUrl}`;
}

// Usage in JSX:
{patient.photo_url ? (
  <img src={getPhotoUrl(patient.photo_url)} alt={patient.full_name} />
) : (
  <div className="placeholder-avatar">No Photo</div>
)}
```

---

## 16. Patient ID Card (Print & Email)

### Data Needed for ID Card

From `GET /api/v1/patients/{id}`:
- `prn` — Patient Reference Number (e.g., "HMS-000001")
- `title`, `first_name`, `last_name` → full name
- `date_of_birth` → DOB and age calculation
- `gender`
- `blood_group`
- `country_code`, `mobile_number` → full phone number
- `emergency_contact_name`, `emergency_contact_relationship`, `emergency_contact_mobile`
- `photo_url` → patient photo

From `GET /api/v1/config/hospital`:
- Hospital name, address, city, state, country, pin_code, phone, email, website

### Print Functionality
Use `window.print()` with a print-specific CSS media query, or use `html2canvas` + `jsPDF`:

```typescript
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

async function generatePdf(elementRef: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(elementRef, { scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', [120, 170]);  // custom card size
  pdf.addImage(imgData, 'PNG', 0, 0, 120, 170);
  return pdf.output('blob');
}
```

### Email ID Card
```typescript
const pdfBlob = await generatePdf(cardElement);
await patientService.emailIdCard(patient.id, pdfBlob);
```

---

## 17. Environment Variables

### Frontend `.env`
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Backend `.env` (reference)
```env
# Database
DATABASE_URL=postgresql://hospital_admin:<password>@localhost:5432/hospital_management

# Security
SECRET_KEY=<random-32+-char-string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]

# PRN
PRN_PREFIX=HMS

# Pagination
DEFAULT_PAGE_SIZE=10
MAX_PAGE_SIZE=100

# File Uploads
MAX_PHOTO_SIZE_MB=5

# SMTP (for email features)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Hospital Management System

# Hospital Details (shown on ID cards)
HOSPITAL_NAME=City General Hospital
HOSPITAL_ADDRESS=123 Medical Center Road
HOSPITAL_CITY=Mumbai
HOSPITAL_STATE=Maharashtra
HOSPITAL_COUNTRY=India
HOSPITAL_PIN_CODE=400001
HOSPITAL_PHONE=+91 22 1234 5678
HOSPITAL_EMAIL=info@hospital.com
HOSPITAL_WEBSITE=www.hospital.com
```

---

## 18. Page-to-Endpoint Mapping

| Frontend Page | Endpoints Used | Notes |
|---------------|---------------|-------|
| **Login** | `POST /auth/login` | Store token + user in localStorage |
| **Dashboard** | None (uses stored user data) | Show role-based cards; user mgmt card only for super_admin |
| **Patient Register** | `POST /patients` | Auto-generates PRN on backend |
| **Patient List** | `GET /patients?page=&limit=&search=` | Paginated table with search |
| **Patient Detail** | `GET /patients/{id}` | Full patient info display |
| **Patient Edit** | `GET /patients/{id}`, `PUT /patients/{id}` | Fetch then update |
| **Patient Photo** | `POST /patients/{id}/photo` | Multipart file upload |
| **Patient ID Card** | `GET /patients/{id}`, `GET /config/hospital` | Print/email card |
| **Email ID Card** | `POST /patients/{id}/email-id-card` | Optional PDF attachment |
| **Change Password** | `POST /auth/change-password` | Current + new password |
| **Profile** | None (uses stored user data) | Display logged-in user info |
| **User Management** | `GET /users`, `POST /users`, `PUT /users/{id}`, `DELETE /users/{id}`, `POST /users/{id}/reset-password`, `POST /users/{id}/send-password` | Super Admin only |
| **Logout** | `POST /auth/logout` | Clear localStorage, redirect to login |

---

## 19. Database Schema Reference

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_role CHECK (role IN (
      'super_admin','admin','doctor','nurse','staff',
      'receptionist','pharmacist','cashier','inventory_manager'
    ))
);
```

### Patients Table
```sql
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    prn VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(10) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    blood_group VARCHAR(5),
    country_code VARCHAR(5) NOT NULL DEFAULT '+91',
    mobile_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pin_code VARCHAR(10),
    country VARCHAR(100) DEFAULT 'India',
    emergency_contact_name VARCHAR(255),
    emergency_contact_country_code VARCHAR(5) DEFAULT '+91',
    emergency_contact_mobile VARCHAR(15),
    emergency_contact_relationship VARCHAR(50),
    photo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_title CHECK (title IN ('Mr.','Mrs.','Ms.','Master','Dr.','Prof.','Baby')),
    CONSTRAINT chk_gender CHECK (gender IN ('Male','Female','Other')),
    CONSTRAINT chk_blood_group CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') OR blood_group IS NULL),
    CONSTRAINT chk_mobile_format CHECK (mobile_number ~ '^\d{4,15}$'),
    CONSTRAINT chk_country_code CHECK (country_code ~ '^\+[0-9]{1,4}$'),
    CONSTRAINT chk_pin_code CHECK (pin_code ~ '^[A-Za-z0-9 \-]{3,10}$' OR pin_code IS NULL),
    CONSTRAINT chk_emergency_relationship CHECK (
      emergency_contact_relationship IN (
        'Father','Mother','Husband','Wife','Son','Daughter',
        'Brother','Sister','Friend','Guardian','Other'
      ) OR emergency_contact_relationship IS NULL
    )
);
```

### PRN Sequence
```sql
CREATE SEQUENCE prn_sequence START WITH 1 INCREMENT BY 1;
-- PRN format: {PREFIX}-{6-digit-number} → "HMS-000001"
```

### Audit Logs Table
```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL,  -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    user_id INTEGER REFERENCES users(id),
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Triggers
- `update_updated_at_column()` — Auto-updates `updated_at` on row UPDATE for users & patients
- `audit_trigger_function()` — Logs INSERT/UPDATE/DELETE on patients table to `audit_logs`

---

## 20. Setup & Running

### Prerequisites
- PostgreSQL 15+
- Python 3.11+
- Node.js 18+ and npm

### Database Setup
```bash
# 1. Create database & user (as postgres superuser)
psql -U postgres -f database/scripts/000_setup_database.sql

# 2. Create tables (as hospital_admin)
psql -U hospital_admin -d hospital_management -f database/scripts/001_create_schema.sql

# 3. Seed data
psql -U hospital_admin -d hospital_management -f database/seeds/seed_data.sql
```

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Create .env file with DATABASE_URL and SECRET_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Default Login
| Username | Role |
|----------|------|
| `superadmin` | Super Admin (can manage users) |
| `admin` | Admin |
| `doctor1` | Doctor |
| `nurse1` | Nurse |

> Seed passwords are bcrypt-hashed in `seed_data.sql`. Check your team's internal docs for the actual plaintext passwords set during seeding.

### Frontend Dependencies (package.json)
```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.3.4",
    "axios": "^1.6.5",
    "clsx": "^2.1.0",
    "date-fns": "^3.2.0",
    "html2canvas": "^1.4.1",
    "jspdf": "^4.1.0",
    "lucide-react": "^0.474.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.49.3",
    "react-router-dom": "^6.21.3",
    "tailwind-merge": "^2.2.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.11"
  }
}
```

### Vite Config (with proxy)
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

### Tailwind Config (sky-blue primary palette)
```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
          400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
          800: '#075985', 900: '#0c4a6e',
        },
      },
    },
  },
  plugins: [],
}
```

---

## Quick Reference Card

```
BASE URL:          http://localhost:8000/api/v1
AUTH HEADER:       Authorization: Bearer <jwt_token>
TOKEN STORAGE:     localStorage keys: "access_token", "user"
ON 401:            Clear localStorage → redirect /login
PHOTO BASE:        http://localhost:8000 + patient.photo_url
PAGINATION:        ?page=1&limit=10&search=term
ERRORS:            { "detail": "string" } or { "detail": [{ "loc": [...], "msg": "..." }] }
USER MGMT:         super_admin role only → 403 for others
SOFT DELETE:       Sets is_active=false, returns 204
PRN FORMAT:        HMS-000001 (auto-generated, read-only)
DATE FORMAT:       YYYY-MM-DD (ISO)
MOBILE FORMAT:     Digits only, 4-15 chars (no spaces, dashes, or country code prefix)
COUNTRY CODE:      Separate field, format: +XX (e.g., +91, +1, +44)
```
