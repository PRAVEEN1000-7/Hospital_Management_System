# HMS Project — Work Explanation

## Overview

A **Hospital Management System (HMS)** built with **React 19 + TypeScript** (frontend) and **FastAPI + PostgreSQL** (backend) for managing patient registrations and hospital staff.

---

## 1. Global Patient Registration Form

### What it does
Registers patients from **35+ countries** with a comprehensive form that adapts based on location.

### Key Features
- **Multi-country support**: Country, State, and City fields with auto-populated data for India (all states/districts) and 35+ other countries
- **Smart field behavior**: Country auto-fills when State is selected; Pincode field appears alongside Country
- **Patient ID generation**: Auto-generates unique IDs in format `HMS-YYYYMMDD-XXXX`
- **Photo upload**: Patients can have profile photos (JPEG/PNG/WebP, max 5MB) uploaded from the detail page
- **Comprehensive fields**: Title, Name, Gender, DOB (with age auto-calc), Blood Group, Phone, Email, Emergency Contact, Address (with Pincode), Medical History, Allergies, Insurance
- **Validation**: Client-side (Zod schema) + server-side validation for all required fields
- **Patient ID Card**: Generates a professional PDF ID card with patient details, photo, QR code — can be downloaded, printed (opens PDF in new tab), or emailed as PDF attachment

### Tech Approach
- Frontend: Zod schema validation, react-hook-form patterns, html2canvas + jsPDF for PDF generation
- Backend: SQLAlchemy models with nullable fields for global compatibility, Pydantic v2 schemas
- Database: PostgreSQL with migration scripts for schema evolution

---

## 2. Super Admin — User Management

### What it does
The **super_admin** role has full control over system users through a dedicated User Management page.

### Key Features
- **Create Users**: Add new users with username, email, full name, role, and auto-generated password
- **9 Roles supported**: Super Admin, Admin, Doctor, Nurse, Staff, Receptionist, Pharmacist, Cashier, Inventory Manager
- **Auto-send password**: On user creation, the generated password is automatically emailed to the user via SMTP (Gmail App Password)
- **Reset & Send Password**: Super admin can reset any user's password and email the new one
- **Edit/Delete Users**: Update user details or deactivate accounts
- **Search & Pagination**: Search users by name/username/email with paginated results
- **Role-based access**: Only `super_admin` can access the User Management page; other roles see a 403 message

### Security Implementation
- Passwords are **bcrypt-hashed** (never stored in plaintext)
- JWT-based authentication with configurable token expiry
- All credentials stored in `.env` (never committed to git)
- `.gitignore` covers `.env`, `TESTING_GUIDE.md`, `uploads/`, `__pycache__/`, `node_modules/`

---

## 3. Additional Features

| Feature | Description |
|---------|-------------|
| **Profile Page** | User info card with gradient header, centered avatar, role badge, and collapsible Change Password section |
| **Change Password** | Any user can change their own password with strength requirements (8+ chars, uppercase, lowercase, digit, special char) |
| **Email Service** | SMTP-based email for sending passwords, patient ID cards (with PDF attachment), and professional HTML templates |
| **Patient List** | Searchable, paginated list with quick actions (view details, ID card, delete) |
| **Dashboard** | Role-aware landing page with welcome message |

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 5, TailwindCSS |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Python 3.12 |
| Database | PostgreSQL 15+ |
| Auth | JWT (python-jose), bcrypt |
| Email | smtplib (Gmail SMTP with App Password) |
| PDF | html2canvas + jsPDF (frontend-generated) |
