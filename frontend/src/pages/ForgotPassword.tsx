import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      // Backend always returns success here regardless of whether the email is
      // registered, to prevent account enumeration — so the UI shows the same
      // confirmation either way.
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white mr-3">
            <span className="material-icons text-2xl">mail_lock</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Forgot Password</h1>
            <p className="text-slate-500 text-sm">We'll email you a reset link</p>
          </div>
        </div>

        {submitted ? (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <span className="material-icons text-3xl text-green-600">mark_email_read</span>
            </div>
            <h2 className="font-bold text-slate-800">Check your email</h2>
            <p className="text-slate-500 text-sm">
              If an account exists for <strong>{email}</strong>, a password reset link has been sent.
              It will expire in 2 hours.
            </p>
            <Link to="/login" className="inline-block text-primary text-sm font-semibold hover:underline">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <span className="material-icons text-base">error_outline</span>
                {error}
              </div>
            )}

            <p className="text-sm text-slate-500">
              Enter the email address associated with your account, and we'll send you a link to reset your password.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@hospital.com"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>

            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="text-primary font-semibold hover:underline">Back to Login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
