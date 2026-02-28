-- ============================================================================
-- HMS — Common CRUD & Operational Queries
-- Reference guide for application development
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. AUTHENTICATION & USERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1.1 Login: Get user by email (for auth)
SELECT u.id, u.hospital_id, u.reference_number, u.email, u.username,
       u.password_hash, u.first_name, u.last_name, u.is_active,
       u.must_change_password, u.failed_login_attempts, u.locked_until,
       ARRAY_AGG(r.name) AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'dr.smith@hmscore.com'
  AND u.is_deleted = false
GROUP BY u.id;

-- 1.2 Update last login timestamp
UPDATE users
SET last_login_at = NOW(), failed_login_attempts = 0, updated_at = NOW()
WHERE id = '10000000-0000-0000-0000-000000000003';

-- 1.3 Increment failed login attempts
UPDATE users
SET failed_login_attempts = failed_login_attempts + 1,
    locked_until = CASE WHEN failed_login_attempts + 1 >= 5
                        THEN NOW() + INTERVAL '30 minutes'
                        ELSE locked_until END,
    updated_at = NOW()
WHERE id = '10000000-0000-0000-0000-000000000003';

-- 1.4 Create refresh token
INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')
RETURNING id;

-- 1.5 Validate refresh token
SELECT id, user_id, expires_at
FROM refresh_tokens
WHERE token_hash = $1
  AND revoked_at IS NULL
  AND expires_at > NOW();

-- 1.6 Revoke all tokens for a user (logout everywhere)
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE user_id = $1 AND revoked_at IS NULL;

-- 1.7 Get user with roles and permissions
SELECT u.id, u.reference_number, u.first_name, u.last_name, u.email,
       u.avatar_url, u.hospital_id,
       JSON_AGG(DISTINCT jsonb_build_object(
           'role', r.name,
           'display_name', r.display_name
       )) AS roles,
       ARRAY_AGG(DISTINCT p.module || ':' || p.action || ':' || p.resource) AS permissions
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE u.id = $1 AND u.is_deleted = false
GROUP BY u.id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. PATIENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 2.1 Create patient
INSERT INTO patients (hospital_id, patient_reference_number, first_name, last_name,
    date_of_birth, gender, blood_group, phone_country_code, phone_number,
    email, address_line_1, city, state_province, postal_code, country,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
RETURNING id, patient_reference_number;

-- 2.2 Search patients (multi-field)
SELECT id, patient_reference_number, first_name, last_name, date_of_birth,
       gender, phone_number, email, is_active
FROM patients
WHERE hospital_id = $1
  AND is_deleted = false
  AND (
      patient_reference_number ILIKE '%' || $2 || '%'
      OR first_name ILIKE '%' || $2 || '%'
      OR last_name ILIKE '%' || $2 || '%'
      OR phone_number ILIKE '%' || $2 || '%'
      OR email ILIKE '%' || $2 || '%'
  )
ORDER BY first_name, last_name
LIMIT 20 OFFSET $3;

-- 2.3 Get patient by PRN (with full details)
SELECT p.*,
    (SELECT COUNT(*) FROM appointments a
     WHERE a.patient_id = p.id AND a.is_deleted = false) AS total_appointments,
    (SELECT MAX(a.appointment_date) FROM appointments a
     WHERE a.patient_id = p.id AND a.is_deleted = false) AS last_visit
FROM patients p
WHERE p.patient_reference_number = $1
  AND p.is_deleted = false;

-- 2.4 Update patient
UPDATE patients
SET first_name = $2, last_name = $3, phone_number = $4, email = $5,
    address_line_1 = $6, city = $7, state_province = $8,
    emergency_contact_name = $9, emergency_contact_phone = $10,
    updated_by = $11, updated_at = NOW()
WHERE id = $1 AND is_deleted = false
RETURNING *;

-- 2.5 Soft delete patient
UPDATE patients
SET is_deleted = true, deleted_at = NOW(), is_active = false, updated_by = $2, updated_at = NOW()
WHERE id = $1 AND is_deleted = false;

-- 2.6 Patient list with pagination
SELECT p.id, p.patient_reference_number, p.first_name, p.last_name,
       p.date_of_birth, p.gender, p.phone_number, p.is_active,
       p.registered_at
FROM patients p
WHERE p.hospital_id = $1 AND p.is_deleted = false
ORDER BY p.created_at DESC
LIMIT $2 OFFSET $3;

-- 2.7 Count patients for pagination
SELECT COUNT(*) FROM patients WHERE hospital_id = $1 AND is_deleted = false;

-- 2.8 Check duplicate patient (by phone)
SELECT id, patient_reference_number, first_name, last_name
FROM patients
WHERE hospital_id = $1
  AND phone_country_code = $2
  AND phone_number = $3
  AND is_deleted = false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. DOCTORS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 3.1 Get all active doctors for a hospital
SELECT d.id, u.first_name, u.last_name, u.reference_number, u.avatar_url,
       d.specialization, d.qualification, d.consultation_fee, d.follow_up_fee,
       d.is_available, dep.name AS department_name, dep.code AS department_code
FROM doctors d
JOIN users u ON u.id = d.user_id
LEFT JOIN departments dep ON dep.id = d.department_id
WHERE d.hospital_id = $1 AND d.is_active = true AND d.is_deleted = false
ORDER BY dep.display_order, u.first_name;

-- 3.2 Get doctor schedule for a specific day
SELECT ds.id, ds.day_of_week, ds.shift_name, ds.start_time, ds.end_time,
       ds.break_start_time, ds.break_end_time, ds.slot_duration_minutes,
       ds.max_patients
FROM doctor_schedules ds
WHERE ds.doctor_id = $1
  AND ds.day_of_week = EXTRACT(DOW FROM $2::DATE)
  AND ds.is_active = true
  AND ds.effective_from <= $2
  AND (ds.effective_to IS NULL OR ds.effective_to >= $2)
ORDER BY ds.start_time;

-- 3.3 Check doctor availability (considering leaves)
SELECT NOT EXISTS (
    SELECT 1 FROM doctor_leaves dl
    WHERE dl.doctor_id = $1
      AND dl.leave_date = $2
      AND dl.status = 'approved'
      AND (dl.leave_type = 'full_day'
           OR (dl.leave_type = 'morning' AND $3 < '12:00')
           OR (dl.leave_type = 'afternoon' AND $3 >= '12:00'))
) AS is_available;

-- 3.4 Get booked slot count for a doctor on a date
SELECT COUNT(*) AS booked_count
FROM appointments
WHERE doctor_id = $1
  AND appointment_date = $2
  AND status NOT IN ('cancelled', 'no_show')
  AND is_deleted = false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. APPOINTMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 4.1 Create appointment
INSERT INTO appointments (hospital_id, appointment_number, patient_id, doctor_id,
    department_id, appointment_date, start_time, end_time, appointment_type,
    visit_type, chief_complaint, consultation_fee, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING id, appointment_number;

-- 4.2 Get appointments for a doctor on a date
SELECT a.id, a.appointment_number, a.start_time, a.end_time,
       a.appointment_type, a.status, a.chief_complaint,
       p.id AS patient_id, p.patient_reference_number,
       p.first_name, p.last_name, p.date_of_birth, p.gender, p.phone_number,
       aq.queue_number, aq.position, aq.status AS queue_status
FROM appointments a
JOIN patients p ON p.id = a.patient_id
LEFT JOIN appointment_queue aq ON aq.appointment_id = a.id AND aq.queue_date = a.appointment_date
WHERE a.doctor_id = $1
  AND a.appointment_date = $2
  AND a.is_deleted = false
ORDER BY a.start_time;

-- 4.3 Get appointments for a patient
SELECT a.id, a.appointment_number, a.appointment_date, a.start_time,
       a.appointment_type, a.visit_type, a.status,
       u.first_name AS doctor_first, u.last_name AS doctor_last,
       d.specialization, dep.name AS department
FROM appointments a
JOIN doctors d ON d.id = a.doctor_id
JOIN users u ON u.id = d.user_id
LEFT JOIN departments dep ON dep.id = a.department_id
WHERE a.patient_id = $1 AND a.is_deleted = false
ORDER BY a.appointment_date DESC, a.start_time DESC;

-- 4.4 Update appointment status
UPDATE appointments
SET status = $2, updated_at = NOW()
WHERE id = $1 AND is_deleted = false
RETURNING *;

-- 4.5 Check-in patient
UPDATE appointments
SET status = 'checked_in', check_in_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status = 'scheduled' AND is_deleted = false
RETURNING *;

-- 4.6 Start consultation
UPDATE appointments
SET status = 'with_doctor', consultation_start_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status IN ('checked_in', 'in_queue') AND is_deleted = false;

-- 4.7 Complete consultation
UPDATE appointments
SET status = 'completed', consultation_end_at = NOW(), updated_at = NOW()
WHERE id = $1 AND status = 'with_doctor' AND is_deleted = false;

-- 4.8 Cancel appointment
UPDATE appointments
SET status = 'cancelled', cancel_reason = $2, updated_at = NOW()
WHERE id = $1 AND status IN ('scheduled', 'checked_in') AND is_deleted = false;

-- 4.9 Get today's appointment summary (dashboard)
SELECT
    COUNT(*) FILTER (WHERE status = 'scheduled')  AS scheduled,
    COUNT(*) FILTER (WHERE status = 'checked_in') AS checked_in,
    COUNT(*) FILTER (WHERE status = 'with_doctor') AS with_doctor,
    COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
    COUNT(*) FILTER (WHERE status = 'cancelled')  AS cancelled,
    COUNT(*) FILTER (WHERE status = 'no_show')    AS no_show,
    COUNT(*) AS total
FROM appointments
WHERE hospital_id = $1
  AND appointment_date = CURRENT_DATE
  AND is_deleted = false;

-- 4.10 Log status change
INSERT INTO appointment_status_log (appointment_id, from_status, to_status, changed_by, notes)
VALUES ($1, $2, $3, $4, $5);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. QUEUE MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════════

-- 5.1 Add to queue
INSERT INTO appointment_queue (appointment_id, doctor_id, queue_date, queue_number, position, status)
VALUES ($1, $2, $3,
    (SELECT COALESCE(MAX(queue_number), 0) + 1 FROM appointment_queue WHERE doctor_id = $2 AND queue_date = $3),
    (SELECT COALESCE(MAX(position), 0) + 1 FROM appointment_queue WHERE doctor_id = $2 AND queue_date = $3 AND status = 'waiting'),
    'waiting')
RETURNING queue_number, position;

-- 5.2 Get current queue for a doctor
SELECT aq.queue_number, aq.position, aq.status, aq.called_at,
       p.first_name, p.last_name, p.patient_reference_number,
       a.appointment_type, a.chief_complaint
FROM appointment_queue aq
JOIN appointments a ON a.id = aq.appointment_id
JOIN patients p ON p.id = a.patient_id
WHERE aq.doctor_id = $1
  AND aq.queue_date = CURRENT_DATE
  AND aq.status IN ('waiting', 'called')
ORDER BY aq.position;

-- 5.3 Call next patient
UPDATE appointment_queue
SET status = 'called', called_at = NOW(), updated_at = NOW()
WHERE id = (
    SELECT id FROM appointment_queue
    WHERE doctor_id = $1 AND queue_date = CURRENT_DATE AND status = 'waiting'
    ORDER BY position LIMIT 1
)
RETURNING *;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. PRESCRIPTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 6.1 Create prescription
INSERT INTO prescriptions (hospital_id, prescription_number, appointment_id,
    patient_id, doctor_id, diagnosis, clinical_notes, advice, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, prescription_number;

-- 6.2 Add prescription item
INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name,
    generic_name, dosage, frequency, duration_value, duration_unit, route,
    instructions, quantity, display_order)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING id;

-- 6.3 Get prescription with items
SELECT p.id, p.prescription_number, p.diagnosis, p.clinical_notes, p.advice,
       p.status, p.is_finalized, p.created_at,
       pat.first_name AS patient_first, pat.last_name AS patient_last,
       pat.patient_reference_number,
       u.first_name AS doctor_first, u.last_name AS doctor_last,
       d.specialization,
       JSON_AGG(
           jsonb_build_object(
               'id', pi.id,
               'medicine_name', pi.medicine_name,
               'generic_name', pi.generic_name,
               'dosage', pi.dosage,
               'frequency', pi.frequency,
               'duration', pi.duration_value || ' ' || pi.duration_unit,
               'route', pi.route,
               'instructions', pi.instructions,
               'quantity', pi.quantity,
               'is_dispensed', pi.is_dispensed
           ) ORDER BY pi.display_order
       ) AS items
FROM prescriptions p
JOIN patients pat ON pat.id = p.patient_id
JOIN doctors d ON d.id = p.doctor_id
JOIN users u ON u.id = d.user_id
LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
WHERE p.id = $1 AND p.is_deleted = false
GROUP BY p.id, pat.first_name, pat.last_name, pat.patient_reference_number,
         u.first_name, u.last_name, d.specialization;

-- 6.4 Finalize prescription
UPDATE prescriptions
SET is_finalized = true, finalized_at = NOW(), status = 'finalized',
    updated_at = NOW()
WHERE id = $1 AND is_finalized = false AND is_deleted = false;

-- 6.5 Get prescriptions for a patient
SELECT p.id, p.prescription_number, p.diagnosis, p.status, p.created_at,
       u.first_name || ' ' || u.last_name AS doctor_name,
       d.specialization,
       COUNT(pi.id) AS item_count
FROM prescriptions p
JOIN doctors d ON d.id = p.doctor_id
JOIN users u ON u.id = d.user_id
LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
WHERE p.patient_id = $1 AND p.is_deleted = false
GROUP BY p.id, u.first_name, u.last_name, d.specialization
ORDER BY p.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. PHARMACY
-- ═══════════════════════════════════════════════════════════════════════════════

-- 7.1 Search medicines
SELECT id, name, generic_name, category, strength, unit_of_measure,
       selling_price, requires_prescription, is_active
FROM medicines
WHERE hospital_id = $1
  AND is_active = true
  AND (name ILIKE '%' || $2 || '%' OR generic_name ILIKE '%' || $2 || '%')
ORDER BY name
LIMIT 20;

-- 7.2 Get medicine with stock info
SELECT m.id, m.name, m.generic_name, m.category, m.strength,
       m.selling_price, m.reorder_level,
       COALESCE(SUM(mb.current_quantity), 0) AS total_stock,
       MIN(mb.expiry_date) FILTER (WHERE mb.current_quantity > 0)  AS nearest_expiry,
       COUNT(mb.id) FILTER (WHERE mb.current_quantity > 0) AS active_batches
FROM medicines m
LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id AND mb.is_active = true
WHERE m.id = $1
GROUP BY m.id;

-- 7.3 Get low stock medicines
SELECT m.id, m.name, m.generic_name, m.reorder_level,
       COALESCE(SUM(mb.current_quantity), 0) AS current_stock
FROM medicines m
LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id AND mb.is_active = true
WHERE m.hospital_id = $1 AND m.is_active = true
GROUP BY m.id
HAVING COALESCE(SUM(mb.current_quantity), 0) <= m.reorder_level
ORDER BY COALESCE(SUM(mb.current_quantity), 0);

-- 7.4 Get expiring medicines (within N days)
SELECT m.name, m.generic_name, mb.batch_number, mb.expiry_date,
       mb.current_quantity,
       mb.expiry_date - CURRENT_DATE AS days_until_expiry
FROM medicine_batches mb
JOIN medicines m ON m.id = mb.medicine_id
WHERE m.hospital_id = $1
  AND mb.is_active = true
  AND mb.current_quantity > 0
  AND mb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY mb.expiry_date;

-- 7.5 Dispense medicine (decrease batch stock)
UPDATE medicine_batches
SET current_quantity = current_quantity - $2, updated_at = NOW()
WHERE id = $1 AND current_quantity >= $2
RETURNING current_quantity;

-- 7.6 Get best batch for dispensing (FEFO — First Expiry First Out)
SELECT id, batch_number, expiry_date, current_quantity, selling_price
FROM medicine_batches
WHERE medicine_id = $1
  AND is_active = true
  AND current_quantity > 0
  AND expiry_date > CURRENT_DATE
ORDER BY expiry_date ASC
LIMIT 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. BILLING & INVOICES
-- ═══════════════════════════════════════════════════════════════════════════════

-- 8.1 Create invoice
INSERT INTO invoices (hospital_id, invoice_number, patient_id, appointment_id,
    invoice_type, invoice_date, subtotal, tax_amount, total_amount, status, created_by)
VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, 'issued', $9)
RETURNING id, invoice_number;

-- 8.2 Get invoice with items
SELECT i.id, i.invoice_number, i.invoice_type, i.invoice_date, i.due_date,
       i.subtotal, i.discount_amount, i.tax_amount, i.total_amount,
       i.paid_amount, i.balance_amount, i.status,
       p.first_name, p.last_name, p.patient_reference_number,
       JSON_AGG(
           jsonb_build_object(
               'description', ii.description,
               'quantity', ii.quantity,
               'unit_price', ii.unit_price,
               'discount_percent', ii.discount_percent,
               'tax_rate', ii.tax_rate,
               'tax_amount', ii.tax_amount,
               'total_price', ii.total_price
           ) ORDER BY ii.display_order
       ) AS items
FROM invoices i
JOIN patients p ON p.id = i.patient_id
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
WHERE i.id = $1 AND i.is_deleted = false
GROUP BY i.id, p.first_name, p.last_name, p.patient_reference_number;

-- 8.3 Record payment
INSERT INTO payments (hospital_id, payment_number, invoice_id, patient_id,
    amount, payment_mode, payment_reference, payment_date, payment_time,
    received_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, CURRENT_TIME, $8)
RETURNING id;

-- 8.4 Update invoice after payment
UPDATE invoices
SET paid_amount = paid_amount + $2,
    balance_amount = total_amount - (paid_amount + $2),
    status = CASE
        WHEN total_amount <= (paid_amount + $2) THEN 'paid'
        ELSE 'partially_paid'
    END,
    updated_at = NOW()
WHERE id = $1;

-- 8.5 Daily revenue summary
SELECT
    COUNT(*) AS total_invoices,
    SUM(total_amount) AS total_billed,
    SUM(paid_amount) AS total_collected,
    SUM(balance_amount) AS total_outstanding,
    COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
    COUNT(*) FILTER (WHERE status = 'partially_paid') AS partial_count,
    COUNT(*) FILTER (WHERE status = 'issued') AS pending_count
FROM invoices
WHERE hospital_id = $1
  AND invoice_date = CURRENT_DATE
  AND is_deleted = false;

-- 8.6 Patient billing history
SELECT i.invoice_number, i.invoice_type, i.invoice_date,
       i.total_amount, i.paid_amount, i.balance_amount, i.status,
       STRING_AGG(py.payment_mode, ', ') AS payment_modes
FROM invoices i
LEFT JOIN payments py ON py.invoice_id = i.id AND py.status = 'completed'
WHERE i.patient_id = $1 AND i.is_deleted = false
GROUP BY i.id
ORDER BY i.invoice_date DESC;

-- 8.7 Revenue by department (monthly)
SELECT dep.name AS department,
       COUNT(DISTINCT i.id) AS invoice_count,
       SUM(i.total_amount) AS total_revenue
FROM invoices i
JOIN appointments a ON a.id = i.appointment_id
JOIN departments dep ON dep.id = a.department_id
WHERE i.hospital_id = $1
  AND i.invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND i.is_deleted = false
GROUP BY dep.name
ORDER BY total_revenue DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. OPTICAL
-- ═══════════════════════════════════════════════════════════════════════════════

-- 9.1 Search optical products
SELECT id, name, category, brand, model_number, selling_price,
       current_stock, lens_type, lens_coating
FROM optical_products
WHERE hospital_id = $1
  AND is_active = true
  AND (name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%')
ORDER BY category, name;

-- 9.2 Create optical prescription
INSERT INTO optical_prescriptions (hospital_id, prescription_number, patient_id,
    doctor_id, appointment_id,
    right_sph, right_cyl, right_axis, right_add, right_va,
    left_sph, left_cyl, left_axis, left_add, left_va,
    pd_distance, pd_near, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
RETURNING id;

-- 9.3 Get patient's optical history
SELECT op.prescription_number, op.created_at,
       op.right_sph, op.right_cyl, op.right_axis,
       op.left_sph, op.left_cyl, op.left_axis,
       op.pd_distance,
       u.first_name || ' ' || u.last_name AS doctor_name
FROM optical_prescriptions op
JOIN doctors d ON d.id = op.doctor_id
JOIN users u ON u.id = d.user_id
WHERE op.patient_id = $1
ORDER BY op.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. INVENTORY
-- ═══════════════════════════════════════════════════════════════════════════════

-- 10.1 Stock level overview
SELECT
    m.name, m.generic_name, m.category, m.reorder_level,
    COALESCE(SUM(mb.current_quantity), 0) AS current_stock,
    CASE
        WHEN COALESCE(SUM(mb.current_quantity), 0) = 0 THEN 'out_of_stock'
        WHEN COALESCE(SUM(mb.current_quantity), 0) <= m.reorder_level THEN 'low'
        ELSE 'adequate'
    END AS stock_status,
    MIN(mb.expiry_date) FILTER (WHERE mb.current_quantity > 0) AS nearest_expiry
FROM medicines m
LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id AND mb.is_active = true
WHERE m.hospital_id = $1 AND m.is_active = true
GROUP BY m.id
ORDER BY m.name;

-- 10.2 Record stock movement
INSERT INTO stock_movements (hospital_id, item_type, item_id, batch_id,
    movement_type, reference_type, reference_id, quantity, balance_after,
    unit_cost, notes, performed_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- 10.3 Stock movement history for an item
SELECT sm.created_at, sm.movement_type, sm.quantity, sm.balance_after,
       sm.reference_type, sm.notes,
       u.first_name || ' ' || u.last_name AS performed_by_name
FROM stock_movements sm
LEFT JOIN users u ON u.id = sm.performed_by
WHERE sm.item_type = $1 AND sm.item_id = $2
ORDER BY sm.created_at DESC
LIMIT 50;

-- 10.4 Create purchase order
INSERT INTO purchase_orders (hospital_id, po_number, supplier_id, order_date,
    expected_delivery_date, total_amount, created_by)
VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
RETURNING id, po_number;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 11.1 Get unread notifications for a user
SELECT id, title, message, type, priority, reference_type, reference_id, created_at
FROM notifications
WHERE user_id = $1 AND is_read = false
ORDER BY created_at DESC
LIMIT 20;

-- 11.2 Mark notification as read
UPDATE notifications
SET is_read = true, read_at = NOW()
WHERE id = $1 AND user_id = $2;

-- 11.3 Mark all notifications as read
UPDATE notifications
SET is_read = true, read_at = NOW()
WHERE user_id = $1 AND is_read = false;

-- 11.4 Get unread count
SELECT COUNT(*) AS unread_count
FROM notifications
WHERE user_id = $1 AND is_read = false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. AUDIT LOGS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 12.1 Log an action
INSERT INTO audit_logs (hospital_id, user_id, action, entity_type, entity_id,
    entity_name, old_values, new_values, ip_address, user_agent, request_path)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);

-- 12.2 Get audit trail for an entity
SELECT al.action, al.entity_name, al.old_values, al.new_values,
       al.created_at, al.ip_address,
       u.first_name || ' ' || u.last_name AS user_name,
       u.reference_number AS user_ref
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.entity_type = $1 AND al.entity_id = $2
ORDER BY al.created_at DESC;

-- 12.3 Get user activity log
SELECT al.action, al.entity_type, al.entity_id, al.entity_name,
       al.created_at, al.ip_address, al.request_path
FROM audit_logs al
WHERE al.user_id = $1
ORDER BY al.created_at DESC
LIMIT 50;

-- 12.4 Recent system activity (dashboard)
SELECT al.action, al.entity_type, al.entity_name, al.created_at,
       u.first_name || ' ' || u.last_name AS user_name
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.hospital_id = $1
ORDER BY al.created_at DESC
LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. ID GENERATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- 13.1 Generate a new patient ID (uses helper function)
SELECT hms_generate_id(
    'a0000000-0000-0000-0000-000000000001',  -- hospital_id
    'HC',                                      -- hospital_code
    'patient',                                 -- entity_type
    'M',                                       -- gender code
    '26',                                      -- year
    '2'                                        -- month code
) AS new_patient_id;

-- 13.2 Validate an existing ID checksum
SELECT
    'HCM262K00147' AS id_to_validate,
    SUBSTRING('HCM262K00147', 7, 1) AS stored_checksum,
    hms_calculate_checksum(SUBSTRING('HCM262K00147', 1, 6)) AS calculated_checksum,
    SUBSTRING('HCM262K00147', 7, 1) = hms_calculate_checksum(SUBSTRING('HCM262K00147', 1, 6)) AS is_valid;

-- 13.3 Get current sequence status
SELECT hospital_code, entity_type, role_gender_code,
       year_code, month_code, last_sequence
FROM id_sequences
WHERE hospital_id = $1
ORDER BY entity_type, year_code DESC, month_code DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. DASHBOARD & REPORTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 14.1 Hospital dashboard summary
SELECT
    (SELECT COUNT(*) FROM patients WHERE hospital_id = $1 AND is_deleted = false) AS total_patients,
    (SELECT COUNT(*) FROM patients WHERE hospital_id = $1 AND is_deleted = false
        AND registered_at >= DATE_TRUNC('month', CURRENT_DATE)) AS new_patients_this_month,
    (SELECT COUNT(*) FROM doctors WHERE hospital_id = $1 AND is_active = true AND is_deleted = false) AS active_doctors,
    (SELECT COUNT(*) FROM appointments WHERE hospital_id = $1
        AND appointment_date = CURRENT_DATE AND is_deleted = false) AS today_appointments,
    (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE hospital_id = $1
        AND invoice_date = CURRENT_DATE AND is_deleted = false) AS today_revenue,
    (SELECT COALESCE(SUM(paid_amount), 0) FROM invoices WHERE hospital_id = $1
        AND invoice_date = CURRENT_DATE AND is_deleted = false) AS today_collected;

-- 14.2 Monthly patient registration trend (last 12 months)
SELECT
    DATE_TRUNC('month', registered_at) AS month,
    COUNT(*) AS registrations
FROM patients
WHERE hospital_id = $1
  AND registered_at >= CURRENT_DATE - INTERVAL '12 months'
  AND is_deleted = false
GROUP BY DATE_TRUNC('month', registered_at)
ORDER BY month;

-- 14.3 Top doctors by appointment count
SELECT u.first_name || ' ' || u.last_name AS doctor_name,
       d.specialization, dep.name AS department,
       COUNT(a.id) AS appointment_count,
       COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed
FROM doctors d
JOIN users u ON u.id = d.user_id
LEFT JOIN departments dep ON dep.id = d.department_id
LEFT JOIN appointments a ON a.doctor_id = d.id
    AND a.appointment_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND a.is_deleted = false
WHERE d.hospital_id = $1 AND d.is_active = true
GROUP BY d.id, u.first_name, u.last_name, d.specialization, dep.name
ORDER BY appointment_count DESC;

-- 14.4 Revenue by payment mode (for a date range)
SELECT payment_mode,
       COUNT(*) AS transaction_count,
       SUM(amount) AS total_amount
FROM payments p
WHERE p.hospital_id = $1
  AND p.payment_date BETWEEN $2 AND $3
  AND p.status = 'completed'
GROUP BY payment_mode
ORDER BY total_amount DESC;

-- 14.5 Insurance claims summary
SELECT
    ip.name AS provider_name,
    COUNT(ic.id) AS total_claims,
    SUM(ic.claim_amount) AS total_claimed,
    SUM(ic.approved_amount) FILTER (WHERE ic.status IN ('approved', 'settled')) AS total_approved,
    COUNT(*) FILTER (WHERE ic.status = 'submitted') AS pending,
    COUNT(*) FILTER (WHERE ic.status = 'rejected') AS rejected
FROM insurance_claims ic
JOIN insurance_policies ipol ON ipol.id = ic.policy_id
JOIN insurance_providers ip ON ip.id = ipol.provider_id
WHERE ic.hospital_id = $1
GROUP BY ip.name
ORDER BY total_claimed DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. SEQUENCE GENERATORS (for formatted numbers)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 15.1 Generate next appointment number
UPDATE hospital_settings
SET invoice_sequence = invoice_sequence  -- placeholder; use relevant field
WHERE hospital_id = $1;

-- Use this pattern for generating formatted numbers:
-- APT-YYYY-NNNNN, INV-YYYY-NNNNN, RX-YYYY-NNNNN, etc.

-- Example: Get next invoice number
WITH next_seq AS (
    UPDATE hospital_settings
    SET invoice_sequence = invoice_sequence + 1, updated_at = NOW()
    WHERE hospital_id = $1
    RETURNING invoice_prefix, invoice_sequence
)
SELECT invoice_prefix || '-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-'
       || LPAD(invoice_sequence::TEXT, 5, '0') AS next_invoice_number
FROM next_seq;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — All common queries documented
-- ═══════════════════════════════════════════════════════════════════════════════
