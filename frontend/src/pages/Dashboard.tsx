import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, UserPlus, Activity, Shield, Settings } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Register Patient',
      description: 'Add a new patient to the system',
      icon: UserPlus,
      color: 'bg-blue-500',
      action: () => navigate('/register'),
    },
    {
      title: 'View Patients',
      description: 'Browse and manage patient records',
      icon: Users,
      color: 'bg-green-500',
      action: () => navigate('/patients'),
    },
    {
      title: 'System Status',
      description: 'All systems operational',
      icon: Activity,
      color: 'bg-yellow-500',
      action: () => {},
    },
    {
      title: 'Security',
      description: 'HIPAA compliant data handling',
      icon: Shield,
      color: 'bg-purple-500',
      action: () => {},
    },
  ];

  // Add User Management card for super_admin
  if (user?.role === 'super_admin') {
    cards.push({
      title: 'User Management',
      description: 'Manage system users and roles',
      icon: Settings,
      color: 'bg-red-500',
      action: () => navigate('/user-management'),
    });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome back, {user?.full_name}! You are logged in as <span className="font-medium capitalize">{user?.role}</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <button
            key={card.title}
            onClick={card.action}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-left hover:shadow-md transition-shadow"
          >
            <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center mb-4`}>
              <card.icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{card.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Info</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-primary-50 rounded-lg">
            <p className="text-sm text-primary-600 font-medium">Your Role</p>
            <p className="text-2xl font-bold text-primary-900 capitalize">{user?.role}</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-600 font-medium">System Status</p>
            <p className="text-2xl font-bold text-green-900">Online</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-600 font-medium">API Version</p>
            <p className="text-2xl font-bold text-yellow-900">v1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};
