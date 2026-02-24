import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formatRole } from '../../utils/constants';
import hospitalService from '../../services/hospitalService';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState('HMS Core');
  const [appointmentsOpen, setAppointmentsOpen] = useState(
    () => location.pathname.startsWith('/appointments')
  );

  useEffect(() => {
    hospitalService.getHospitalDetails()
      .then(res => {
        setHospitalName(res.hospital_name);
        document.title = `${res.hospital_name} | Hospital Management System`;
      })
      .catch(() => {
        // Keep default on error
      });
  }, []);

  // Auto-expand appointments section when navigating to an appointment route
  useEffect(() => {
    if (location.pathname.startsWith('/appointments')) {
      setAppointmentsOpen(true);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/patients', label: 'Patient Directory', icon: 'group' },
  ];

  // Staff Directory - only for admin and super_admin
  if (user?.role === 'super_admin' || user?.role === 'admin') {
    navItems.push({ to: '/staff', label: 'Staff Directory', icon: 'badge' });
  }

  // Appointment nav items (role-based)
  const appointmentItems: { to: string; label: string; icon: string }[] = [];
  const role = user?.role;
  if (role === 'receptionist' || role === 'admin' || role === 'super_admin') {
    appointmentItems.push({ to: '/appointments/book', label: 'Book Appointment', icon: 'event' });
  }
  if (role === 'receptionist' || role === 'admin' || role === 'super_admin') {
    appointmentItems.push({ to: '/appointments/walk-in', label: 'Walk-in Registration', icon: 'directions_walk' });
  }
  if (role === 'receptionist' || role === 'admin' || role === 'super_admin' || role === 'doctor' || role === 'nurse') {
    appointmentItems.push({ to: '/appointments/queue', label: 'Walk-in Queue', icon: 'queue' });
  }
  if (role === 'doctor') {
    appointmentItems.push({ to: '/appointments/my-schedule', label: 'My Appointments', icon: 'clinical_notes' });
  }
  if (role === 'admin' || role === 'super_admin' || role === 'doctor') {
    appointmentItems.push({ to: '/appointments/doctor-schedule', label: 'Doctor Schedule', icon: 'calendar_month' });
  }
  if (role === 'admin' || role === 'super_admin') {
    appointmentItems.push({ to: '/appointments/manage', label: 'Manage Appointments', icon: 'event_note' });
  }
  if (role === 'admin' || role === 'super_admin' || role === 'doctor') {
    appointmentItems.push({ to: '/appointments/waitlist', label: 'Waitlist', icon: 'playlist_add' });
  }
  if (role === 'admin' || role === 'super_admin' || role === 'doctor') {
    appointmentItems.push({ to: '/appointments/reports', label: 'Appointment Reports', icon: 'analytics' });
  }
  if (role === 'admin' || role === 'super_admin') {
    appointmentItems.push({ to: '/appointments/settings', label: 'Appointment Settings', icon: 'tune' });
  }

  if (user?.role === 'super_admin' ) {
    navItems.push({ to: '/hospital-setup', label: 'Hospital Setup', icon: 'local_hospital' });
  }
  if (user?.role === 'super_admin') {
    navItems.push({ to: '/user-management', label: 'User Management', icon: 'admin_panel_settings' });
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const initials = user?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-30
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white mr-3">
            <span className="material-icons text-xl">health_and_safety</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">{hospitalName}</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-all ${
                isActive(item.to)
                  ? 'sidebar-item-active'
                  : 'text-slate-500 hover:text-primary hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Appointments Section — collapsible */}
          {appointmentItems.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setAppointmentsOpen(!appointmentsOpen)}
                className={`w-full flex items-center justify-between px-6 py-3 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/appointments')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  <span className="material-symbols-outlined mr-3 text-[20px]">calendar_month</span>
                  Appointments
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${appointmentsOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div className={`overflow-hidden transition-all duration-200 ${appointmentsOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {appointmentItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center pl-10 pr-6 py-2.5 text-[13px] font-medium transition-all ${
                      isActive(item.to)
                        ? 'sidebar-item-active'
                        : 'text-slate-400 hover:text-primary hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined mr-3 text-[18px]">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 mt-8 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account</span>
          </div>
          <NavLink
            to="/profile"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-all ${
              isActive('/profile')
                ? 'sidebar-item-active'
                : 'text-slate-500 hover:text-primary hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">settings</span>
            Settings
          </NavLink>
        </nav>

        {/* User Card at Bottom */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-slate-900 truncate">{user?.full_name}</p>
              <p className="text-[10px] text-slate-500">{formatRole(user?.role || '')}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <span className="material-icons">{sidebarOpen ? 'close' : 'menu'}</span>
            </button>
            <h1 className="text-lg font-bold text-slate-900 hidden sm:block">
              {navItems.find(i => isActive(i.to))?.label || appointmentItems.find(i => isActive(i.to))?.label || 'HMS'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                className="w-64 pl-10 pr-3 py-1.5 border border-slate-200 bg-slate-50 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                placeholder="Search records..."
                type="text"
              />
            </div>
            <button className="relative p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>
            </button>
            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                {initials}
              </div>
              <span className="text-xs font-bold text-slate-700 hidden sm:block">{user?.full_name}</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <Outlet />
        </div>
      </main>

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform"
        >
          <span className="material-icons">menu</span>
        </button>
      </div>
    </div>
  );
};

export default Layout;
