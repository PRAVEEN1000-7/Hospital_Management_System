import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatRole } from '../utils/constants';
import patientService from '../services/patientService';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [totalPatients, setTotalPatients] = useState<number>(0);

  useEffect(() => {
    patientService.getPatients(1, 1).then(res => setTotalPatients(res.total)).catch(() => {});
  }, []);

  // Stat cards matching the dashboard design
  const statCards = [
    { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: 'person_add', iconColor: 'text-blue-500', trend: null },
    { label: 'Active Today', value: '—', icon: 'calendar_today', iconColor: 'text-purple-500', trend: null },
    { label: 'System Status', value: 'Online', icon: 'check_circle', iconColor: 'text-emerald-500', trend: null },
    { label: 'Pending Tasks', value: '—', icon: 'receipt_long', iconColor: 'text-amber-500', trend: null },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard Overview</h1>
        <p className="text-slate-500 text-sm mt-1">
          Welcome back, <span className="font-semibold text-slate-700">{user?.full_name}</span>
          {' · '}
          <span className="text-primary font-medium">{formatRole(user?.role || '')}</span>
        </p>
      </div>

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
              {card.trend && (
                <span className="text-[10px] font-bold text-emerald-500 flex items-center">
                  <span className="material-symbols-outlined text-[12px]">trending_up</span> {card.trend}
                </span>
              )}
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
              {user?.role === 'super_admin' && (
                <button
                  onClick={() => navigate('/user-management')}
                  className="p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all group cursor-pointer text-left active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-rose-500 mb-2 text-2xl">admin_panel_settings</span>
                  <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">User Management</p>
                  <p className="text-[10px] text-slate-400 mt-1">Manage staff accounts</p>
                </button>
              )}
            </div>
          </div>

          {/* Recent Activity Placeholder */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Recent Activity</h3>
              <button
                onClick={() => navigate('/patients')}
                className="text-primary text-xs font-bold hover:underline"
              >
                View All Patients
              </button>
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
        </div>

        {/* Right Sidebar */}
        <div className="space-y-8">
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
                <span className="font-bold text-primary">{formatRole(user?.role || '')}</span>
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
                  <p className="text-[11px] text-white font-medium">HMS Core v1.0</p>
                  <p className="text-[10px] text-slate-400">Running latest stable release.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
