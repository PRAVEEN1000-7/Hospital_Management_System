# HMS — Error Handling, Internationalization & Testing Strategy

---

## Part 1: Error Handling Strategy

### 1.1 Backend Error Architecture

#### Custom Exception Hierarchy

```python
# app/core/exceptions.py

class HMSException(Exception):
    """Base exception for all application errors."""
    def __init__(self, message: str, error_code: str, status_code: int = 500, details: dict | None = None):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

class AuthenticationError(HMSException):
    def __init__(self, message="Invalid credentials", error_code="AUTH_INVALID_CREDENTIALS"):
        super().__init__(message, error_code, status_code=401)

class AuthorizationError(HMSException):
    def __init__(self, message="Permission denied", error_code="AUTH_PERMISSION_DENIED"):
        super().__init__(message, error_code, status_code=403)

class NotFoundError(HMSException):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} not found",
            error_code="RESOURCE_NOT_FOUND",
            status_code=404,
            details={"resource": resource, "id": resource_id}
        )

class ValidationError(HMSException):
    def __init__(self, message: str, field_errors: list[dict] | None = None):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=422,
            details={"field_errors": field_errors or []}
        )

class DuplicateError(HMSException):
    def __init__(self, resource: str, field: str, value: str):
        super().__init__(
            message=f"{resource} with {field}='{value}' already exists",
            error_code="DUPLICATE_RESOURCE",
            status_code=409,
            details={"resource": resource, "field": field, "value": value}
        )

class BusinessRuleError(HMSException):
    def __init__(self, message: str, error_code: str = "BUSINESS_RULE_VIOLATION"):
        super().__init__(message, error_code, status_code=422)

class RateLimitError(HMSException):
    def __init__(self, retry_after: int = 60):
        super().__init__(
            message="Too many requests",
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=429,
            details={"retry_after_seconds": retry_after}
        )

class AccountLockedError(HMSException):
    def __init__(self, locked_until: str):
        super().__init__(
            message="Account is locked due to too many failed login attempts",
            error_code="ACCOUNT_LOCKED",
            status_code=423,
            details={"locked_until": locked_until}
        )

class FileError(HMSException):
    def __init__(self, message: str, error_code: str = "FILE_ERROR"):
        super().__init__(message, error_code, status_code=400)

class ExternalServiceError(HMSException):
    def __init__(self, service: str, message: str = "External service unavailable"):
        super().__init__(message, f"EXTERNAL_{service.upper()}_ERROR", status_code=502)
```

#### Global Exception Handlers

```python
# app/core/exception_handlers.py

from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError
from .exceptions import HMSException

async def hms_exception_handler(request: Request, exc: HMSException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            }
        }
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    field_errors = []
    for error in exc.errors():
        field_errors.append({
            "field": ".".join(str(loc) for loc in error["loc"] if loc != "body"),
            "message": error["msg"],
            "type": error["type"]
        })
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": {"field_errors": field_errors}
            }
        }
    )

async def integrity_error_handler(request: Request, exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={
            "success": False,
            "error": {
                "code": "DATABASE_CONSTRAINT_VIOLATION",
                "message": "A database constraint was violated. Possible duplicate record.",
                "details": {}
            }
        }
    )

async def generic_exception_handler(request: Request, exc: Exception):
    # Log the full traceback for internal investigation
    import traceback, logging
    logging.error(f"Unhandled error: {traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred. Please try again later.",
                "details": {}
            }
        }
    )
```

#### Error Code Catalog

| Code | HTTP | Description | User Message |
|------|------|-------------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong username/password | "Invalid email or password" |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT access token expired | "Session expired, please log in again" |
| `AUTH_TOKEN_INVALID` | 401 | Malformed or tampered JWT | "Invalid session" |
| `AUTH_REFRESH_TOKEN_EXPIRED` | 401 | Refresh token expired | "Session expired, please log in again" |
| `AUTH_PERMISSION_DENIED` | 403 | User lacks permission | "You don't have permission to perform this action" |
| `AUTH_MFA_REQUIRED` | 403 | MFA verification needed | "Please verify your identity with 2FA" |
| `AUTH_MFA_INVALID` | 401 | Wrong MFA code | "Invalid verification code" |
| `ACCOUNT_LOCKED` | 423 | Too many failed logins | "Account locked. Try again after {time}" |
| `ACCOUNT_DISABLED` | 403 | Admin disabled account | "Your account has been deactivated" |
| `RESOURCE_NOT_FOUND` | 404 | Entity not found | "{Resource} not found" |
| `DUPLICATE_RESOURCE` | 409 | Unique constraint violation | "{Resource} with this {field} already exists" |
| `VALIDATION_ERROR` | 422 | Input validation failure | "Please fix the highlighted fields" |
| `BUSINESS_RULE_VIOLATION` | 422 | Business logic failed | Context-specific message |
| `SLOT_NOT_AVAILABLE` | 409 | Appointment slot taken | "This slot is no longer available" |
| `SLOT_OUTSIDE_SCHEDULE` | 422 | Slot outside doctor hours | "Selected time is outside doctor's working hours" |
| `DOCTOR_ON_LEAVE` | 422 | Doctor has leave | "Doctor is on leave on this date" |
| `PRESCRIPTION_FINALIZED` | 422 | Cannot edit finalized Rx | "Cannot modify a finalized prescription" |
| `DRUG_INTERACTION` | 422 | Dangerous drug combo | "Drug interaction detected: {details}" |
| `INSUFFICIENT_STOCK` | 422 | Not enough inventory | "Insufficient stock for {medicine}" |
| `BATCH_EXPIRED` | 422 | Expired batch selected | "Selected batch has expired" |
| `INVOICE_ALREADY_PAID` | 422 | Double payment attempt | "Invoice is already fully paid" |
| `REFUND_EXCEEDS_PAYMENT` | 422 | Refund > payment amount | "Refund amount cannot exceed payment amount" |
| `SETTLEMENT_MISMATCH` | 422 | Daily numbers don't match | "Settlement amount does not match expected total" |
| `FILE_TOO_LARGE` | 413 | Upload exceeds size limit | "File size exceeds the maximum allowed (5 MB)" |
| `FILE_TYPE_NOT_ALLOWED` | 415 | Invalid file type | "File type not supported. Allowed: JPG, PNG, PDF" |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | "Too many requests. Please wait and try again." |
| `EXTERNAL_SERVICE_ERROR` | 502 | Third-party service down | "Service temporarily unavailable" |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | "Something went wrong. Please try again later." |

---

### 1.2 Frontend Error Handling

#### Global Error Boundary

```tsx
// src/components/common/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to error reporting service (Sentry, etc.)
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

#### Axios Error Interceptor

```typescript
// src/services/api.ts
import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/components/ui/Toaster';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // for httpOnly refresh token cookie
});

// Request interceptor: attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config;

    // 1. Token expired → attempt silent refresh
    if (error.response?.status === 401 &&
        error.response?.data?.error?.code === 'AUTH_TOKEN_EXPIRED' &&
        !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        useAuthStore.getState().setAccessToken(data.data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.data.access_token}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login?session=expired';
        return Promise.reject(error);
      }
    }

    // 2. 403 → Permission denied
    if (error.response?.status === 403) {
      toast.error(
        error.response?.data?.error?.message || 'You do not have permission'
      );
    }

    // 3. 404 → Not found (usually handle in component)
    // 4. 422 → Validation / Business rule (handle in form)

    // 5. 429 → Rate limited
    if (error.response?.status === 429) {
      toast.error('Too many requests. Please wait a moment.');
    }

    // 6. 500 → Server error
    if (error.response?.status === 500) {
      toast.error('Something went wrong. Please try again later.');
    }

    // 7. Network error (no response)
    if (!error.response) {
      toast.error('Network error. Please check your connection.');
    }

    return Promise.reject(error);
  }
);
```

#### Form Validation Error Handling Pattern

```typescript
// Pattern for handling API validation errors in forms
async function handleSubmit(values: PatientFormData) {
  try {
    await patientService.create(values);
    toast.success(t('patient.created'));
    navigate('/patients');
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 422) {
      const apiErrors = error.response.data.error.details.field_errors;
      // Map API errors to react-hook-form
      apiErrors.forEach((err: FieldError) => {
        form.setError(err.field as keyof PatientFormData, {
          type: 'server',
          message: err.message,
        });
      });
    } else if (isAxiosError(error) && error.response?.status === 409) {
      // Duplicate detected
      toast.warning(error.response.data.error.message);
    }
    // Other errors handled by interceptor
  }
}
```

#### Error Scenarios & UI Responses

| Scenario | UI Response |
|----------|------------|
| Network offline | Banner at top: "You are offline. Changes will not be saved." |
| API returns 401 (expired) | Silent refresh → retry. If refresh fails → redirect to `/login?session=expired` |
| API returns 403 | Toast: "You don't have permission" |
| API returns 404 | Page-level: show `NotFound` component with back button |
| API returns 422 (validation) | Inline field errors under each field in red |
| API returns 422 (business rule) | Toast warning or inline error message |
| API returns 409 (duplicate) | Toast warning: "Record already exists" or duplicate detection modal |
| API returns 429 | Toast: "Too many requests, please wait" with countdown |
| API returns 500 | Toast: "Something went wrong" with retry button |
| JavaScript runtime error | ErrorBoundary: "Something went wrong" with reload button |
| Slow API response (>5s) | Loading skeleton shown; after 30s show timeout message |
| Form submission in progress | Submit button disabled + spinner; prevent double submit |
| Session about to expire | Modal at 5 min remaining: "Session expires soon. Continue?" with Extend/Logout |
| Concurrent edit conflict | Show diff comparison: "This record was modified. Reload or overwrite?" |

---

## Part 2: Internationalization (i18n) Strategy

### 2.1 Setup

**Library**: `react-i18next` + `i18next-http-backend` + `i18next-browser-languagedetector`

```typescript
// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: ['en', 'es', 'fr', 'de', 'ar', 'hi', 'pt', 'zh', 'ja'],
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [
      'common',         // shared strings (buttons, labels, status)
      'auth',           // login, register, password
      'patients',       // patient module
      'doctors',        // doctor module
      'appointments',   // appointment module
      'prescriptions',  // prescription module
      'pharmacy',       // pharmacy module
      'optical',        // optical module
      'billing',        // billing module
      'inventory',      // inventory module
      'reports',        // reports module
      'admin',          // admin panel
      'errors',         // error messages
      'validation',     // form validation messages
    ],
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });
```

### 2.2 Translation File Structure

```
public/locales/
├── en/
│   ├── common.json
│   ├── auth.json
│   ├── patients.json
│   ├── doctors.json
│   ├── appointments.json
│   ├── prescriptions.json
│   ├── pharmacy.json
│   ├── optical.json
│   ├── billing.json
│   ├── inventory.json
│   ├── reports.json
│   ├── admin.json
│   ├── errors.json
│   └── validation.json
├── es/  (same structure)
├── fr/  (same structure)
├── de/  (same structure)
├── ar/  (same structure, RTL)
├── hi/  (same structure)
├── pt/  (same structure)
├── zh/  (same structure)
└── ja/  (same structure)
```

### 2.3 Translation Key Structure (Examples)

```json
// en/common.json
{
  "app_name": "Hospital Management System",
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "search": "Search",
    "filter": "Filter",
    "export": "Export",
    "print": "Print",
    "back": "Back",
    "next": "Next",
    "previous": "Previous",
    "submit": "Submit",
    "confirm": "Confirm",
    "close": "Close",
    "refresh": "Refresh",
    "reset": "Reset",
    "view": "View",
    "download": "Download",
    "upload": "Upload",
    "approve": "Approve",
    "reject": "Reject"
  },
  "status": {
    "active": "Active",
    "inactive": "Inactive",
    "pending": "Pending",
    "completed": "Completed",
    "cancelled": "Cancelled"
  },
  "table": {
    "no_data": "No records found",
    "loading": "Loading...",
    "showing": "Showing {{from}} to {{to}} of {{total}} results",
    "rows_per_page": "Rows per page",
    "select_all": "Select all",
    "selected": "{{count}} selected"
  },
  "confirm_dialog": {
    "delete_title": "Confirm Deletion",
    "delete_message": "Are you sure you want to delete this {{resource}}? This action cannot be undone.",
    "yes_delete": "Yes, Delete",
    "no_cancel": "No, Cancel"
  },
  "time": {
    "just_now": "Just now",
    "minutes_ago": "{{count}} min ago",
    "hours_ago": "{{count}} hours ago",
    "days_ago": "{{count}} days ago",
    "today": "Today",
    "yesterday": "Yesterday",
    "tomorrow": "Tomorrow"
  }
}
```

```json
// en/patients.json
{
  "title": "Patients",
  "new_patient": "New Patient",
  "edit_patient": "Edit Patient",
  "search_placeholder": "Search by name, phone, or patient ID...",
  "fields": {
    "patient_id": "Patient ID",
    "first_name": "First Name",
    "last_name": "Last Name",
    "date_of_birth": "Date of Birth",
    "age": "Age",
    "gender": "Gender",
    "blood_group": "Blood Group",
    "phone": "Phone Number",
    "email": "Email",
    "national_id": "National ID",
    "address": "Address",
    "emergency_contact": "Emergency Contact",
    "allergies": "Allergies",
    "chronic_conditions": "Chronic Conditions"
  },
  "gender_options": {
    "male": "Male",
    "female": "Female",
    "other": "Other",
    "prefer_not_to_say": "Prefer not to say"
  },
  "steps": {
    "personal": "Personal Info",
    "contact": "Contact Details",
    "medical": "Medical History",
    "emergency": "Emergency Contact",
    "documents": "Documents",
    "consent": "Consent",
    "review": "Review"
  },
  "messages": {
    "created": "Patient registered successfully",
    "updated": "Patient information updated",
    "photo_uploaded": "Photo uploaded successfully",
    "consent_saved": "Consent form saved",
    "duplicate_found": "A patient with similar details already exists"
  }
}
```

```json
// en/validation.json
{
  "required": "{{field}} is required",
  "min_length": "{{field}} must be at least {{min}} characters",
  "max_length": "{{field}} must not exceed {{max}} characters",
  "email_invalid": "Please enter a valid email address",
  "phone_invalid": "Please enter a valid phone number",
  "date_invalid": "Please enter a valid date",
  "date_future": "{{field}} cannot be in the future",
  "date_past": "{{field}} cannot be in the past",
  "number_min": "{{field}} must be at least {{min}}",
  "number_max": "{{field}} must not exceed {{max}}",
  "number_positive": "{{field}} must be a positive number",
  "password_weak": "Password must include uppercase, lowercase, number, and special character",
  "password_mismatch": "Passwords do not match",
  "file_too_large": "File size must not exceed {{max}}",
  "file_type": "Allowed file types: {{types}}",
  "unique": "{{field}} is already in use",
  "age_range": "Age must be between 0 and 150 years"
}
```

```json
// en/errors.json
{
  "network_error": "Network error. Please check your connection.",
  "server_error": "Something went wrong. Please try again later.",
  "session_expired": "Your session has expired. Please log in again.",
  "permission_denied": "You don't have permission to perform this action.",
  "not_found": "The requested {{resource}} was not found.",
  "rate_limited": "Too many requests. Please wait a moment.",
  "offline": "You are offline. Changes will not be saved.",
  "timeout": "Request timed out. Please try again.",
  "unknown": "An unexpected error occurred.",
  "session_expire_warning": "Your session will expire in {{minutes}} minutes. Would you like to continue?"
}
```

### 2.4 RTL Support

```typescript
// src/lib/rtl.ts
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang);
}

// In App.tsx or MainLayout:
useEffect(() => {
  const dir = isRTL(i18n.language) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', i18n.language);
}, [i18n.language]);
```

**Tailwind RTL config:**
```js
// tailwind.config.ts
plugins: [
  require('tailwindcss-rtl'), // Adds rtl: and ltr: variants
],
```

**RTL-aware component example:**
```tsx
<div className="flex ltr:flex-row rtl:flex-row-reverse gap-4">
  <Sidebar />
  <main className="ltr:ml-64 rtl:mr-64">
    {children}
  </main>
</div>
```

### 2.5 Date, Time, Numbers, Currency

```typescript
// src/utils/formatters.ts
import { format, formatDistance } from 'date-fns';
import { enUS, es, fr, ar, de, hi, pt, zhCN, ja } from 'date-fns/locale';

const localeMap: Record<string, Locale> = {
  en: enUS, es, fr, ar, de, hi, pt, zh: zhCN, ja,
};

export function formatDate(date: string | Date, pattern: string = 'PP', lang: string = 'en'): string {
  return format(new Date(date), pattern, { locale: localeMap[lang] || enUS });
}

export function formatCurrency(amount: number, currencyCode: string = 'USD', lang: string = 'en'): string {
  return new Intl.NumberFormat(lang, {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
}

export function formatNumber(value: number, lang: string = 'en'): string {
  return new Intl.NumberFormat(lang).format(value);
}

export function formatPhone(phone: string, countryCode: string = 'US'): string {
  // Use libphonenumber-js for international formatting
  const phoneNumber = parsePhoneNumber(phone, countryCode);
  return phoneNumber?.formatInternational() || phone;
}
```

### 2.6 Backend i18n (Error Messages)

The backend returns **error codes** (machine-readable), NOT translated messages. The frontend maps error codes to translated messages:

```typescript
// Frontend maps error codes to i18n keys
function getErrorMessage(errorCode: string, details?: Record<string, string>): string {
  const key = `errors.${errorCode}`;
  if (i18n.exists(key)) {
    return t(key, details);
  }
  return t('errors.unknown');
}
```

The `message` field in the API response is always in English and serves as a developer-friendly fallback.

---

## Part 3: Testing Strategy

### 3.1 Testing Pyramid

```
         /  E2E Tests  \          ← 5–10 critical user journeys
        / Integration    \        ← API endpoint tests
       /   Tests          \       ← Component integration
      /                    \
     /   Unit Tests          \    ← Services, utils, hooks, components
    /________________________\
```

### 3.2 Backend Testing

**Framework**: `pytest` + `pytest-asyncio` + `httpx` (async test client)

**Coverage Target**: ≥ 80% for services, ≥ 90% for utilities, ≥ 70% overall

#### Test Structure

```
tests/
├── conftest.py                 # Shared fixtures: test DB, client, auth
├── factories/                  # Test data factories (factory_boy)
│   ├── __init__.py
│   ├── user_factory.py
│   ├── patient_factory.py
│   ├── doctor_factory.py
│   ├── appointment_factory.py
│   ├── prescription_factory.py
│   ├── invoice_factory.py
│   └── inventory_factory.py
├── unit/
│   ├── test_auth_service.py
│   ├── test_patient_service.py
│   ├── test_doctor_service.py
│   ├── test_appointment_service.py
│   ├── test_prescription_service.py
│   ├── test_pharmacy_service.py
│   ├── test_billing_service.py
│   ├── test_inventory_service.py
│   ├── test_validators.py
│   ├── test_formatters.py
│   ├── test_id_generator.py
│   └── test_date_utils.py
├── integration/
│   ├── test_auth_api.py
│   ├── test_patient_api.py
│   ├── test_doctor_api.py
│   ├── test_appointment_api.py
│   ├── test_prescription_api.py
│   ├── test_pharmacy_api.py
│   ├── test_billing_api.py
│   ├── test_inventory_api.py
│   ├── test_report_api.py
│   └── test_admin_api.py
└── e2e/
    ├── test_patient_journey.py
    └── test_billing_flow.py
```

#### Key Test Fixture (conftest.py)

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.main import app
from app.core.database import get_db
from app.core.security import create_access_token

# Use a separate test database
TEST_DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5433/hms_test"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def admin_client(client, db_session):
    """Client with admin authentication."""
    # Create admin user + token
    admin = await create_test_admin(db_session)
    token = create_access_token(data={"sub": str(admin.id), "role": "admin"})
    client.headers["Authorization"] = f"Bearer {token}"
    return client

@pytest_asyncio.fixture
async def doctor_client(client, db_session):
    """Client with doctor authentication."""
    doctor = await create_test_doctor(db_session)
    token = create_access_token(data={"sub": str(doctor.user_id), "role": "doctor"})
    client.headers["Authorization"] = f"Bearer {token}"
    return client
```

#### Test Examples

```python
# tests/unit/test_patient_service.py
import pytest
from app.services.patient_service import PatientService
from app.schemas.patient import PatientCreate

class TestPatientService:
    async def test_create_patient_success(self, db_session):
        service = PatientService(db_session)
        patient_data = PatientCreate(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="male",
            phone_country_code="+1",
            phone_number="5551234567",
        )
        patient = await service.create(patient_data, created_by=admin_id)
        assert patient.first_name == "John"
        assert patient.patient_id_number.startswith("PAT-")

    async def test_create_patient_duplicate_phone(self, db_session):
        service = PatientService(db_session)
        # Create first patient
        await service.create(patient_data_1, created_by=admin_id)
        # Try creating duplicate
        with pytest.raises(DuplicateError):
            await service.create(patient_data_same_phone, created_by=admin_id)

    async def test_search_patient_by_name(self, db_session):
        service = PatientService(db_session)
        await service.create(john_data, created_by=admin_id)
        results = await service.search(query="John")
        assert len(results.items) >= 1
        assert results.items[0].first_name == "John"

    async def test_age_calculation(self, db_session):
        service = PatientService(db_session)
        patient = await service.create(
            PatientCreate(date_of_birth="2000-06-15", ...),
            created_by=admin_id
        )
        assert patient.age_years >= 25  # Depends on current date

# tests/integration/test_patient_api.py
class TestPatientAPI:
    async def test_create_patient_endpoint(self, admin_client):
        response = await admin_client.post("/api/v1/patients", json={
            "first_name": "Jane",
            "last_name": "Smith",
            "gender": "female",
            "phone_country_code": "+1",
            "phone_number": "5559876543",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["first_name"] == "Jane"

    async def test_create_patient_unauthorized(self, client):
        response = await client.post("/api/v1/patients", json={...})
        assert response.status_code == 401

    async def test_create_patient_validation_error(self, admin_client):
        response = await admin_client.post("/api/v1/patients", json={
            "first_name": "",  # Empty → validation error
        })
        assert response.status_code == 422
        errors = response.json()["error"]["details"]["field_errors"]
        assert any(e["field"] == "first_name" for e in errors)

    async def test_get_patients_paginated(self, admin_client):
        response = await admin_client.get("/api/v1/patients?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data["data"]
        assert "total" in data["data"]
        assert "page" in data["data"]

    async def test_receptionist_cannot_delete_patient(self, receptionist_client):
        response = await receptionist_client.delete("/api/v1/patients/{id}")
        assert response.status_code == 403
```

### 3.3 Frontend Testing

**Framework**: `Vitest` + `React Testing Library` + `@testing-library/user-event`

**Coverage Target**: ≥ 70% for components, ≥ 90% for hooks/utils

#### Test Structure

```
src/
├── __tests__/                   # Top-level integration tests
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx      # Co-located test
│   ├── tables/
│   │   ├── DataTable.tsx
│   │   └── DataTable.test.tsx
│   └── forms/
│       ├── PhoneInput.tsx
│       └── PhoneInput.test.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useAuth.test.ts
├── utils/
│   ├── formatters.ts
│   └── formatters.test.ts
├── pages/
│   └── patients/
│       ├── PatientListPage.tsx
│       └── PatientListPage.test.tsx
└── test/
    ├── setup.ts                 # Vitest setup (jsdom, mocks)
    ├── mocks/
    │   ├── handlers.ts          # MSW handlers (mock API)
    │   └── server.ts            # MSW server setup
    └── utils.tsx                # Render helpers (providers wrapper)
```

#### MSW (Mock Service Worker) Setup

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json();
    if (body.email === 'admin@test.com' && body.password === 'Test@1234') {
      return HttpResponse.json({
        success: true,
        data: { access_token: 'mock-token', user: { id: '1', name: 'Admin' } },
      });
    }
    return HttpResponse.json(
      { success: false, error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid' } },
      { status: 401 }
    );
  }),

  http.get('/api/v1/patients', () => {
    return HttpResponse.json({
      success: true,
      data: {
        items: [
          { id: '1', first_name: 'John', last_name: 'Doe', patient_id_number: 'PAT-2026-00001' },
        ],
        total: 1, page: 1, page_size: 10, total_pages: 1,
      },
    });
  }),

  // ... more handlers per module
];
```

#### Test Examples

```typescript
// src/components/ui/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});

// src/pages/patients/PatientListPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { PatientListPage } from './PatientListPage';
import { TestProviders } from '@/test/utils';

describe('PatientListPage', () => {
  it('renders patient data table', async () => {
    render(<PatientListPage />, { wrapper: TestProviders });
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('PAT-2026-00001')).toBeInTheDocument();
  });

  it('shows empty state when no patients', async () => {
    // Override handler
    server.use(
      http.get('/api/v1/patients', () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } })
      )
    );
    render(<PatientListPage />, { wrapper: TestProviders });
    await waitFor(() => {
      expect(screen.getByText(/no records found/i)).toBeInTheDocument();
    });
  });

  it('opens create patient page on button click', async () => {
    render(<PatientListPage />, { wrapper: TestProviders });
    await userEvent.click(screen.getByRole('button', { name: /new patient/i }));
    // Assert navigation
  });
});

// src/hooks/useAuth.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('logs in successfully', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: TestProviders });
    await act(async () => {
      await result.current.login('admin@test.com', 'Test@1234');
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Admin');
  });

  it('handles invalid credentials', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: TestProviders });
    await act(async () => {
      await expect(
        result.current.login('wrong@test.com', 'wrong')
      ).rejects.toThrow();
    });
    expect(result.current.isAuthenticated).toBe(false);
  });
});

// src/utils/formatters.test.ts
describe('formatCurrency', () => {
  it('formats USD', () => {
    expect(formatCurrency(1234.56, 'USD', 'en')).toBe('$1,234.56');
  });
  it('formats EUR in German locale', () => {
    expect(formatCurrency(1234.56, 'EUR', 'de')).toMatch(/1.*234,56/);
  });
  it('formats INR', () => {
    expect(formatCurrency(1234.56, 'INR', 'en')).toMatch(/₹/);
  });
});
```

### 3.4 End-to-End Testing

**Framework**: `Playwright`

**Target**: 5–10 critical user journeys

```
e2e/
├── fixtures/
│   ├── auth.ts          # Login setup fixture
│   └── testData.ts      # Test data setup
├── pages/               # Page Object Model
│   ├── LoginPage.ts
│   ├── PatientListPage.ts
│   ├── PatientFormPage.ts
│   ├── AppointmentPage.ts
│   ├── PrescriptionPage.ts
│   └── BillingPage.ts
├── tests/
│   ├── auth.spec.ts
│   ├── patient-registration.spec.ts
│   ├── appointment-booking.spec.ts
│   ├── prescription-dispensing.spec.ts
│   ├── billing-flow.spec.ts
│   └── admin-settings.spec.ts
└── playwright.config.ts
```

#### Critical E2E Test Scenarios

```typescript
// e2e/tests/patient-registration.spec.ts
test.describe('Patient Registration Flow', () => {
  test('Receptionist can register a new patient', async ({ page }) => {
    await loginAsReceptionist(page);
    await page.goto('/patients/new');
    
    // Step 1: Personal Info
    await page.fill('[name="first_name"]', 'Test');
    await page.fill('[name="last_name"]', 'Patient');
    await page.fill('[name="date_of_birth"]', '1990-01-15');
    await page.selectOption('[name="gender"]', 'male');
    await page.click('button:has-text("Next")');
    
    // Step 2: Contact
    await page.fill('[name="phone_number"]', '5551234567');
    await page.click('button:has-text("Next")');
    
    // ... more steps
    
    // Final: Submit
    await page.click('button:has-text("Register Patient")');
    
    // Verify success
    await expect(page.locator('.toast-success')).toContainText('Patient registered');
    await expect(page).toHaveURL(/\/patients\/PAT-/);
  });
});

// e2e/tests/billing-flow.spec.ts
test.describe('Complete Billing Flow', () => {
  test('Consultation → Prescription → Dispensing → Invoice → Payment', async ({ page }) => {
    // 1. Book appointment
    await loginAsReceptionist(page);
    // ... book appointment
    
    // 2. Doctor creates prescription
    await loginAsDoctor(page);
    // ... create prescription
    
    // 3. Pharmacist dispenses
    await loginAsPharmacist(page);
    // ... dispense medicines
    
    // 4. Billing creates invoice
    await loginAsBillingClerk(page);
    // ... create invoice, add items
    
    // 5. Payment
    // ... process payment
    
    // 6. Verify receipt
    await expect(page.locator('.invoice-status')).toContainText('Paid');
  });
});
```

### 3.5 CI/CD Test Pipeline

```yaml
# .github/workflows/ci.yml
name: CI Pipeline
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: hms_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install -r requirements-dev.txt
      - name: Lint (ruff)
        run: cd backend && ruff check .
      - name: Type check (mypy)
        run: cd backend && mypy app/
      - name: Unit tests
        run: cd backend && pytest tests/unit/ -v --cov=app --cov-report=xml
      - name: Integration tests
        run: cd backend && pytest tests/integration/ -v
        env:
          DATABASE_URL: postgresql+asyncpg://test:test@localhost:5432/hms_test
          REDIS_URL: redis://localhost:6379
      - name: Upload coverage
        uses: codecov/codecov-action@v4

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Lint (ESLint)
        run: cd frontend && npm run lint
      - name: Type check
        run: cd frontend && npx tsc --noEmit
      - name: Unit + component tests
        run: cd frontend && npm run test -- --coverage
      - name: Build
        run: cd frontend && npm run build

  e2e-tests:
    needs: [backend-tests, frontend-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start services
        run: docker compose -f docker-compose.test.yml up -d
      - name: Wait for services
        run: |
          npx wait-on http://localhost:8000/health
          npx wait-on http://localhost:5173
      - name: Install Playwright
        run: cd frontend && npx playwright install --with-deps
      - name: Run E2E tests
        run: cd frontend && npx playwright test
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

### 3.6 Test Data Factories (Backend)

```python
# tests/factories/patient_factory.py
from factory import Factory, Faker, Sequence, LazyAttribute
from app.models.patient import Patient

class PatientFactory(Factory):
    class Meta:
        model = Patient

    id = Faker('uuid4')
    patient_id_number = Sequence(lambda n: f"PAT-2026-{n:05d}")
    first_name = Faker('first_name')
    last_name = Faker('last_name')
    date_of_birth = Faker('date_of_birth', minimum_age=1, maximum_age=100)
    gender = Faker('random_element', elements=['male', 'female', 'other'])
    phone_country_code = '+1'
    phone_number = Faker('numerify', text='##########')
    email = Faker('email')
    blood_group = Faker('random_element', elements=['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'])
    country = 'US'
    is_active = True

class DoctorFactory(Factory):
    class Meta:
        model = Doctor
    # ... similar pattern

class AppointmentFactory(Factory):
    class Meta:
        model = Appointment
    # ... similar pattern
```

### 3.7 Performance Testing

**Tool**: `Locust` (Python-based, consistent with backend)

```python
# tests/performance/locustfile.py
from locust import HttpUser, task, between

class HMSUser(HttpUser):
    wait_time = between(1, 5)
    
    def on_start(self):
        # Login and store token
        response = self.client.post("/api/v1/auth/login", json={
            "email": "loadtest@test.com",
            "password": "Test@12345"
        })
        self.token = response.json()["data"]["access_token"]
        self.client.headers["Authorization"] = f"Bearer {self.token}"

    @task(3)
    def get_patients(self):
        self.client.get("/api/v1/patients?page=1&page_size=20")

    @task(2)
    def search_patients(self):
        self.client.get("/api/v1/patients/search?query=John")

    @task(2)
    def get_appointments(self):
        self.client.get("/api/v1/appointments?date=2026-02-10")

    @task(1)
    def get_queue(self):
        self.client.get("/api/v1/appointments/queue?doctor_id=xxx")

    @task(1)
    def get_dashboard(self):
        self.client.get("/api/v1/reports/dashboard")
```

**Performance Targets:**
| Metric | Target |
|--------|--------|
| API p50 latency | < 100ms |
| API p95 latency | < 500ms |
| API p99 latency | < 1000ms |
| Concurrent users | 100 (minimum) |
| Patient search (p95) | < 200ms |
| Dashboard load (p95) | < 800ms |
| Report generation (p95) | < 3000ms |
| Frontend bundle size (gzipped) | < 500KB |
| Largest Contentful Paint (LCP) | < 2.5s |
| First Input Delay (FID) | < 100ms |
| Cumulative Layout Shift (CLS) | < 0.1 |
