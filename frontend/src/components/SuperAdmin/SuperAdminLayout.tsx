import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSuperAdmin } from '../../contexts/SuperAdminContext';

const SuperAdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logout } = useSuperAdmin();
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    setUserMenuOpen(false);
    logout();
    navigate('/login');
  };

  const isActive = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const mainNavItems = [
    { to: '/superadmin', label: 'Overview', icon: 'dashboard', exact: true },
    { to: '/superadmin/hospitals', label: 'Hospitals', icon: 'local_hospital', exact: false },
    { to: '/superadmin/plans', label: 'Subscription Plans', icon: 'card_membership', exact: false },
    { to: '/superadmin/medicines', label: 'Common Medicines', icon: 'medication', exact: false },
  ];

  const systemNavItems = [
    { to: '/multitenant', label: 'Control Center', icon: 'hub', exact: false },
    { to: '/superadmin/audit', label: 'Audit Logs', icon: 'history', exact: false },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const initials = admin?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'SA';

  const getPageTitle = () => {
    if (location.pathname === '/superadmin') return 'Overview';
    if (location.pathname.startsWith('/superadmin/hospitals')) return 'Hospitals';
    if (location.pathname.startsWith('/superadmin/plans')) return 'Subscription Plans';
    if (location.pathname.startsWith('/superadmin/medicines')) return 'Common Medicines';
    if (location.pathname.startsWith('/superadmin/profile')) return 'My Profile';
    if (location.pathname.startsWith('/multitenant')) return 'Control Center';
    if (location.pathname.startsWith('/superadmin/audit')) return 'Audit Logs';
    return 'HMS Control Center';
  };

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
            <span className="material-symbols-outlined text-xl">security</span>
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight text-slate-900 truncate block leading-none">
              HMS Control Center
            </span>
            <span className="text-[10px] font-bold text-primary uppercase mt-1 block">
              Super Admin
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar">
          {/* MAIN */}
          <div className="px-6 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main</span>
          </div>
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-all ${
                isActive(item.to, item.exact)
                  ? 'sidebar-item-active'
                  : 'text-slate-500 hover:text-primary hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* SYSTEM */}
          <div className="mt-4 px-6 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System</span>
          </div>
          {systemNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-all ${
                isActive(item.to, item.exact)
                  ? 'sidebar-item-active'
                  : 'text-slate-500 hover:text-primary hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* ACCOUNT */}
          <div className="mt-4 px-6 mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account</span>
          </div>
          <NavLink
            to="/superadmin/profile"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center px-6 py-3 text-sm font-medium transition-all ${
              isActive('/superadmin/profile')
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
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-slate-900 truncate">{admin?.full_name || 'Super Admin'}</p>
              <p className="text-[10px] text-slate-500">Super Administrator</p>
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
              {getPageTitle()}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Super Admin Badge */}
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              Super Admin
            </span>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {initials}
                </div>
                <span className="material-icons text-sm text-slate-400">expand_more</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="font-bold text-slate-900 text-sm">{admin?.full_name || 'Super Admin'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{admin?.email}</p>
                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold rounded-full">
                      <span className="material-symbols-outlined text-[11px]">verified_user</span>
                      Super Administrator
                    </span>
                  </div>
                  <div className="py-2">
                    <NavLink
                      to="/superadmin/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                      <span className="material-icons text-lg">manage_accounts</span>
                      My Profile
                    </NavLink>
                  </div>
                  <div className="py-2 border-t border-slate-100">
                    <button
                      onClick={() => { setUserMenuOpen(false); setShowLogoutConfirm(true); }}
                      className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                    >
                      <span className="material-icons text-lg">logout</span>
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
          <Outlet />
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-amber-500 text-3xl">logout</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Sign Out</h3>
                <p className="text-sm text-slate-500 mb-6">Are you sure you want to sign out?</p>
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
      </main>
    </div>
  );
};

export default SuperAdminLayout;