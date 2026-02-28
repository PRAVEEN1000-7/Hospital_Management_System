# Phase 0 — Foundation: Use Cases & Wireframe Flow

> **Tables (11):** hospitals, departments, hospital_settings, tax_configurations, users, roles, permissions, user_roles, role_permissions, refresh_tokens, password_emails
> **Focus:** Hospital config, Authentication, RBAC, User Management

---

## Eraser.io Use Case Diagram

Copy the code below into [eraser.io](https://app.eraser.io) → Diagram as Code:

```eraser
// =============================================================================
// PHASE 0: FOUNDATION — USE CASE DIAGRAM
// =============================================================================

// Actors
Super Admin [icon: shield, color: red]
Admin [icon: user-check, color: orange]
Any User [icon: user, color: blue]
System [icon: cpu, color: gray]

// ─────────────────────────────────────────────
// Hospital Configuration
// ─────────────────────────────────────────────

Configure Hospital [icon: home, color: blue] {
  description: "Set up hospital name, address, logo, timezone, currency"
}

Manage Hospital Settings [icon: settings, color: blue] {
  description: "ID numbering, appointment rules, notification prefs, branding"
}

Manage Departments [icon: layers, color: blue] {
  description: "Create/edit/deactivate departments (Cardiology, ER, etc.)"
}

Configure Tax Rules [icon: percent, color: blue] {
  description: "Define GST/VAT rates, effective dates, applies to product/service"
}

// ─────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────

Login [icon: log-in, color: green] {
  description: "Email/username + password → JWT access + refresh tokens"
}

Logout [icon: log-out, color: green] {
  description: "Revoke refresh token, end session"
}

Change Own Password [icon: lock, color: green] {
  description: "User updates their own password"
}

View Edit Profile [icon: user, color: green] {
  description: "View/edit name, phone, avatar, language, timezone"
}

// ─────────────────────────────────────────────
// User Management & RBAC
// ─────────────────────────────────────────────

Create User Account [icon: user-plus, color: purple] {
  description: "Super Admin creates staff with temp password, sends via email"
}

Manage User Roles [icon: link, color: purple] {
  description: "Assign/revoke roles (doctor, receptionist, cashier) to users"
}

Define Roles and Permissions [icon: shield, color: purple] {
  description: "Create roles, assign granular permissions (module.action.resource)"
}

Reset User Password [icon: key, color: purple] {
  description: "Super Admin resets password & sends via email"
}

// ─────────────────────────────────────────────
// Relationships
// ─────────────────────────────────────────────

Super Admin > Configure Hospital
Super Admin > Manage Hospital Settings
Super Admin > Create User Account
Super Admin > Manage User Roles
Super Admin > Define Roles and Permissions
Super Admin > Reset User Password

Admin > Manage Departments
Admin > Configure Tax Rules

Any User > Login
Any User > Logout
Any User > Change Own Password
Any User > View Edit Profile

System > Login: "Issues JWT tokens"
System > Create User Account: "Sends password email"
System > Reset User Password: "Sends password email"
```

---

## Use Case Descriptions

### UC-0.1: Configure Hospital
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `hospitals` |
| **Precondition** | System is freshly installed |
| **Main Flow** | 1. Super Admin enters hospital name, code, address, phone, email, logo<br>2. Sets timezone, currency, tax ID, registration number<br>3. System saves to `hospitals` table<br>4. Hospital becomes the root entity for all data |
| **Postcondition** | Hospital record exists, all other tables can reference `hospital_id` |

### UC-0.2: Manage Hospital Settings
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `hospital_settings` |
| **Precondition** | Hospital exists |
| **Main Flow** | 1. Set 2-char hospital code for ID generation (e.g., "HC")<br>2. Configure patient/staff ID start numbers and sequences<br>3. Set invoice/prescription prefixes and sequences<br>4. Configure appointment slot duration, max daily appointments<br>5. Toggle walk-in, emergency bypass, notifications<br>6. Set consultation fee defaults, follow-up validity days<br>7. Configure branding colors and print header/footer |
| **Postcondition** | 1:1 settings row created, ID generation and appointment rules active |

### UC-0.3: Manage Departments
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `departments` |
| **Precondition** | Hospital exists |
| **Main Flow** | 1. Admin creates department with name, 2-char code (CC, GP, ER)<br>2. Sets display order for sidebar sorting<br>3. Can deactivate departments (they stop appearing in dropdowns)<br>4. Head doctor assigned later in Phase 1 |
| **Postcondition** | Department available for doctor assignment and ID generation |

### UC-0.4: Configure Tax Rules
| Field | Detail |
|-------|--------|
| **Actor** | Admin |
| **Tables** | `tax_configurations` |
| **Precondition** | Hospital exists |
| **Main Flow** | 1. Admin creates tax rule with name ("GST 18%"), code, rate percentage<br>2. Sets whether it applies to products, services, or both<br>3. Marks compound taxes (tax on tax) if applicable<br>4. Sets effective date range<br>5. Old tax rules deactivated, not deleted |
| **Postcondition** | Tax rules available for invoices, medicines, and optical products |

### UC-0.5: Login
| Field | Detail |
|-------|--------|
| **Actor** | Any User |
| **Tables** | `users`, `refresh_tokens` |
| **Precondition** | User account exists and is active |
| **Main Flow** | 1. User enters email/username + password<br>2. System verifies bcrypt hash<br>3. If `must_change_password` = true → redirect to change password<br>4. System issues JWT access token (15 min) + refresh token (7 days)<br>5. Refresh token hash stored in `refresh_tokens` with device info and IP<br>6. `last_login_at` updated, `failed_login_attempts` reset |
| **Exception** | Wrong password → increment `failed_login_attempts`; 5 failures → set `locked_until` |

### UC-0.6: Logout
| Field | Detail |
|-------|--------|
| **Actor** | Any User |
| **Tables** | `refresh_tokens` |
| **Main Flow** | 1. User clicks logout<br>2. System sets `revoked_at` on the refresh token<br>3. Access token expires naturally (15 min) or client discards it |

### UC-0.7: Create User Account
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `users`, `password_emails` |
| **Main Flow** | 1. Super Admin fills in email, name, phone, role<br>2. System generates temporary password<br>3. Saves user with `must_change_password` = true<br>4. Sends password to user's email<br>5. Logs the email in `password_emails` (who sent, to whom, when) |
| **Postcondition** | User can log in and must change password on first login |

### UC-0.8: Manage User Roles
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `users`, `user_roles`, `roles` |
| **Main Flow** | 1. Super Admin selects a user<br>2. Views currently assigned roles<br>3. Assigns new role(s) → row created in `user_roles` with `assigned_by`<br>4. Revokes role → row removed from `user_roles`<br>5. A user can have multiple roles (e.g., doctor + admin) |

### UC-0.9: Define Roles & Permissions
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `roles`, `permissions`, `role_permissions` |
| **Main Flow** | 1. Super Admin creates custom role with name and description<br>2. Views permission matrix (module × action × resource)<br>3. Assigns permissions to role via `role_permissions`<br>4. System roles (super_admin, doctor, etc.) cannot be deleted (`is_system` = true) |

### UC-0.10: Reset User Password
| Field | Detail |
|-------|--------|
| **Actor** | Super Admin |
| **Tables** | `users`, `password_emails` |
| **Main Flow** | 1. Super Admin selects a user<br>2. Clicks "Reset Password"<br>3. System generates new temp password, sets `must_change_password` = true<br>4. Sends password via email<br>5. Logs in `password_emails` table |

### UC-0.11: Change Own Password
| Field | Detail |
|-------|--------|
| **Actor** | Any User |
| **Tables** | `users` |
| **Main Flow** | 1. User enters current password + new password<br>2. System verifies current password hash<br>3. Hashes new password with bcrypt<br>4. Updates `password_hash` and `password_changed_at`<br>5. Sets `must_change_password` = false |

### UC-0.12: View / Edit Profile
| Field | Detail |
|-------|--------|
| **Actor** | Any User |
| **Tables** | `users` |
| **Main Flow** | 1. User views their profile (name, email, phone, avatar)<br>2. Can edit first name, last name, phone, avatar, preferred locale, timezone<br>3. Cannot change email or role (admin-only) |

---

## Data Flow: Login → Dashboard

```
User enters credentials
        │
        ▼
┌─ users table ─────────────────┐
│  Check: is_active? locked?    │
│  Verify: bcrypt(password)     │
│  Check: must_change_password? │
└───────────┬───────────────────┘
            │ ✓ Valid
            ▼
┌─ refresh_tokens ──────────────┐
│  Store: token_hash (SHA-256)  │
│  Store: device_info, ip       │
│  Set: expires_at              │
└───────────┬───────────────────┘
            │
            ▼
┌─ user_roles + role_permissions ─┐
│  Load: user's roles              │
│  Load: role's permissions        │
│  Build: JWT payload with claims  │
└───────────┬─────────────────────┘
            │
            ▼
    Return JWT + Refresh Token
    → Frontend renders dashboard
      based on role permissions
```

## Data Flow: Super Admin Creates User

```
Super Admin fills user form
        │
        ▼
┌─ users table ─────────────────┐
│  Insert: email, name, phone   │
│  Set: password_hash (temp)    │
│  Set: must_change_password=T  │
│  Generate: reference_number   │
└───────────┬───────────────────┘
            │
            ├────────────────────┐
            ▼                    ▼
┌─ user_roles ──────┐  ┌─ password_emails ─────┐
│  Assign role(s)   │  │  Log: sent_by, email   │
│  Set: assigned_by │  │  Set: is_temp_password │
│  Set: assigned_at │  │  → Send email          │
└───────────────────┘  └────────────────────────┘
```
