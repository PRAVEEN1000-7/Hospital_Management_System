import React from 'react';
import { Link } from 'react-router-dom';
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
  Cloud,
  ArrowRight,
} from 'lucide-react';

const MultiTenantControl: React.FC = () => {
  const controlSections = [
    {
      title: 'Hospital Management',
      description: 'Manage all hospitals and their configurations',
      icon: Building2,
      color: 'bg-blue-500',
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
      color: 'bg-green-500',
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
          href: '/superadmin/modules',
          icon: Settings,
        },
      ],
    },
    {
      title: 'System Administration',
      description: 'Platform-wide settings and monitoring',
      icon: Shield,
      color: 'bg-purple-500',
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
        {
          name: 'System Settings',
          description: 'Configure platform settings',
          href: '/superadmin/settings',
          icon: Settings,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Cloud className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Multi-Tenant Control Center
                </h1>
                <p className="text-sm text-gray-500">
                  Manage your SaaS platform
                </p>
              </div>
            </div>
            <Link
              to="/superadmin/login"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Super Admin Login
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Hospitals', value: '12', icon: Building2, color: 'text-blue-600' },
            { label: 'Active Plans', value: '4', icon: Package, color: 'text-green-600' },
            { label: 'Available Modules', value: '12', icon: Database, color: 'text-purple-600' },
            { label: 'System Health', value: 'Good', icon: Activity, color: 'text-emerald-600' },
          ].map((stat, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm p-6 border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Control Sections */}
        <div className="space-y-8">
          {controlSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              {/* Section Header */}
              <div className={`${section.color} p-6 text-white`}>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-lg">
                    <section.icon className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{section.title}</h2>
                    <p className="text-white/80">{section.description}</p>
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
                      className="group flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 hover:border-indigo-300 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-indigo-100 transition-colors">
                          <item.icon className="w-5 h-5 text-gray-600 group-hover:text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 group-hover:text-indigo-600">
                            {item.name}
                          </h3>
                          <p className="text-sm text-gray-500">{item.description}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Access */}
        <div className="mt-8 bg-indigo-50 rounded-xl p-6 border border-indigo-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-indigo-900">
                Need Super Admin Access?
              </h3>
              <p className="text-indigo-700 mt-1">
                Login to the Super Admin panel to manage all platform features
              </p>
            </div>
            <Link
              to="/superadmin/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Shield className="w-5 h-5" />
              Login to Super Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTenantControl;
