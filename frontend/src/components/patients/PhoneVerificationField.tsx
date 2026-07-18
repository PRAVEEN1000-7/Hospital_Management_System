import React, { useEffect, useState } from 'react';
import patientService from '../../services/patientService';
import { useToast } from '../../contexts/ToastContext';

interface PhoneVerificationFieldProps {
  patientId: string | null;
  isPhoneVerified: boolean;
  onVerified?: () => void;
}

// "Send OTP" -> code entry -> "Verify OTP" -> "Verified Phone Number"
// (BRD_OP_1 §3.2.2). Backend OTP generation/delivery is being wired up
// separately — this calls the real send/verify endpoints so the UI is
// ready end-to-end once that lands.
const PhoneVerificationField: React.FC<PhoneVerificationFieldProps> = ({ patientId, isPhoneVerified, onVerified }) => {
  const { success, error: showError } = useToast();
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (isPhoneVerified) {
    return (
      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
        <span className="material-icons text-xs">check_circle</span>
        Verified Phone Number
      </p>
    );
  }

  const handleSendOtp = async () => {
    if (!patientId) {
      showError('Save the patient record first, then send OTP.');
      return;
    }
    setSending(true);
    try {
      const res = await patientService.sendPhoneOtp(patientId);
      success(res.message || 'OTP sent');
      setOtpSent(true);
      setCooldown(res.cooldown_seconds || 60);
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Failed to send OTP';
      showError(message);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!patientId) return;
    if (!/^\d{4,8}$/.test(code)) {
      showError('Enter the OTP you received');
      return;
    }
    setVerifying(true);
    try {
      await patientService.verifyPhoneOtp(patientId, code);
      success('Phone number verified');
      setOtpSent(false);
      setCode('');
      onVerified?.();
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Invalid or expired OTP';
      showError(message);
    } finally {
      setVerifying(false);
    }
  };

  if (!otpSent) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={handleSendOtp}
          disabled={sending || cooldown > 0}
          className="text-xs font-semibold text-primary hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed flex items-center gap-1"
        >
          <span className={`material-icons text-xs ${sending ? 'animate-spin' : ''}`}>{sending ? 'sync' : 'sms'}</span>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send OTP'}
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
        placeholder="Enter OTP"
        className="w-28 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
      />
      <button
        type="button"
        onClick={handleVerifyOtp}
        disabled={verifying || !code}
        className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1"
      >
        <span className={`material-icons text-xs ${verifying ? 'animate-spin' : ''}`}>{verifying ? 'sync' : 'check'}</span>
        Verify OTP
      </button>
      <button
        type="button"
        onClick={handleSendOtp}
        disabled={sending || cooldown > 0}
        className="text-xs font-semibold text-primary hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
      </button>
    </div>
  );
};

export default PhoneVerificationField;
