import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formatRole, ROLE_ICONS } from '../../utils/constants';
import hospitalService from '../../services/hospitalService';
import userService from '../../services/userService';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState('HMS Core');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [appointmentsOpen, setAppointmentsOpen] = useState(
    () => location.pathname.startsWith('/appointments')
  );
  const [prescriptionsOpen, setPrescriptionsOpen] = useState(
    () => location.pathname.startsWith('/prescriptions')
  );

  useEffect(() => {
    hospitalService.getHospitalDetails()
      .then(res => {
        setHospitalName(res.name);
        document.title = `${res.name} | Hospital Management System`;
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
    if (location.pathname.startsWith('/prescriptions')) {
      setPrescriptionsOpen(true);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/patients?search=${encodeURIComponent(searchQuery.trim())}`);
      setSidebarOpen(false);
    }
  }, [searchQuery, navigate]);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Close notifications on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  const role = user?.roles?.[0];

  // Receptionist and Doctor get flat appointment links (no dropdown)
  const isFlatNav = role === 'receptionist' || role === 'doctor';

  // ── Main navigation ── visible to every authenticated user
  const mainNavItems = [
    { to: '/dashboard', label: 'Dashboard',        icon: 'dashboard' },
  ];
  // Patient Directory - NOT for doctors
  if (role !== 'doctor') {
    mainNavItems.push({ to: '/patients', label: 'Patient Directory', icon: 'group' });
  }
  // Register Patient - only roles with actual route access
  if (role === 'super_admin' || role === 'admin' || role === 'receptionist') {
    mainNavItems.push({ to: '/register', label: 'Register Patient', icon: 'person_add' });
  }
  if (role === 'super_admin' || role === 'admin') {
    mainNavItems.push({ to: '/staff', label: 'Staff Directory', icon: 'badge' });
  }

  // ── Appointment navigation ── fully role-driven
  const appointmentItems: { to: string; label: string; icon: string }[] = [];

  if (role === 'super_admin' || role === 'admin') {
    appointmentItems.push(
      // { to: '/appointments/book',            label: 'Book Appointment',    icon: 'event' },
      { to: '/appointments/walk-in',         label: 'Walk-in Registration',icon: 'directions_walk' },
      { to: '/appointments/queue',           label: 'Walk-in Queue',       icon: 'queue' },
      { to: '/appointments/doctor-schedule', label: 'Doctor Schedule',     icon: 'calendar_month' },
      { to: '/appointments/manage',          label: 'Manage Appointments', icon: 'event_note' },
      { to: '/appointments/waitlist',        label: 'Waitlist',            icon: 'playlist_add' },
      { to: '/appointments/reports',         label: 'Reports',             icon: 'analytics' },
      { to: '/appointments/settings',        label: 'Settings',            icon: 'tune' },
    );
  } else if (role === 'doctor') {
    appointmentItems.push(
      { to: '/appointments/queue',           label: 'Today Patients',   icon: 'queue' },
      { to: '/appointments/doctor-schedule', label: 'Manage My Schedule',  icon: 'edit_calendar' },
      { to: '/appointments/waitlist',        label: 'Waitlist',            icon: 'playlist_add' },
    );
  } else if (role === 'nurse') {
    appointmentItems.push(
      { to: '/appointments/queue',  label: 'Walk-in Queue',  icon: 'queue' },
      { to: '/appointments/manage', label: 'Appointments',   icon: 'event_note' },
    );
  } else if (isFlatNav && role === 'receptionist') {
    // Receptionist items are shown flat (outside dropdown) — see render below
    appointmentItems.push(
      { to: '/appointments/walk-in', label: 'Walk-in Registration',icon: 'directions_walk' },
      { to: '/appointments/queue',   label: 'Walk-in Queue',       icon: 'queue' },
      { to: '/appointments/manage',  label: 'Manage Appointments', icon: 'event_note' },
      { to: '/appointments/waitlist',label: 'Waitlist',            icon: 'playlist_add' },
      { to: '/appointments/reports', label: 'Reports',             icon: 'analytics' },
    );
  }
  // report_viewer only sees Reports
  else if (role === 'report_viewer') {
    appointmentItems.push(
      { to: '/appointments/reports', label: 'Appointment Reports', icon: 'analytics' },
    );
  }
  // pharmacist, cashier, inventory_manager, optical_staff — no appointment items

  // ── Prescription navigation ── role-driven
  const prescriptionItems: { to: string; label: string; icon: string }[] = [];

  if (role === 'super_admin' || role === 'admin') {
    prescriptionItems.push(
      { to: '/prescriptions',     label: 'All Prescriptions', icon: 'list_alt' },
      { to: '/prescriptions/new', label: 'New Prescription',  icon: 'note_add' },
    );
  } else if (role === 'doctor') {
    prescriptionItems.push(
      { to: '/prescriptions',     label: 'My Prescriptions',  icon: 'list_alt' },
      { to: '/prescriptions/new', label: 'New Prescription',  icon: 'note_add' },
    );
  } else if (role === 'nurse' || role === 'pharmacist') {
    prescriptionItems.push(
      { to: '/prescriptions', label: 'Prescriptions', icon: 'list_alt' },
    );
  }

  // ── System navigation ── admin / super_admin / receptionist
  const systemNavItems: { to: string; label: string; icon: string }[] = [];
  if (role === 'super_admin') {
    systemNavItems.push(
      { to: '/hospital-setup',  label: 'Hospital Setup',  icon: 'local_hospital' },
      { to: '/user-management', label: 'User Management', icon: 'admin_panel_settings' },
    );
  } else if (role === 'admin') {
    systemNavItems.push(
      { to: '/user-management', label: 'User Management', icon: 'admin_panel_settings' },
    );
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  // For dropdown sub-items: exact match only (prevents parent path from matching sibling child routes)
  const isExactActive = (path: string) => location.pathname === path;

  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : '';

  const initials = fullName
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed md:static top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-30
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white mr-3 shrink-0">
            <span className="material-icons text-xl">health_and_safety</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900 truncate">{hospitalName}</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar">
          {/* ══ MAIN ══ */}
          <div className="px-6 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main</span>
          </div>
          {mainNavItems.map((item) => (
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

          {/* ══ APPOINTMENTS — collapsible (or flat for receptionist) ══ */}
          {appointmentItems.length > 0 && isFlatNav ? (
            /* ── Receptionist: flat links, no dropdown ── */
            <div className="mt-4">
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Appointments</span>
              </div>
              {appointmentItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-6 py-3 text-sm font-medium transition-all ${
                    isExactActive(item.to)
                      ? 'sidebar-item-active'
                      : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ) : appointmentItems.length > 0 && (
            <div className="mt-4">
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Appointments</span>
              </div>
              <button
                onClick={() => setAppointmentsOpen(!appointmentsOpen)}
                aria-expanded={appointmentsOpen}
                aria-controls="appointments-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
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
              <div id="appointments-menu" className={`overflow-hidden transition-all duration-200 ${appointmentsOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {appointmentItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center pl-10 pr-6 py-2.5 text-[13px] font-medium transition-all ${
                      isExactActive(item.to)
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

          {/* ══ PRESCRIPTIONS — collapsible ══ */}
          {prescriptionItems.length > 0 && (
            <div className="mt-4">
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prescriptions</span>
              </div>
              <button
                onClick={() => setPrescriptionsOpen(!prescriptionsOpen)}
                aria-expanded={prescriptionsOpen}
                aria-controls="prescriptions-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/prescriptions')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  <span className="material-symbols-outlined mr-3 text-[20px]">prescriptions</span>
                  Prescriptions
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${prescriptionsOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="prescriptions-menu" className={`overflow-hidden transition-all duration-200 ${prescriptionsOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {prescriptionItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center pl-10 pr-6 py-2.5 text-[13px] font-medium transition-all ${
                      isExactActive(item.to)
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

          {/* ══ SYSTEM — admin / super_admin only ══ */}
          {systemNavItems.length > 0 && (
            <div className="mt-4">
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System</span>
              </div>
              {systemNavItems.map((item) => (
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
            </div>
          )}

          {/* ══ ACCOUNT ══ */}
          <div className="px-6 mt-4 mb-1">
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
            <span className="material-symbols-outlined mr-3 text-[20px]">manage_accounts</span>
            My Profile
          </NavLink>
        </nav>

        {/* User Card at Bottom */}
        <div className="p-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {user?.avatar_url
                ? <img src={userService.getPhotoUrl(user.avatar_url) ?? ''} alt={fullName} className="w-full h-full object-cover" />
                : <span className="material-symbols-outlined text-[16px]">{ROLE_ICONS[user?.roles?.[0] || ''] || 'person'}</span>
              }
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-slate-900 truncate">{fullName}</p>
              <p className="text-[10px] text-slate-500">{formatRole(user?.roles?.[0] || '')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors shrink-0"
              aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={sidebarOpen}
            >
              <span className="material-icons">{sidebarOpen ? 'close' : 'menu'}</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {mainNavItems.find(i => isActive(i.to))?.label ||
              appointmentItems.find(i => isActive(i.to))?.label ||
              prescriptionItems.find(i => isActive(i.to))?.label ||
              systemNavItems.find(i => isActive(i.to))?.label ||
              (isActive('/profile') ? 'My Profile' : 'HMS')}
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Search - form-based, navigates to patient search */}
            <form onSubmit={handleSearch} className="relative hidden sm:block" role="search">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <span className="material-symbols-outlined text-lg">search</span>
              </span>
              <input
                className="w-48 lg:w-64 pl-10 pr-9 py-1.5 border border-slate-200 bg-slate-50 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                placeholder="Search patients..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search patients"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(''); navigate('/patients', { replace: true }); }} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
            </form>
            {/* Mobile search - navigates to patients page */}
            <button
              className="sm:hidden p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              onClick={() => navigate('/patients')}
              aria-label="Search patients"
            >
              <span className="material-symbols-outlined">search</span>
            </button>

            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                className="relative p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50" role="menu">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">Notifications</p>
                    <span className="text-[10px] font-medium text-slate-400 uppercase">All caught up</span>
                  </div>
                  <div className="py-8 flex flex-col items-center text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">notifications_none</span>
                    <p className="text-sm text-slate-400">No new notifications</p>
                    <p className="text-xs text-slate-300 mt-1">You're all up to date</p>
                  </div>
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
            {/* User avatar dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors"
                aria-label="User menu"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {user?.avatar_url
                    ? <img src={userService.getPhotoUrl(user.avatar_url) ?? ''} alt={fullName} className="w-full h-full object-cover" />
                    : <span className="material-symbols-outlined text-[16px]">{ROLE_ICONS[user?.roles?.[0] || ''] || 'person'}</span>
                  }
                </div>
                <span className="text-xs font-bold text-slate-700 hidden sm:block">{fullName}</span>
                <span className={`material-symbols-outlined text-slate-400 text-[16px] hidden sm:block transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}>expand_more</span>
              </button>

              {/* Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150" role="menu">
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-900 truncate">{fullName}</p>
                    <p className="text-[11px] text-slate-500">{user?.username} &middot; {formatRole(user?.roles?.[0] || '')}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => { setUserMenuOpen(false); navigate('/profile'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      role="menuitem"
                    >
                      <span className="material-symbols-outlined text-[18px] text-slate-400">manage_accounts</span>
                      My Profile
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); navigate('/dashboard'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      role="menuitem"
                    >
                      <span className="material-symbols-outlined text-[18px] text-slate-400">dashboard</span>
                      Dashboard
                    </button>
                  </div>

                  <div className="border-t border-slate-100 py-1">
                    <button
                      onClick={() => { setUserMenuOpen(false); setShowLogoutConfirm(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      role="menuitem"
                    >
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-red-500 text-3xl">logout</span>
              </div>
              <h3 id="logout-dialog-title" className="text-lg font-bold text-slate-900 mb-1">Sign Out</h3>
              <p className="text-sm text-slate-500 mb-6">Are you sure you want to sign out of your account?</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors active:scale-[0.98]"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
