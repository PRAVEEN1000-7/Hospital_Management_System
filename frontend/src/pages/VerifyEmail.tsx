import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import patientService from '../services/patientService';

const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(() => (token ? 'verifying' : 'error'));
  const [error, setError] = useState(() => (token ? '' : 'Invalid or missing verification link.'));

  useEffect(() => {
    if (!token) return;
    patientService.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white mr-3">
            <span className="material-icons text-2xl">mark_email_read</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Email Verification</h1>
            <p className="text-slate-500 text-sm">Confirming your email address</p>
          </div>
        </div>

        {status === 'verifying' && (
          <div className="text-center space-y-3">
            <span className="material-icons text-3xl text-primary animate-spin">sync</span>
            <p className="text-slate-500 text-sm">Verifying…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <span className="material-icons text-3xl text-emerald-600">check_circle</span>
            </div>
            <h2 className="font-bold text-slate-800">Email Verified!</h2>
            <p className="text-slate-500 text-sm">Your email address has been confirmed.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <span className="material-icons text-3xl text-red-600">error</span>
            </div>
            <h2 className="font-bold text-slate-800">Verification Failed</h2>
            <p className="text-slate-500 text-sm">{error}</p>
          </div>
        )}

        <div className="text-center mt-6">
          <Link to="/login" className="inline-block text-primary text-sm font-semibold hover:underline">
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
