import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Package,
  Settings,
  FileText,
  Shield,
  Users,
  CreditCard,
  Activity,
  ArrowRight,
  ChevronLeft,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { superAdminApi } from '../services/superAdminApi';

interface PlatformStats {
  total_tenants: number;
  active_tenants: number;
  trial_tenants: number;
  past_due_tenants: number;
  suspended_tenants: number;
  pending_tenants: number;
  total_users: number;
  total_patients: number;
  mrr: number;
  recent_signups: number;
}

const MultiTenantControl: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    superAdminApi
      .getDashboardStats()
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const statCards = [
    {
      label: 'Total Hospitals',
      value: statsLoading ? null : (stats?.total_tenants ?? 0),
      sub: statsLoading ? null : `${stats?.active_tenants ?? 0} active`,
      icon: Building2,
      color: 'text-primary',
      bg: 'bg-primary/10',
      link: '/superadmin/hospitals',
    },
    {
      label: 'In Trial',
      value: statsLoading ? null : (stats?.trial_tenants ?? 0),
      sub: statsLoading ? null : `${stats?.pending_tenants ?? 0} pending setup`,
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      link: '/superadmin/hospitals?status=trialing',
    },
    {
      label: 'Platform Users',
      value: statsLoading ? null : (stats?.total_users ?? 0).toLocaleString(),
      sub: statsLoading ? null : `${(stats?.total_patients ?? 0).toLocaleString()} patients`,
      icon: Users,
      color: 'text-sky-500',
      bg: 'bg-sky-50',
      link: null,
    },
    {
      label: 'Monthly Revenue',
      value: statsLoading ? null : `₹${Number(stats?.mrr ?? 0).toLocaleString()}`,
      sub: statsLoading ? null : `${stats?.recent_signups ?? 0} new this month`,
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
      link: '/superadmin/plans',
    },
  ];

  const controlSections = [
    {
      title: 'Hospital Management',
      description: 'Manage all hospitals and their configurations',
      icon: Building2,
      color: 'bg-primary',
      items: [
        {
          name: 'View All Hospitals',
          description: 'List and manage all registered hospitals',
          href: '/superadmin/hospitals',
          icon: Users,
        },
        {
          name: 'Add New Hospital',
          description: 'Onboard a new hospital to the platform',
          href: '/superadmin/hospitals/new',
          icon: Building2,
        },
      ],
    },
    {
      title: 'Subscription Plans',
      description: 'Configure pricing and feature tiers',
      icon: Package,
      color: 'bg-emerald-500',
      items: [
        {
          name: 'Manage Plans',
          description: 'Edit subscription plans and pricing',
          href: '/superadmin/plans',
          icon: CreditCard,
        },
        {
          name: 'Module Configuration',
          description: 'Configure available modules per plan',
          href: '/superadmin/plans',
          icon: Settings,
        },
      ],
    },
    {
      title: 'Platform Administration',
      description: 'Platform-wide settings and monitoring',
      icon: Shield,
      color: 'bg-slate-800',
      items: [
        {
          name: 'Dashboard Overview',
          description: 'Platform statistics and metrics',
          href: '/superadmin',
          icon: Activity,
        },
        {
          name: 'Audit Logs',
          description: 'View system activity logs',
          href: '/superadmin/audit',
          icon: FileText,
        },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-3xl">hub</span>
              Multi-Tenant Control Center
            </h1>
            <p className="text-slate-500 mt-1">Centralized management for your SaaS platform</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const card = (
            <div
              key={index}
              className={`bg-white rounded-xl shadow-sm p-5 border border-slate-200 ${stat.link ? 'hover:shadow-md hover:border-primary/30 transition-all cursor-pointer' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {stat.label}
                  </p>
                  {stat.value === null ? (
                    <>
                      <div className="h-7 w-16 bg-slate-100 rounded animate-pulse mt-2" />
                      <div className="h-3 w-24 bg-slate-100 rounded animate-pulse mt-1.5" />
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                      {stat.sub && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{stat.sub}</p>
                      )}
                    </>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center shrink-0 ml-3`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              {stat.link && (
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                  View details <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          );

          return stat.link ? (
            <Link key={index} to={stat.link} className="block">
              {card}
            </Link>
          ) : (
            card
          );
        })}
      </div>

      {/* Status breakdown bar */}
      {stats && (stats.active_tenants + stats.trial_tenants + stats.suspended_tenants + stats.pending_tenants) > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Hospital Status Breakdown</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Active', value: stats.active_tenants, color: 'bg-emerald-500', textColor: 'text-emerald-700', bg: 'bg-emerald-50', link: '/superadmin/hospitals?status=active' },
              { label: 'In Trial', value: stats.trial_tenants, color: 'bg-blue-500', textColor: 'text-blue-700', bg: 'bg-blue-50', link: '/superadmin/hospitals?status=trialing' },
              { label: 'Pending', value: stats.pending_tenants, color: 'bg-amber-500', textColor: 'text-amber-700', bg: 'bg-amber-50', link: '/superadmin/hospitals?status=pending' },
              { label: 'Suspended', value: stats.suspended_tenants, color: 'bg-red-500', textColor: 'text-red-700', bg: 'bg-red-50', link: '/superadmin/hospitals?status=suspended' },
            ].map((item) => (
              <Link key={item.label} to={item.link} className={`flex items-center gap-3 p-3 rounded-lg ${item.bg} hover:opacity-80 transition-opacity`}>
                <div className={`w-2.5 h-2.5 rounded-full ${item.color} shrink-0`} />
                <div>
                  <p className={`text-lg font-bold ${item.textColor}`}>{item.value}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Control Sections */}
      <div className="grid grid-cols-1 gap-6">
        {controlSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className={`${section.color} px-6 py-4 text-white`}>
              <div className="flex items-center gap-3">
                <section.icon className="w-6 h-6" />
                <div>
                  <h2 className="text-lg font-bold">{section.title}</h2>
                  <p className="text-white/80 text-xs">{section.description}</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.items.map((item, itemIndex) => (
                  <Link
                    key={itemIndex}
                    to={item.href}
                    className="group flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-primary/10 transition-colors">
                        <item.icon className="w-5 h-5 text-slate-500 group-hover:text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 group-hover:text-primary transition-colors">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiTenantControl;
