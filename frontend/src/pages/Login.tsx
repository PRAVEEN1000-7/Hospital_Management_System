import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../contexts/AuthContext';
import { loginSchema, type LoginFormData } from '../utils/validation';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setError('');
    try {
      await login(data);
      navigate('/dashboard');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || 'Login failed. Please try again.');
    }
  };

  return (
    <main className="w-full min-h-screen flex flex-col md:flex-row overflow-hidden">
      {/* Left Hero Panel */}
      <section className="hidden md:flex md:w-7/12 lg:w-3/5 relative bg-primary items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            alt="Modern Hospital Corridor"
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAY9XKOewOnGBuqSJLua1JF4J7T33NLnVXWK4nfzlXr7IUq_0Ks5kuB8j3G2h_BUFjfpUEXxhnyq17cBECdpPVGbO4VAiOf-Ez-dVZd0Sw-_77IFOtfXrY8oKxkiX-t4KIXxlew93ZkKqsFmrnoAviAXgwiIqec7BSykP3KYxHpTi_kifipp2l8yQQmdk_Tts1Cyvx__cudqG9yME34Y0GmlKbSglNjnbeZ-N80iHZC0z4_VRt0tUB2tqQTLRZPCFaka5V3PdAQyj4"
          />
        </div>
        <div className="relative z-10 p-12 lg:p-24 text-white max-w-2xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg">
              <span className="material-icons text-primary text-3xl">local_hospital</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">HMS Global</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mb-6">
            Empowering Healthcare Through Intelligence.
          </h1>
          <p className="text-lg lg:text-xl text-white/80 leading-relaxed mb-10">
            Access the next generation of patient care coordination and clinical management systems. Streamlined, secure, and built for modern providers.
          </p>
          <div className="grid grid-cols-2 gap-6 pt-10 border-t border-white/20">
            <div className="flex items-center gap-3">
              <span className="material-icons text-white/70">verified_user</span>
              <span className="text-sm font-medium">HIPAA Compliant</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-icons text-white/70">lock</span>
              <span className="text-sm font-medium">256-bit Encryption</span>
            </div>
          </div>
        </div>
        {/* Decorative blurs */}
        <div className="absolute bottom-[-10%] right-[-5%] w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute top-[-10%] left-[-5%] w-64 h-64 bg-primary/30 rounded-full blur-3xl"></div>
      </section>

      {/* Right Login Panel */}
      <section className="flex-1 bg-white flex flex-col justify-between p-8 md:p-12 lg:p-20">
        {/* Mobile Brand */}
        <div className="md:hidden flex items-center gap-2 mb-12">
          <span className="material-icons text-primary text-2xl">local_hospital</span>
          <span className="text-xl font-bold text-slate-800">HMS Global</span>
        </div>

        <div className="w-full max-w-md mx-auto">
          <div className="mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
            <p className="text-slate-500">Enter your credentials to access the provider portal.</p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3">
              <span className="material-icons text-red-500 text-xl">error_outline</span>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="username">
                Email or Username
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-icons text-slate-400 group-focus-within:text-primary transition-colors text-xl">alternate_email</span>
                </div>
                <input
                  {...register('username')}
                  id="username"
                  className="block w-full pl-10 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="name@hospital.com"
                  type="text"
                />
              </div>
              {errors.username && (
                <p className="mt-1.5 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
                  Password
                </label>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-icons text-slate-400 group-focus-within:text-primary transition-colors text-xl">lock_outline</span>
                </div>
                <input
                  {...register('password')}
                  id="password"
                  className="block w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="••••••••"
                  type={showPassword ? 'text' : 'password'}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-icons text-xl">{showPassword ? 'visibility' : 'visibility_off'}</span>
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <span className="material-icons text-lg">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400">
            <span className="material-icons text-sm">shield</span>
            <span className="text-xs font-medium uppercase tracking-wider">End-to-End Secure Session</span>
          </div>
        </div>

        <footer className="mt-12 text-center text-xs text-slate-400 space-x-4">
          <span>HMS &copy; 2026</span>
          <span className="text-slate-300">|</span>
          <span>Privacy Policy</span>
          <span className="text-slate-300">|</span>
          <span>Contact Support</span>
        </footer>
      </section>
    </main>
  );
};

export default Login;
