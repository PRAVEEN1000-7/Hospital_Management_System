
import React, { useState, useEffect, useRef, useCallback } from 'react';
import TrialBanner from './TrialBanner';
import HospitalLogo from './HospitalLogo';
import UserAvatar from './UserAvatar';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatRole } from '../../utils/constants';
import hospitalService from '../../services/hospitalService';
import pharmacyService from '../../services/pharmacyService';
import notificationsService, { type AppNotification } from '../../services/notificationsService';
import {
  getNotificationTarget,
  getNotificationIcon,
  getNotificationColor,
  formatNotificationMessage,
  getRelativeTime,
} from '../../utils/notificationUtils';
import { hasAccess, canEdit } from '../../config/modulePermissions';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';

const Layout: React.FC = () => {
  const { user, logout, isModuleEnabled, isEyeHospitalFeatureEnabled } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState(user?.hospital_name || 'HMS Core');
  const [hospitalLogo, setHospitalLogo] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchDebounceRef = useRef<number | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  // IDs hidden from the panel view — DB is never touched; resets on page refresh.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [appointmentsOpen, setAppointmentsOpen] = useState(
    () => location.pathname.startsWith('/appointments')
  );
  const [prescriptionsOpen, setPrescriptionsOpen] = useState(
    () => location.pathname.startsWith('/prescriptions')
  );
  const [pharmacyOpen, setPharmacyOpen] = useState(
    () => location.pathname.startsWith('/pharmacy')
  );
  const [pharmacyExpanded, setPharmacyExpanded] = useState(
    () => location.pathname.startsWith('/pharmacy')
  );
  const [pendingPrescriptionCount, setPendingPrescriptionCount] = useState(0);
  const [loadingPendingCount, setLoadingPendingCount] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(
    () => location.pathname.startsWith('/inventory')
  );
  const [opticalOpen, setOpticalOpen] = useState(
    () => location.pathname.startsWith('/optical')
  );
  const [labOpen, setLabOpen] = useState(
    () => location.pathname.startsWith('/lab')
  );
  const [attendanceOpen, setAttendanceOpen] = useState(
    () => location.pathname.startsWith('/attendance')
  );

  const role = user?.roles?.[0];
  const [billingOpen, setBillingOpen] = useState(
    () => location.pathname.startsWith('/billing')
  );
  // Guest doctors have analytics_enabled=false on their doctor profile and
  // must not see the Analytics entry (BUG-16). Default true so non-doctors
  // and doctors whose profile hasn't loaded yet are unaffected.
  const [doctorAnalyticsEnabled, setDoctorAnalyticsEnabled] = useState(true);
  const normalizedRoles = (user?.roles || []).map(r => String(r).trim().toLowerCase());
  const roleAliases: Record<string, string> = {
    administrator: 'admin',
    hospital_admin: 'admin',
    'inventory-admin': 'inventory_manager',
    inventoryadmin: 'inventory_manager',
  };
  const effectiveRoles = normalizedRoles.map(r => roleAliases[r] || r);
  const hasRole = (...allowed: string[]) => {
    const allowedSet = new Set(allowed.map(a => String(a).trim().toLowerCase()));
    return effectiveRoles.some(r => allowedSet.has(r));
  };
  const hasPendingPrescriptionAccess = hasAccess('pharmacy', effectiveRoles) && isModuleEnabled('pharmacy');

  // Module + role gating — every section requires BOTH the right role AND enabled module.
  // Role sets are driven by the shared permission matrix (config/modulePermissions.ts —
  // see docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md), super_admin always included.
  const canAccessPatients      = hasAccess('general.patients', effectiveRoles) && isModuleEnabled('patients');
  const canAccessAppointments  = hasAccess('appt.manage', effectiveRoles) && isModuleEnabled('appointments');
  const canAccessPrescriptions = hasAccess('rx.all', effectiveRoles) && isModuleEnabled('prescriptions');
  const canAccessPharmacy      = hasAccess('pharmacy', effectiveRoles) && isModuleEnabled('pharmacy');
  const canAccessInventory     = hasAccess('inventory', effectiveRoles) && isModuleEnabled('inventory');
  const canAccessBilling       = hasAccess('billing', effectiveRoles) && isModuleEnabled('billing');
  // Independent of canAccessBilling — receptionist gets general_billing but
  // not full billing access, so this must not be nested inside that gate.
  const canAccessGeneralBilling = hasAccess('general_billing', effectiveRoles) && isModuleEnabled('general_billing');
  // For doctors, additionally require their per-doctor analytics_enabled flag
  // (in-house vs guest doctor, BUG-16) — other roles are unaffected.
  const canAccessAnalytics     = hasAccess('general.analytics', effectiveRoles)
    && isModuleEnabled('analytics')
    && (!hasRole('doctor') || hasRole('super_admin', 'admin') || doctorAnalyticsEnabled);
  // Optical Store is a back-of-store retail/dispensing operation, not part of a doctor's
  // clinical workflow — admin/super_admin (oversight) and optical_staff (the job) get
  // this full nav section (products/sales/stock/dispensing). Nurse deliberately does
  // NOT get it — nurse's eye-exam entry is scoped to the narrower "optical.exam"
  // permission (draft create/update only, no finalize, no Store management) and is
  // reached directly from the Walk-in Queue's "Optical" action, not this nav section
  // (see module_roles.py's "optical.exam" for the full rationale).
  const canAccessOptical       = hasAccess('optical', effectiveRoles) && isModuleEnabled('optical') && isEyeHospitalFeatureEnabled;
  // Laboratory applies to every hospital type (not eye-specific) — admin/
  // super_admin (oversight) and lab_technician (the job) get it. Left untouched
  // per the client's instruction to leave the Lab role as-is — not part of the
  // shared matrix (its spreadsheet column is blank for every row).
  const canAccessLab           = hasRole('super_admin', 'admin', 'lab_technician') && isModuleEnabled('lab');
  // Report Viewer's whole job is the appointment reports export — no other role gets a
  // sidebar entry for it since admin/super_admin already reach it via the Appointments dropdown.
  const canAccessAppointmentReports = hasRole('report_viewer') && isModuleEnabled('appointments');
  // Attendance — Workforce Management module (Holidays/Shifts/Attendance/
  // Leave/Payroll), schema in database_hole/01_full_schema.sql Section 8
  // (see also database_hole/workforce_attendance_module_combined.sql for
  // patching a database bootstrapped before that section existed).
  const canAccessAttendance   = hasRole('super_admin', 'admin') && isModuleEnabled('attendance');

  // Fetch the current hospital's name + logo from the tenant-scoped /hospital endpoint.
  const loadBranding = useCallback(() => {
    hospitalService.getHospitalDetails()
      .then(res => {
        if (res.name) {
          setHospitalName(res.name);
          document.title = `${res.name} | Hospital Management System`;
        }
        setHospitalLogo(res.logo_url || null);
      })
      .catch(() => {
        // Keep defaults on error
      });
  }, []);

  useEffect(() => {
    // Prefer the tenant-scoped name from the auth context for an instant, correct
    // first render, then refresh name + logo from the API.
    if (user?.hospital_name) {
      setHospitalName(user.hospital_name);
      document.title = `${user.hospital_name} | Hospital Management System`;
    }
    loadBranding();
  }, [user?.hospital_name, loadBranding]);

  // Refresh branding live when the hospital profile/logo is updated in Settings.
  useEffect(() => {
    const handler = () => loadBranding();
    window.addEventListener('hospital:updated', handler);
    return () => window.removeEventListener('hospital:updated', handler);
  }, [loadBranding]);

  // Doctors only: load their profile's analytics_enabled flag (BUG-16).
  // Silently keeps the default (enabled) if the profile can't be fetched, so
  // a transient error never locks an in-house doctor out of Analytics.
  useEffect(() => {
    if (!normalizedRoles.includes('doctor')) return;
    import('../../services/doctorService').then(({ default: doctorService }) =>
      doctorService.getMyProfile()
        .then(profile => setDoctorAnalyticsEnabled(profile.analytics_enabled !== false))
        .catch(() => {})
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch pending prescription count for pharmacy badge
  const fetchPendingCount = useCallback(async () => {
    if (!hasPendingPrescriptionAccess) return;
    setLoadingPendingCount(true);
    try {
      // Explicitly request status='pending' — with no filter this endpoint
      // returns both pending and dispensed prescriptions, which would inflate
      // this sidebar badge with prescriptions that are already fully dispensed.
      const result = await pharmacyService.getPendingPrescriptions(1, 1, 'pending');
      setPendingPrescriptionCount(result.total);
    } catch (err) {
      setPendingPrescriptionCount(0);
    } finally {
      setLoadingPendingCount(false);
    }
  }, [hasPendingPrescriptionAccess]);

  useEffect(() => {
    if (hasPendingPrescriptionAccess) fetchPendingCount();
  }, [hasPendingPrescriptionAccess, fetchPendingCount]);

  // Background poll every 30s — skips the fetch while this tab is
  // backgrounded, and fires one immediate refresh the moment it regains
  // focus, so the badge reflects new pending prescriptions right away
  // instead of waiting up to 30s after switching back.
  useVisiblePolling(fetchPendingCount, 30000, hasPendingPrescriptionAccess);

  // Auto-expand sections when navigating to their routes
  useEffect(() => {
    if (location.pathname.startsWith('/appointments')) {
      setAppointmentsOpen(true);
    }
    if (location.pathname.startsWith('/prescriptions')) {
      setPrescriptionsOpen(true);
    }
    if (location.pathname.startsWith('/pharmacy')) {
      setPharmacyOpen(true);
      setPharmacyExpanded(true);
    }
    if (location.pathname.startsWith('/inventory')) {
      setInventoryOpen(true);
    }
    if (location.pathname.startsWith('/optical')) {
      setOpticalOpen(true);
    }
    if (location.pathname.startsWith('/lab')) {
      setLabOpen(true);
    }
    if (location.pathname.startsWith('/billing')) {
      setBillingOpen(true);
    }
  }, [location.pathname]);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setNotificationsLoading(true);
    try {
      // There's no dedicated "view all" notifications page — this dropdown is
      // the only place notifications are ever listed — so the fetch limit is
      // kept generous rather than the previous 15, which could silently hide
      // older unread items behind an otherwise-correct unread badge count.
      const res = await notificationsService.getNotifications(1, 50, false);
      setNotifications(res.data);
      setUnreadCount(res.unread_count || 0);
    } catch {
      // Keep previous notifications on transient API failures
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  }, []);

  // Notifications visible in the panel — filters out locally dismissed items.
  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));

  useEffect(() => {
    if (!notificationsOpen) return;
    fetchNotifications();
  }, [notificationsOpen, fetchNotifications]);

  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  // Background poll: cheap unread-count only (every 30 s). Full list is
  // fetched on dropdown open. Skips the fetch while this tab is
  // backgrounded, and fires one immediate refresh the moment it regains
  // focus, so a new notification shows up right away instead of waiting up
  // to 30s after switching back.
  useVisiblePolling(async () => {
    try {
      const count = await notificationsService.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // keep previous count on transient failure
    }
  }, 30000);

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsService.markRead(id);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsService.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      toast.error('Failed to mark all notifications as read');
    }
  };

  // Permanently remove a single notification. This used to only hide it
  // locally (dismissedIds, never touching the backend) — it looked deleted
  // but reappeared on the next refresh since the row was still there.
  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set(prev).add(id));
    try {
      await notificationsService.deleteNotification(id);
    } catch {
      setDismissedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Failed to remove notification');
    }
  };

  // Permanently remove every currently visible notification (same
  // reasoning as handleDismiss — this must actually delete server-side).
  // Unread ones are marked read first since DELETE /notifications/read only
  // removes already-read rows.
  const handleDismissAll = async () => {
    const ids = notifications.map(n => n.id);
    setDismissedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    try {
      await notificationsService.markAllRead();
      await notificationsService.deleteAllRead();
      setUnreadCount(0);
    } catch {
      setDismissedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      toast.error('Failed to clear notifications');
    }
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const getGlobalSearchContext = useCallback(() => {
    if (location.pathname.startsWith('/appointments/manage')) {
      return { path: '/appointments/manage', placeholder: 'Search appointments...' };
    }
    if (location.pathname.startsWith('/prescriptions')) {
      return { path: '/prescriptions', placeholder: 'Search prescriptions...' };
    }
    if (location.pathname.startsWith('/user-management')) {
      return { path: '/user-management', placeholder: 'Search users...' };
    }
    if (location.pathname.startsWith('/staff')) {
      return { path: '/staff', placeholder: 'Search staff...' };
    }
    return { path: '/patients', placeholder: 'Search patients...' };
  }, [location.pathname]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    const { path } = getGlobalSearchContext();
    if (trimmed) {
      navigate(`${path}?search=${encodeURIComponent(trimmed)}`);
    }
  }, [searchQuery, navigate, getGlobalSearchContext]);

  // Keep global search input in sync with URL query when route changes
  useEffect(() => {
    const urlSearch = new URLSearchParams(location.search).get('search') || '';
    setSearchQuery(urlSearch);
  }, [location.pathname, location.search]);

  // Dynamic global search with debounce
  useEffect(() => {
    if (location.pathname.startsWith('/register')) return;
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      const trimmed = searchQuery.trim();
      const { path } = getGlobalSearchContext();
      const hasSearchParam = new URLSearchParams(location.search).has('search');
      if (!trimmed) {
        if (hasSearchParam) {
          navigate(path, { replace: true });
        }
        return;
      }
      navigate(`${path}?search=${encodeURIComponent(trimmed)}`, { replace: true });
    }, 350) as unknown as number;

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, location.pathname, location.search, getGlobalSearchContext, navigate]);

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.is_read) {
      await handleMarkRead(notification.id);
    }
    setNotificationsOpen(false);
    
    const target = getNotificationTarget(notification);
    
    // Navigate to the target page
    navigate(target.path, {
      state: {
        fromNotification: true,
        referenceType: notification.reference_type,
        referenceId: notification.reference_id,
      },
    });
  };

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

  const isRegisterPatientPage = location.pathname.startsWith('/register');
  const globalSearchContext = getGlobalSearchContext();

  // Receptionist and Doctor get flat appointment links (no dropdown)
  const isFlatNav = hasRole('receptionist', 'doctor');

  // ── Main navigation ──
  // The generic Dashboard was previously shown to every authenticated user
  // unconditionally, but its route (/dashboard in App.tsx) is gated by the
  // shared 'general.dashboard' permission — which lab_technician, pharmacist,
  // optical_staff and inventory_manager don't hold (they get their own
  // module-specific dashboard instead: Lab/Pharmacy/Optical/Inventory
  // "Dashboard" entries below). cashier and visiting_doctor DO hold it and
  // land on this same generic Dashboard, role-customized (see Dashboard.tsx).
  // Only show the link to roles that actually have it.
  const mainNavItems = [
    ...(hasAccess('general.dashboard', effectiveRoles)
      ? [{ to: '/dashboard', label: 'Dashboard', icon: 'dashboard' }]
      : []),
  ];
  if (canAccessPatients) {
    mainNavItems.push({ to: '/patients', label: 'Patient Directory', icon: 'group' });
  }
  if (hasRole('super_admin', 'admin', 'receptionist') && isModuleEnabled('patients')) {
    mainNavItems.push({ to: '/register', label: 'Patient Registration', icon: 'person_add' });
  }
  if (hasRole('super_admin', 'admin')) {
    mainNavItems.push({ to: '/staff', label: 'Staff Directory', icon: 'badge' });
  }
  if (canAccessAnalytics) {
    mainNavItems.push({ to: '/analytics', label: 'Analytics', icon: 'monitoring' });
  }
  if (canAccessAppointmentReports) {
    mainNavItems.push({ to: '/appointments/reports', label: 'Appointment Reports', icon: 'analytics' });
  }

  // ── Appointment navigation ── fully role-driven
  const appointmentItems: { to: string; label: string; icon: string; external?: boolean }[] = [];

  if (canAccessAppointments) {
    if (hasRole('super_admin', 'admin')) {
      appointmentItems.push(
        { to: '/appointments/walk-in', label: 'OPD Assignment', icon: 'directions_walk' },
        { to: '/appointments/queue', label: 'Walk-in Queue', icon: 'queue' },
      );
      appointmentItems.push(
        { to: '/appointments/manage', label: 'Manage Appointments', icon: 'event_note' },
        { to: '/appointments/doctor-schedule', label: 'Doctor Schedule', icon: 'calendar_month' },
      );
      // Queue Display (BRD v1.1 §3) — eye-hospital feature pack only. Public,
      // unauthenticated kiosk page (no sidebar/login) — opens in a new tab so
      // the admin doesn't lose their own session view.
      if (isEyeHospitalFeatureEnabled && user?.hospital_code) {
        appointmentItems.push({ to: `/public/queue/${user.hospital_code}`, label: 'Queue Display', icon: 'tv', external: true });
      }
      appointmentItems.push(
        { to: '/appointments/waitlist', label: 'Waitlist', icon: 'playlist_add' },
        { to: '/appointments/reports', label: 'Reports', icon: 'analytics' },
        { to: '/appointments/settings', label: 'Settings', icon: 'tune' },
      );
    } else if (hasRole('doctor')) {
      appointmentItems.push(
        { to: '/appointments/queue', label: 'Today Patients', icon: 'queue' },
        { to: '/appointments/my-schedule', label: 'My Patients', icon: 'groups' },
        { to: '/appointments/doctor-schedule', label: 'Manage My Schedule', icon: 'edit_calendar' },
        { to: '/appointments/waitlist', label: 'Waitlist', icon: 'playlist_add' },
      );
    } else if (hasRole('nurse')) {
      appointmentItems.push(
        { to: '/appointments/queue', label: 'Walk-in Queue', icon: 'queue' },
        { to: '/appointments/manage', label: 'Appointments', icon: 'event_note' },
      );
    } else if (isFlatNav && hasRole('receptionist')) {
      appointmentItems.push(
        { to: '/appointments/walk-in', label: 'OPD Assignment', icon: 'directions_walk' },
        { to: '/appointments/queue', label: 'Walk-in Queue', icon: 'queue' },
      );
      appointmentItems.push(
        { to: '/appointments/manage', label: 'Manage Appointments', icon: 'event_note' },
      );
      // Queue Display for the front desk too (BUG-19) — the receptionist is the
      // person who actually runs the waiting-room TV. Link only appears inside
      // an authenticated receptionist session (that session IS the security
      // gate); the kiosk page itself stays read-only token numbers, no patient
      // details.
      if (isEyeHospitalFeatureEnabled && user?.hospital_code) {
        appointmentItems.push({ to: `/public/queue/${user.hospital_code}`, label: 'Queue Display', icon: 'tv', external: true });
      }
      appointmentItems.push(
        // Manage Doctor Schedule now reachable from the front desk (BUG-17).
        { to: '/appointments/doctor-schedule', label: 'Manage Doctor Schedule', icon: 'calendar_month' },
        { to: '/appointments/waitlist', label: 'Waitlist', icon: 'playlist_add' },
      );
    }
  }

  // ── Prescription navigation ── FLAT (no dropdown)
  const prescriptionItems: { to: string; label: string; icon: string }[] = [];

  if (canAccessPrescriptions) {
    if (hasRole('super_admin', 'admin')) {
      prescriptionItems.push(
        { to: '/prescriptions', label: 'All Prescription', icon: 'list_alt' },
        { to: '/prescriptions/new', label: 'New Prescription', icon: 'note_add' },
      );
    } else if (hasRole('doctor')) {
      prescriptionItems.push(
        { to: '/prescriptions', label: 'All Prescription', icon: 'list_alt' },
        { to: '/prescriptions/new', label: 'New Prescription', icon: 'note_add' },
      );
    } else if (hasRole('nurse', 'pharmacist')) {
      prescriptionItems.push(
        { to: '/prescriptions', label: 'All Prescription', icon: 'prescriptions' },
      );
    }
  }

  // ── Pharmacy navigation ── FLAT (no dropdown), simplified for pharmacists
  const pharmacyItems: { to: string; label: string; icon: string; badge?: number }[] = [];

  if (canAccessPharmacy) {
    if (hasRole('pharmacist') && !hasRole('super_admin', 'admin', 'inventory_manager')) {
      // Simplified pharmacy menu for pharmacists - essential items only
      pharmacyItems.push(
        // Lets a pharmacist author a walk-in prescription directly (no
        // doctor consultation first), attributed to a doctor they pick —
        // reuses PrescriptionBuilder via the /prescriptions/new route,
        // which carves out pharmacist access explicitly (see App.tsx).
        { to: '/prescriptions/new', label: 'New Prescription', icon: 'note_add' },
        { to: '/pharmacy/medicines', label: 'Medicines', icon: 'medication' },
        {
          to: '/pharmacy/pending-prescriptions',
          label: 'Pending Prescriptions',
          icon: 'queue',
          badge: pendingPrescriptionCount > 0 ? pendingPrescriptionCount : undefined,
        },
        { to: '/pharmacy/sales', label: 'Sales', icon: 'point_of_sale' },
      );
      if (isEyeHospitalFeatureEnabled) {
        pharmacyItems.push({ to: '/pharmacy/queue', label: 'Pharmacy Queue', icon: 'queue' });
      }
    } else if (hasRole('cashier')) {
      pharmacyItems.push(
        { to: '/pharmacy/sales', label: 'Sales', icon: 'point_of_sale' },
      );
    } else {
      // Full pharmacy menu for admin/super_admin/inventory_manager
      pharmacyItems.push(
        { to: '/pharmacy', label: 'Dashboard', icon: 'dashboard' },
        { to: '/pharmacy/medicines', label: 'Medicines', icon: 'medication' },
        {
          to: '/pharmacy/pending-prescriptions',
          label: 'Pending Prescriptions',
          icon: 'queue',
          badge: pendingPrescriptionCount > 0 ? pendingPrescriptionCount : undefined,
        },
        { to: '/pharmacy/sales', label: 'Sales', icon: 'point_of_sale' },
      );
      if (isEyeHospitalFeatureEnabled) {
        pharmacyItems.push({ to: '/pharmacy/queue', label: 'Pharmacy Queue', icon: 'queue' });
      }
      pharmacyItems.push({ to: '/pharmacy/stock-adjustments', label: 'Stock Adjustments', icon: 'tune' });
    }
  }

  // ── Optical navigation —— eye-hospital feature pack only (canAccessOptical already gates this) ──
  const opticalItems: { to: string; label: string; icon: string }[] = [];
  if (canAccessOptical) {
    opticalItems.push(
      { to: '/optical', label: 'Dashboard', icon: 'dashboard' },
      { to: '/optical/products', label: 'Products', icon: 'visibility' },
      { to: '/optical/prescriptions', label: 'Prescriptions', icon: 'description' },
      { to: '/optical/prescriptions/new', label: 'New Prescription', icon: 'add_circle' },
      { to: '/optical/sales', label: 'Sales', icon: 'point_of_sale' },
      { to: '/optical/queue', label: 'Dispensing Queue', icon: 'queue' },
      { to: '/optical/stock-adjustments', label: 'Stock Adjustments', icon: 'tune' },
    );
  }

  // ── Laboratory navigation ── applies to every hospital type
  const labItems: { to: string; label: string; icon: string }[] = [];
  if (canAccessLab) {
    labItems.push(
      { to: '/lab', label: 'Dashboard', icon: 'dashboard' },
      // New Order — lets lab staff create a walk-in order directly (no prior
      // doctor visit required), filed under a doctor picked from the roster.
      { to: '/lab/new-order', label: 'New Order', icon: 'add_circle' },
      { to: '/lab/queue', label: 'Lab Queue', icon: 'queue' },
      { to: '/lab/billing', label: 'Billing', icon: 'payments' },
      { to: '/lab/tests', label: 'Test Catalog', icon: 'biotech' },
    );
  }

  // ── Attendance navigation ── sub-modules land here as they're built.
  const attendanceItems: { to: string; label: string; icon: string }[] = [];
  if (canAccessAttendance) {
    attendanceItems.push(
      { to: '/attendance/holidays', label: 'Holiday Calendar', icon: 'event_available' },
      { to: '/attendance/shifts', label: 'Shift Management', icon: 'schedule' },
      { to: '/attendance/report', label: 'Attendance Report', icon: 'fact_check' },
      { to: '/attendance/leaves', label: 'Leave Management', icon: 'event_busy' },
      { to: '/attendance/payroll', label: 'Payroll', icon: 'payments' },
      { to: '/attendance/allowance', label: 'Payroll Add-ons', icon: 'redeem' },
    );
  }

  // ── Inventory navigation ── role-driven
  const inventoryItems: { to: string; label: string; icon: string }[] = [];

  if (canAccessInventory) {
    if (hasRole('super_admin', 'admin', 'inventory_manager')) {
      inventoryItems.push(
        { to: '/inventory', label: 'Dashboard', icon: 'space_dashboard' },
        { to: '/inventory/low-stock', label: 'Low Stock', icon: 'warning' },
        { to: '/inventory/suppliers', label: 'Suppliers', icon: 'local_shipping' },
        { to: '/inventory/purchase-orders', label: 'Purchase Orders', icon: 'receipt_long' },
        { to: '/inventory/grns', label: 'Goods Receipt', icon: 'inventory' },
        { to: '/inventory/stock-movements', label: 'Stock Movements', icon: 'swap_vert' },
        { to: '/inventory/adjustments', label: 'Adjustments', icon: 'tune' },
        // Cycle Counts disabled application-wide — nav entry intentionally
        // removed, route unmounted in App.tsx, page code untouched.
        // { to: '/inventory/cycle-counts', label: 'Cycle Counts', icon: 'inventory_2' },
      );
    } else if (hasRole('pharmacist')) {
      inventoryItems.push(
        { to: '/inventory', label: 'Dashboard', icon: 'space_dashboard' },
        { to: '/inventory/low-stock', label: 'Low Stock', icon: 'warning' },
        { to: '/inventory/suppliers', label: 'Suppliers', icon: 'local_shipping' },
        { to: '/inventory/purchase-orders', label: 'Purchase Orders', icon: 'receipt_long' },
        { to: '/inventory/grns', label: 'Goods Receipt', icon: 'inventory' },
        { to: '/inventory/stock-movements', label: 'Stock Movements', icon: 'swap_vert' },
        { to: '/inventory/adjustments', label: 'Adjustments', icon: 'tune' },
      );
    }
  }

  // ── System navigation ── admin / super_admin only
  const systemNavItems: { to: string; label: string; icon: string }[] = [];
  if (hasRole('super_admin')) {
    systemNavItems.push(
      { to: '/multitenant', label: 'Multi-Tenant Control', icon: 'hub' },
      { to: '/hospital-setup', label: 'Hospital Setup', icon: 'local_hospital' },
      { to: '/user-management', label: 'User Management', icon: 'admin_panel_settings' },
      { to: '/roles-permissions', label: 'Roles & Permissions', icon: 'shield_person' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    );
  } else if (hasRole('admin')) {
    systemNavItems.push(
      { to: '/subscription', label: 'Subscription', icon: 'credit_card' },
      { to: '/user-management', label: 'User Management', icon: 'admin_panel_settings' },
      { to: '/roles-permissions', label: 'Roles & Permissions', icon: 'shield_person' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    );
  }

  // ── Billing navigation ── role-scoped
  // receptionist/doctor: view invoices + payments only
  // cashier/pharmacist: + refunds + settlements
  // admin/super_admin: full access including admin-only items
  const billingItems: { to: string; label: string; icon: string; stub?: boolean }[] = [];
  if (canAccessBilling) {
    billingItems.push({ to: '/billing/invoices', label: 'Invoices', icon: 'receipt_long' });
    billingItems.push({ to: '/billing/payments', label: 'Payments', icon: 'payments' });
    if (hasRole('super_admin', 'admin', 'cashier', 'pharmacist')) {
      billingItems.push({ to: '/billing/refunds', label: 'Refunds', icon: 'currency_exchange' });
      billingItems.push({ to: '/billing/settlements', label: 'Daily Settlements', icon: 'account_balance_wallet' });
    }
    if (hasRole('super_admin', 'admin')) {
      billingItems.push({ to: '/billing/insurance-claims', label: 'Insurance Claims', icon: 'health_and_safety', stub: true });
      billingItems.push({ to: '/billing/credit-notes', label: 'Credit Notes', icon: 'credit_score', stub: true });
      billingItems.push({ to: '/billing/insurance-providers', label: 'Insurance Providers', icon: 'domain', stub: true });
    }
  }
  if (canAccessGeneralBilling) {
    billingItems.push({ to: '/billing/general-billing', label: 'General Billing', icon: 'point_of_sale' });
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  // For flat nav items: exact match only
  const isExactActive = (path: string) => location.pathname === path;

  const isDoctor = user?.roles?.includes('doctor');
  const fullName = user ? `${isDoctor ? 'Dr. ' : ''}${user.first_name} ${user.last_name}`.trim() : '';

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
        <div className="min-h-[4rem] flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100">
          <HospitalLogo
            logoUrl={hospitalLogo}
            name={hospitalName}
            className="w-9 h-9 rounded-lg shrink-0"
            textClassName="text-sm"
          />
          <div className="min-w-0 flex-1">
            <span
              className="font-bold text-[13px] leading-snug tracking-tight text-slate-900 line-clamp-2 break-words"
              title={hospitalName}
            >
              {hospitalName}
            </span>
            {user?.hospital_code && (
              <span className="text-[10px] font-bold text-primary uppercase block leading-none mt-0.5">
                Code: {user.hospital_code}
              </span>
            )}
          </div>
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
            <div className="mt-4">
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Appointments</span>
              </div>
              {appointmentItems.map((item) => item.external ? (
                <a
                  key={item.to}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-6 py-3 text-sm font-medium transition-all text-slate-500 hover:text-primary hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
                  {item.label}
                  <span className="material-symbols-outlined ml-1 text-[14px]">open_in_new</span>
                </a>
              ) : (
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
            <div
              className="mt-4"
              onMouseEnter={() => setAppointmentsOpen(true)}
              onMouseLeave={() => setAppointmentsOpen(false)}
            >
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
                {appointmentItems.map((item) => item.external ? (
                  <a
                    key={item.to}
                    href={item.to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center whitespace-nowrap pl-10 pr-6 py-2.5 text-[13px] font-medium transition-all text-slate-400 hover:text-primary hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined mr-3 flex-shrink-0 text-[18px]">{item.icon}</span>
                    {item.label}
                    <span className="material-symbols-outlined ml-1 text-[12px]">open_in_new</span>
                  </a>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center whitespace-nowrap pl-10 pr-6 py-2.5 text-[13px] font-medium transition-all ${
                      isExactActive(item.to)
                        ? 'sidebar-item-active'
                        : 'text-slate-400 hover:text-primary hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined mr-3 flex-shrink-0 text-[18px]">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* ══ PRESCRIPTIONS — FLAT (no dropdown) ══ */}
          {prescriptionItems.length > 0 && (
            <div className="mt-4">
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prescriptions</span>
              </div>
              {prescriptionItems.map((item) => (
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
          )}

          {/* ══ PHARMACY — collapsible (with badge notifications) ══ */}
          {pharmacyItems.length > 0 && (
            <div
              className="mt-4"
              onMouseEnter={() => setPharmacyOpen(true)}
              onMouseLeave={() => setPharmacyOpen(false)}
            >
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pharmacy</span>
              </div>
              <button
                onClick={() => setPharmacyOpen(!pharmacyOpen)}
                aria-expanded={pharmacyOpen}
                aria-controls="pharmacy-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/pharmacy')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  <span className="material-symbols-outlined mr-3 text-[20px]">local_pharmacy</span>
                  Pharmacy
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${pharmacyOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="pharmacy-menu" className={`overflow-hidden transition-all duration-200 ${pharmacyOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {pharmacyItems.map((item) => (
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
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-red-500 text-white rounded-full min-w-[1.25rem] text-center notification-badge">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* ══ OPTICAL STORE — collapsible ══ */}
          {opticalItems.length > 0 && (
            <div
              className="mt-4"
              onMouseEnter={() => setOpticalOpen(true)}
              onMouseLeave={() => setOpticalOpen(false)}
            >
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Optical Store</span>
              </div>
              <button
                onClick={() => setOpticalOpen(!opticalOpen)}
                aria-expanded={opticalOpen}
                aria-controls="optical-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/optical')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  Optical Store
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${opticalOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="optical-menu" className={`overflow-hidden transition-all duration-200 ${opticalOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {opticalItems.map((item) => (
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

          {/* ══ LABORATORY — collapsible ══ */}
          {labItems.length > 0 && (
            <div
              className="mt-4"
              onMouseEnter={() => setLabOpen(true)}
              onMouseLeave={() => setLabOpen(false)}
            >
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Laboratory</span>
              </div>
              <button
                onClick={() => setLabOpen(!labOpen)}
                aria-expanded={labOpen}
                aria-controls="lab-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/lab')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  Laboratory
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${labOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="lab-menu" className={`overflow-hidden transition-all duration-200 ${labOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {labItems.map((item) => (
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

          {/* ══ ATTENDANCE — collapsible ══ */}
          {attendanceItems.length > 0 && (
            <div
              className="mt-4"
              onMouseEnter={() => setAttendanceOpen(true)}
              onMouseLeave={() => setAttendanceOpen(false)}
            >
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attendance</span>
              </div>
              <button
                onClick={() => setAttendanceOpen(!attendanceOpen)}
                aria-expanded={attendanceOpen}
                aria-controls="attendance-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/attendance')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  Attendance
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${attendanceOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="attendance-menu" className={`overflow-hidden transition-all duration-200 ${attendanceOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {attendanceItems.map((item) => (
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

          {/* ══ INVENTORY — collapsible ══ */}
          {inventoryItems.length > 0 && (
            <div
              className="mt-4"
              onMouseEnter={() => setInventoryOpen(true)}
              onMouseLeave={() => setInventoryOpen(false)}
            >
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inventory</span>
              </div>
              <button
                onClick={() => setInventoryOpen(!inventoryOpen)}
                aria-expanded={inventoryOpen}
                aria-controls="inventory-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/inventory')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  <span className="material-symbols-outlined mr-3 text-[20px]">inventory_2</span>
                  Inventory
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${inventoryOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="inventory-menu" className={`overflow-hidden transition-all duration-200 ${inventoryOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {inventoryItems.map((item) => (
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

          {/* ══ BILLING — collapsible ══ */}
          {billingItems.length > 0 && (
            <div
              className="mt-4"
              onMouseEnter={() => setBillingOpen(true)}
              onMouseLeave={() => setBillingOpen(false)}
            >
              <div className="px-6 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billing</span>
              </div>
              <button
                onClick={() => setBillingOpen(!billingOpen)}
                aria-expanded={billingOpen}
                aria-controls="billing-menu"
                className={`w-full flex items-center justify-between px-6 py-2.5 text-sm font-medium transition-all ${
                  location.pathname.startsWith('/billing')
                    ? 'text-primary bg-primary/5'
                    : 'text-slate-500 hover:text-primary hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center">
                  <span className="material-symbols-outlined mr-3 text-[20px]">receipt_long</span>
                  Billing & Invoice
                </div>
                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${billingOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>
              <div id="billing-menu" className={`overflow-hidden transition-all duration-200 ${billingOpen ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
                {billingItems.map((item) => (
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
                    {item.stub && (
                      <span className="ml-auto text-[9px] font-semibold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        Soon
                      </span>
                    )}
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
            <UserAvatar
              avatarUrl={user?.avatar_url}
              name={fullName}
              className="w-8 h-8 rounded-full shrink-0"
              textClassName="text-xs"
            />
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
        {/* Trial expiry banner — shows for trialing tenants with ≤14 days left.
            GET /tenant/subscription is edit-gated on "system.subscription"
            (admin-only per the shared matrix), so only render/fetch it for
            roles that can actually pass — avoids a guaranteed 403 for every
            other role on every page load. */}
        {!user?.roles?.includes('super_admin') && canEdit('system.subscription', effectiveRoles) && <TrialBanner />}
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
              pharmacyItems.find(i => isActive(i.to))?.label ||
              inventoryItems.find(i => isActive(i.to))?.label ||
              (isActive('/inventory') ? 'Inventory' : '') ||
              systemNavItems.find(i => isActive(i.to))?.label ||
              (isActive('/superadmin/hospitals') ? 'Hospitals' : '') ||
              (isActive('/superadmin/plans') ? 'Subscription Plans' : '') ||
              (isActive('/superadmin') ? 'Super Admin' : '') ||
              (isActive('/profile') ? 'My Profile' : 'HMS')}
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {!isRegisterPatientPage && (
              <>
                {/* Search - form-based, navigates to patient search */}
                <form onSubmit={handleSearch} className="relative hidden sm:block" role="search">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                    <span className="material-symbols-outlined text-lg">search</span>
                  </span>
                  <input
                    className="w-48 lg:w-64 pl-10 pr-9 py-1.5 border border-slate-200 bg-slate-50 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                    placeholder={globalSearchContext.placeholder}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search patients"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => { setSearchQuery(''); navigate(globalSearchContext.path, { replace: true }); }} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  )}
                </form>
                {/* Mobile search - navigates to patients page */}
                <button
                  onClick={() => navigate('/patients')}
                  className="sm:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                  aria-label="Search patients"
                >
                  <span className="material-icons">search</span>
                </button>
              </>
            )}

            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
              >
                <span className="material-icons">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-primary text-lg">notifications</span>
                      <h3 className="font-bold text-slate-900">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full min-w-[1.25rem] text-center">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                        >
                          <span className="material-icons text-sm">done_all</span>
                          Mark all read
                        </button>
                      )}
                      {visibleNotifications.length > 0 && (
                        <button
                          onClick={handleDismissAll}
                          className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1"
                          title="Hide all from view — notifications stay in your history"
                        >
                          <span className="material-icons text-sm">visibility_off</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-[28rem] overflow-y-auto custom-scrollbar">
                    {notificationsLoading ? (
                      <div className="p-12 text-center">
                        <span className="material-icons animate-spin text-3xl text-primary">progress_activity</span>
                        <p className="text-sm text-slate-500 mt-3">Loading notifications...</p>
                      </div>
                    ) : visibleNotifications.length === 0 ? (
                      <div className="p-12 text-center">
                        <span className="material-icons text-5xl text-slate-300">notifications_none</span>
                        <p className="text-sm font-semibold text-slate-700 mt-3">All caught up!</p>
                        <p className="text-xs text-slate-400 mt-1">No new notifications</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {visibleNotifications.map((notification) => {
                          const referenceType = notification.reference_type || '';
                          const icon = getNotificationIcon(referenceType);
                          const colorClass = getNotificationColor(referenceType);
                          const formattedMessage = formatNotificationMessage(notification);

                          return (
                            <div
                              key={notification.id}
                              className={`group relative flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-all border-l-4 cursor-pointer ${
                                !notification.is_read
                                  ? 'border-primary bg-blue-50/30'
                                  : 'border-transparent'
                              }`}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              {/* Icon */}
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                <span className="material-icons text-lg">{icon}</span>
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-sm font-semibold ${
                                    !notification.is_read ? 'text-slate-900' : 'text-slate-600'
                                  }`}>
                                    {notification.title}
                                  </p>
                                  {!notification.is_read && (
                                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5"></span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                  {formattedMessage}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                  <span className="material-icons text-[10px]">schedule</span>
                                  {notification.created_at ? getRelativeTime(notification.created_at) : 'Unknown'}
                                </p>
                              </div>

                              {/* Per-item dismiss (UI only — no DB change) */}
                              <button
                                onClick={(e) => handleDismiss(e, notification.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 mt-0.5"
                                aria-label="Dismiss notification"
                                title="Hide from view"
                              >
                                <span className="material-icons text-[16px]">close</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {visibleNotifications.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                      <p className="text-xs text-slate-500">
                        {unreadCount === 0
                          ? 'All notifications read'
                          : `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                        }
                      </p>
                      <button
                        onClick={handleDismissAll}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
                        title="Hide all from view — notifications stay in your history"
                      >
                        <span className="material-icons text-sm">visibility_off</span>
                        Clear view
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Role Badge — always-visible role indicator, independent of the
                sidebar's bottom-left user card and the account dropdown below. */}
            {user?.roles?.[0] && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary whitespace-nowrap">
                {formatRole(user.roles[0])}
              </span>
            )}

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                <UserAvatar
                  avatarUrl={user?.avatar_url}
                  name={fullName}
                  className="w-8 h-8 rounded-full"
                  textClassName="text-sm"
                />
                <span className="material-icons text-sm text-slate-400">expand_more</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="font-bold text-slate-900 text-sm">{fullName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatRole(user?.roles?.[0] || '')}</p>
                  </div>
                  <div className="py-2">
                    <NavLink
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                      <span className="material-icons text-lg">person</span>
                      My Profile
                    </NavLink>
                  </div>
                  <div className="py-2 border-t border-slate-100">
                    <button
                      onClick={handleLogout}
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
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
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

export default Layout;
