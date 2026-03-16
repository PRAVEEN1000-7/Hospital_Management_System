import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatRole } from '../utils/constants';
import patientService from '../services/patientService';
import hospitalService from '../services/hospitalService';
import userService from '../services/userService';
import doctorService from '../services/doctorService';
import walkInService from '../services/walkInService';
import waitlistService from '../services/waitlistService';
import { useToast } from '../contexts/ToastContext';
import type { DoctorProfile } from '../types/doctor';

/* ────────────────────────────── helpers ────────────────────────────── */

interface StatCard { label: string; value: string; icon: string; iconColor: string }
interface QuickAction { icon: string; iconColor: string; label: string; desc: string; to: string }
interface QuickLink { icon: string; iconColor: string; label: string; to: string }

const ACTION_BTN = 'p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]';
const LINK_BTN = 'w-full flex items-center gap-3 text-left hover:bg-slate-800 rounded-lg p-2 transition-colors';

/* ────────────────── role → dashboard title map ─────────────────── */
const dashboardTitles: Record<string, string> = {
  super_admin: 'Admin Dashboard Overview',
  admin: 'Admin Dashboard Overview',
  doctor: 'Doctor Dashboard',
  receptionist: 'Reception Dashboard',
  pharmacist: 'Pharmacy Dashboard',
  cashier: 'Billing Dashboard',
  optical_staff: 'Optical Dashboard',
  inventory_manager: 'Inventory Dashboard',
  report_viewer: 'Reports Dashboard',
};

/* ────────────────── role → quick actions ─────────────────── */
function getQuickActions(role: string, isSuperAdmin: boolean): QuickAction[] {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return [
        { icon: 'person_add', iconColor: 'text-primary', label: 'Register Patient', desc: 'Add a new patient record', to: '/register' },
        { icon: 'group', iconColor: 'text-emerald-500', label: 'Patient Directory', desc: 'Browse all patient records', to: '/patients' },
        ...(isSuperAdmin ? [{ icon: 'admin_panel_settings', iconColor: 'text-rose-500', label: 'User Management', desc: 'Manage staff accounts', to: '/user-management' }] : []),
      ];
    case 'doctor':
      return [
        { icon: 'queue', iconColor: 'text-amber-500', label: 'My Queue', desc: 'View your patient queue', to: '/appointments/queue' },
        { icon: 'note_add', iconColor: 'text-blue-500', label: 'New Prescription', desc: 'Create a prescription', to: '/prescriptions/new' },
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
    case 'receptionist':
      return [
        { icon: 'directions_walk', iconColor: 'text-primary', label: 'Walk-in Registration', desc: 'Register a walk-in patient', to: '/appointments/walk-in' },
        { icon: 'queue', iconColor: 'text-amber-500', label: 'Walk-in Queue', desc: 'View current queue status', to: '/appointments/queue' },
        { icon: 'event_note', iconColor: 'text-emerald-500', label: 'Manage Appointments', desc: 'View & manage all appointments', to: '/appointments/manage' },
      ];
    case 'pharmacist':
      return [
        { icon: 'list_alt', iconColor: 'text-primary', label: 'Prescriptions', desc: 'View pending prescriptions', to: '/prescriptions' },
        { icon: 'group', iconColor: 'text-emerald-500', label: 'Patient Directory', desc: 'Look up patient records', to: '/patients' },
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
    case 'cashier':
      return [
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
    case 'optical_staff':
      return [
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
    case 'inventory_manager':
      return [
        { icon: 'inventory_2', iconColor: 'text-primary', label: 'Inventory Dashboard', desc: 'View stock and inventory activity', to: '/inventory' },
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
    case 'report_viewer':
      return [
        { icon: 'analytics', iconColor: 'text-primary', label: 'Appointment Reports', desc: 'View appointment analytics', to: '/appointments/reports' },
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
    default:
      return [
        { icon: 'person', iconColor: 'text-purple-500', label: 'My Profile', desc: 'Update your information', to: '/profile' },
      ];
  }
}

/* ────────────────── role → quick links sidebar ─────────────────── */
function getQuickLinks(role: string): QuickLink[] {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return [
        { icon: 'directions_walk', iconColor: 'text-amber-400', label: 'Walk-in Registration', to: '/appointments/walk-in' },
        { icon: 'queue', iconColor: 'text-blue-400', label: 'Walk-in Queue', to: '/appointments/queue' },
        { icon: 'analytics', iconColor: 'text-emerald-400', label: 'Reports', to: '/appointments/reports' },
      ];
    case 'doctor':
      return [
        { icon: 'queue', iconColor: 'text-amber-400', label: 'Walk-in Queue', to: '/appointments/queue' },
        { icon: 'list_alt', iconColor: 'text-blue-400', label: 'My Prescriptions', to: '/prescriptions' },
        { icon: 'person', iconColor: 'text-purple-400', label: 'My Profile', to: '/profile' },
      ];
    case 'receptionist':
      return [
        { icon: 'person_add', iconColor: 'text-blue-400', label: 'Register Patient', to: '/register' },
        { icon: 'playlist_add', iconColor: 'text-amber-400', label: 'Waitlist', to: '/appointments/waitlist' },
        { icon: 'analytics', iconColor: 'text-emerald-400', label: 'Reports', to: '/appointments/reports' },
      ];
    case 'pharmacist':
      return [
        { icon: 'list_alt', iconColor: 'text-blue-400', label: 'Prescriptions', to: '/prescriptions' },
        { icon: 'group', iconColor: 'text-emerald-400', label: 'Patients', to: '/patients' },
      ];
    case 'cashier':
      return [
        { icon: 'person', iconColor: 'text-purple-400', label: 'My Profile', to: '/profile' },
      ];
    default:
      return [
        { icon: 'person', iconColor: 'text-purple-400', label: 'My Profile', to: '/profile' },
      ];
  }
}

/* ════════════════════════════ Component ════════════════════════════ */

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [activeUsers, setActiveUsers] = useState<number>(0);
  const [hospitalName, setHospitalName] = useState<string>('HMS Core');
  const [loading, setLoading] = useState(true);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [queueWaiting, setQueueWaiting] = useState<number>(0);
  const [queueInProgress, setQueueInProgress] = useState<number>(0);
  const [queueCompleted, setQueueCompleted] = useState<number>(0);
  const [waitlistWaiting, setWaitlistWaiting] = useState<number>(0);

  const role = user?.roles?.[0] || '';
  const isDoctor = role === 'doctor';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isReceptionist = role === 'receptionist';
  const isPharmacist = role === 'pharmacist';
  const canAccessPatients = role === 'super_admin' || role === 'admin' || role === 'receptionist' || role === 'nurse' || role === 'pharmacist' || role === 'doctor';

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);

      // Patient count only for roles allowed to read patient records
      if (canAccessPatients) {
        try {
          const patientsRes = await patientService.getPatients(1, 1);
          setTotalPatients(patientsRes.total);
        } catch { /* silent */ }
      }

      // Common: hospital name
      try {
        const hospitalRes = await hospitalService.getHospitalDetails();
        setHospitalName(hospitalRes.name);
      } catch { /* silent */ }

      // Doctor-specific data
      if (isDoctor) {
        try { const profile = await doctorService.getMyProfile(); setDoctorProfile(profile); } catch { /* may not exist */ }
        try {
          const queueData = await walkInService.getQueueStatus();
          setQueueWaiting(queueData.total_waiting || 0);
          setQueueInProgress(queueData.total_in_progress || 0);
          setQueueCompleted(queueData.total_completed || 0);
        } catch { /* silent */ }
        try { const wlStats = await waitlistService.getStats(); setWaitlistWaiting(wlStats.total_waiting || 0); } catch { /* silent */ }
      }

      // Receptionist: queue + waitlist counts
      if (isReceptionist) {
        try {
          const queueData = await walkInService.getQueueStatus();
          setQueueWaiting(queueData.total_waiting || 0);
          setQueueInProgress(queueData.total_in_progress || 0);
          setQueueCompleted(queueData.total_completed || 0);
        } catch { /* silent */ }
        try { const wlStats = await waitlistService.getStats(); setWaitlistWaiting(wlStats.total_waiting || 0); } catch { /* silent */ }
      }

      // Admin-only: user count (requires super_admin or admin)
      if (isAdmin) {
        try {
          const firstPage = await userService.getUsers(1, 100);
          let allUsers = [...firstPage.data];
          const totalPages = firstPage.total_pages;
          if (totalPages > 1) {
            const remaining = [];
            for (let page = 2; page <= totalPages; page++) remaining.push(userService.getUsers(page, 100));
            const results = await Promise.all(remaining);
            results.forEach(res => { allUsers = [...allUsers, ...res.data]; });
          }
          setActiveUsers(allUsers.filter((u: any) => u.is_active === true).length);
        } catch { /* silent */ }
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, [isDoctor, isReceptionist, isAdmin, canAccessPatients]);

  /* ── stat cards per role ── */
  const getStatCards = (): StatCard[] => {
    switch (role) {
      case 'doctor':
        return [
          { label: 'Queue Waiting', value: queueWaiting.toString(), icon: 'hourglass_top', iconColor: 'text-amber-500' },
          { label: 'In Consultation', value: queueInProgress.toString(), icon: 'stethoscope', iconColor: 'text-blue-500' },
          { label: 'Completed Today', value: queueCompleted.toString(), icon: 'task_alt', iconColor: 'text-emerald-500' },
          { label: 'Waitlisted', value: waitlistWaiting.toString(), icon: 'playlist_add', iconColor: 'text-purple-500' },
        ];
      case 'super_admin':
      case 'admin':
        return [
          { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: 'group', iconColor: 'text-blue-500' },
          { label: 'Active Staff', value: activeUsers.toLocaleString(), icon: 'badge', iconColor: 'text-purple-500' },
          { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
          { label: 'Pending Tasks', value: '—', icon: 'receipt_long', iconColor: 'text-amber-500' },
        ];
      case 'receptionist':
        return [
          { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: 'group', iconColor: 'text-blue-500' },
          { label: 'Queue Waiting', value: queueWaiting.toString(), icon: 'hourglass_top', iconColor: 'text-amber-500' },
          { label: 'In Consultation', value: queueInProgress.toString(), icon: 'stethoscope', iconColor: 'text-blue-500' },
          { label: 'Waitlisted', value: waitlistWaiting.toString(), icon: 'playlist_add', iconColor: 'text-purple-500' },
        ];
      case 'pharmacist':
        return [
          { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: 'group', iconColor: 'text-blue-500' },
          { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
        ];
      case 'cashier':
        return [
          { label: 'Billing Console', value: 'Ready', icon: 'payments', iconColor: 'text-blue-500' },
          { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
        ];
      case 'optical_staff':
        return [
          { label: 'Optical Console', value: 'Ready', icon: 'visibility', iconColor: 'text-blue-500' },
          { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
        ];
      case 'inventory_manager':
        return [
          { label: 'Inventory Console', value: 'Ready', icon: 'inventory_2', iconColor: 'text-blue-500' },
          { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
        ];
      default:
        return [
          { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
        ];
    }
  };

  const statCards = getStatCards();
  const quickActions = getQuickActions(role, user?.roles?.includes('super_admin') || false);
  const quickLinks = getQuickLinks(role);
  const title = dashboardTitles[role] || 'Dashboard';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 text-sm mt-1">
          Welcome back, <span className="font-semibold text-slate-700">{user ? `${user.first_name} ${user.last_name}` : ''}</span>
          {' · '}
          <span className="text-primary font-medium">{formatRole(role)}</span>
        </p>
      </div>

      {/* Doctor Profile Card */}
      {isDoctor && doctorProfile && (
        <div className="bg-gradient-to-r from-primary/5 to-blue-50 rounded-xl border border-primary/10 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-3xl">stethoscope</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{doctorProfile.doctor_name || `${user?.first_name} ${user?.last_name}`}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-primary">medical_information</span>
                  {doctorProfile.specialization}
                </span>
                {doctorProfile.department_name && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-slate-400">apartment</span>
                    {doctorProfile.department_name}
                  </span>
                )}
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-slate-400">school</span>
                  {doctorProfile.qualification}
                </span>
                {doctorProfile.experience_years && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-slate-400">work_history</span>
                    {doctorProfile.experience_years} years exp.
                  </span>
                )}
                {doctorProfile.registration_number && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-slate-400">badge</span>
                    Reg #{doctorProfile.registration_number}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0 sm:items-end">
              {doctorProfile.consultation_fee != null && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                  <span className="material-symbols-outlined text-sm">payments</span>
                  Consultation ₹{Number(doctorProfile.consultation_fee).toLocaleString()}
                </span>
              )}
              {doctorProfile.employee_id && (
                <span className="text-[10px] text-slate-400 font-medium">EMP: {doctorProfile.employee_id}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(statCards.length, 4)} gap-6 mb-8`}>
        {statCards.map((card) => (
          <div key={card.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.label}</span>
              <span className={`material-symbols-outlined ${card.iconColor}`}>{card.icon}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick Actions */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Quick Actions</h3>
            <div className={`grid grid-cols-1 sm:grid-cols-${Math.min(quickActions.length, 3)} gap-4`}>
              {quickActions.map((action) => (
                <button key={action.to} onClick={() => navigate(action.to)} className={ACTION_BTN}>
                  <span className={`material-symbols-outlined ${action.iconColor} mb-2 text-2xl`}>{action.icon}</span>
                  <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{action.label}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Activity / Info Section — role-aware */}
          {isDoctor ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">My Practice Info</h3>
                <button onClick={() => navigate('/profile')} className="text-primary text-xs font-bold hover:underline">View Profile</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Specialization</p>
                    <p className="text-sm font-semibold text-slate-800">{doctorProfile?.specialization || '—'}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Department</p>
                    <p className="text-sm font-semibold text-slate-800">{doctorProfile?.department_name || '—'}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Consultation Fee</p>
                    <p className="text-sm font-semibold text-slate-800">{doctorProfile?.consultation_fee != null ? `₹${Number(doctorProfile.consultation_fee).toLocaleString()}` : '—'}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Follow-up Fee</p>
                    <p className="text-sm font-semibold text-slate-800">{doctorProfile?.follow_up_fee != null ? `₹${Number(doctorProfile.follow_up_fee).toLocaleString()}` : '—'}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Registration #</p>
                    <p className="text-sm font-semibold text-slate-800">{doctorProfile?.registration_number || '—'}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Experience</p>
                    <p className="text-sm font-semibold text-slate-800">{doctorProfile?.experience_years ? `${doctorProfile.experience_years} years` : '—'}</p>
                  </div>
                </div>
                {doctorProfile?.bio && (
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Bio</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{doctorProfile.bio}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Your Workspace</h3>
                {canAccessPatients && (
                  <button onClick={() => navigate('/patients')} className="text-primary text-xs font-bold hover:underline">View Patients</button>
                )}
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Your Role</p>
                    <p className="text-sm font-semibold text-slate-800">{formatRole(role)}</p>
                  </div>
                  {canAccessPatients && (
                    <div className="p-4 rounded-lg bg-slate-50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Patients</p>
                      <p className="text-sm font-semibold text-slate-800">{totalPatients.toLocaleString()}</p>
                    </div>
                  )}
                  {isReceptionist && (
                    <>
                      <div className="p-4 rounded-lg bg-amber-50">
                        <p className="text-[10px] font-bold text-amber-500 uppercase mb-1">Queue Waiting</p>
                        <p className="text-sm font-semibold text-amber-700">{queueWaiting}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-purple-50">
                        <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">Waitlisted</p>
                        <p className="text-sm font-semibold text-purple-700">{waitlistWaiting}</p>
                      </div>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <div className="p-4 rounded-lg bg-purple-50">
                        <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">Active Staff</p>
                        <p className="text-sm font-semibold text-purple-700">{activeUsers}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-emerald-50">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">System</p>
                        <p className="text-sm font-semibold text-emerald-700">All Operational</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-8">
          {isDoctor ? (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-6">My Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className={`w-2 h-2 rounded-full ${doctorProfile?.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                    Availability
                  </span>
                  <span className={`font-bold ${doctorProfile?.is_available ? 'text-emerald-600' : 'text-red-600'}`}>
                    {doctorProfile?.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Queue Waiting</span>
                  <span className="font-bold text-amber-600">{queueWaiting}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">In Consultation</span>
                  <span className="font-bold text-blue-600">{queueInProgress}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Completed Today</span>
                  <span className="font-bold text-emerald-600">{queueCompleted}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Waitlisted</span>
                  <span className="font-bold text-purple-600">{waitlistWaiting}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-6">System Info</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    API Status
                  </span>
                  <span className="font-bold text-emerald-600">Online</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Version</span>
                  <span className="font-bold text-slate-700">v1.0.0</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Your Role</span>
                  <span className="font-bold text-primary">{formatRole(role)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Links */}
          {quickLinks.length > 0 && (
            <div className="bg-slate-900 p-6 rounded-xl shadow-xl">
              <h3 className="font-bold text-white text-sm mb-4">Quick Links</h3>
              <div className="space-y-3">
                {quickLinks.map((link) => (
                  <button key={link.to} onClick={() => navigate(link.to)} className={LINK_BTN}>
                    <span className={`material-symbols-outlined ${link.iconColor} text-sm`}>{link.icon}</span>
                    <span className="text-[11px] text-white font-medium">{link.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
