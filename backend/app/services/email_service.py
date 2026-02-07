import logging
import smtplib
import io
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from ..config import settings

logger = logging.getLogger(__name__)


def _check_smtp_configured() -> str | None:
    """Return an error message if SMTP is not configured, else None."""
    missing = []
    if not settings.SMTP_HOST:
        missing.append("SMTP_HOST")
    if not settings.SMTP_USERNAME:
        missing.append("SMTP_USERNAME")
    if not settings.SMTP_PASSWORD:
        missing.append("SMTP_PASSWORD")
    if not settings.SMTP_FROM_EMAIL or settings.SMTP_FROM_EMAIL == "noreply@hospital.com":
        missing.append("SMTP_FROM_EMAIL")
    if missing:
        return (
            f"SMTP not configured. Missing/default env variables: {', '.join(missing)}. "
            "See .env.example for setup instructions."
        )
    return None


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> bool:
    """
    Send an email using SMTP. Raises RuntimeError if SMTP is not configured.

    attachments: list of (filename, file_bytes, mime_type) tuples
    """
    config_error = _check_smtp_configured()
    if config_error:
        logger.warning(config_error)
        raise RuntimeError(config_error)

    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = to_email

        html_part = MIMEText(html_body, "html")
        msg.attach(html_part)

        # Attachments
        if attachments:
            for filename, file_bytes, mime_type in attachments:
                maintype, subtype = mime_type.split("/", 1)
                part = MIMEBase(maintype, subtype)
                part.set_payload(file_bytes)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment", filename=filename)
                msg.attach(part)

        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=60) as server:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=60) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())

        logger.info(f"Email sent successfully to {to_email}")
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP authentication failed: {e}")
        raise RuntimeError(
            "SMTP authentication failed. Check SMTP_USERNAME and SMTP_PASSWORD in .env. "
            "For Gmail, use an App Password (not your regular password)."
        )
    except smtplib.SMTPRecipientsRefused as e:
        logger.error(f"Recipient refused: {to_email} — {e}")
        raise RuntimeError(f"Email address rejected by server: {to_email}")
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error sending to {to_email}: {e}", exc_info=True)
        raise RuntimeError(f"SMTP error: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}", exc_info=True)
        raise RuntimeError(f"Email sending failed: {str(e)}")


def _email_base_template(title: str, body_content: str) -> str:
    """Wrap body content in a professional, responsive email template."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:30px 15px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0"
  style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);background:#ffffff;">
  <tr>
    <td style="background:linear-gradient(135deg,#0284c7 0%,#0369a1 100%);padding:32px 40px;text-align:center;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">
        {settings.HOSPITAL_NAME}
      </h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);letter-spacing:0.3px;">
        Hospital Management System
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px 24px;">
      {body_content}
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
      <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size:12px;color:#64748b;line-height:1.6;">
            <strong>{settings.HOSPITAL_NAME}</strong><br>
            {settings.HOSPITAL_ADDRESS}, {settings.HOSPITAL_CITY}<br>
            {settings.HOSPITAL_STATE}, {settings.HOSPITAL_COUNTRY} - {settings.HOSPITAL_PIN_CODE}<br>
            Phone: {settings.HOSPITAL_PHONE} | Email: {settings.HOSPITAL_EMAIL}
          </td>
        </tr>
        <tr>
          <td style="padding-top:12px;font-size:11px;color:#94a3b8;">
            This is an automated message from {settings.HOSPITAL_NAME}. Please do not reply directly to this email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</td></tr></table>
</body></html>"""


def send_password_email(
    to_email: str, username: str, password: str, full_name: str
) -> bool:
    """Send account credentials to user via email. Raises RuntimeError on failure."""
    subject = f"{settings.HOSPITAL_NAME} - Your Account Has Been Created"
    body = f"""
      <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">
        Dear <strong>{full_name}</strong>,
      </p>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px;">
        Welcome! Your account on the <strong>{settings.HOSPITAL_NAME}</strong> Hospital Management System has been
        created by the System Administrator. Below are your login credentials:
      </p>
      <table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr><td style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1px solid #bae6fd;border-radius:10px;padding:24px;">
          <table cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;width:120px;">Username</td>
              <td style="padding:6px 0;font-size:15px;color:#0f172a;font-weight:600;">{username}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;">Password</td>
              <td style="padding:6px 0;font-size:15px;color:#0f172a;font-weight:600;font-family:monospace;letter-spacing:1px;">{password}</td>
            </tr>
          </table>
        </td></tr>
      </table>
      <table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
        <tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;">
          <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;">
            <strong>Security Notice:</strong> Please change your password immediately after
            your first login. Do not share your credentials with anyone.
          </p>
        </td></tr>
      </table>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 8px;">
        If you did not expect this account, please contact the System Administrator immediately.
      </p>
      <p style="font-size:14px;color:#475569;margin:0;">
        Best regards,<br><strong>{settings.HOSPITAL_NAME} Team</strong>
      </p>
    """
    return send_email(to_email, subject, _email_base_template(subject, body))


def _generate_id_card_pdf(patient, settings_obj=None) -> bytes:
    """Generate a PDF of the patient ID card. Returns PDF bytes."""
    from xhtml2pdf import pisa

    s = settings_obj or settings
    html = _generate_id_card_pdf_html(patient, s)

    buffer = io.BytesIO()
    pisa_status = pisa.CreatePDF(io.StringIO(html), dest=buffer)
    if pisa_status.err:
        logger.error(f"PDF generation error: {pisa_status.err}")
        raise RuntimeError("Failed to generate ID card PDF")
    return buffer.getvalue()


def _generate_id_card_pdf_html(patient, s) -> str:
    """HTML specifically for PDF rendering (xhtml2pdf-compatible)."""
    full_name = f"{patient.title} {patient.first_name} {patient.last_name}"
    dob = patient.date_of_birth.strftime("%d %b %Y") if patient.date_of_birth else "N/A"

    from datetime import date
    today = date.today()
    if patient.date_of_birth:
        age = today.year - patient.date_of_birth.year - (
            (today.month, today.day) < (patient.date_of_birth.month, patient.date_of_birth.day)
        )
        age_str = f"{age} yrs"
    else:
        age_str = ""

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

    emergency_row = f'<tr><td colspan="2" style="font-size:9px;color:#6b7280;padding-top:4px;"><b>Emergency:</b> {emergency}</td></tr>' if emergency else ''

    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @page {{ size: 120mm 170mm; margin: 10mm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 0; }}
  .card {{ width: 100mm; border: 2px solid #0284c7; overflow: hidden; margin: 0 auto 8mm; }}
  .card-header {{ background-color: #0284c7; color: white; padding: 8px 14px; }}
  .card-header h2 {{ margin: 0; font-size: 13px; }}
  .card-header small {{ font-size: 9px; }}
  .card-body {{ padding: 10px 14px; }}
  .name {{ font-size: 15px; font-weight: bold; color: #1e293b; margin-bottom: 6px; }}
  .info-table td {{ font-size: 10px; color: #374151; padding: 2px 0; }}
  .label {{ color: #6b7280; padding-right: 8px; }}
  .blood {{ color: #dc2626; font-weight: bold; }}
  .fold {{ text-align: center; font-size: 10px; color: #9ca3af; margin: 4mm 0; }}
  .back-body {{ padding: 14px; text-align: center; }}
  .footer-note {{ font-size: 8px; color: #9ca3af; text-align: center; margin-top: 8px; }}
</style>
</head><body>
<div class="card">
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr><td class="card-header">
      <table width="100%"><tr>
        <td><h2>{s.HOSPITAL_NAME}</h2><small>Patient Identity Card</small></td>
        <td align="right" style="color:white;font-size:11px;font-weight:bold;">{patient.prn}</td>
      </tr></table>
    </td></tr>
  </table>
  <div class="card-body">
    <div class="name">{full_name}</div>
    <table class="info-table" cellspacing="0" cellpadding="0">
      <tr><td class="label">DOB:</td><td>{dob} ({age_str})</td></tr>
      <tr><td class="label">Gender:</td><td>{patient.gender}</td></tr>
      <tr><td class="label">Blood:</td><td class="blood">{blood_group}</td></tr>
      <tr><td class="label">Mobile:</td><td>{mobile}</td></tr>
      {emergency_row}
    </table>
  </div>
</div>
<div class="fold">- - - - Fold Here - - - -</div>
<div class="card">
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr><td class="card-header" style="text-align:center;">
      <h2>{s.HOSPITAL_NAME}</h2>
    </td></tr>
  </table>
  <div class="back-body">
    <table class="info-table" cellspacing="0" cellpadding="0" style="margin:0 auto;text-align:left;">
      <tr><td class="label">Address:</td><td>{s.HOSPITAL_ADDRESS}</td></tr>
      <tr><td></td><td>{s.HOSPITAL_CITY}, {s.HOSPITAL_STATE}</td></tr>
      <tr><td></td><td>{s.HOSPITAL_COUNTRY} - {s.HOSPITAL_PIN_CODE}</td></tr>
      <tr><td class="label">Phone:</td><td>{s.HOSPITAL_PHONE}</td></tr>
      <tr><td class="label">Email:</td><td>{s.HOSPITAL_EMAIL}</td></tr>
      <tr><td class="label">Website:</td><td>{s.HOSPITAL_WEBSITE}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">
    <p class="footer-note">
      This card is the property of {s.HOSPITAL_NAME}.<br>
      If found, please return to the above address.
    </p>
  </div>
</div>
</body></html>"""


def send_patient_id_card_email(
    to_email: str, patient_name: str, patient=None,
    id_card_html: str = "", pdf_bytes: bytes | None = None,
) -> bool:
    """Send patient ID card via email with PDF attachment. Raises RuntimeError on failure.

    If pdf_bytes is provided (from the frontend), it is used directly.
    Otherwise falls back to server-side PDF generation via xhtml2pdf.
    """
    subject = f"{settings.HOSPITAL_NAME} - Your Patient ID Card"

    body = f"""
      <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">
        Dear <strong>{patient_name}</strong>,
      </p>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px;">
        Thank you for registering with <strong>{settings.HOSPITAL_NAME}</strong>.
        Your Patient ID Card has been generated and is attached to this email as a PDF document.
      </p>
      <table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr><td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;">
          <p style="margin:0 0 10px;font-size:14px;color:#166534;font-weight:600;">
            What to do with your ID Card:
          </p>
          <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#15803d;line-height:1.8;">
            <li>Download and save the attached PDF for your records</li>
            <li>Print the card and carry it during hospital visits</li>
            <li>Present this card at the reception for quick check-in</li>
            <li>Keep your PRN (Patient Reference Number) for future reference</li>
          </ul>
        </td></tr>
      </table>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 8px;">
        If you have any questions, please don't hesitate to contact us.
      </p>
      <p style="font-size:14px;color:#475569;margin:0;">
        Warm regards,<br><strong>{settings.HOSPITAL_NAME} Team</strong>
      </p>
    """

    # Determine PDF attachment
    attachments = []
    prn = (patient.prn if patient else None) or "patient"

    if pdf_bytes:
        # Use the high-quality PDF rendered by the frontend
        attachments.append((f"ID-Card-{prn}.pdf", pdf_bytes, "application/pdf"))
    elif patient:
        # Fallback: server-side generation
        try:
            generated_pdf = _generate_id_card_pdf(patient)
            attachments.append((f"ID-Card-{prn}.pdf", generated_pdf, "application/pdf"))
        except Exception as e:
            logger.warning(f"PDF generation failed, sending without attachment: {e}")

    return send_email(
        to_email,
        subject,
        _email_base_template(subject, body),
        attachments=attachments if attachments else None,
    )


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
