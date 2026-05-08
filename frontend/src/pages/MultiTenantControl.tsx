import React from 'react';
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
  Database,
  ArrowRight,
  Cloud,
  ChevronLeft,
} from 'lucide-react';

const MultiTenantControl: React.FC = () => {
  const navigate = useNavigate();
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
          description: 'Configure available modules',
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
          href: '/superadmin', 
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
            <p className="text-slate-500 mt-1">
              Centralized management for your SaaS platform
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Hospitals', value: '...', icon: Building2, color: 'text-primary' },
          { label: 'Active Plans', value: '4', icon: Package, color: 'text-emerald-500' },
          { label: 'System Health', value: 'Optimal', icon: Activity, color: 'text-indigo-500' },
          { label: 'Storage Usage', value: '24 GB', icon: Database, color: 'text-slate-500' },
        ].map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm p-5 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Control Sections */}
      <div className="grid grid-cols-1 gap-8">
        {controlSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Section Header */}
            <div className={`${section.color} px-6 py-4 text-white`}>
              <div className="flex items-center gap-3">
                <section.icon className="w-6 h-6" />
                <div>
                  <h2 className="text-lg font-bold">{section.title}</h2>
                  <p className="text-white/80 text-xs">{section.description}</p>
                </div>
              </div>
            </div>

            {/* Section Items */}
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
