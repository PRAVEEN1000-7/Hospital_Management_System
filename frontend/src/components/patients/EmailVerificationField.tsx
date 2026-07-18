import React, { useEffect, useState } from 'react';
import patientService from '../../services/patientService';
import { useToast } from '../../contexts/ToastContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailVerificationFieldProps {
  patientId: string | null;
  email: string;
  isEmailVerified: boolean;
  onVerified?: () => void;
}

// "Send Email Verification" -> code entry -> "Verify Code" -> "Verified Email"
// (BRD_OP_1 §3.2.1 — "link or code"). The emailed link still works too; this
// gives the front desk a way to confirm the address without depending on the
// patient's mail client rendering the link. Dropped into both the primary
// registration form and the patient detail page.
const EmailVerificationField: React.FC<EmailVerificationFieldProps> = ({ patientId, email, isEmailVerified, onVerified }) => {
  const { success, error: showError } = useToast();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (isEmailVerified) {
    return (
      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
        <span className="material-icons text-xs">check_circle</span>
        Verified Email
      </p>
    );
  }

  const isValidEmail = EMAIL_RE.test(email || '');
  if (!isValidEmail) return null;

  const handleSend = async () => {
    if (!patientId) {
      showError('Save the patient record first, then send email verification.');
      return;
    }
    setSending(true);
    try {
      const res = await patientService.sendEmailVerification(patientId);
      success(res.message || 'Verification email sent');
      setCodeSent(true);
      setCooldown(res.cooldown_seconds || 60);
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Failed to send verification email';
      showError(message);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!patientId) return;
    if (!/^\d{4,8}$/.test(code)) {
      showError('Enter the code from the verification email');
      return;
    }
    setVerifying(true);
    try {
      await patientService.verifyEmailCode(patientId, code);
      success('Email verified');
      setCodeSent(false);
      setCode('');
      onVerified?.();
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Incorrect or expired code';
      showError(message);
    } finally {
      setVerifying(false);
    }
  };

  if (!codeSent) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || cooldown > 0}
          className="text-xs font-semibold text-primary hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed flex items-center gap-1"
        >
          <span className={`material-icons text-xs ${sending ? 'animate-spin' : ''}`}>{sending ? 'sync' : 'mail'}</span>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Email Verification'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="Enter code"
        className="w-28 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
      />
      <button
        type="button"
        onClick={handleVerifyCode}
        disabled={verifying || !code}
        className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1"
      >
        <span className={`material-icons text-xs ${verifying ? 'animate-spin' : ''}`}>{verifying ? 'sync' : 'check'}</span>
        Verify Code
      </button>
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || cooldown > 0}
        className="text-xs font-semibold text-primary hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
      </button>
    </div>
  );
};

export default EmailVerificationField;
