import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email using SMTP"""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured (SMTP_HOST is empty). Email not sent to %s.", to_email)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = to_email

        html_part = MIMEText(html_body, "html")
        msg.attach(html_part)

        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
            server.starttls()

        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

        server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())
        server.quit()

        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}", exc_info=True)
        return False


def send_password_email(
    to_email: str, username: str, password: str, full_name: str
) -> bool:
    """Send account credentials to user via email"""
    subject = f"{settings.HOSPITAL_NAME} - Your Account Credentials"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
            <div style="background-color: #0284c7; color: white; padding: 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">{settings.HOSPITAL_NAME}</h1>
                <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Hospital Management System</p>
            </div>
            <div style="padding: 30px;">
                <p style="font-size: 16px;">Dear <strong>{full_name}</strong>,</p>
                <p>Your account has been created on the Hospital Management System. Below are your login credentials:</p>
                <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #bae6fd;">
                    <p style="margin: 8px 0;"><strong>Username:</strong> {username}</p>
                    <p style="margin: 8px 0;"><strong>Password:</strong> {password}</p>
                </div>
                <p style="color: #dc2626; font-weight: 500;">&#9888; Please change your password after first login for security purposes.</p>
                <p>If you did not request this account, please contact the system administrator immediately.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
                    {settings.HOSPITAL_NAME}<br>
                    {settings.HOSPITAL_ADDRESS}, {settings.HOSPITAL_CITY}<br>
                    {settings.HOSPITAL_STATE}, {settings.HOSPITAL_COUNTRY} - {settings.HOSPITAL_PIN_CODE}<br>
                    Phone: {settings.HOSPITAL_PHONE}<br>
                    Email: {settings.HOSPITAL_EMAIL}
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)


def send_patient_id_card_email(
    to_email: str, patient_name: str, id_card_html: str
) -> bool:
    """Send patient ID card via email"""
    subject = f"{settings.HOSPITAL_NAME} - Patient ID Card"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 700px; margin: 0 auto;">
            <p style="font-size: 16px;">Dear <strong>{patient_name}</strong>,</p>
            <p>Please find your Patient ID Card below. You can print this email or save it for your records.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            {id_card_html}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
                This is a system-generated email from {settings.HOSPITAL_NAME}.
                Please do not reply to this email.
            </p>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)


def generate_patient_id_card_html(patient, settings_obj=None) -> str:
    """Generate HTML for patient ID card (front + back)"""
    s = settings_obj or settings
    full_name = f"{patient.title} {patient.first_name} {patient.last_name}"
    dob = patient.date_of_birth.strftime("%d %b %Y") if patient.date_of_birth else "N/A"

    # Calculate age
    from datetime import date
    today = date.today()
    if patient.date_of_birth:
        age = today.year - patient.date_of_birth.year - (
            (today.month, today.day) < (patient.date_of_birth.month, patient.date_of_birth.day)
        )
        age_str = f"{age} years"
    else:
        age_str = "N/A"

    blood_group = patient.blood_group or "N/A"
    mobile = f"{patient.country_code} {patient.mobile_number}"
    emergency = ""
    if patient.emergency_contact_name:
        ec_mobile = ""
        if patient.emergency_contact_mobile:
            ec_code = patient.emergency_contact_country_code or ""
            ec_mobile = f" | {ec_code} {patient.emergency_contact_mobile}"
        ec_rel = f" ({patient.emergency_contact_relationship})" if patient.emergency_contact_relationship else ""
        emergency = f"{patient.emergency_contact_name}{ec_rel}{ec_mobile}"

    return f"""
    <div style="font-family: Arial, sans-serif;">
        <!-- FRONT SIDE -->
        <div style="width: 420px; height: 260px; border: 2px solid #0284c7; border-radius: 12px; overflow: hidden; margin: 10px auto; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);">
            <div style="background: #0284c7; color: white; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 14px; font-weight: bold;">{s.HOSPITAL_NAME}</div>
                    <div style="font-size: 9px; opacity: 0.9;">Patient Identity Card</div>
                </div>
                <div style="font-size: 10px; text-align: right;">
                    <div style="font-weight: bold;">{patient.prn}</div>
                </div>
            </div>
            <div style="padding: 12px 16px; display: flex;">
                <div style="width: 80px; height: 90px; background: #e0e7ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 16px; border: 1px solid #c7d2fe;">
                    <span style="font-size: 36px; color: #6366f1;">&#128100;</span>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 16px; font-weight: bold; color: #1e3a5f; margin-bottom: 6px;">{full_name}</div>
                    <table style="font-size: 11px; color: #374151; line-height: 1.6;">
                        <tr><td style="padding-right: 8px; color: #6b7280;">DOB:</td><td>{dob} ({age_str})</td></tr>
                        <tr><td style="padding-right: 8px; color: #6b7280;">Gender:</td><td>{patient.gender}</td></tr>
                        <tr><td style="padding-right: 8px; color: #6b7280;">Blood:</td><td style="color: #dc2626; font-weight: bold;">{blood_group}</td></tr>
                        <tr><td style="padding-right: 8px; color: #6b7280;">Mobile:</td><td>{mobile}</td></tr>
                    </table>
                </div>
            </div>
            {f'<div style="padding: 0 16px 8px; font-size: 10px; color: #6b7280;"><strong>Emergency:</strong> {emergency}</div>' if emergency else ''}
        </div>

        <div style="text-align: center; color: #9ca3af; font-size: 11px; margin: 4px 0;">&#8212; &#9986; Fold Here &#9986; &#8212;</div>

        <!-- BACK SIDE -->
        <div style="width: 420px; height: 260px; border: 2px solid #0284c7; border-radius: 12px; overflow: hidden; margin: 10px auto; background: white;">
            <div style="background: #0284c7; color: white; padding: 8px 16px; text-align: center;">
                <div style="font-size: 14px; font-weight: bold;">{s.HOSPITAL_NAME}</div>
            </div>
            <div style="padding: 16px; text-align: center;">
                <table style="font-size: 11px; color: #374151; margin: 0 auto; text-align: left; line-height: 2;">
                    <tr><td style="padding-right: 12px; color: #6b7280;">Address:</td><td>{s.HOSPITAL_ADDRESS}</td></tr>
                    <tr><td></td><td>{s.HOSPITAL_CITY}, {s.HOSPITAL_STATE}</td></tr>
                    <tr><td></td><td>{s.HOSPITAL_COUNTRY} - {s.HOSPITAL_PIN_CODE}</td></tr>
                    <tr><td style="padding-right: 12px; color: #6b7280;">Phone:</td><td>{s.HOSPITAL_PHONE}</td></tr>
                    <tr><td style="padding-right: 12px; color: #6b7280;">Email:</td><td>{s.HOSPITAL_EMAIL}</td></tr>
                    <tr><td style="padding-right: 12px; color: #6b7280;">Website:</td><td>{s.HOSPITAL_WEBSITE}</td></tr>
                </table>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 12px 0;">
                <p style="font-size: 9px; color: #9ca3af; margin: 0;">
                    This card is the property of {s.HOSPITAL_NAME}.<br>
                    If found, please return to the above address.<br>
                    This is a system-generated ID card.
                </p>
            </div>
        </div>
    </div>
    """


# ═══════════════════════════════════════════════════════════════════════════
# Appointment Email Functions
# ═══════════════════════════════════════════════════════════════════════════

def _appointment_email_header():
    return f"""
    <div style="background-color: #0284c7; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">{settings.HOSPITAL_NAME}</h1>
        <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">Appointment Management</p>
    </div>"""


def _appointment_email_footer():
    return f"""
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
        {settings.HOSPITAL_NAME}<br>
        {settings.HOSPITAL_ADDRESS}, {settings.HOSPITAL_CITY}<br>
        Phone: {settings.HOSPITAL_PHONE} | Email: {settings.HOSPITAL_EMAIL}<br>
        <em>This is a system-generated email. Please do not reply.</em>
    </p>"""


def send_appointment_confirmation_email(
    to_email: str, patient_name: str, doctor_name: str,
    appointment_date: str, appointment_time: str,
    appointment_number: str, consultation_type: str
) -> bool:
    """Send appointment booking confirmation email."""
    subject = f"{settings.HOSPITAL_NAME} - Appointment Confirmation ({appointment_number})"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
            {_appointment_email_header()}
            <div style="padding: 30px;">
                <p style="font-size: 16px;">Dear <strong>{patient_name}</strong>,</p>
                <p>Your appointment has been confirmed. Details below:</p>
                <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #bae6fd;">
                    <table style="font-size: 14px; line-height: 2;">
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Appointment #</td><td><strong>{appointment_number}</strong></td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Doctor</td><td>Dr. {doctor_name}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Date</td><td>{appointment_date}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Time</td><td>{appointment_time}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Type</td><td style="text-transform: capitalize;">{consultation_type}</td></tr>
                    </table>
                </div>
                <p style="color: #059669; font-weight: 500;">&#10004; Please arrive 15 minutes before your scheduled time.</p>
                {_appointment_email_footer()}
            </div>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)


def send_appointment_cancellation_email(
    to_email: str, patient_name: str,
    appointment_number: str, appointment_date: str,
    reason: str = ""
) -> bool:
    """Send appointment cancellation notification email."""
    subject = f"{settings.HOSPITAL_NAME} - Appointment Cancelled ({appointment_number})"
    reason_html = f'<p><strong>Reason:</strong> {reason}</p>' if reason else ''
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
            {_appointment_email_header()}
            <div style="padding: 30px;">
                <p style="font-size: 16px;">Dear <strong>{patient_name}</strong>,</p>
                <p>Your appointment <strong>{appointment_number}</strong> scheduled for <strong>{appointment_date}</strong> has been <span style="color: #dc2626; font-weight: bold;">cancelled</span>.</p>
                {reason_html}
                <p>If you would like to reschedule, please contact us or book a new appointment through our system.</p>
                {_appointment_email_footer()}
            </div>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)


def send_appointment_reschedule_email(
    to_email: str, patient_name: str, doctor_name: str,
    appointment_number: str, new_date: str, new_time: str
) -> bool:
    """Send appointment reschedule notification email."""
    subject = f"{settings.HOSPITAL_NAME} - Appointment Rescheduled ({appointment_number})"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
            {_appointment_email_header()}
            <div style="padding: 30px;">
                <p style="font-size: 16px;">Dear <strong>{patient_name}</strong>,</p>
                <p>Your appointment <strong>{appointment_number}</strong> has been rescheduled.</p>
                <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fde68a;">
                    <table style="font-size: 14px; line-height: 2;">
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Doctor</td><td>Dr. {doctor_name}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">New Date</td><td><strong>{new_date}</strong></td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">New Time</td><td><strong>{new_time}</strong></td></tr>
                    </table>
                </div>
                <p>Please contact us if the new time doesn't work for you.</p>
                {_appointment_email_footer()}
            </div>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)


def send_appointment_reminder_email(
    to_email: str, patient_name: str, doctor_name: str,
    appointment_number: str, appointment_date: str, appointment_time: str
) -> bool:
    """Send appointment reminder email."""
    subject = f"{settings.HOSPITAL_NAME} - Appointment Reminder ({appointment_number})"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
            {_appointment_email_header()}
            <div style="padding: 30px;">
                <p style="font-size: 16px;">Dear <strong>{patient_name}</strong>,</p>
                <p>This is a friendly reminder about your upcoming appointment:</p>
                <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #a7f3d0;">
                    <table style="font-size: 14px; line-height: 2;">
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Appointment #</td><td>{appointment_number}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Doctor</td><td>Dr. {doctor_name}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Date</td><td>{appointment_date}</td></tr>
                        <tr><td style="padding-right: 16px; color: #6b7280; font-weight: 600;">Time</td><td>{appointment_time}</td></tr>
                    </table>
                </div>
                <p style="color: #059669; font-weight: 500;">&#128276; Please arrive 15 minutes early.</p>
                {_appointment_email_footer()}
            </div>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)


def send_waitlist_notification_email(
    to_email: str, patient_name: str, doctor_name: str,
    available_date: str
) -> bool:
    """Notify waitlisted patient that a slot is now available."""
    subject = f"{settings.HOSPITAL_NAME} - Appointment Slot Available!"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
            {_appointment_email_header()}
            <div style="padding: 30px;">
                <p style="font-size: 16px;">Dear <strong>{patient_name}</strong>,</p>
                <p>Great news! A slot has become available with <strong>Dr. {doctor_name}</strong> on <strong>{available_date}</strong>.</p>
                <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #a7f3d0; text-align: center;">
                    <p style="font-size: 18px; color: #059669; font-weight: bold; margin: 0;">&#127881; Slot Available!</p>
                    <p style="margin: 8px 0 0;">Please confirm your appointment as soon as possible as slots fill up quickly.</p>
                </div>
                <p>Contact us or log in to confirm your appointment.</p>
                {_appointment_email_footer()}
            </div>
        </div>
    </body>
    </html>
    """
    return send_email(to_email, subject, html_body)
