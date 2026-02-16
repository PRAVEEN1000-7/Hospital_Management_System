"""
HMS AI Chat — Role-Based Knowledge Base & Permission Matrix
============================================================
This file contains ALL knowledge the AI needs about the HMS system:
- Role permissions (who can do what)
- Navigation paths (where to find things)
- Step-by-step guides (how to do things)
- Error resolution (what to do when stuck)

PLUG-AND-PLAY: This file is self-contained. Delete it + chat_service.py +
routers/chat.py + 1 line in main.py to fully remove the AI system.
"""

# ──────────────────────────────────────────────
# 1. ROLE DEFINITIONS
# ──────────────────────────────────────────────
ROLES = {
    "super_admin": {
        "label": "Super Admin",
        "level": 1,
        "description": "Full system access. Manages users, hospital config, and all operations.",
    },
    "admin": {
        "label": "Admin",
        "level": 2,
        "description": "Hospital configuration and management. Cannot manage users.",
    },
    "doctor": {
        "label": "Doctor",
        "level": 3,
        "description": "Patient care and records. Standard clinical access.",
    },
    "nurse": {
        "label": "Nurse",
        "level": 3,
        "description": "Patient care support. Standard clinical access.",
    },
    "receptionist": {
        "label": "Receptionist",
        "level": 4,
        "description": "Patient registration and front-desk operations.",
    },
    "pharmacist": {
        "label": "Pharmacist",
        "level": 4,
        "description": "Medication management (feature planned).",
    },
    "cashier": {
        "label": "Cashier",
        "level": 4,
        "description": "Billing and payment operations (feature planned).",
    },
    "inventory_manager": {
        "label": "Inventory Manager",
        "level": 4,
        "description": "Stock and inventory management (feature planned).",
    },
    "staff": {
        "label": "Staff",
        "level": 5,
        "description": "General staff. Basic authenticated access only.",
    },
}

# ──────────────────────────────────────────────
# 2. PERMISSION MATRIX
# ──────────────────────────────────────────────
# Format: action -> list of roles that CAN do it
PERMISSIONS = {
    # ── Patient Operations ──
    "register_patient": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to sidebar → click 'Register Patient' or Dashboard → Quick Actions → 'Register New Patient'. Fill in the form (Personal, Contact, Address, Emergency Contact) and click 'Register Patient'.",
        "nav_path": "/register",
        "description": "Register a new patient in the system",
    },
    "view_patients": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to sidebar → click 'Patient Directory'. You can search by name, PRN, or phone number. Click on any patient row to view full details.",
        "nav_path": "/patients",
        "description": "View the patient directory and individual patient records",
    },
    "view_patient_detail": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to Patient Directory → click on a patient's row → you'll see their full profile with Personal Info, Contact, Address, Emergency Contact, and metadata.",
        "nav_path": "/patients/:id",
        "description": "View detailed information about a specific patient",
    },
    "delete_patient": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to Patient Directory → find the patient → click the Delete (trash) icon on the right side of their row → confirm the deletion in the popup.",
        "nav_path": "/patients",
        "description": "Soft-delete (deactivate) a patient record",
    },
    "view_patient_id_card": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to Patient Detail page → click 'View ID Card' button → you can then Download PDF, Print, or Email the card.",
        "nav_path": "/patients/:id/id-card",
        "description": "View, download, print, or email a patient's ID card",
    },

    # ── User/Staff Management ──
    "manage_users": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to sidebar → click 'User Management'. You can create, edit, delete users and reset passwords. Only Super Admins can access this.",
        "nav_path": "/user-management",
        "description": "Create, edit, delete users and manage their roles",
    },
    "create_user": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to User Management → click '+ Add User' button → fill in username, email, password, role, department → click 'Create User'.",
        "nav_path": "/user-management",
        "description": "Create a new system user account",
    },
    "delete_user": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to User Management → find the user → click the Delete icon → confirm deletion. Note: You cannot delete yourself or the last Super Admin.",
        "nav_path": "/user-management",
        "description": "Deactivate a user account",
    },
    "reset_user_password": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to User Management → find the user → click the Key/Reset icon → enter new password or toggle auto-generate → click 'Reset Password'.",
        "nav_path": "/user-management",
        "description": "Reset another user's password",
    },
    "view_staff_directory": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to sidebar → click 'Staff Directory'. You can search staff, filter by role, view profiles, and export to CSV.",
        "nav_path": "/staff",
        "description": "View all staff members in the system",
    },
    "create_staff": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to Staff Directory → click '+ Add Staff' button → fill in personal info, role, department, password → click 'Save Staff Member'.",
        "nav_path": "/staff",
        "description": "Add a new staff member",
    },
    "edit_staff": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to Staff Directory → find the staff member → click Edit (pencil) icon → modify fields → click 'Update Staff Member'.",
        "nav_path": "/staff",
        "description": "Edit a staff member's information",
    },
    "delete_staff": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to Staff Directory → find the staff member → click Delete (trash) icon → confirm deletion.",
        "nav_path": "/staff",
        "description": "Deactivate a staff member's account",
    },
    "reset_staff_password": {
        "allowed_roles": ["super_admin"],
        "how_to": "Go to Staff Directory → find the staff member → click Key icon → enter new password or auto-generate → click 'Reset Password'.",
        "nav_path": "/staff",
        "description": "Reset a staff member's password",
    },
    "export_staff_csv": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to Staff Directory → click the 'Export CSV' button in the toolbar. A CSV file with all visible staff will download.",
        "nav_path": "/staff",
        "description": "Export the staff list as a CSV file",
    },

    # ── Hospital Configuration ──
    "configure_hospital": {
        "allowed_roles": ["super_admin", "admin"],
        "how_to": "Go to sidebar → click 'Hospital Setup'. Fill in hospital name, contact details, address, legal info (GST, PAN), and operating hours → click 'Save'.",
        "nav_path": "/hospital-setup",
        "description": "Configure hospital details (name, address, legal, hours)",
    },
    "upload_hospital_logo": {
        "allowed_roles": ["super_admin", "admin"],
        "how_to": "Go to Hospital Setup → click on the logo upload area → select a JPG, PNG, or SVG file (max 2MB). The logo appears on ID cards and reports.",
        "nav_path": "/hospital-setup",
        "description": "Upload or change the hospital logo",
    },

    # ── Profile & Password ──
    "view_own_profile": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Click your name/avatar in the sidebar bottom → or go to the Profile page. You'll see your username, email, and role.",
        "nav_path": "/profile",
        "description": "View your own profile information",
    },
    "change_own_password": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Go to Profile page → expand 'Change Password' section → enter current password, new password (must have uppercase, lowercase, number, special char, 8+ chars), confirm → click 'Update Password'.",
        "nav_path": "/profile",
        "description": "Change your own login password",
    },

    # ── Dashboard ──
    "view_dashboard": {
        "allowed_roles": ["super_admin", "admin", "doctor", "nurse", "receptionist", "pharmacist", "cashier", "inventory_manager", "staff"],
        "how_to": "Click 'Dashboard' in the sidebar. Shows total patients, quick actions, and system status.",
        "nav_path": "/dashboard",
        "description": "View the main dashboard with statistics and quick actions",
    },
}

# ──────────────────────────────────────────────
# 3. NAVIGATION MAP
# ──────────────────────────────────────────────
NAVIGATION = {
    "Dashboard": {"path": "/dashboard", "icon": "dashboard", "all_roles": True},
    "Register Patient": {"path": "/register", "icon": "person_add", "all_roles": True},
    "Patient Directory": {"path": "/patients", "icon": "group", "all_roles": True},
    "Staff Directory": {"path": "/staff", "icon": "badge", "all_roles": True},
    "User Management": {"path": "/user-management", "icon": "admin_panel_settings", "all_roles": False, "roles": ["super_admin"]},
    "Hospital Setup": {"path": "/hospital-setup", "icon": "local_hospital", "all_roles": False, "roles": ["super_admin", "admin"]},
    "Profile": {"path": "/profile", "icon": "account_circle", "all_roles": True},
}

# ──────────────────────────────────────────────
# 4. SYSTEM KNOWLEDGE (for Groq context)
# ──────────────────────────────────────────────
HMS_SYSTEM_KNOWLEDGE = """
## Hospital Management System (HMS) — Complete Knowledge Base

### System Overview
HMS is a hospital management web application for managing patients, staff, hospital config, and authentication.
It has 9 user roles with different access levels.

### Roles & Access Levels
1. **Super Admin** — Full access. Can manage users, staff, hospital settings, patients, everything.
2. **Admin** — Can configure hospital settings and manage patients. Cannot manage users.
3. **Doctor** — Can register, view, and manage patients. Cannot manage users or hospital settings.
4. **Nurse** — Same as Doctor. Patient care access.
5. **Receptionist** — Patient registration and directory access.
6. **Pharmacist** — Patient access (medication features planned).
7. **Cashier** — Patient access (billing features planned).
8. **Inventory Manager** — Patient access (stock features planned).
9. **Staff** — Basic access. Can view/register patients, view staff directory, manage own profile.

### Key Features
- **Patient Registration**: Auto-generates PRN (Patient Reference Number) like HMS-000001
- **Patient Directory**: Search by name, PRN, phone. Paginated. View details, ID cards.
- **Patient ID Card**: Can be downloaded as PDF, printed, or emailed to the patient.
- **Staff Directory**: View all staff, search, filter by role, export CSV.
- **User Management**: Super Admin only — create/edit/delete users, reset passwords.
- **Hospital Setup**: Super Admin and Admin — configure hospital name, address, legal info, logo, hours.
- **Profile**: Everyone can view their profile and change their own password.

### Password Requirements
- Minimum 8 characters
- Must contain: uppercase letter, lowercase letter, number, special character
- Examples of valid passwords: MyPass@123, Hospital#2026

### Patient Registration Fields
- Personal: Title (Mr./Mrs./Ms./etc.), First Name, Last Name, Date of Birth, Gender, Blood Group
- Contact: Country Code, Mobile Number, Email (optional)
- Address: Address Line 1, Address Line 2 (optional), City, State, PIN Code, Country
- Emergency: Contact Name, Country Code, Mobile, Relationship

### Navigation
- **Sidebar** on the left has: Dashboard, Register Patient, Patient Directory, Staff Directory, User Management (Super Admin only), Hospital Setup (Admin+), Profile
- **Top bar** has search (decorative) and notification bell (decorative)
- **User avatar** at bottom of sidebar shows current user

### Common Issues & Solutions
- "I can't see User Management" → Only Super Admins see it. Ask a Super Admin if you need user changes.
- "Login failed" → Check username and password. Passwords are case-sensitive.
- "Cannot delete patient" → Any authenticated user can delete patients from Patient Directory.
- "How to print ID card" → Patient Detail → View ID Card → click Print button.
- "Forgot password" → Ask a Super Admin to reset it via User Management or Staff Directory.
- "Hospital logo not showing on ID card" → Admin/Super Admin must upload logo via Hospital Setup first.

### Employee ID Format
- Doctors: DOC-YYYY-XXXX
- Nurses: NUR-YYYY-XXXX
- Admins/Super Admins: ADM-YYYY-XXXX
- Pharmacists: PHA-YYYY-XXXX
- Receptionists: REC-YYYY-XXXX
- Cashiers: CSH-YYYY-XXXX
- Inventory Managers: INV-YYYY-XXXX
- General Staff: STF-YYYY-XXXX

### Technical Details (for advanced questions)
- Backend: FastAPI (Python) at port 8000
- Frontend: React 19 + TypeScript at port 3000
- Database: PostgreSQL
- Authentication: JWT tokens (60 min expiry)
- API Docs: http://localhost:8000/docs
"""


# ──────────────────────────────────────────────
# 5. HELPER FUNCTIONS
# ──────────────────────────────────────────────

def check_permission(role: str, action: str) -> dict:
    """
    Check if a role can perform an action.
    Returns a dict with result + guidance.
    """
    action_lower = action.lower().replace(" ", "_").replace("-", "_")

    # Try exact match first
    if action_lower in PERMISSIONS:
        perm = PERMISSIONS[action_lower]
        can_do = role in perm["allowed_roles"]
        if can_do:
            return {
                "allowed": True,
                "message": f"Yes, as a {ROLES[role]['label']} you can {perm['description'].lower()}.",
                "how_to": perm["how_to"],
                "nav_path": perm["nav_path"],
            }
        else:
            allowed_labels = [ROLES[r]["label"] for r in perm["allowed_roles"]]
            return {
                "allowed": False,
                "message": f"No, as a {ROLES[role]['label']} you cannot {perm['description'].lower()}.",
                "who_can": f"The following roles can do this: {', '.join(allowed_labels)}.",
                "suggestion": f"Please contact a {allowed_labels[0]} to help you with this.",
            }

    # Try fuzzy match on keywords
    for perm_key, perm_data in PERMISSIONS.items():
        keywords = perm_key.split("_")
        if any(kw in action_lower for kw in keywords if len(kw) > 3):
            can_do = role in perm_data["allowed_roles"]
            if can_do:
                return {
                    "allowed": True,
                    "message": f"Yes, you can {perm_data['description'].lower()}.",
                    "how_to": perm_data["how_to"],
                    "nav_path": perm_data["nav_path"],
                }
            else:
                allowed_labels = [ROLES[r]["label"] for r in perm_data["allowed_roles"]]
                return {
                    "allowed": False,
                    "message": f"No, as a {ROLES[role]['label']} you cannot {perm_data['description'].lower()}.",
                    "who_can": f"These roles can: {', '.join(allowed_labels)}.",
                    "suggestion": f"Contact a {allowed_labels[0]} for assistance.",
                }

    return None  # No matching permission found — let Groq handle it


def get_role_summary(role: str) -> str:
    """Get a summary of what a role can and cannot do."""
    if role not in ROLES:
        return "Unknown role."

    can_do = []
    cannot_do = []
    for action_key, perm in PERMISSIONS.items():
        desc = perm["description"]
        if role in perm["allowed_roles"]:
            can_do.append(f"• {desc}")
        else:
            cannot_do.append(f"• {desc} → Ask: {', '.join(ROLES[r]['label'] for r in perm['allowed_roles'][:2])}")

    summary = f"### What you can do as {ROLES[role]['label']}:\n"
    summary += "\n".join(can_do) if can_do else "No specific permissions found."
    if cannot_do:
        summary += f"\n\n### What you CANNOT do:\n"
        summary += "\n".join(cannot_do)

    return summary


def get_all_permissions_for_role(role: str) -> list[dict]:
    """Get all permissions for a given role with how-to instructions."""
    results = []
    for action_key, perm in PERMISSIONS.items():
        results.append({
            "action": action_key,
            "description": perm["description"],
            "allowed": role in perm["allowed_roles"],
            "how_to": perm["how_to"] if role in perm["allowed_roles"] else None,
            "nav_path": perm["nav_path"] if role in perm["allowed_roles"] else None,
            "who_can": [ROLES[r]["label"] for r in perm["allowed_roles"]] if role not in perm["allowed_roles"] else None,
        })
    return results
