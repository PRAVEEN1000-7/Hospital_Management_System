import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';

interface DashboardStats {
  total_tenants: number;
  active_tenants: number;
  trial_tenants: number;
  past_due_tenants: number;
  suspended_tenants: number;
  pending_tenants: number;
  mrr: number;
  plan_distribution: Record<string, number>;
  recent_signups: number;
}

const SuperAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await superAdminApi.getDashboardStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    color,
    link,
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: any;
    color: string;
    link?: string;
  }) => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${link ? 'hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      {link && (
        <Link
          to={link}
          className="mt-4 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
        >
          View details <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-600">Failed to load dashboard data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Overview of all hospitals and platform metrics
          </p>
        </div>
        <Link
          to="/superadmin/hospitals/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          <Building2 className="w-5 h-5" />
          Add Hospital
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Hospitals"
          value={stats.total_tenants}
          subtitle={`${stats.active_tenants} active`}
          icon={Building2}
          color="bg-blue-600"
          link="/superadmin/hospitals"
        />
        <StatCard
          title="Monthly Revenue"
          value={`$${stats.mrr.toLocaleString()}`}
          subtitle="MRR"
          icon={CreditCard}
          color="bg-green-600"
          link="/superadmin/plans"
        />
        <StatCard
          title="In Trial"
          value={stats.trial_tenants}
          subtitle="Active trials"
          icon={Activity}
          color="bg-purple-600"
        />
        <StatCard
          title="Past Due"
          value={stats.past_due_tenants}
          subtitle="Needs attention"
          icon={AlertCircle}
          color="bg-red-600"
        />
      </div>

      {/* Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Plan Distribution
          </h2>
          <div className="space-y-4">
            {Object.entries(stats.plan_distribution).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    plan === 'enterprise' ? 'bg-purple-500' :
                    plan === 'professional' ? 'bg-blue-500' :
                    plan === 'starter' ? 'bg-green-500' :
                    'bg-gray-400'
                  }`} />
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {plan}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-900 font-medium">{count}</span>
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        plan === 'enterprise' ? 'bg-purple-500' :
                        plan === 'professional' ? 'bg-blue-500' :
                        plan === 'starter' ? 'bg-green-500' :
                        'bg-gray-400'
                      }`}
                      style={{
                        width: `${(count / stats.total_tenants) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(stats.plan_distribution).length === 0 && (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Activity
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {stats.recent_signups} new signups
                </p>
                <p className="text-xs text-gray-500">In the last 30 days</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {stats.active_tenants} active hospitals
                </p>
                <p className="text-xs text-gray-500">Currently operating</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {stats.suspended_tenants + stats.past_due_tenants} need attention
                </p>
                <p className="text-xs text-gray-500">
                  Suspended or past due accounts
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-sm p-6 text-white">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            to="/superadmin/hospitals"
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Manage Hospitals
          </Link>
          <Link
            to="/superadmin/plans"
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Configure Plans
          </Link>
          <Link
            to="/superadmin/audit"
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View Audit Logs
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
