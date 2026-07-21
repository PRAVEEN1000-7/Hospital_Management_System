import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import labService from '../../services/labService';
import type { LabDashboard as DashboardData } from '../../types/lab';
import { useAuth } from '../../contexts/AuthContext';

const LabDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setStats(await labService.getDashboard());
      } catch (err) {
        console.error('Failed to load lab dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  const cards = [
    {
      label: 'Waiting in Queue',
      value: stats?.waiting_count ?? 0,
      icon: (stats?.waiting_count ?? 0) > 0 ? 'notifications_active' : 'queue',
      color: 'text-blue-600', bg: (stats?.waiting_count ?? 0) > 0 ? 'bg-blue-100' : 'bg-blue-50',
      to: '/lab/queue', highlight: (stats?.waiting_count ?? 0) > 0,
    },
    { label: "Today's Orders", value: stats?.today_orders_count ?? 0, icon: 'science', color: 'text-indigo-500', bg: 'bg-indigo-50', to: '/lab/queue' },
    { label: 'Pending Results', value: stats?.pending_results_count ?? 0, icon: 'pending_actions', color: 'text-amber-500', bg: 'bg-amber-50', to: '/lab/queue' },
    { label: 'Test Catalog', value: stats?.total_tests ?? 0, icon: 'biotech', color: 'text-purple-500', bg: 'bg-purple-50', to: '/lab/tests' },
    { label: "Today's Revenue", value: `₹${Number(stats?.today_revenue ?? 0).toLocaleString()}`, icon: 'payments', color: 'text-green-600', bg: 'bg-green-50', to: '/lab/queue' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laboratory Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{user?.first_name} {user?.last_name}</span>
          </p>
        </div>
        <button onClick={() => navigate('/lab/tests')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-white border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
          <span className="material-symbols-outlined text-base">add</span> Manage Tests
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-all overflow-hidden relative ${
              card.highlight ? 'ring-2 ring-blue-400 ring-offset-2 animate-pulse' : ''
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`material-symbols-outlined text-2xl ${card.color} shrink-0`}>{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 truncate">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1 truncate">{card.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Lab Queue', desc: "Today's orders awaiting collection & results", icon: 'queue', to: '/lab/queue' },
          { label: 'Test Catalog', desc: 'Browse & manage orderable tests', icon: 'biotech', to: '/lab/tests' },
        ].map((item) => (
          <button key={item.label} onClick={() => navigate(item.to)}
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-primary/30 transition-all text-left overflow-hidden">
            <span className="material-symbols-outlined text-3xl text-primary shrink-0">{item.icon}</span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{item.label}</p>
              <p className="text-xs text-slate-500 truncate">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LabDashboard;
