import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If provided, only users whose role is in this list can access the route. */
  allowedRoles?: string[];
  /** If provided, the route is inaccessible when the module is disabled for this tenant. */
  requiredModule?: string;
  /**
   * If true, the route requires the hospital to be classified eye_hospital/
   * multi_specialty — gates the BRD v1.1 feature pack (Queue Display, etc.).
   */
  requireEyeHospitalFeature?: boolean;
}

const MODULE_LABELS: Record<string, string> = {
  patients:      'Patients',
  appointments:  'Appointments',
  prescriptions: 'Prescriptions',
  pharmacy:      'Pharmacy',
  inventory:     'Inventory',
  billing:       'Billing & Invoicing',
  analytics:     'Analytics',
  optical:       'Optical Store',
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredModule, requireEyeHospitalFeature }) => {
  const { isAuthenticated, user, isModuleEnabled, isEyeHospitalFeatureEnabled } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // super_admin bypasses all checks
  if (user?.roles?.includes('super_admin')) {
    return <>{children}</>;
  }

  // Case/whitespace-insensitive — mirrors the backend's _has_role normalization
  // (dependencies.py) so a role stored with different casing never silently
  // bounces an otherwise-authorized user to the dashboard.
  if (allowedRoles && user) {
    const normalizedAllowed = allowedRoles.map(r => r.trim().toLowerCase());
    const hasAllowedRole = user.roles?.some(r => normalizedAllowed.includes(r.trim().toLowerCase()));
    if (!hasAllowedRole) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  if (requireEyeHospitalFeature && !isEyeHospitalFeatureEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 px-4 text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-5">
          <span className="material-icons text-amber-400 text-4xl">lock</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Not Available</h2>
        <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
          This feature is only available to hospitals classified as an <strong className="text-slate-700">Eye Hospital</strong> or <strong className="text-slate-700">Multi-Specialty</strong> hospital.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Back to Dashboard
        </a>
      </div>
    );
  }

  if (requiredModule && !isModuleEnabled(requiredModule)) {
    const label = MODULE_LABELS[requiredModule] ?? requiredModule;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 px-4 text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-5">
          <span className="material-icons text-amber-400 text-4xl">lock</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Module Not Available</h2>
        <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
          The <strong className="text-slate-700">{label}</strong> module is not enabled for your hospital.
          Contact your system administrator to enable it from the hospital settings.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Back to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;