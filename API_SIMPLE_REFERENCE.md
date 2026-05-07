# HMS API Quick Reference

**Base URL:** `/api/v1`

---

## Authentication APIs

| API | Method | Function |
|-----|--------|----------|
| `/auth/login` | POST | User login with email/username and password |
| `/auth/logout` | POST | Logout user and revoke refresh token |
| `/auth/refresh` | POST | Refresh access token |
| `/auth/forgot-password` | POST | Send password reset email |
| `/auth/reset-password` | POST | Reset password with token |
| `/auth/change-password` | POST | Change own password |
| `/auth/me` | GET | Get current user profile |
| `/auth/me` | PUT | Update own profile |
| `/auth/me/avatar` | POST | Upload profile photo |
| `/auth/mfa/enable` | POST | Enable MFA (TOTP) |
| `/auth/mfa/verify` | POST | Verify MFA code during login |
| `/auth/mfa/disable` | POST | Disable MFA |

---

## User Management APIs

| API | Method | Function |
|-----|--------|----------|
| `/users` | GET | List all users with filters |
| `/users` | POST | Create new user |
| `/users/{id}` | GET | Get user by ID |
| `/users/{id}` | PUT | Update user details |
| `/users/{id}/status` | PATCH | Activate/deactivate user |
| `/users/{id}` | DELETE | Soft delete user |
| `/users/{id}/roles` | GET | Get user's assigned roles |
| `/users/{id}/roles` | PUT | Assign roles to user |
| `/users/{id}/reset-password` | POST | Admin reset user's password |
| `/users/{id}/send-password` | POST | Send password to user via email |
| `/users/{id}/audit-log` | GET | Get user's activity log |
| `/users/{id}/id-card` | GET | Get user's ID card data |
| `/users/{id}/id-card/generate` | POST | Generate/regenerate staff ID card |
| `/users/{id}/photo` | POST | Upload user photo for ID card |
| `/users/{id}/photo` | DELETE | Remove user photo |

---

## Roles & Permissions APIs

| API | Method | Function |
|-----|--------|----------|
| `/roles` | GET | List all roles |
| `/roles` | POST | Create custom role |
| `/roles/{id}` | GET | Get role details with permissions |
| `/roles/{id}` | PUT | Update role |
| `/roles/{id}` | DELETE | Delete role (not system roles) |
| `/roles/{id}/permissions` | PUT | Set role's permissions |
| `/permissions` | GET | List all available permissions |
| `/permissions/modules` | GET | List permission modules |

---

## Patients APIs

| API | Method | Function |
|-----|--------|----------|
| `/patients` | GET | List all patients (paginated) |
| `/patients` | POST | Register new patient |
| `/patients/{id}` | GET | Get patient profile |
| `/patients/{id}` | PUT | Update patient info |
| `/patients/search` | GET | Search patients by name/phone/ID |
| `/patients/check-duplicate` | POST | Check for duplicate patient |
| `/patients/{id}/photo` | POST | Upload patient photo |
| `/patients/{id}/photo` | DELETE | Remove patient photo |
| `/patients/{id}/consents` | GET | Get consent records |
| `/patients/{id}/consents` | POST | Record patient consent |
| `/patients/{id}/documents` | GET | List patient documents |
| `/patients/{id}/documents` | POST | Upload document |
| `/patients/{id}/documents/{doc_id}` | DELETE | Delete document |
| `/patients/{id}/appointments` | GET | Get patient's appointments |
| `/patients/{id}/prescriptions` | GET | Get patient's prescriptions |
| `/patients/{id}/invoices` | GET | Get patient's invoices |
| `/patients/{id}/insurance-policies` | GET | Get patient's insurance |
| `/patients/{id}/timeline` | GET | Get complete visit timeline |
| `/patients/{id}/id-card` | GET | Get patient's ID card data |
| `/patients/{id}/id-card/generate` | POST | Generate patient ID card |
| `/patients/{id}/id-card/email` | POST | Email ID card PDF to patient |
| `/patients/{id}/id-card/download` | GET | Download ID card PDF |
| `/patients/{id}/id-card/print` | GET | Get print-optimized ID card |

---

## Doctors APIs

| API | Method | Function |
|-----|--------|----------|
| `/doctors` | GET | List all doctors |
| `/doctors` | POST | Create doctor profile |
| `/doctors/{id}` | GET | Get doctor details |
| `/doctors/{id}` | PUT | Update doctor profile |
| `/doctors/{id}/status` | PATCH | Activate/deactivate doctor |
| `/doctors/{id}/schedule` | GET | Get doctor's weekly schedule |
| `/doctors/{id}/schedule` | PUT | Set/update doctor's schedule |
| `/doctors/{id}/leaves` | GET | Get doctor's leave list |
| `/doctors/{id}/leaves` | POST | Create leave request |
| `/doctors/{id}/leaves/{leave_id}` | DELETE | Cancel leave |
| `/doctors/{id}/fees` | GET | Get doctor's fees |
| `/doctors/{id}/fees` | PUT | Update doctor's fees |
| `/doctors/{id}/availability` | GET | Check doctor availability for date |
| `/doctors/{id}/queue` | GET | Get doctor's current patient queue |
| `/doctors/{id}/stats` | GET | Get doctor statistics |
| `/doctors/by-department/{dept_id}` | GET | List doctors in department |

---

## Appointments APIs

| API | Method | Function |
|-----|--------|----------|
| `/appointments` | GET | List appointments with filters |
| `/appointments` | POST | Book scheduled appointment |
| `/appointments/walk-in` | POST | Register walk-in patient |
| `/appointments/emergency` | POST | Create emergency appointment |
| `/appointments/{id}` | GET | Get appointment details |
| `/appointments/{id}` | PUT | Update appointment |
| `/appointments/{id}/status` | PATCH | Change appointment status |
| `/appointments/{id}/cancel` | PATCH | Cancel appointment |
| `/appointments/{id}/reschedule` | PATCH | Reschedule appointment |
| `/appointments/{id}/check-in` | POST | Mark patient as arrived |
| `/appointments/{id}/transfer` | POST | Transfer patient to next doctor |
| `/appointments/slots` | GET | Get available appointment slots |
| `/appointments/queue` | GET | Get queue for doctor/date |
| `/appointments/queue/{queue_id}/position` | PATCH | Reorder queue position |
| `/appointments/queue/{queue_id}/call-next` | PATCH | Call next patient in queue |
| `/appointments/queue/{queue_id}/skip` | PATCH | Skip patient in queue |
| `/appointments/calendar` | GET | Get calendar view data |
| `/appointments/today-summary` | GET | Get today's appointment summary |

---

## Prescriptions APIs

| API | Method | Function |
|-----|--------|----------|
| `/prescriptions` | GET | List prescriptions |
| `/prescriptions` | POST | Create prescription |
| `/prescriptions/{id}` | GET | Get prescription details |
| `/prescriptions/{id}` | PUT | Update prescription (if not finalized) |
| `/prescriptions/{id}/finalize` | POST | Finalize/lock prescription |
| `/prescriptions/{id}/versions` | GET | Get prescription version history |
| `/prescriptions/{id}/pdf` | GET | Generate prescription PDF |
| `/prescriptions/{id}/duplicate` | POST | Create copy for new visit |
| `/prescription-templates` | GET | List prescription templates |
| `/prescription-templates` | POST | Create prescription template |
| `/prescription-templates/{id}` | GET | Get template details |
| `/prescription-templates/{id}` | PUT | Update template |
| `/prescription-templates/{id}` | DELETE | Delete template |
| `/prescriptions/{id}/lab-orders` | POST | Add lab order to prescription |
| `/prescriptions/{id}/lab-orders` | GET | Get prescription lab orders |
| `/drug-interactions/check` | GET | Check drug interactions |
| `/medicines/formulary` | GET | Search medicine formulary |

---

## Pharmacy APIs

| API | Method | Function |
|-----|--------|----------|
| `/pharmacy/medicines` | GET | List medicines |
| `/pharmacy/medicines` | POST | Add medicine to catalog |
| `/pharmacy/medicines/{id}` | GET | Get medicine details |
| `/pharmacy/medicines/{id}` | PUT | Update medicine |
| `/pharmacy/medicines/search` | GET | Search medicines by name/generic |
| `/pharmacy/medicines/barcode-lookup` | POST | Lookup medicine by barcode |
| `/pharmacy/pending-prescriptions` | GET | Get prescriptions awaiting dispensing |
| `/pharmacy/dispensing` | GET | List dispensing records |
| `/pharmacy/dispensing` | POST | Dispense medicine against prescription |
| `/pharmacy/dispensing/{id}` | GET | Get dispensing details |
| `/pharmacy/dispensing/{id}/status` | PATCH | Update dispensing status |
| `/pharmacy/counter-sale` | POST | Create OTC counter sale |
| `/pharmacy/returns` | GET | List medicine returns |
| `/pharmacy/returns` | POST | Create return request |
| `/pharmacy/returns/{id}/approve` | PATCH | Approve return |
| `/pharmacy/batches` | GET | List medicine batches |
| `/pharmacy/expiring-soon` | GET | Get items expiring within X days |
| `/pharmacy/low-stock` | GET | Get items below reorder level |
| `/pharmacy/dashboard` | GET | Get pharmacy dashboard statistics |
| `/pharmacy/analytics/sales-trend` | GET | Get pharmacy sales trend |
| `/pharmacy/analytics/top-medicines` | GET | Get top selling medicines |

---

## Optical Store APIs

| API | Method | Function |
|-----|--------|----------|
| `/optical/products` | GET | List optical products |
| `/optical/products` | POST | Add optical product |
| `/optical/products/{id}` | GET | Get product details |
| `/optical/products/{id}` | PUT | Update product |
| `/optical/products/search` | GET | Search optical products |
| `/optical/prescriptions` | GET | List optical prescriptions |
| `/optical/prescriptions` | POST | Create optical prescription |
| `/optical/prescriptions/{id}` | GET | Get optical prescription details |
| `/optical/prescriptions/{id}` | PUT | Update optical prescription |
| `/optical/orders` | GET | List optical orders |
| `/optical/orders` | POST | Create optical order |
| `/optical/orders/{id}` | GET | Get order details |
| `/optical/orders/{id}/status` | PATCH | Update order status |
| `/optical/orders/{id}/job-ticket` | GET | Generate job ticket PDF |
| `/optical/repairs` | GET | List optical repairs |
| `/optical/repairs` | POST | Create repair entry |
| `/optical/repairs/{id}` | GET | Get repair details |
| `/optical/repairs/{id}/status` | PATCH | Update repair status |

---

## Billing & Payments APIs

| API | Method | Function |
|-----|--------|----------|
| `/billing/invoices` | GET | List invoices |
| `/billing/invoices` | POST | Create invoice |
| `/billing/invoices/{id}` | GET | Get invoice details |
| `/billing/invoices/{id}` | PUT | Update draft invoice |
| `/billing/invoices/{id}/issue` | POST | Issue/finalize invoice |
| `/billing/invoices/{id}/pdf` | GET | Generate invoice PDF |
| `/billing/invoices/{id}/send` | POST | Send invoice via email/SMS |
| `/billing/invoices/{id}/payments` | GET | Get payments for invoice |
| `/billing/payments` | POST | Record payment |
| `/billing/payments` | GET | List payments |
| `/billing/payments/{id}` | GET | Get payment details |
| `/billing/payments/{id}/receipt` | GET | Generate receipt PDF |
| `/billing/refunds` | POST | Create refund request |
| `/billing/refunds` | GET | List refunds |
| `/billing/refunds/{id}` | GET | Get refund details |
| `/billing/refunds/{id}/approve` | PATCH | Approve refund |
| `/billing/refunds/{id}/process` | PATCH | Process approved refund |
| `/billing/credit-notes` | POST | Create credit note |
| `/billing/credit-notes` | GET | List credit notes |
| `/billing/outstanding` | GET | List outstanding dues |
| `/billing/settlements` | GET | List daily settlements |
| `/billing/settlements` | POST | Create daily settlement |
| `/billing/settlements/{id}` | GET | Get settlement details |
| `/billing/settlements/{id}/verify` | PATCH | Verify settlement |

---

## Insurance APIs

| API | Method | Function |
|-----|--------|----------|
| `/insurance/providers` | GET | List insurance providers |
| `/insurance/providers` | POST | Add insurance provider |
| `/insurance/providers/{id}` | PUT | Update provider |
| `/insurance/policies` | GET | List insurance policies |
| `/insurance/policies` | POST | Create patient policy |
| `/insurance/policies/{id}` | GET | Get policy details |
| `/insurance/policies/{id}` | PUT | Update policy |
| `/insurance/claims` | POST | Submit claim |
| `/insurance/claims` | GET | List claims |
| `/insurance/claims/{id}` | GET | Get claim details |
| `/insurance/claims/{id}/status` | PATCH | Update claim status |
| `/insurance/pre-auth` | POST | Request pre-authorization |
| `/insurance/pre-auth` | GET | List pre-authorizations |
| `/insurance/pre-auth/{id}/status` | PATCH | Update pre-auth status |

---

## Inventory APIs

| API | Method | Function |
|-----|--------|----------|
| `/inventory/items` | GET | List inventory items |
| `/inventory/items` | POST | Add inventory item |
| `/inventory/items/{id}` | GET | Get item details |
| `/inventory/items/{id}` | PUT | Update item |
| `/inventory/items/{id}/movements` | GET | Get item movement history |
| `/inventory/suppliers` | GET | List suppliers |
| `/inventory/suppliers` | POST | Add supplier |
| `/inventory/suppliers/{id}` | GET | Get supplier details |
| `/inventory/suppliers/{id}` | PUT | Update supplier |
| `/inventory/purchase-orders` | GET | List purchase orders |
| `/inventory/purchase-orders` | POST | Create purchase order |
| `/inventory/purchase-orders/{id}` | GET | Get PO details |
| `/inventory/purchase-orders/{id}/status` | PATCH | Update PO status |
| `/inventory/purchase-orders/{id}/approve` | PATCH | Approve PO |
| `/inventory/grn` | POST | Create goods receipt note |
| `/inventory/grn` | GET | List GRNs |
| `/inventory/grn/{id}` | GET | Get GRN details |
| `/inventory/grn/{id}/verify` | PATCH | Verify GRN |
| `/inventory/stock-adjustments` | POST | Create stock adjustment |
| `/inventory/stock-adjustments` | GET | List adjustments |
| `/inventory/stock-adjustments/{id}/approve` | PATCH | Approve adjustment |
| `/inventory/stock-transfers` | POST | Transfer stock between locations |
| `/inventory/stock-transfers` | GET | List transfers |
| `/inventory/reorder-alerts` | GET | Get items needing reorder |
| `/inventory/expiry-alerts` | GET | Get items expiring soon |
| `/inventory/cycle-counts` | POST | Start cycle count |
| `/inventory/cycle-counts` | GET | List cycle counts |
| `/inventory/cycle-counts/{id}` | GET | Get count details |
| `/inventory/cycle-counts/{id}` | PUT | Update counted items |
| `/inventory/cycle-counts/{id}/verify` | PATCH | Verify count |
| `/inventory/variance-report` | GET | Get stock variance report |

---

## Reports APIs

| API | Method | Function |
|-----|--------|----------|
| `/reports/dashboard` | GET | Get dashboard summary statistics |
| `/reports/revenue/daily` | GET | Get day-wise revenue report |
| `/reports/revenue/monthly` | GET | Get month-wise revenue report |
| `/reports/revenue/yearly` | GET | Get yearly revenue report |
| `/reports/revenue/by-department` | GET | Get revenue by department |
| `/reports/opd/summary` | GET | Get OPD summary statistics |
| `/reports/opd/doctor-wise` | GET | Get doctor-wise consultations |
| `/reports/pharmacy/sales` | GET | Get pharmacy sales report |
| `/reports/pharmacy/top-selling` | GET | Get top selling medicines |
| `/reports/optical/sales` | GET | Get optical sales report |
| `/reports/inventory/aging` | GET | Get inventory aging report |
| `/reports/inventory/stock-status` | GET | Get current stock status |
| `/reports/financial/outstanding` | GET | Get outstanding dues report |
| `/reports/financial/collection` | GET | Get collection report |
| `/reports/financial/tax-summary` | GET | Get tax collection summary |
| `/reports/export` | POST | Export report (CSV/XLSX/PDF) |
| `/reports/schedule` | POST | Schedule recurring report |
| `/reports/scheduled` | GET | List scheduled reports |

---

## Notifications APIs

| API | Method | Function |
|-----|--------|----------|
| `/notifications` | GET | List my notifications |
| `/notifications/unread-count` | GET | Get unread notification count |
| `/notifications/{id}/read` | PATCH | Mark notification as read |
| `/notifications/read-all` | PATCH | Mark all notifications as read |
| `/notifications/{id}` | DELETE | Delete notification |
| `/notifications/templates` | GET | List notification templates |
| `/notifications/templates` | POST | Create notification template |
| `/notifications/templates/{id}` | PUT | Update template |
| `/notifications/templates/{id}` | DELETE | Delete template |
| `/notifications/test-send` | POST | Send test notification |

---

## Administration APIs

| API | Method | Function |
|-----|--------|----------|
| `/admin/hospital` | GET | Get hospital information |
| `/admin/hospital` | PUT | Update hospital information |
| `/admin/hospital/logo` | POST | Upload hospital logo |
| `/admin/settings` | GET | Get hospital settings |
| `/admin/settings` | PUT | Update hospital settings |
| `/admin/departments` | GET | List departments |
| `/admin/departments` | POST | Create department |
| `/admin/departments/{id}` | PUT | Update department |
| `/admin/departments/{id}` | DELETE | Delete department |
| `/admin/tax-config` | GET | List tax configurations |
| `/admin/tax-config` | POST | Create tax config |
| `/admin/tax-config/{id}` | PUT | Update tax config |
| `/admin/tax-config/{id}` | DELETE | Delete tax config |
| `/admin/audit-logs` | GET | View audit logs |
| `/admin/audit-logs/export` | GET | Export audit logs |
| `/admin/system-health` | GET | Check system health |
| `/admin/backup` | POST | Trigger manual backup |
| `/admin/backups` | GET | List backups |
| `/admin/active-sessions` | GET | List active user sessions |
| `/admin/sessions/{id}` | DELETE | Force logout user |

---

## File Upload APIs

| API | Method | Function |
|-----|--------|----------|
| `/files/upload` | POST | Upload file (images, documents) |
| `/files/{id}` | GET | Download/view file |
| `/files/{id}` | DELETE | Delete file |

---

## WebSocket APIs

| WebSocket | Function |
|-----------|----------|
| `ws://host/ws/queue/{doctor_id}` | Real-time queue updates for doctor's patients |
| `ws://host/ws/notifications/{user_id}` | Real-time notifications for user |

---

## Summary

**Total APIs:** 250+

**Main Modules:**
- **Authentication:** 12 APIs
- **User Management:** 15 APIs
- **Roles & Permissions:** 8 APIs
- **Patients:** 22 APIs
- **Doctors:** 16 APIs
- **Appointments:** 18 APIs
- **Prescriptions:** 17 APIs
- **Pharmacy:** 20 APIs
- **Optical Store:** 18 APIs
- **Billing & Payments:** 23 APIs
- **Insurance:** 14 APIs
- **Inventory:** 30 APIs
- **Reports:** 18 APIs
- **Notifications:** 9 APIs
- **Administration:** 20 APIs
- **File Upload:** 3 APIs
- **WebSocket:** 2 APIs

---

**Base URL:** `http://localhost:8000/api/v1`  
**Authentication:** Bearer Token (JWT)  
**Rate Limit:** 60 requests/minute per user  
**Last Updated:** May 5, 2026
