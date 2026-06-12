# HMS (Hospital Management System) - Complete API Documentation

**Generated Date:** May 4, 2026  
**Version:** 1.0  
**Base URL:** `/api/v1`

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Authentication & Security](#authentication--security)
4. [API Response Format](#api-response-format)
5. [Authentication Endpoints](#authentication-endpoints)
6. [User Management Endpoints](#user-management-endpoints)
7. [Roles & Permissions Endpoints](#roles--permissions-endpoints)
8. [Patients Endpoints](#patients-endpoints)
9. [Doctors & Scheduling Endpoints](#doctors--scheduling-endpoints)
10. [Appointments Endpoints](#appointments-endpoints)
11. [Prescriptions Endpoints](#prescriptions-endpoints)
12. [Pharmacy Endpoints](#pharmacy-endpoints)
13. [Optical Store Endpoints](#optical-store-endpoints)
14. [Billing & Payments Endpoints](#billing--payments-endpoints)
15. [Insurance Endpoints](#insurance-endpoints)
16. [Inventory Endpoints](#inventory-endpoints)
17. [Reports Endpoints](#reports-endpoints)
18. [Notifications Endpoints](#notifications-endpoints)
19. [Administration Endpoints](#administration-endpoints)
20. [File Upload Endpoints](#file-upload-endpoints)
21. [WebSocket Endpoints](#websocket-endpoints)
22. [Rate Limiting](#rate-limiting)
23. [Error Handling](#error-handling)
24. [API Versioning](#api-versioning)

---

## Overview

The HMS (Hospital Management System) is a comprehensive healthcare management platform that provides REST APIs for managing:

- **Clinical Operations:** Patients, appointments, prescriptions, consultations
- **Billing & Payments:** Invoicing, payments, refunds, settlements
- **Pharmacy Management:** Medicines, batches, dispensing, counter sales
- **Optical Services:** Optical prescriptions, products, orders, repairs
- **Inventory Management:** Stock control, purchase orders, GRNs, adjustments
- **User Management:** Staff profiles, roles, permissions, authentication
- **Reports & Analytics:** Revenue, OPD statistics, pharmacy sales, stock aging
- **Notifications:** Email, SMS alerts, system notifications
- **Administration:** Hospital settings, tax configuration, audit logs

### Technology Stack

- **Backend:** FastAPI (Python), SQLAlchemy ORM
- **Database:** PostgreSQL
- **Authentication:** JWT tokens with optional MFA (TOTP)
- **File Storage:** MinIO (S3-compatible) in production, local filesystem in development
- **Real-time Communication:** WebSockets for live queue updates and notifications

### Key Principles

- **Single Hospital Instance:** Each deployment serves one hospital (multi-tenant via hospital_id)
- **Role-Based Access Control:** Fine-grained permissions system with module:action:resource pattern
- **Audit Trail:** All sensitive operations logged with user, timestamp, entity type
- **Soft Deletes:** No hard deletion; records marked as deleted with timestamp
- **API Versioning:** Current v1; breaking changes trigger v2 with deprecation period
- **Standardized Responses:** All endpoints return consistent JSON format with status, data, message, errors

---

## Getting Started

### Prerequisites

- Valid HMS user account
- Access credentials (email/username + password)
- Authorization header with Bearer token for protected endpoints
- (Optional) TOTP app if MFA enabled on account

### Quick Start Example

```bash
# 1. Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email_or_username": "doctor@hospital.com", "password": "P@ss123456"}'

# Response:
# {
#   "access_token": "eyJhbGc...",
#   "token_type": "bearer",
#   "expires_in": 3600,
#   "user": {...}
# }

# 2. Use token in subsequent requests
curl -X GET http://localhost:8000/api/v1/patients \
  -H "Authorization: Bearer eyJhbGc..."

# 3. If access token expires, refresh it
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "..."}'
```

### API Endpoints Documentation

All list endpoints support pagination and filtering:
```
GET /api/v1/endpoint?page=1&per_page=20&sort_by=created_at&sort_order=desc
```

---

## Authentication & Security

### Authorization Legend

| Symbol | Meaning | Description |
|--------|---------|-------------|
| 🔓 | Public | No authentication required |
| 🔒 | Authenticated | Any logged-in user |
| 👑 | Admin Only | Super Admin or Admin role required |
| 🏥 | Role-Specific | Specific hospital roles (Receptionist, Doctor, Pharmacist, etc.) |

### Security Features

1. **JWT Tokens:** Access tokens valid for 60 minutes (configurable)
2. **Refresh Tokens:** Stored in httpOnly cookies (cannot be accessed by JavaScript)
3. **MFA Support:** TOTP (Time-based One-Time Password) optional on all accounts
4. **Password Policy:**
   - Minimum 8 characters
   - At least 1 uppercase, 1 lowercase, 1 digit, 1 special character
   - Cannot match last 5 passwords
   - Cannot contain username or email
5. **Account Lockout:** 5 failed attempts = 15-min lock; 10 attempts = 1-hour lock
6. **Audit Trail:** All API calls logged with user, timestamp, action, entity
7. **Field Encryption:** Sensitive data (national IDs, passwords) encrypted at rest

### Standard Auth Header

```
Authorization: Bearer <access_token>
```

---

## API Response Format

### Success Response (200, 201)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Operation successful",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Smith",
    ...
  },
  "timestamp": "2026-02-15T10:30:00Z"
}
```

### Paginated Response

```json
{
  "success": true,
  "status_code": 200,
  "data": {
    "total": 250,
    "page": 1,
    "per_page": 20,
    "total_pages": 13,
    "items": [
      { "id": "...", "name": "..." },
      ...
    ]
  },
  "timestamp": "2026-02-15T10:30:00Z"
}
```

### Error Response (400, 401, 403, 500)

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "INVALID_EMAIL"
    },
    {
      "field": "password",
      "message": "Password too short",
      "code": "PASSWORD_TOO_SHORT"
    }
  ],
  "timestamp": "2026-02-15T10:30:00Z"
}
```

### Common HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Authenticated but no permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate entry, state conflict |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

---

## Authentication Endpoints

**Base Path:** `/auth`

### POST `/auth/login` — User Login

**Role Required:** 🔓 Public

**Request Body:**
```json
{
  "email_or_username": "doctor@hospital.com",
  "password": "SecureP@ss123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "dr.smith",
      "email": "doctor@hospital.com",
      "first_name": "John",
      "last_name": "Smith",
      "roles": ["doctor", "consultant"],
      "permissions": ["appointments:view", "prescriptions:create", ...],
      "hospital_id": "hospital-uuid",
      "hospital_name": "City General Hospital",
      "reference_number": "HCD262Z00003",
      "avatar_url": "https://..."
    }
  }
}
```

**Response (MFA Enabled):**
```json
{
  "success": true,
  "data": {
    "requires_mfa": true,
    "temp_token": "temp-jwt-token",
    "message": "Please verify your MFA code"
  }
}
```

**Error Responses:**
- 401: Invalid username or password
- 401: Account inactive
- 401: Account locked (too many failed attempts)

**Login Flow:**
1. POST `/auth/login` with credentials
2. If MFA enabled: returns `requires_mfa: true` + `temp_token`
3. POST `/auth/mfa/verify` with `temp_token` + TOTP code
4. Receive full token response with `access_token` and `refresh_token`
5. Store `access_token` in memory (NOT localStorage)
6. Store `refresh_token` in httpOnly cookie or secure storage
7. On 401 error, call POST `/auth/refresh` to get new token
8. If refresh fails, redirect to login

---

### POST `/auth/logout` — Logout User

**Role Required:** 🔒 Authenticated

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### POST `/auth/refresh` — Refresh Access Token

**Role Required:** 🔓 Public

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600
  }
}
```

**Use Case:** 
- Access token expired (401 response)
- Call this endpoint with stored refresh token
- Get new access token
- Retry original request

---

### POST `/auth/forgot-password` — Request Password Reset

**Role Required:** 🔓 Public

**Request Body:**
```json
{
  "email": "doctor@hospital.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

**Process:**
1. User provides email
2. System generates secure reset token (valid for 30 minutes)
3. Sends email with reset link: `https://hospital.com/reset-password?token=...`
4. User clicks link, enters new password
5. Frontend calls POST `/auth/reset-password` with token + new password

**Rate Limit:** 3 requests per hour per email

---

### POST `/auth/reset-password` — Reset Password with Token

**Role Required:** 🔓 Public

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "new_password": "NewSecure@Pass123",
  "confirm_password": "NewSecure@Pass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully. Please login with your new password."
}
```

**Validation:**
- Token must be valid and not expired
- Passwords must match
- New password must meet complexity requirements
- Cannot be same as last 5 passwords

**Rate Limit:** 5 requests per hour per token

---

### POST `/auth/change-password` — Change Own Password

**Role Required:** 🔒 Authenticated

**Request Body:**
```json
{
  "current_password": "OldSecure@Pass123",
  "new_password": "NewSecure@Pass456",
  "confirm_password": "NewSecure@Pass456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Validation:**
- Current password must match
- New password must be different from current
- New password must meet complexity requirements
- Cannot be same as last 5 passwords

---

### GET `/auth/me` — Get Current User Profile

**Role Required:** 🔒 Authenticated

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "dr.smith",
      "email": "doctor@hospital.com",
      "first_name": "John",
      "last_name": "Smith",
      "phone": "+12025551234",
      "roles": ["doctor"],
      "permissions": ["appointments:view", "prescriptions:create"],
      "hospital_id": "hospital-uuid",
      "reference_number": "HCD262Z00003",
      "avatar_url": "https://...",
      "preferred_locale": "en-US",
      "preferred_timezone": "America/New_York",
      "mfa_enabled": true,
      "last_login": "2026-02-15T10:30:00Z",
      "created_at": "2026-01-01T00:00:00Z"
    },
    "roles": [
      {
        "id": "role-uuid",
        "name": "doctor",
        "description": "Clinical staff with prescription rights"
      }
    ],
    "permissions": [
      "appointments:view",
      "appointments:create",
      "prescriptions:create",
      ...
    ]
  }
}
```

**Use Case:** 
- Initialize user profile in frontend
- Check user roles and permissions
- Display user information in header/profile page

---

### PUT `/auth/me` — Update Own Profile

**Role Required:** 🔒 Authenticated

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "phone": "+12025551234",
  "preferred_locale": "en-US",
  "preferred_timezone": "America/New_York"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "dr.smith",
    "email": "doctor@hospital.com",
    "first_name": "John",
    "last_name": "Smith",
    "phone": "+12025551234",
    "preferred_locale": "en-US",
    "preferred_timezone": "America/New_York",
    ...
  }
}
```

---

### POST `/auth/me/avatar` — Upload Profile Photo

**Role Required:** 🔒 Authenticated

**Request Type:** `multipart/form-data`

**Form Fields:**
- `avatar` (file): JPEG or PNG image, max 5MB

**Response:**
```json
{
  "success": true,
  "data": {
    "avatar_url": "https://storage.hospital.com/avatars/user-uuid-avatar.png"
  }
}
```

**Processing:**
- Auto-compressed to max 500KB
- Converted to PNG format
- Stored in cloud storage (MinIO/S3)
- Previous avatar deleted

---

### POST `/auth/mfa/enable` — Enable MFA (TOTP)

**Role Required:** 🔒 Authenticated

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEBLW64TMMQ======",
    "qr_code_url": "https://...",
    "backup_codes": [
      "12345678",
      "87654321",
      ...
    ]
  }
}
```

**Process:**
1. User calls this endpoint
2. System generates TOTP secret
3. Return secret + QR code URL + backup codes
4. User scans QR code in authenticator app (Google Authenticator, Authy, etc.)
5. User enters 6-digit code from app
6. Frontend calls POST `/auth/mfa/verify-setup` with code
7. If valid, MFA is enabled on account
8. Store backup codes securely (user prints/saves them)

---

### POST `/auth/mfa/verify` — Verify MFA Code During Login

**Role Required:** 🔓 Public

**Request Body:**
```json
{
  "temp_token": "temp-jwt-from-login",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {...}
  }
}
```

**Error Responses:**
- 401: Invalid code
- 401: Temp token expired (re-login required)
- 401: Code already used (TOTP is time-based; wait for next window)

---

### POST `/auth/mfa/disable` — Disable MFA

**Role Required:** 🔒 Authenticated

**Request Body:**
```json
{
  "password": "SecureP@ss123",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "MFA disabled successfully"
}
```

**Security:**
- Requires current password + valid TOTP code
- Prevents accidental disabling
- Logged in audit trail

---

## User Management Endpoints

**Base Path:** `/users`

### GET `/users` — List All Users

**Role Required:** 👑 Super Admin, Admin

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `per_page` (int): Items per page (default: 20, max: 100)
- `status` (string): `active` or `inactive`
- `role` (string): Filter by role (doctor, nurse, receptionist, pharmacist, etc.)
- `search` (string): Search by name, email, or reference_number
- `department_id` (uuid): Filter by department
- `sort_by` (string): Sort column (default: created_at)
- `sort_order` (string): `asc` or `desc` (default: desc)

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 125,
    "page": 1,
    "per_page": 20,
    "total_pages": 7,
    "items": [
      {
        "id": "user-uuid-1",
        "username": "dr.smith",
        "email": "doctor@hospital.com",
        "first_name": "John",
        "last_name": "Smith",
        "reference_number": "HCD262Z00003",
        "roles": ["doctor"],
        "department": {
          "id": "dept-uuid",
          "name": "Cardiology",
          "code": "CARD"
        },
        "status": "active",
        "avatar_url": "https://...",
        "last_login": "2026-02-15T10:30:00Z",
        "created_at": "2026-01-01T00:00:00Z"
      },
      ...
    ]
  }
}
```

---

### POST `/users` — Create New User

**Role Required:** 👑 Super Admin

**Request Body:**
```json
{
  "email": "nurse@hospital.com",
  "username": "nurse.johnson",
  "password": "TempP@ss123",
  "first_name": "Jane",
  "last_name": "Johnson",
  "phone": "+12025559876",
  "role_ids": ["role-uuid-1", "role-uuid-2"],
  "department_id": "dept-uuid",
  "must_change_password": true
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "user-uuid",
    "username": "nurse.johnson",
    "email": "nurse@hospital.com",
    "first_name": "Jane",
    "last_name": "Johnson",
    "reference_number": "HCN262Z00015",
    "roles": ["nurse"],
    "department": {
      "id": "dept-uuid",
      "name": "General Ward",
      "code": "GW"
    },
    "status": "active",
    "must_change_password": true,
    "created_at": "2026-02-15T10:30:00Z"
  }
}
```

**Automatic Generation:**
- `reference_number` auto-generated as 12-digit code (e.g., `HCN262Z00015`)
- Format: `HC[role-code][yy][zz][sequential-5-digits]`
- Initial password must be changed on first login

**Validation:**
- Email must be unique across hospital
- Username must be unique across hospital
- Phone must be valid format
- Password must meet complexity requirements
- Roles must exist
- Department must exist

---

### GET `/users/{id}` — Get User By ID

**Role Required:** 👑 Super Admin, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "username": "dr.smith",
    "email": "doctor@hospital.com",
    "first_name": "John",
    "last_name": "Smith",
    "phone": "+12025551234",
    "reference_number": "HCD262Z00003",
    "roles": [
      {
        "id": "role-uuid",
        "name": "doctor",
        "permissions": ["appointments:view", "prescriptions:create", ...]
      }
    ],
    "department": {
      "id": "dept-uuid",
      "name": "Cardiology",
      "code": "CARD"
    },
    "status": "active",
    "avatar_url": "https://...",
    "mfa_enabled": true,
    "last_login": "2026-02-15T10:30:00Z",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-02-10T15:45:00Z"
  }
}
```

---

### PUT `/users/{id}` — Update User

**Role Required:** 👑 Super Admin

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "phone": "+12025551234",
  "email": "doctor.smith@hospital.com",
  "department_id": "dept-uuid",
  "role_ids": ["role-uuid-1"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "username": "dr.smith",
    "email": "doctor.smith@hospital.com",
    "first_name": "John",
    "last_name": "Smith",
    "phone": "+12025551234",
    ...
  }
}
```

---

### PATCH `/users/{id}/status` — Activate/Deactivate User

**Role Required:** 👑 Super Admin

**Request Body:**
```json
{
  "status": "inactive",
  "reason": "Extended leave"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "status": "inactive",
    "status_changed_at": "2026-02-15T10:30:00Z"
  }
}
```

**Use Cases:**
- Deactivate user on leave
- Deactivate user on termination
- Reactivate user after leave ends
- Active users can login; inactive users cannot

---

### DELETE `/users/{id}` — Soft Delete User

**Role Required:** 👑 Super Admin

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Note:** Soft delete marks user as deleted with timestamp. Data retained for audit trail. Cannot be undone directly; requires database admin to restore.

---

### GET `/users/{id}/roles` — Get User's Roles

**Role Required:** 👑 Super Admin, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "user-uuid",
    "roles": [
      {
        "id": "role-uuid-1",
        "name": "doctor",
        "description": "Clinical staff with prescription rights",
        "permissions": [
          "appointments:view",
          "appointments:create",
          "prescriptions:create",
          ...
        ]
      },
      {
        "id": "role-uuid-2",
        "name": "consultant",
        "description": "Senior clinical staff",
        "permissions": [...]
      }
    ]
  }
}
```

---

### PUT `/users/{id}/roles` — Assign Roles to User

**Role Required:** 👑 Super Admin

**Request Body:**
```json
{
  "role_ids": ["role-uuid-1", "role-uuid-2"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "user-uuid",
    "roles": [
      { "id": "role-uuid-1", "name": "doctor", ... },
      { "id": "role-uuid-2", "name": "consultant", ... }
    ]
  }
}
```

**Note:** Replaces all existing roles. Use with caution.

---

### POST `/users/{id}/reset-password` — Admin Reset User's Password

**Role Required:** 👑 Super Admin

**Request Body:**
```json
{
  "new_password": "TempP@ss456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully",
  "data": {
    "user_id": "user-uuid",
    "password_reset_at": "2026-02-15T10:30:00Z",
    "must_change_password": true
  }
}
```

**Use Case:** 
- User forgot password and cannot reset via email
- Super Admin generates new temporary password
- User forced to change password on next login

---

### POST `/users/{id}/send-password` — Send Password to User via Email

**Role Required:** 👑 Super Admin

**Request Body:**
```json
{
  "password": "TempP@ss123",
  "message": "Your HMS account has been created. Please login and change your password."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sent_to": "doctor@hospital.com",
    "sent_at": "2026-02-15T10:30:00Z",
    "message": "Password sent to doctor@hospital.com"
  }
}
```

**Business Rules:**
- Password sent in email body (never stored in plain text)
- Email includes temporary password + login instructions
- User forced to change password on first login
- Email record logged in audit trail
- Only Super Admin can send passwords

---

### GET `/users/{id}/audit-log` — Get User's Activity Log

**Role Required:** 👑 Super Admin, Admin

**Query Parameters:**
- `page` (int): Page number
- `per_page` (int): Items per page
- `action` (string): Filter by action (login, create, update, delete, export, etc.)
- `date_from`, `date_to` (date): Date range

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 450,
    "page": 1,
    "per_page": 20,
    "total_pages": 23,
    "items": [
      {
        "id": "audit-log-uuid",
        "user_id": "user-uuid",
        "action": "login",
        "entity_type": "User",
        "entity_id": "user-uuid",
        "entity_name": "dr.smith",
        "old_values": {},
        "new_values": {},
        "ip_address": "192.168.1.100",
        "user_agent": "Mozilla/5.0...",
        "timestamp": "2026-02-15T10:30:00Z"
      },
      ...
    ]
  }
}
```

---

### GET `/users/{id}/id-card` — Get User's ID Card Data

**Role Required:** 👑 Super Admin, Admin, 🏥 Own User

**Response:**
```json
{
  "success": true,
  "data": {
    "id_card_id": "id-card-uuid",
    "user_id": "user-uuid",
    "reference_number": "HCD262Z00003",
    "full_name": "Dr. John Smith",
    "photo_url": "https://storage.../photo.png",
    "designation": "Cardiologist",
    "department": "Cardiology",
    "employee_since": "2025-01-01",
    "front_image_url": "https://storage.../front.png",
    "back_image_url": "https://storage.../back.png",
    "pdf_url": "https://storage.../id-card.pdf",
    "version": 1,
    "issued_at": "2026-02-15T10:30:00Z"
  }
}
```

---

### POST `/users/{id}/id-card/generate` — Generate/Regenerate Staff ID Card

**Role Required:** 👑 Super Admin, Admin

**Request Body:**
```json
{
  "regenerate": false
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id_card_id": "id-card-uuid",
    "reference_number": "HCD262Z00003",
    "front_image_url": "https://storage.../front.png",
    "back_image_url": "https://storage.../back.png",
    "pdf_url": "https://storage.../id-card.pdf",
    "version": 1,
    "issued_at": "2026-02-15T10:30:00Z"
  }
}
```

**ID Card Design:**
- **Front Side:** Hospital logo, staff photo, full name, designation, department color band, reference number (12-digit), QR code, join date
- **Back Side:** Hospital address, phone, email, website, card issue date, version
- **Size:** Credit card standard (85.6 × 53.98 mm)
- **Output:** PNG (high-res), PDF (print-friendly)

**Process:**
1. Fetch user data, photo, and designation
2. Generate QR code with reference number
3. Create card design using template
4. Export as PNG + PDF
5. Store URLs in database
6. Increment version number if regenerating

---

### POST `/users/{id}/photo` — Upload User Photo

**Role Required:** 👑 Super Admin, Admin, 🏥 Own User

**Request Type:** `multipart/form-data`

**Form Fields:**
- `photo` (file): JPEG or PNG, max 5MB

**Response:**
```json
{
  "success": true,
  "data": {
    "photo_url": "https://storage.hospital.com/users/user-uuid-photo.png"
  }
}
```

**Processing:**
- Auto-compressed to 500KB
- Converted to PNG
- Stored in cloud storage
- Used for ID card, profile display

---

### DELETE `/users/{id}/photo` — Remove User Photo

**Role Required:** 👑 Super Admin, Admin

**Response:**
```json
{
  "success": true,
  "message": "Photo deleted successfully"
}
```

---

## Roles & Permissions Endpoints

**Base Path:** `/roles` and `/permissions`

### GET `/roles` — List All Roles

**Role Required:** 👑 Admin

**Query Parameters:**
- `page` (int): Page number
- `per_page` (int): Items per page
- `search` (string): Search by role name

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 12,
    "page": 1,
    "per_page": 20,
    "items": [
      {
        "id": "role-uuid-1",
        "name": "super_admin",
        "description": "Full system access",
        "is_system_role": true,
        "created_at": "2026-01-01T00:00:00Z"
      },
      {
        "id": "role-uuid-2",
        "name": "doctor",
        "description": "Clinical staff with prescription rights",
        "is_system_role": true,
        "created_at": "2026-01-01T00:00:00Z"
      },
      ...
    ]
  }
}
```

**System Roles (Cannot Delete):**
- `super_admin`: Full system access
- `admin`: Hospital-level admin
- `doctor`: Clinical consultation rights
- `nurse`: Support clinical staff
- `pharmacist`: Pharmacy dispensing
- `receptionist`: Front desk operations
- `cashier`: Billing and payments
- `inventory_manager`: Stock management
- `optical_staff`: Optical services
- `report_viewer`: Read-only reports

---

### POST `/roles` — Create Custom Role

**Role Required:** 👑 Admin

**Request Body:**
```json
{
  "name": "senior_doctor",
  "description": "Senior doctor with additional approval rights",
  "permission_ids": ["perm-uuid-1", "perm-uuid-2", ...]
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "role-uuid",
    "name": "senior_doctor",
    "description": "Senior doctor with additional approval rights",
    "is_system_role": false,
    "permissions": [
      {
        "id": "perm-uuid-1",
        "module": "prescriptions",
        "action": "create",
        "resource": "any",
        "description": "Create prescriptions"
      },
      ...
    ],
    "created_at": "2026-02-15T10:30:00Z"
  }
}
```

---

### GET `/roles/{id}` — Get Role Details

**Role Required:** 👑 Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "role-uuid",
    "name": "doctor",
    "description": "Clinical staff with prescription rights",
    "is_system_role": true,
    "permissions": [
      {
        "id": "perm-uuid-1",
        "module": "appointments",
        "action": "view",
        "resource": "any",
        "description": "View appointments"
      },
      {
        "id": "perm-uuid-2",
        "module": "prescriptions",
        "action": "create",
        "resource": "any",
        "description": "Create prescriptions"
      },
      ...
    ],
    "user_count": 15,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

---

### GET `/permissions` — List All Permissions

**Role Required:** 👑 Admin

**Query Parameters:**
- `module` (string): Filter by module (appointments, prescriptions, etc.)
- `page` (int): Page number
- `per_page` (int): Items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 120,
    "page": 1,
    "per_page": 20,
    "items": [
      {
        "id": "perm-uuid-1",
        "module": "appointments",
        "action": "view",
        "resource": "any",
        "description": "View appointments",
        "category": "Appointments"
      },
      {
        "id": "perm-uuid-2",
        "module": "appointments",
        "action": "create",
        "resource": "any",
        "description": "Create/book appointments",
        "category": "Appointments"
      },
      ...
    ]
  }
}
```

**Permission Format:** `module:action:resource`

Examples:
- `appointments:view:any` — View any appointment
- `prescriptions:create:any` — Create any prescription
- `invoices:approve:any` — Approve any invoice
- `reports:export:own` — Export only own reports

---

### GET `/permissions/modules` — List Permission Modules

**Role Required:** 👑 Admin

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "module": "appointments",
      "description": "Appointment management",
      "actions": ["view", "create", "update", "delete", "reschedule", "cancel"]
    },
    {
      "module": "prescriptions",
      "description": "Prescription management",
      "actions": ["view", "create", "update", "finalize", "duplicate"]
    },
    {
      "module": "invoices",
      "description": "Billing and invoicing",
      "actions": ["view", "create", "issue", "refund", "approve"]
    },
    ...
  ]
}
```

---

## Patients Endpoints

**Base Path:** `/patients`

### GET `/patients` — List All Patients

**Role Required:** 🏥 Receptionist, Doctor, Admin

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `per_page` (int): Items per page (default: 20)
- `search` (string): Search by name, email, phone
- `phone` (string): Filter by phone number
- `prn` (string): Filter by Patient Reference Number
- `national_id` (string): Filter by national ID
- `date_from`, `date_to` (date): Registration date range
- `sort_by` (string): Sort column
- `sort_order` (string): `asc` or `desc`

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 2350,
    "page": 1,
    "per_page": 20,
    "total_pages": 118,
    "items": [
      {
        "id": "patient-uuid",
        "patient_reference_number": "HCF265GP000148",
        "first_name": "Jane",
        "last_name": "Doe",
        "date_of_birth": "1990-05-15",
        "age_years": 35,
        "gender": "female",
        "blood_group": "O+",
        "phone_country_code": "+1",
        "phone_number": "2025551234",
        "email": "jane@example.com",
        "national_id_type": "passport",
        "national_id_number": "[encrypted]",
        "photo_url": "https://...",
        "address_line_1": "123 Main Street",
        "city": "New York",
        "state_province": "NY",
        "postal_code": "10001",
        "country": "USA",
        "emergency_contact_name": "John Doe",
        "emergency_contact_phone": "+12025559876",
        "known_allergies": "Penicillin",
        "chronic_conditions": "Diabetes Type 2",
        "status": "active",
        "created_at": "2026-02-01T00:00:00Z",
        "last_visit": "2026-02-14T14:30:00Z"
      },
      ...
    ]
  }
}
```

---

### POST `/patients` — Register New Patient

**Role Required:** 🏥 Receptionist, Admin

**Request Body:**
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "date_of_birth": "1990-05-15",
  "gender": "female",
  "blood_group": "O+",
  "phone_country_code": "+1",
  "phone_number": "2025551234",
  "email": "jane@example.com",
  "national_id_type": "passport",
  "national_id_number": "AB1234567",
  "address_line_1": "123 Main Street",
  "city": "New York",
  "state_province": "NY",
  "postal_code": "10001",
  "country": "USA",
  "department_code": "GP",
  "emergency_contact_name": "John Doe",
  "emergency_contact_phone": "+12025559876",
  "emergency_contact_relation": "spouse",
  "known_allergies": "Penicillin",
  "chronic_conditions": "Diabetes Type 2",
  "preferred_language": "en"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "patient-uuid",
    "patient_reference_number": "HCF265GP000148",
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "1990-05-15",
    "age_years": 35,
    "gender": "female",
    "blood_group": "O+",
    "phone_country_code": "+1",
    "phone_number": "2025551234",
    "email": "jane@example.com",
    ...
  }
}
```

**Automatic Generation:**
- `patient_reference_number`: 12-digit PRN (e.g., `HCF265GP000148`)
- Format: `HCF[yy][zz][dept-code][sequential-6-digits]`
- Unique per hospital

**Validation:**
- `first_name`: Required, 1-100 chars, no special chars except hyphen/apostrophe
- `last_name`: Required, 1-100 chars
- `phone_number`: Required, validated per country
- `gender`: Required, one of: male, female, other
- `date_of_birth`: Optional, cannot be future date, cannot be > 150 years ago
- `email`: Optional, valid email format if provided
- `national_id_number`: Encrypted at rest
- Duplicate check on (phone_country_code + phone_number) per hospital

---

### GET `/patients/{id}` — Get Patient Profile

**Role Required:** 🏥 Receptionist, Doctor, Pharmacist, Cashier, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "patient-uuid",
    "patient_reference_number": "HCF265GP000148",
    "first_name": "Jane",
    "last_name": "Doe",
    "full_name": "Jane Doe",
    "date_of_birth": "1990-05-15",
    "age_years": 35,
    "gender": "female",
    "blood_group": "O+",
    "phone_country_code": "+1",
    "phone_number": "2025551234",
    "email": "jane@example.com",
    "national_id_type": "passport",
    "national_id_number": "[encrypted]",
    "photo_url": "https://...",
    "address": {
      "line_1": "123 Main Street",
      "city": "New York",
      "state_province": "NY",
      "postal_code": "10001",
      "country": "USA"
    },
    "emergency_contact": {
      "name": "John Doe",
      "phone": "+12025559876",
      "relation": "spouse"
    },
    "medical_info": {
      "known_allergies": "Penicillin",
      "chronic_conditions": "Diabetes Type 2",
      "preferred_language": "en"
    },
    "status": "active",
    "created_at": "2026-02-01T00:00:00Z",
    "updated_at": "2026-02-14T10:00:00Z",
    "last_visit": "2026-02-14T14:30:00Z",
    "total_visits": 12,
    "total_invoices": 12,
    "outstanding_balance": 500.00
  }
}
```

---

### PUT `/patients/{id}` — Update Patient Info

**Role Required:** 🏥 Receptionist, Admin

**Request Body:**
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "phone_number": "2025551234",
  "email": "jane.doe@example.com",
  "blood_group": "O+",
  "known_allergies": "Penicillin, Sulfonamides",
  "chronic_conditions": "Diabetes Type 2, Hypertension",
  "emergency_contact_name": "John Doe",
  "emergency_contact_phone": "+12025559876"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "patient-uuid",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane.doe@example.com",
    ...
  }
}
```

---

### GET `/patients/search` — Search Patients

**Role Required:** 🏥 All Clinical Staff

**Query Parameters:**
- `q` (string): Search term (name, phone, PRN, email)
- `phone` (string): Exact phone search
- `prn` (string): Patient Reference Number
- `national_id` (string): National ID
- `date_from`, `date_to` (date): Registration date range

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "items": [
      {
        "id": "patient-uuid",
        "patient_reference_number": "HCF265GP000148",
        "first_name": "Jane",
        "last_name": "Doe",
        "phone_number": "2025551234",
        "email": "jane@example.com",
        "photo_url": "https://...",
        "last_visit": "2026-02-14T14:30:00Z"
      },
      ...
    ]
  }
}
```

**Use Case:**
- Receptionist searches for existing patient before registration
- Quick lookup during appointment booking
- Billing search for patient

---

### POST `/patients/check-duplicate` — Check for Duplicate Patient

**Role Required:** 🏥 Receptionist

**Request Body:**
```json
{
  "phone_country_code": "+1",
  "phone_number": "2025551234"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "is_duplicate": true,
    "existing_patient": {
      "id": "patient-uuid",
      "patient_reference_number": "HCF265GP000148",
      "first_name": "Jane",
      "last_name": "Doe",
      "phone_number": "2025551234",
      "last_visit": "2026-02-14T14:30:00Z"
    }
  }
}
```

**Use Case:**
- Prevent duplicate patient registrations
- Receptionist sees duplicate warning before creating new record

---

### POST `/patients/{id}/photo` — Upload Patient Photo

**Role Required:** 🏥 Receptionist, Admin

**Request Type:** `multipart/form-data`

**Form Fields:**
- `photo` (file): JPEG or PNG, max 5MB

**Response:**
```json
{
  "success": true,
  "data": {
    "photo_url": "https://storage.hospital.com/patients/patient-uuid-photo.png"
  }
}
```

**Use Case:**
- Display on patient ID card
- Patient verification at reception
- Medical record illustration

---

### GET `/patients/{id}/consents` — Get Patient Consent Records

**Role Required:** 🏥 Receptionist, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "consent-uuid",
        "consent_type": "treatment_authorization",
        "description": "Authorization for treatment and procedures",
        "patient_acknowledgment": true,
        "given_by": "Jane Doe (Patient)",
        "given_at": "2026-02-01T09:00:00Z",
        "witnessed_by": "John Smith (Receptionist)",
        "consent_document_url": "https://...",
        "status": "active"
      },
      {
        "id": "consent-uuid-2",
        "consent_type": "privacy_authorization",
        "description": "Data privacy and information sharing consent",
        "patient_acknowledgment": true,
        "given_by": "Jane Doe (Patient)",
        "given_at": "2026-02-01T09:05:00Z",
        "witnessed_by": "John Smith (Receptionist)",
        "consent_document_url": "https://...",
        "status": "active"
      }
    ]
  }
}
```

---

### POST `/patients/{id}/consents` — Record Patient Consent

**Role Required:** 🏥 Receptionist

**Request Body:**
```json
{
  "consent_type": "treatment_authorization",
  "description": "Authorization for treatment and procedures",
  "patient_acknowledgment": true,
  "given_by_name": "Jane Doe",
  "witnessed_by_name": "John Smith"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "consent-uuid",
    "consent_type": "treatment_authorization",
    "patient_acknowledgment": true,
    "given_at": "2026-02-15T10:30:00Z",
    "status": "active"
  }
}
```

---

### GET `/patients/{id}/id-card` — Get Patient ID Card Data

**Role Required:** 🏥 Receptionist, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "id_card_id": "id-card-uuid",
    "patient_id": "patient-uuid",
    "patient_reference_number": "HCF265GP000148",
    "full_name": "Jane Doe",
    "date_of_birth": "1990-05-15",
    "gender": "female",
    "blood_group": "O+",
    "photo_url": "https://storage.../photo.png",
    "front_image_url": "https://storage.../front.png",
    "back_image_url": "https://storage.../back.png",
    "pdf_url": "https://storage.../id-card.pdf",
    "version": 1,
    "issued_at": "2026-02-15T10:30:00Z"
  }
}
```

---

### POST `/patients/{id}/id-card/generate` — Generate Patient ID Card

**Role Required:** 🏥 Receptionist, Admin

**Request Body:**
```json
{
  "regenerate": false
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id_card_id": "id-card-uuid",
    "patient_reference_number": "HCF265GP000148",
    "front_image_url": "https://storage.../front.png",
    "back_image_url": "https://storage.../back.png",
    "pdf_url": "https://storage.../id-card.pdf",
    "version": 1,
    "issued_at": "2026-02-15T10:30:00Z"
  }
}
```

**ID Card Design:**
- **Front Side:** Hospital logo, patient photo, full name, DOB/age, gender symbol, blood group, PRN (12-digit), department color band, QR code, registration date
- **Back Side:** Hospital address, phone, email, website, emergency number, terms, issue date, version
- **Output:** PNG + PDF

---

## Doctors & Scheduling Endpoints

**Base Path:** `/doctors`

### GET `/doctors` — List Doctors

**Role Required:** 🏥 All Authenticated

**Query Parameters:**
- `page` (int): Page number
- `per_page` (int): Items per page
- `search` (string): Search by name
- `department_id` (uuid): Filter by department
- `status` (string): `active` or `inactive`
- `specialization` (string): Filter by specialization

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "page": 1,
    "per_page": 20,
    "items": [
      {
        "id": "doctor-uuid",
        "user_id": "user-uuid",
        "first_name": "John",
        "last_name": "Smith",
        "full_name": "Dr. John Smith",
        "specialization": "Cardiology",
        "qualification": "MBBS, MD Cardiology",
        "license_number": "LIC-12345",
        "phone": "+12025551234",
        "email": "doctor@hospital.com",
        "department": {
          "id": "dept-uuid",
          "name": "Cardiology",
          "code": "CARD"
        },
        "consultation_fee": 150.00,
        "follow_up_fee": 100.00,
        "status": "active",
        "photo_url": "https://...",
        "is_available_today": true,
        "current_queue_count": 5
      },
      ...
    ]
  }
}
```

---

### PUT `/doctors/{id}/schedule` — Set/Update Doctor Schedule

**Role Required:** 👑 Admin, 🏥 Own Doctor Profile

**Request Body:**
```json
{
  "schedules": [
    {
      "day_of_week": 1,
      "shift_name": "morning",
      "start_time": "09:00",
      "end_time": "13:00",
      "break_start_time": "11:00",
      "break_end_time": "11:30",
      "slot_duration_minutes": 15,
      "max_patients": 20,
      "effective_from": "2026-02-01"
    },
    {
      "day_of_week": 1,
      "shift_name": "afternoon",
      "start_time": "14:00",
      "end_time": "18:00",
      "break_start_time": null,
      "break_end_time": null,
      "slot_duration_minutes": 15,
      "max_patients": 16,
      "effective_from": "2026-02-01"
    },
    {
      "day_of_week": 2,
      "shift_name": "morning",
      "start_time": "09:00",
      "end_time": "13:00",
      "slot_duration_minutes": 15,
      "max_patients": 20,
      "effective_from": "2026-02-01"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "doctor_id": "doctor-uuid",
    "schedules": [
      {
        "id": "schedule-uuid",
        "day_of_week": 1,
        "shift_name": "morning",
        "start_time": "09:00",
        "end_time": "13:00",
        "slot_duration_minutes": 15,
        "max_patients": 20,
        "effective_from": "2026-02-01"
      },
      ...
    ]
  }
}
```

**Validation:**
- `day_of_week`: 1 (Monday) to 7 (Sunday)
- `start_time` < `end_time`
- `slot_duration_minutes`: 5-60 minutes
- `max_patients`: 1-100

---

### GET `/doctors/{id}/leaves` — Get Doctor Leaves

**Role Required:** 🏥 Receptionist, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "leave-uuid",
        "doctor_id": "doctor-uuid",
        "leave_type": "sick_leave",
        "leave_from": "2026-02-15",
        "leave_to": "2026-02-17",
        "reason": "Medical emergency",
        "approved_by": "Admin Name",
        "status": "approved",
        "created_at": "2026-02-14T10:00:00Z"
      },
      ...
    ]
  }
}
```

---

### POST `/doctors/{id}/leaves` — Create Doctor Leave

**Role Required:** 👑 Admin, 🏥 Doctor (own)

**Request Body:**
```json
{
  "leave_type": "sick_leave",
  "leave_from": "2026-02-15",
  "leave_to": "2026-02-17",
  "reason": "Medical emergency"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "leave-uuid",
    "leave_type": "sick_leave",
    "leave_from": "2026-02-15",
    "leave_to": "2026-02-17",
    "reason": "Medical emergency",
    "status": "pending_approval"
  }
}
```

**Leave Types:**
- `sick_leave`: Medical/health reasons
- `casual_leave`: Regular time off
- `emergency_leave`: Urgent situations
- `training_leave`: Professional development
- `conference_leave`: Conference attendance

---

## Appointments Endpoints

**Base Path:** `/appointments`

### POST `/appointments` — Book Scheduled Appointment

**Role Required:** 🏥 Receptionist, Admin

**Request Body:**
```json
{
  "patient_id": "patient-uuid",
  "doctor_id": "doctor-uuid",
  "appointment_date": "2026-02-20",
  "start_time": "10:00",
  "appointment_type": "scheduled",
  "visit_type": "new",
  "chief_complaint": "Persistent headache for 3 days"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "appointment-uuid",
    "appointment_number": "APT-20260220-001",
    "patient_id": "patient-uuid",
    "patient_name": "Jane Doe",
    "doctor_id": "doctor-uuid",
    "doctor_name": "Dr. John Smith",
    "appointment_date": "2026-02-20",
    "start_time": "10:00",
    "end_time": "10:15",
    "appointment_type": "scheduled",
    "visit_type": "new",
    "chief_complaint": "Persistent headache for 3 days",
    "status": "scheduled",
    "created_at": "2026-02-15T10:30:00Z"
  }
}
```

**Validation:**
- Date cannot be in past
- Doctor must be available on date
- Time slot must be available
- Patient must exist

---

### GET `/appointments` — List Appointments

**Role Required:** 🏥 Receptionist, Doctor, Admin

**Query Parameters:**
- `doctor_id` (uuid): Filter by doctor
- `patient_id` (uuid): Filter by patient
- `date` (date): Single date filter
- `date_from`, `date_to` (date): Date range
- `status` (string): scheduled, checked_in, in_queue, with_doctor, completed, cancelled
- `appointment_type` (string): scheduled, walk_in, emergency, follow_up

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 342,
    "page": 1,
    "per_page": 20,
    "items": [
      {
        "id": "appointment-uuid",
        "appointment_number": "APT-20260220-001",
        "patient_id": "patient-uuid",
        "patient_name": "Jane Doe",
        "patient_reference_number": "HCF265GP000148",
        "doctor_id": "doctor-uuid",
        "doctor_name": "Dr. John Smith",
        "appointment_date": "2026-02-20",
        "start_time": "10:00",
        "end_time": "10:15",
        "appointment_type": "scheduled",
        "visit_type": "new",
        "chief_complaint": "Persistent headache for 3 days",
        "status": "scheduled",
        "queue_position": null,
        "queue_total": null,
        "created_at": "2026-02-15T10:30:00Z"
      },
      ...
    ]
  }
}
```

---

### PATCH `/appointments/{id}/status` — Update Appointment Status

**Role Required:** 🏥 Receptionist, Doctor

**Request Body:**
```json
{
  "status": "checked_in",
  "notes": "Patient arrived 10 minutes early"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "appointment-uuid",
    "status": "checked_in",
    "status_changed_at": "2026-02-20T09:50:00Z"
  }
}
```

**Status Transitions:**
- `scheduled` → `checked_in`: Receptionist marks patient as arrived
- `checked_in` → `in_queue`: Patient joins doctor's queue
- `in_queue` → `with_doctor`: Doctor calls patient
- `with_doctor` → `completed`: Doctor completes consultation OR `transfer` (to next doctor)
- Any → `cancelled`: Appointment cancelled

---

### POST `/appointments/{id}/check-in` — Mark Patient Arrived

**Role Required:** 🏥 Receptionist

**Request Body:**
```json
{
  "check_in_time": "2026-02-20T09:50:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "appointment-uuid",
    "status": "checked_in",
    "check_in_time": "2026-02-20T09:50:00Z",
    "queue_position": 3,
    "queue_total": 8
  }
}
```

---

### POST `/appointments/{id}/transfer` — Transfer to Next Doctor

**Role Required:** 🏥 Doctor

**Request Body:**
```json
{
  "next_doctor_id": "doctor-uuid-2",
  "notes": "Referred to ophthalmology for eye examination",
  "priority": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "appointment-uuid",
    "status": "transfer_completed",
    "current_doctor_sequence": 2,
    "next_doctor_id": "doctor-uuid-2",
    "next_doctor_name": "Dr. Sarah Johnson",
    "transfer_reason": "Referred to ophthalmology for eye examination",
    "transfer_time": "2026-02-20T10:15:00Z"
  }
}
```

**Doctor Workflow:**
1. Patient books appointment with Doctor 1
2. Doctor 1 completes consultation, calls `/transfer`
3. Appointment updated: `current_doctor_sequence = 2`
4. New queue entry created for Doctor 2
5. Patient goes to Doctor 2
6. Doctor 2 completes or transfers to Doctor 3
7. Final doctor marks as `completed`

---

### GET `/appointments/slots` — Get Available Appointment Slots

**Role Required:** 🏥 Receptionist

**Query Parameters:**
- `doctor_id` (uuid): Required
- `date` (date): Required (YYYY-MM-DD format)

**Response:**
```json
{
  "success": true,
  "data": {
    "doctor_id": "doctor-uuid",
    "doctor_name": "Dr. John Smith",
    "date": "2026-02-20",
    "slots": [
      {
        "start_time": "09:00",
        "end_time": "09:15",
        "available": true,
        "patients_in_slot": 0,
        "max_patients": 1
      },
      {
        "start_time": "09:15",
        "end_time": "09:30",
        "available": true,
        "patients_in_slot": 0,
        "max_patients": 1
      },
      {
        "start_time": "09:30",
        "end_time": "09:45",
        "available": false,
        "patients_in_slot": 1,
        "max_patients": 1
      },
      {
        "start_time": "11:00",
        "end_time": "11:15",
        "available": true,
        "patients_in_slot": 0,
        "max_patients": 1
      }
    ]
  }
}
```

**Logic:**
- Fetches doctor's schedule for date
- Generates slots based on `slot_duration_minutes`
- Excludes break times
- Marks slot unavailable if `patients_in_slot >= max_patients`
- Shows date not available if doctor on leave or no schedule

---

## Prescriptions Endpoints

**Base Path:** `/prescriptions`

### POST `/prescriptions` — Create Prescription

**Role Required:** 🏥 Doctor

**Request Body:**
```json
{
  "appointment_id": "appointment-uuid",
  "patient_id": "patient-uuid",
  "diagnosis": "Viral Upper Respiratory Tract Infection",
  "clinical_notes": "Patient presents with cough, sore throat for 3 days",
  "advice": "Rest, increase fluid intake, warm salt water gargle",
  "items": [
    {
      "medicine_name": "Paracetamol 500mg",
      "dosage": "500mg",
      "frequency": "1-0-1",
      "duration_value": 5,
      "duration_unit": "days",
      "route": "oral",
      "instructions": "After food",
      "allow_substitution": true
    },
    {
      "medicine_name": "Cough Syrup (Dextromethorphan)",
      "dosage": "10ml",
      "frequency": "1-1-1",
      "duration_value": 5,
      "duration_unit": "days",
      "route": "oral",
      "instructions": "After food"
    }
  ],
  "valid_until": "2026-03-10"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "prescription-uuid",
    "prescription_number": "RX-20260215-001",
    "patient_id": "patient-uuid",
    "patient_name": "Jane Doe",
    "doctor_id": "doctor-uuid",
    "doctor_name": "Dr. John Smith",
    "appointment_id": "appointment-uuid",
    "diagnosis": "Viral Upper Respiratory Tract Infection",
    "clinical_notes": "Patient presents with cough...",
    "advice": "Rest, increase fluid intake...",
    "items": [
      {
        "id": "item-uuid",
        "medicine_name": "Paracetamol 500mg",
        "dosage": "500mg",
        "frequency": "1-0-1",
        "duration": "5 days",
        "route": "oral",
        "instructions": "After food",
        "allow_substitution": true
      },
      ...
    ],
    "status": "draft",
    "valid_until": "2026-03-10",
    "created_at": "2026-02-15T10:30:00Z"
  }
}
```

**Frequency Notation:**
- `1-0-1` = Morning-Afternoon-Evening (1 tablet morning, 0 afternoon, 1 evening)
- `1-1-1` = Three times daily
- `1-0-0` = Once daily (morning)
- `0-0-1` = Once daily (evening)

---

### POST `/prescriptions/{id}/finalize` — Finalize Prescription

**Role Required:** 🏥 Doctor

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prescription-uuid",
    "status": "finalized",
    "finalized_at": "2026-02-15T10:35:00Z"
  }
}
```

**Purpose:**
- Lock prescription for editing
- Cannot be modified after finalization
- Ready for pharmacist to dispense

---

## Pharmacy Endpoints

**Base Path:** `/pharmacy`

### GET `/pharmacy/medicines` — List Medicines

**Role Required:** 🏥 Pharmacist, Doctor, Admin

**Query Parameters:**
- `page` (int): Page number
- `per_page` (int): Items per page
- `search` (string): Search by name/generic
- `category` (string): Filter by category
- `active_only` (bool): Show only active medicines

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 1250,
    "page": 1,
    "per_page": 20,
    "items": [
      {
        "id": "medicine-uuid",
        "name": "Paracetamol 500mg",
        "generic_name": "Paracetamol",
        "category": "Analgesic",
        "manufacturer": "Pharma Inc",
        "unit": "tablet",
        "unit_price": 5.50,
        "stock": 1500,
        "reorder_level": 500,
        "tax_rate": 5.0,
        "is_prescription_required": false,
        "is_active": true
      },
      ...
    ]
  }
}
```

---

### POST `/pharmacy/dispensing` — Dispense Medicine Against Prescription

**Role Required:** 🏥 Pharmacist

**Request Body:**
```json
{
  "prescription_id": "prescription-uuid",
  "patient_id": "patient-uuid",
  "items": [
    {
      "prescription_item_id": "item-uuid",
      "medicine_id": "medicine-uuid",
      "medicine_batch_id": "batch-uuid",
      "quantity": 10,
      "unit_price": 5.50,
      "discount_percent": 0,
      "substituted": false
    }
  ],
  "notes": "All items dispensed as prescribed"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "dispensing-uuid",
    "prescription_id": "prescription-uuid",
    "patient_id": "patient-uuid",
    "patient_name": "Jane Doe",
    "total_amount": 55.00,
    "discount": 0,
    "grand_total": 55.00,
    "status": "dispensed",
    "dispensed_at": "2026-02-15T14:00:00Z",
    "dispensed_by": "Pharmacist Name"
  }
}
```

**Business Rules:**
- Cannot dispense expired batches
- FEFO (First Expiry First Out) ordering
- Cannot dispense more than available stock
- Stock auto-reduced on dispensing
- If substituting, record original medicine name
- Cannot dispense controlled substances without prescription

---

### POST `/pharmacy/counter-sale` — OTC Counter Sale

**Role Required:** 🏥 Pharmacist

**Request Body:**
```json
{
  "patient_id": null,
  "customer_name": "Walk-in Customer",
  "customer_phone": "+12025551234",
  "items": [
    {
      "medicine_id": "medicine-uuid",
      "medicine_batch_id": "batch-uuid",
      "quantity": 2,
      "unit_price": 8.99,
      "discount_percent": 0
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "sale-uuid",
    "customer_name": "Walk-in Customer",
    "total_amount": 17.98,
    "discount": 0,
    "grand_total": 17.98,
    "status": "completed",
    "created_at": "2026-02-15T15:00:00Z"
  }
}
```

---

## Billing & Payments Endpoints

**Base Path:** `/billing`

### POST `/billing/invoices` — Create Invoice

**Role Required:** 🏥 Cashier, Receptionist, Pharmacist, Optical Staff

**Request Body:**
```json
{
  "patient_id": "patient-uuid",
  "appointment_id": "appointment-uuid",
  "invoice_type": "opd",
  "invoice_date": "2026-02-15",
  "items": [
    {
      "item_type": "consultation",
      "description": "General Consultation - Dr. Smith",
      "quantity": 1,
      "unit_price": 150.00,
      "tax_config_id": "tax-uuid"
    },
    {
      "item_type": "procedure",
      "description": "Blood Pressure Check",
      "quantity": 1,
      "unit_price": 25.00,
      "tax_config_id": null
    }
  ],
  "discount_amount": 10.00,
  "discount_reason": "Senior citizen discount"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "invoice-uuid",
    "invoice_number": "INV-20260215-001",
    "patient_id": "patient-uuid",
    "patient_name": "Jane Doe",
    "patient_reference_number": "HCF265GP000148",
    "invoice_type": "opd",
    "invoice_date": "2026-02-15",
    "items": [
      {
        "description": "General Consultation - Dr. Smith",
        "quantity": 1,
        "unit_price": 150.00,
        "tax_rate": 5.0,
        "tax_amount": 7.50,
        "line_total": 157.50
      },
      {
        "description": "Blood Pressure Check",
        "quantity": 1,
        "unit_price": 25.00,
        "tax_rate": 0,
        "tax_amount": 0,
        "line_total": 25.00
      }
    ],
    "subtotal": 175.00,
    "discount": 10.00,
    "tax": 7.50,
    "grand_total": 172.50,
    "balance": 172.50,
    "status": "draft",
    "created_at": "2026-02-15T14:30:00Z"
  }
}
```

**Status Workflow:**
- `draft`: Created but not issued
- `issued`: Issued to patient
- `partially_paid`: Some payment received
- `paid`: Full payment received
- `voided`: Cancelled (requires approval)

---

### POST `/billing/invoices/{id}/issue` — Issue Invoice (Finalize)

**Role Required:** 🏥 Cashier

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "invoice-uuid",
    "invoice_number": "INV-20260215-001",
    "status": "issued",
    "issued_at": "2026-02-15T14:35:00Z"
  }
}
```

---

### POST `/billing/payments` — Record Payment

**Role Required:** 🏥 Cashier

**Request Body:**
```json
{
  "invoice_id": "invoice-uuid",
  "amount": 100.00,
  "payment_mode": "card",
  "payment_reference": "TXN-12345678",
  "payment_date": "2026-02-15"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "payment-uuid",
    "invoice_id": "invoice-uuid",
    "amount": 100.00,
    "payment_mode": "card",
    "payment_reference": "TXN-12345678",
    "payment_date": "2026-02-15",
    "created_at": "2026-02-15T14:40:00Z",
    "invoice": {
      "id": "invoice-uuid",
      "grand_total": 172.50,
      "total_paid": 100.00,
      "balance": 72.50,
      "status": "partially_paid"
    }
  }
}
```

**Payment Modes:**
- `cash`: Cash payment
- `card`: Credit/Debit card
- `upi`: UPI/Mobile wallet
- `cheque`: Cheque payment
- `bank_transfer`: Bank transfer
- `insurance`: Insurance payment
- `adjustment`: Credit note adjustment

---

### POST `/billing/refunds` — Create Refund Request

**Role Required:** 🏥 Cashier

**Request Body:**
```json
{
  "payment_id": "payment-uuid",
  "refund_amount": 50.00,
  "reason": "Patient requested refund",
  "notes": "Partial refund for unused medicine"
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "refund-uuid",
    "payment_id": "payment-uuid",
    "invoice_id": "invoice-uuid",
    "refund_amount": 50.00,
    "reason": "Patient requested refund",
    "status": "pending_approval",
    "created_at": "2026-02-15T15:00:00Z"
  }
}
```

**Status Workflow:**
- `pending_approval`: Awaiting admin approval
- `approved`: Approved by admin
- `processed`: Refund issued to patient
- `rejected`: Rejected by admin

---

## Inventory Endpoints

**Base Path:** `/inventory`

### GET `/inventory/items` — List Inventory Items

**Role Required:** 🏥 Inventory, Pharmacist, Optical Staff, Admin

**Query Parameters:**
- `page` (int): Page number
- `per_page` (int): Items per page
- `search` (string): Search by name/code
- `category` (string): Filter by category
- `status` (string): in_stock, low_stock, out_of_stock, expired

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 5200,
    "page": 1,
    "per_page": 20,
    "items": [
      {
        "id": "item-uuid",
        "name": "Paracetamol 500mg",
        "sku": "PARA-500",
        "category": "Medicines",
        "unit": "tablet",
        "quantity_on_hand": 1500,
        "unit_cost": 4.50,
        "unit_price": 5.50,
        "reorder_level": 500,
        "reorder_quantity": 1000,
        "status": "in_stock",
        "supplier_id": "supplier-uuid",
        "last_purchase_date": "2026-01-15"
      },
      ...
    ]
  }
}
```

---

### POST `/inventory/purchase-orders` — Create Purchase Order

**Role Required:** 🏥 Inventory

**Request Body:**
```json
{
  "supplier_id": "supplier-uuid",
  "delivery_date": "2026-03-01",
  "items": [
    {
      "inventory_item_id": "item-uuid",
      "quantity": 1000,
      "unit_cost": 4.50,
      "discount_percent": 5
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "po-uuid",
    "po_number": "PO-20260215-001",
    "supplier_id": "supplier-uuid",
    "supplier_name": "Pharma Suppliers Inc",
    "delivery_date": "2026-03-01",
    "items": [
      {
        "inventory_item_id": "item-uuid",
        "quantity": 1000,
        "unit_cost": 4.50,
        "discount": 5,
        "line_total": 4275.00
      }
    ],
    "subtotal": 4500.00,
    "discount": 225.00,
    "grand_total": 4275.00,
    "status": "draft",
    "created_at": "2026-02-15T10:30:00Z"
  }
}
```

---

### POST `/inventory/grn` — Create GRN (Goods Receipt Note)

**Role Required:** 🏥 Inventory

**Request Body:**
```json
{
  "purchase_order_id": "po-uuid",
  "received_date": "2026-02-20",
  "items": [
    {
      "inventory_item_id": "item-uuid",
      "quantity_received": 1000,
      "batch_number": "BATCH-2026-001",
      "expiry_date": "2027-02-15",
      "quantity_accepted": 1000,
      "quantity_rejected": 0,
      "rejection_reason": null
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": "grn-uuid",
    "grn_number": "GRN-20260220-001",
    "purchase_order_id": "po-uuid",
    "received_date": "2026-02-20",
    "status": "received",
    "items": [
      {
        "inventory_item_id": "item-uuid",
        "quantity_received": 1000,
        "batch_number": "BATCH-2026-001",
        "expiry_date": "2027-02-15",
        "quantity_accepted": 1000
      }
    ],
    "created_at": "2026-02-20T10:00:00Z"
  }
}
```

---

## Reports Endpoints

**Base Path:** `/reports`

### GET `/reports/dashboard` — Get Dashboard Summary

**Role Required:** 🏥 Admin, Report Viewer

**Response:**
```json
{
  "success": true,
  "data": {
    "today": {
      "total_appointments": 45,
      "completed_appointments": 38,
      "total_patients": 42,
      "total_revenue": 8500.00,
      "total_invoices": 52,
      "pending_payments": 2100.00
    },
    "this_month": {
      "total_appointments": 950,
      "total_patients": 750,
      "total_revenue": 185000.00,
      "average_ticket_size": 194.74
    },
    "this_year": {
      "total_revenue": 2150000.00,
      "total_appointments": 12500,
      "total_patients": 9200
    },
    "top_departments": [
      {
        "name": "Cardiology",
        "revenue": 285000.00,
        "appointments": 1850,
        "percentage": 13.2
      },
      ...
    ],
    "top_doctors": [
      {
        "name": "Dr. John Smith",
        "appointments": 425,
        "revenue": 63750.00
      },
      ...
    ]
  }
}
```

---

### GET `/reports/revenue/daily` — Day-wise Revenue Report

**Role Required:** 🏥 Admin, Cashier, Report Viewer

**Query Parameters:**
- `date_from` (date): Start date
- `date_to` (date): End date
- `department` (string): `opd`, `pharmacy`, `optical`, or `all`
- `group_by` (string): `day`, `department`, or `both`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_revenue": 125000.00,
      "opd_revenue": 45000.00,
      "pharmacy_revenue": 55000.00,
      "optical_revenue": 25000.00,
      "total_invoices": 340,
      "total_patients": 280,
      "average_ticket_size": 367.65
    },
    "daily_breakdown": [
      {
        "date": "2026-02-01",
        "opd": 1500.00,
        "pharmacy": 2200.00,
        "optical": 800.00,
        "total": 4500.00,
        "invoice_count": 12,
        "patient_count": 10
      },
      ...
    ],
    "trends": {
      "mom_change_percent": 12.5,
      "yoy_change_percent": 8.3
    }
  }
}
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "INVALID_EMAIL"
    }
  ],
  "timestamp": "2026-02-15T10:30:00Z"
}
```

### Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `INVALID_INPUT` | Invalid input data | Check request body validation |
| `UNAUTHORIZED` | Missing/invalid token | Re-login and get new token |
| `FORBIDDEN` | No permission | Contact admin for access |
| `NOT_FOUND` | Resource doesn't exist | Verify resource ID |
| `CONFLICT` | Duplicate/conflict | Resource already exists or state conflict |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait before retrying |
| `INTERNAL_SERVER_ERROR` | Server error | Contact support |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 requests | per minute per IP |
| `POST /auth/forgot-password` | 3 requests | per hour per email |
| `POST /auth/reset-password` | 5 requests | per hour per token |
| `POST /files/upload` | 10 requests | per minute per user |
| `GET /reports/*` | 20 requests | per minute per user |
| All other endpoints | 60 requests | per minute per user |

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## API Versioning

- **Current Version:** `/api/v1/`
- **Deprecation Policy:** 6-month notice before breaking changes
- **Sunset Header:** `Sunset: <http-date>`
- **OpenAPI Documentation:** `/api/v1/docs` (Swagger) and `/api/v1/redoc`

---

## WebSocket Endpoints

### Live Queue Updates

**Endpoint:** `ws://host/ws/queue/{doctor_id}`

**Message Example:**
```json
{
  "type": "queue_update",
  "data": {
    "action": "patient_called",
    "queue_number": 15,
    "patient_name": "Jane D.",
    "doctor_id": "doctor-uuid",
    "position": 3,
    "total_waiting": 8
  }
}
```

### Real-time Notifications

**Endpoint:** `ws://host/ws/notifications/{user_id}`

**Message Example:**
```json
{
  "type": "appointment_reminder",
  "data": {
    "patient_name": "Jane Doe",
    "appointment_time": "10:00 AM",
    "doctor_name": "Dr. John Smith"
  }
}
```

---

## Best Practices

### 1. Token Management
- Store access token in memory only
- Refresh token in httpOnly cookie
- Implement token refresh before expiry
- Handle 401 errors gracefully

### 2. Pagination
- Always use pagination for list endpoints
- Limit per_page to 100 maximum
- Sort appropriately for UX

### 3. Error Handling
- Check `success` flag first
- Display user-friendly error messages
- Log errors for debugging
- Retry with exponential backoff

### 4. Data Validation
- Validate on client side for UX
- Always validate on server side
- Use type hints and schemas
- Handle edge cases

### 5. Security
- Never log sensitive data
- Encrypt data in transit (HTTPS)
- Validate input/output
- Use principle of least privilege

---

## Support & Documentation

- **API Documentation:** This file
- **Swagger UI:** `http://localhost:8000/api/v1/docs`
- **ReDoc:** `http://localhost:8000/api/v1/redoc`
- **GitHub Repository:** Contact your team lead
- **Support Email:** support@hospital.com

---

**Last Updated:** May 4, 2026  
**Maintained By:** Development Team  
**Version:** 1.0
