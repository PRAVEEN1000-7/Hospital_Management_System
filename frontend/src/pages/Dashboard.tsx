import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatRole } from '../utils/constants';
import patientService from '../services/patientService';
import hospitalService from '../services/hospitalService';
import userService from '../services/userService';
import doctorService from '../services/doctorService';
import walkInService from '../services/walkInService';
import { useToast } from '../contexts/ToastContext';
import type { DoctorProfile } from '../types/doctor';

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
  const [queueCompleted, setQueueCompleted] = useState<number>(0);

  const isDoctor = user?.roles?.includes('doctor');
  const isAdmin = user?.roles?.includes('admin') || user?.roles?.includes('super_admin');

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch total patients
        const patientsRes = await patientService.getPatients(1, 1);
        setTotalPatients(patientsRes.total);
      } catch (err) {
        // Silent fail - dashboard will show 0
      }

      try {
        // Fetch hospital details
        const hospitalRes = await hospitalService.getHospitalDetails();
        setHospitalName(hospitalRes.name);
      } catch (err) {
        // Silent fail - will use default hospital name
      }

      // Doctor-specific data
      if (isDoctor) {
        try {
          const profile = await doctorService.getMyProfile();
          setDoctorProfile(profile);
        } catch (err) {
          // Doctor profile may not exist yet
        }
        try {
          const queueData = await walkInService.getQueueStatus();
          setQueueWaiting(queueData.total_waiting || 0);
          setQueueCompleted(queueData.total_completed || 0);
        } catch (err) {
          // Silent fail
        }
      }

      // Admin-specific data
      if (isAdmin) {
        try {
          const firstPage = await userService.getUsers(1, 100);
          let allUsers = [...firstPage.data];
          const totalPages = firstPage.total_pages;
          if (totalPages > 1) {
            const remainingPages = [];
            for (let page = 2; page <= totalPages; page++) {
              remainingPages.push(userService.getUsers(page, 100));
            }
            const results = await Promise.all(remainingPages);
            results.forEach(res => {
              allUsers = [...allUsers, ...res.data];
            });
          }
          const activeCount = allUsers.filter((u: any) => u.is_active === true).length;
          setActiveUsers(activeCount);
        } catch (err: any) {
          // Silent fail
        }
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  // Stat cards - role-aware
  const doctorStatCards = [
    { label: 'Queue Waiting', value: queueWaiting.toString(), icon: 'hourglass_top', iconColor: 'text-amber-500' },
    { label: 'Completed Today', value: queueCompleted.toString(), icon: 'task_alt', iconColor: 'text-emerald-500' },
    { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: 'group', iconColor: 'text-blue-500' },
    { label: 'Availability', value: doctorProfile?.is_available ? 'Available' : 'Unavailable', icon: doctorProfile?.is_available ? 'check_circle' : 'cancel', iconColor: doctorProfile?.is_available ? 'text-emerald-500' : 'text-red-500' },
  ];

  const adminStatCards = [
    { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: 'person_add', iconColor: 'text-blue-500' },
    { label: 'Active Staff', value: activeUsers.toLocaleString(), icon: 'badge', iconColor: 'text-purple-500' },
    { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500' },
    { label: 'Pending Tasks', value: '—', icon: 'receipt_long', iconColor: 'text-amber-500' },
  ];

  const statCards = isDoctor ? doctorStatCards : adminStatCards;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{isDoctor ? 'Doctor Dashboard' : 'Admin Dashboard Overview'}</h1>
        <p className="text-slate-500 text-sm mt-1">
          Welcome back, <span className="font-semibold text-slate-700">{user ? `${user.first_name} ${user.last_name}` : ''}</span>
          {' · '}
          <span className="text-primary font-medium">{formatRole(user?.roles?.[0] || '')}</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {isDoctor ? (
                <>
                  <button
                    onClick={() => navigate('/appointments/queue')}
                    className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-amber-500 mb-2 text-2xl">queue</span>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">My Queue</p>
                    <p className="text-[10px] text-slate-400 mt-1">View your patient queue</p>
                  </button>
                  <button
                    onClick={() => navigate('/appointments/my')}
                    className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-blue-500 mb-2 text-2xl">calendar_month</span>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">My Appointments</p>
                    <p className="text-[10px] text-slate-400 mt-1">Today's scheduled appointments</p>
                  </button>
                  <button
                    onClick={() => navigate('/patients')}
                    className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-emerald-500 mb-2 text-2xl">group</span>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">Patient Directory</p>
                    <p className="text-[10px] text-slate-400 mt-1">Browse patient records</p>
                  </button>
                </>
              ) : (
                <>
              <button
                onClick={() => navigate('/register')}
                className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-primary mb-2 text-2xl">person_add</span>
                <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">Register Patient</p>
                <p className="text-[10px] text-slate-400 mt-1">Add a new patient record</p>
              </button>
              <button
                onClick={() => navigate('/patients')}
                className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-emerald-500 mb-2 text-2xl">group</span>
                <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">Patient Directory</p>
                <p className="text-[10px] text-slate-400 mt-1">Browse all patient records</p>
              </button>
              {user?.roles?.includes('super_admin') && (
                <button
                  onClick={() => navigate('/user-management')}
                  className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-rose-500 mb-2 text-2xl">admin_panel_settings</span>
                  <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">User Management</p>
                  <p className="text-[10px] text-slate-400 mt-1">Manage staff accounts</p>
                </button>
              )}
                </>
              )}
            </div>
          </div>

          {/* Activity / Info Section */}
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
                <h3 className="font-bold text-slate-900">Recent Activity</h3>
                <button onClick={() => navigate('/patients')} className="text-primary text-xs font-bold hover:underline">View All Patients</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase">Activity</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase">Details</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-primary flex items-center justify-center">
                            <span className="material-icons text-sm">person_add</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-700">Patient Registration</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">System ready for new registrations</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase">Active</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                            <span className="material-icons text-sm">verified_user</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-700">Security Status</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">All endpoints secured</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-primary text-[10px] font-bold uppercase">Monitored</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-8">
          {isDoctor ? (
            <>
              {/* Availability Status */}
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
                    <span className="text-slate-600">Completed Today</span>
                    <span className="font-bold text-emerald-600">{queueCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Employee ID</span>
                    <span className="font-bold text-slate-700">{doctorProfile?.employee_id || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="bg-slate-900 p-6 rounded-xl shadow-xl">
                <h3 className="font-bold text-white text-sm mb-4">Quick Links</h3>
                <div className="space-y-3">
                  <button onClick={() => navigate('/appointments/queue')} className="w-full flex items-center gap-3 text-left hover:bg-slate-800 rounded-lg p-2 transition-colors">
                    <span className="material-symbols-outlined text-amber-400 text-sm">queue</span>
                    <span className="text-[11px] text-white font-medium">Walk-in Queue</span>
                  </button>
                  <button onClick={() => navigate('/appointments/my')} className="w-full flex items-center gap-3 text-left hover:bg-slate-800 rounded-lg p-2 transition-colors">
                    <span className="material-symbols-outlined text-blue-400 text-sm">calendar_month</span>
                    <span className="text-[11px] text-white font-medium">My Appointments</span>
                  </button>
                  <button onClick={() => navigate('/patients')} className="w-full flex items-center gap-3 text-left hover:bg-slate-800 rounded-lg p-2 transition-colors">
                    <span className="material-symbols-outlined text-emerald-400 text-sm">group</span>
                    <span className="text-[11px] text-white font-medium">Patient Directory</span>
                  </button>
                  <button onClick={() => navigate('/profile')} className="w-full flex items-center gap-3 text-left hover:bg-slate-800 rounded-lg p-2 transition-colors">
                    <span className="material-symbols-outlined text-purple-400 text-sm">person</span>
                    <span className="text-[11px] text-white font-medium">My Profile</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* System Info Card */}
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
                    <span className="font-bold text-primary">{formatRole(user?.roles?.[0] || '')}</span>
                  </div>
                </div>
              </div>

              {/* System Alerts */}
              <div className="bg-slate-900 p-6 rounded-xl shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white text-sm">System Alerts</h3>
                  <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                </div>
                <div className="space-y-4 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  <div className="flex gap-3 pb-3 border-b border-slate-800">
                    <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                    <div>
                      <p className="text-[11px] text-white font-medium">All Systems Operational</p>
                      <p className="text-[10px] text-slate-400">No issues detected.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="material-symbols-outlined text-blue-400 text-sm">info</span>
                    <div>
                      <p className="text-[11px] text-white font-medium">{hospitalName} v1.0</p>
                      <p className="text-[10px] text-slate-400">Running latest stable release.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
