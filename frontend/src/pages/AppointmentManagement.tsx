import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import appointmentService from '../services/appointmentService';
import scheduleService from '../services/scheduleService';
import invoiceService from '../services/invoiceService';
import paymentService from '../services/paymentService';
import prescriptionService from '../services/prescriptionService';
import opticalService from '../services/opticalService';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import DateRangeFilter from '../components/common/DateRangeFilter';
import { formatLocalDateISO, formatDateOnly, formatTimeOnly } from '../utils/calendarDate';
import type { Appointment, DoctorOption, AppointmentStatus, AppointmentStats, TimeSlot } from '../types/appointment';
import type { Invoice, PaymentMode, PaymentCollector } from '../types/billing';
import type { PrescriptionListItem } from '../types/prescription';
import type { OpticalPrescription } from '../types/optical';
import { canEdit } from '../config/modulePermissions';

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'insurance', label: 'Insurance' },
];

const formatMoney = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const AppointmentManagement: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = formatLocalDateISO();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [collectAppt, setCollectAppt] = useState<Appointment | null>(null);
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectSaving, setCollectSaving] = useState(false);
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMode, setCollectMode] = useState<PaymentMode>('cash');
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectDate, setCollectDate] = useState(today);
  const [collectors, setCollectors] = useState<PaymentCollector[]>([]);
  const [collectCollectorId, setCollectCollectorId] = useState('');
  // Bumped on every open/close so a slow in-flight invoice fetch from a
  // dialog the user already closed (or reopened for another appointment)
  // can't land its response into state after the fact.
  const collectRequestRef = useRef(0);

  // Prescription viewer state (loaded when detail modal opens)
  const [viewRxs, setViewRxs] = useState<PrescriptionListItem[]>([]);
  const [viewOptRxs, setViewOptRxs] = useState<OpticalPrescription[]>([]);
  const [viewRxLoading, setViewRxLoading] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const limit = 15;

  // Collecting a fee ultimately calls paymentService.record() → POST
  // /payments, which the backend gates on "billing: edit" (see
  // docs/security/ROLE_PERMISSIONS_DECISIONS_2026-07-25.md — the client's
  // matrix gives only admin/cashier billing access by default, which
  // conflicts with receptionist previously being a valid fee collector).
  // Using canEdit() instead of the old hardcoded role list means the button
  // only shows when the click would actually succeed — no more "receptionist
  // clicks Collect Fee, hits a 403" — and it re-appears automatically if a
  // hospital admin grants billing edit to receptionist/pharmacist via Roles
  // & Permissions.
  const canCollectFee = canEdit('billing', user?.roles);
  const role = user?.roles?.[0] || '';
  const canProgressConsultation = role !== 'receptionist';

  const fetchStats = useCallback(async () => {
    try {
      const data = await appointmentService.getStats(
        dateFrom || undefined,
        dateTo || undefined,
        filterDoctor || undefined,
      );
      setStats(data);
    } catch {
      // silently fail — stats are supplementary
    }
  }, [dateFrom, dateTo, filterDoctor]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!canCollectFee) return;
    paymentService.getCollectors().then(setCollectors).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getAppointments(page, limit, {
        ...(search && { search }),
        ...(filterDoctor && { doctor_id: filterDoctor }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
        ...(filterStatus && { status: filterStatus }),
        ...(filterType && { appointment_type: filterType }),
      });
      setAppointments(data.data);
      setTotalPages(data.total_pages);
    } catch {
      toast.error('Failed to load appointments');
    }
    setLoading(false);
  }, [page, search, filterDoctor, dateFrom, dateTo, filterStatus, filterType]);

  useEffect(() => { scheduleService.getDoctors().then(setDoctors).catch(() => {}); }, []);
  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // Sync from URL when global header search updates the query. Deliberately
  // depends only on `searchParams` — including `searchInput` here made this
  // fire on every keystroke and immediately revert the just-typed text back
  // to the last committed value before the URL had a chance to catch up.
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    setSearchInput(urlSearch);
    setSearch(urlSearch);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep URL in sync with table search state.
  useEffect(() => {
    if (search) {
      setSearchParams({ search }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [search, setSearchParams]);


  const handleSearch = () => { setPage(1); setSearch(searchInput); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const openPrescription = (appt: Appointment) => {
    const params = new URLSearchParams();
    if (appt.patient_id) params.set('patient_id', appt.patient_id);
    if (appt.id) params.set('appointment_id', appt.id);
    navigate(`/prescriptions/new?${params.toString()}`);
  };

  const loadPrescriptionsForAppt = async (appt: Appointment) => {
    if (!appt.patient_id) return;
    setViewRxLoading(true);
    setViewRxs([]);
    setViewOptRxs([]);
    try {
      const [rxRes, optRes] = await Promise.all([
        prescriptionService.getPrescriptions(1, 50, { patient_id: appt.patient_id }),
        opticalService.getPrescriptions(1, 50, appt.patient_id),
      ]);
      setViewRxs(rxRes.data.filter(rx => rx.appointment_id === appt.id));
      setViewOptRxs(optRes.data.filter(rx => rx.appointment_id === appt.id));
    } catch { /* silent */ }
    setViewRxLoading(false);
  };

  const printRx = async (id: string, isOptical = false) => {
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-ups are blocked — allow pop-ups for this site'); return; }
    setPrintingId(id);
    try {
      const html = isOptical
        ? await opticalService.getPrescriptionPdfUrl(id)
        : await prescriptionService.getPrescriptionPdfUrl(id);
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(() => { try { win.print(); } catch { /* closed */ } }, 800);
    } catch {
      win.close();
      toast.error('Failed to load prescription for printing');
    } finally {
      setPrintingId(null);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await appointmentService.updateStatus(id, status);
      toast.success(`Status updated`);
      fetchAppointments();
      fetchStats();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update');
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      await appointmentService.cancelAppointment(cancelId, cancelReason || undefined);
      toast.success('Appointment cancelled');
      setCancelId(null);
      setCancelReason('');
      fetchAppointments();
      fetchStats();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel');
    }
  };

  const openReschedule = (appt: Appointment) => {
    setRescheduleId(appt.id);
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleSlots([]);
    setRescheduleDoctorId(appt.doctor_id || null);
  };

  useEffect(() => {
    if (!rescheduleDate || !rescheduleDoctorId) { setRescheduleSlots([]); return; }
    setRescheduleLoading(true);
    scheduleService.getAvailableSlots(rescheduleDoctorId, rescheduleDate)
      .then(data => setRescheduleSlots(data.slots))
      .catch(() => setRescheduleSlots([]))
      .finally(() => setRescheduleLoading(false));
  }, [rescheduleDate, rescheduleDoctorId]);

  const handleReschedule = async () => {
    if (!rescheduleId || !rescheduleDate || !rescheduleTime) return;
    try {
      await appointmentService.rescheduleAppointment(rescheduleId, rescheduleDate, rescheduleTime);
      toast.success('Appointment rescheduled');
      setRescheduleId(null);
      fetchAppointments();
      fetchStats();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reschedule');
    }
  };

  const openCollectFee = async (appt: Appointment) => {
    const requestId = ++collectRequestRef.current;
    setCollectAppt(appt);
    setCollectLoading(true);
    try {
      const invoice = await invoiceService.getOrCreateConsultationInvoice(appt.id);
      if (collectRequestRef.current !== requestId) return; // dialog closed/reopened since this fetch started
      setCollectInvoice(invoice);
      // Predefined consultation billing template: always collect the current outstanding amount.
      setCollectAmount(Number(invoice.balance_amount || 0));
      setCollectMode('cash');
      setCollectRef('');
      setCollectNotes('');
      setCollectDate(today);
      setCollectCollectorId(user?.id || '');
    } catch (err: any) {
      if (collectRequestRef.current !== requestId) return;
      toast.error(err?.response?.data?.detail || 'Failed to prepare consultation invoice');
      setCollectAppt(null);
      setCollectInvoice(null);
    } finally {
      if (collectRequestRef.current === requestId) setCollectLoading(false);
    }
  };

  const closeCollectFee = () => {
    collectRequestRef.current++; // invalidate any in-flight invoice fetch
    setCollectAppt(null);
    setCollectInvoice(null);
    setCollectLoading(false);
    setCollectSaving(false);
    setCollectAmount(0);
    setCollectMode('cash');
    setCollectRef('');
    setCollectNotes('');
    setCollectDate(today);
    setCollectCollectorId('');
  };

  const submitCollectFee = async () => {
    if (!collectAppt || !collectInvoice) return;
    const balance = Number(collectInvoice.balance_amount || 0);
    if (balance <= 0) {
      toast.info('Consultation invoice is already paid');
      closeCollectFee();
      return;
    }
    if (collectAmount <= 0) {
      toast.error('Payment amount must be greater than zero');
      return;
    }
    if (collectAmount > balance) {
      toast.error(`Amount cannot exceed balance (Rs ${formatMoney(balance)})`);
      return;
    }

    setCollectSaving(true);
    try {
      await paymentService.record({
        invoice_id: collectInvoice.id,
        patient_id: collectInvoice.patient_id,
        amount: collectAmount,
        payment_mode: collectMode,
        payment_reference: collectRef || undefined,
        payment_date: collectDate,
        notes: collectNotes || undefined,
        received_by: collectCollectorId || undefined,
      });

      const refreshed = await invoiceService.getById(collectInvoice.id);
      setCollectInvoice(refreshed);
      setCollectAmount(Number(refreshed.balance_amount || 0));
      toast.success(
        Number(refreshed.balance_amount || 0) <= 0
          ? 'Consultation fee fully collected'
          : 'Payment recorded (partial)'
      );
      fetchAppointments();
      fetchStats();
      closeCollectFee();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setCollectSaving(false);
    }
  };

  const formatTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  // For walk-ins start_time is null — fall back to check_in_at (arrival time).
  // check_in_at is a real timestamp, so it must be converted to the hospital's
  // timezone (not read via getHours()/getMinutes(), which reflect whatever
  // timezone the viewer's own device happens to be on).
  const getApptTime = (appt: Appointment): string | undefined => {
    if (appt.start_time) return appt.start_time;
    if (appt.check_in_at) return formatTimeOnly(appt.check_in_at, 'HH:mm');
    return undefined;
  };

  const statuses: AppointmentStatus[] = ['scheduled', 'pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled'];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Appointment Management</h1>
        <p className="text-slate-500 text-sm mt-1">View and manage all appointments</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {/* Total */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-lg text-blue-500">calendar_month</span>
            </div>
          </div>
          {stats ? (
            <p className="text-2xl font-bold text-slate-900">{stats.total_appointments}</p>
          ) : (
            <div className="h-8 w-10 bg-slate-100 rounded animate-pulse mt-1" />
          )}
        </div>
        {/* Scheduled (status = scheduled / rescheduled — awaiting confirmation) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scheduled</span>
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-lg text-primary">event</span>
            </div>
          </div>
          {stats ? (
            <p className="text-2xl font-bold text-slate-900">{stats.total_scheduled}</p>
          ) : (
            <div className="h-8 w-10 bg-slate-100 rounded animate-pulse mt-1" />
          )}
        </div>
        {/* Completed */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completed</span>
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-lg text-emerald-500">task_alt</span>
            </div>
          </div>
          {stats ? (
            <>
              <p className="text-2xl font-bold text-emerald-600">{stats.total_completed}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stats.completion_rate.toFixed(1)}% rate</p>
            </>
          ) : (
            <div className="h-8 w-10 bg-slate-100 rounded animate-pulse mt-1" />
          )}
        </div>
        {/* In Progress (confirmed / in-progress / pending) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">In Progress</span>
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-lg text-amber-500">hourglass_top</span>
            </div>
          </div>
          {stats ? (
            <p className="text-2xl font-bold text-amber-600">{stats.total_pending}</p>
          ) : (
            <div className="h-8 w-10 bg-slate-100 rounded animate-pulse mt-1" />
          )}
        </div>
        {/* Cancelled */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cancelled</span>
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-lg text-red-500">cancel</span>
            </div>
          </div>
          {stats ? (
            <>
              <p className="text-2xl font-bold text-red-500">{stats.total_cancelled}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stats.cancellation_rate.toFixed(1)}% rate</p>
            </>
          ) : (
            <div className="h-8 w-10 bg-slate-100 rounded animate-pulse mt-1" />
          )}
        </div>
        {/* No-Shows */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No-Shows</span>
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-lg text-slate-500">person_off</span>
            </div>
          </div>
          {stats ? (
            <>
              <p className="text-2xl font-bold text-slate-600">{stats.total_no_shows}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stats.no_show_rate.toFixed(1)}% rate</p>
            </>
          ) : (
            <div className="h-8 w-10 bg-slate-100 rounded animate-pulse mt-1" />
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Search patient or appointment #..." className="w-full pl-10 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
          <select value={filterDoctor} onChange={(e) => { setFilterDoctor(e.target.value as any); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Doctors</option>
            {doctors.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>
        <div className="mt-3">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
            hideClear
          />
        </div>
        <div className="flex gap-2 mt-3">
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Types</option>
            <option value="scheduled">Scheduled</option>
            <option value="walk-in">Walk-in</option>
          </select>
          <button onClick={handleSearch} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 shadow-sm">Search</button>
          <button onClick={() => { setSearchInput(''); setSearch(''); setFilterDoctor(''); setDateFrom(''); setDateTo(''); setFilterStatus(''); setFilterType(''); setPage(1); }}
            className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Clear</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400"><span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span></div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">event_busy</span>
          <p className="text-sm font-medium">No appointments found</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3 mb-4">
            {appointments.map(appt => (
              <div key={appt.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-primary">{appt.appointment_number}</span>
                  <AppointmentStatusBadge status={appt.status} />
                </div>
                <p className="font-medium text-slate-900 text-sm">{appt.patient_name || '—'}</p>
                <p className="text-xs text-slate-500 mt-0.5">{appt.doctor_name || '—'}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">calendar_today</span>
                    {formatDateOnly(appt.appointment_date, 'MMM d')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {formatTime(getApptTime(appt))}
                    {!appt.start_time && appt.check_in_at && <span className="text-[9px] text-slate-400 ml-0.5">(arrival)</span>}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${appt.appointment_type === 'walk-in' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                    {appt.appointment_type}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => { setDetailAppt(appt); loadPrescriptionsForAppt(appt); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg" title="View Details & Prescription">
                    <span className="material-symbols-outlined text-lg">visibility</span>
                  </button>
                  {canProgressConsultation && appt.status !== 'cancelled' && appt.status !== 'completed' && (
                    <>
                      {(appt.status === 'scheduled' || appt.status === 'pending') && (
                        <button onClick={() => handleStatusChange(appt.id, 'confirmed')} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Confirm">
                          <span className="material-symbols-outlined text-lg">check_circle</span>
                        </button>
                      )}
                      {appt.status === 'confirmed' && (
                        <button onClick={() => handleStatusChange(appt.id, 'in-progress')} className="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Start">
                          <span className="material-symbols-outlined text-lg">play_circle</span>
                        </button>
                      )}
                      {appt.status === 'in-progress' && (
                        <button onClick={() => handleStatusChange(appt.id, 'completed')} className="p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Complete">
                          <span className="material-symbols-outlined text-lg">task_alt</span>
                        </button>
                      )}
                      <button onClick={() => openReschedule(appt)} className="p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Reschedule">
                        <span className="material-symbols-outlined text-lg">event_repeat</span>
                      </button>
                      <button onClick={() => { setCancelId(appt.id); setCancelReason(''); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancel">
                        <span className="material-symbols-outlined text-lg">cancel</span>
                      </button>
                    </>
                  )}
                  {appt.status === 'in-progress' && (
                    <button onClick={() => openPrescription(appt)} className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg" title="Write Prescription">
                      <span className="material-symbols-outlined text-lg">clinical_notes</span>
                    </button>
                  )}
                  {canCollectFee && appt.status === 'completed' && !appt.consultation_fee_collected && (
                    <button onClick={() => openCollectFee(appt)} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg" title="Collect Consultation Fee">
                      <span className="material-symbols-outlined text-lg">payments</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Appointment #', 'Patient', 'Doctor', 'Date & Time', 'Type', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(appt => (
                    <tr key={appt.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-primary">{appt.appointment_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{appt.patient_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{appt.doctor_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateOnly(appt.appointment_date, 'MMM d')}
                        <span className="text-slate-300 mx-1">·</span>
                        {formatTime(getApptTime(appt))}
                        {!appt.start_time && appt.check_in_at && <span className="ml-1 text-[10px] text-slate-400">(arrival)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${appt.appointment_type === 'walk-in' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                          {appt.appointment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3"><AppointmentStatusBadge status={appt.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setDetailAppt(appt); loadPrescriptionsForAppt(appt); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg" title="View Details & Prescription">
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                          {canProgressConsultation && appt.status !== 'cancelled' && appt.status !== 'completed' && (
                            <>
                              {(appt.status === 'scheduled' || appt.status === 'pending') && (
                                <button onClick={() => handleStatusChange(appt.id, 'confirmed')} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Confirm">
                                  <span className="material-symbols-outlined text-lg">check_circle</span>
                                </button>
                              )}
                              {appt.status === 'confirmed' && (
                                <button onClick={() => handleStatusChange(appt.id, 'in-progress')} className="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Start Consultation">
                                  <span className="material-symbols-outlined text-lg">play_circle</span>
                                </button>
                              )}
                              {appt.status === 'in-progress' && (
                                <button onClick={() => handleStatusChange(appt.id, 'completed')} className="p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Complete">
                                  <span className="material-symbols-outlined text-lg">task_alt</span>
                                </button>
                              )}
                              <button onClick={() => openReschedule(appt)} className="p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Reschedule">
                                <span className="material-symbols-outlined text-lg">event_repeat</span>
                              </button>
                              <button onClick={() => { setCancelId(appt.id); setCancelReason(''); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancel">
                                <span className="material-symbols-outlined text-lg">cancel</span>
                              </button>
                            </>
                          )}
                          {appt.status === 'in-progress' && (
                            <button onClick={() => openPrescription(appt)} className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg" title="Write Prescription">
                              <span className="material-symbols-outlined text-lg">clinical_notes</span>
                            </button>
                          )}
                          {canCollectFee && appt.status === 'completed' && !appt.consultation_fee_collected && (
                            <button onClick={() => openCollectFee(appt)} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg" title="Collect Consultation Fee">
                              <span className="material-symbols-outlined text-lg">payments</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal — Appointment + Prescription Viewer */}
      {detailAppt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailAppt(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Appointment Details</h3>
                <p className="text-xs text-slate-400">{detailAppt.appointment_number}</p>
              </div>
              <button onClick={() => setDetailAppt(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Appointment Summary */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  ['Patient', detailAppt.patient_name || '—'],
                  ['Doctor', detailAppt.doctor_name || '—'],
                  ['Date', formatDateOnly(detailAppt.appointment_date, 'MMM d, yyyy')],
                  [detailAppt.start_time ? 'Time' : 'Arrival', formatTime(getApptTime(detailAppt))],
                  ['Type', detailAppt.appointment_type],
                  ['Visit', detailAppt.visit_type || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                    <span className="text-slate-900 font-medium">{value}</span>
                  </div>
                ))}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                  <AppointmentStatusBadge status={detailAppt.status} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Consultation Fee</span>
                  <span className={`text-sm font-semibold ${detailAppt.consultation_fee_collected ? 'text-emerald-600' : 'text-red-500'}`}>
                    {detailAppt.consultation_fee_collected ? 'Collected ✓' : 'Pending'}
                  </span>
                </div>
              </div>
              {detailAppt.chief_complaint && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reason for Visit</span>
                  <p className="text-sm text-slate-700 mt-0.5">{detailAppt.chief_complaint}</p>
                </div>
              )}

              {/* Fee not collected warning */}
              {detailAppt.status === 'completed' && !detailAppt.consultation_fee_collected && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <span className="material-symbols-outlined text-amber-500 text-base mt-0.5 shrink-0">payments</span>
                  <div>
                    <p className="font-semibold">Consultation fee not collected</p>
                    <p className="text-xs text-amber-700 mt-0.5">Collect the consultation fee to enable prescription download and pharmacy dispensing.</p>
                  </div>
                </div>
              )}

              {/* Prescriptions Section */}
              {detailAppt.status === 'completed' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-primary text-base">clinical_notes</span>
                    <h4 className="font-bold text-slate-900 text-sm">Prescriptions</h4>
                  </div>

                  {viewRxLoading ? (
                    <div className="text-center py-6 text-slate-400">
                      <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
                      <p className="text-xs mt-1">Loading prescriptions…</p>
                    </div>
                  ) : viewRxs.length === 0 && viewOptRxs.length === 0 ? (
                    <div className="text-center py-5 bg-slate-50 rounded-xl border border-slate-200 text-slate-400">
                      <span className="material-symbols-outlined text-2xl">description</span>
                      <p className="text-xs mt-1">No prescriptions found for this visit</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Regular prescriptions */}
                      {viewRxs.map(rx => (
                        <div key={rx.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-primary">{rx.prescription_number}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rx.is_finalized ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {rx.is_finalized ? 'Finalized' : rx.status}
                                </span>
                              </div>
                              {rx.diagnosis && <p className="text-xs text-slate-700 font-medium">{rx.diagnosis}</p>}
                              <p className="text-[11px] text-slate-400 mt-0.5">{rx.item_count} medicine{rx.item_count !== 1 ? 's' : ''} · {rx.doctor_name || '—'}</p>
                            </div>
                            <button
                              onClick={() => printRx(rx.id)}
                              disabled={!detailAppt.consultation_fee_collected || printingId === rx.id}
                              title={!detailAppt.consultation_fee_collected ? 'Collect consultation fee first to print' : 'Print Prescription'}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-white hover:bg-primary/90"
                            >
                              <span className="material-symbols-outlined text-sm">
                                {printingId === rx.id ? 'progress_activity' : 'print'}
                              </span>
                              Print
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Optical prescriptions */}
                      {viewOptRxs.map(rx => (
                        <div key={rx.id} className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-blue-600">{rx.prescription_number}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Eye Prescription</span>
                                {rx.is_finalized && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Finalized</span>}
                              </div>
                              <p className="text-[11px] text-blue-600 mt-0.5">{rx.doctor_name || '—'}</p>
                            </div>
                            <button
                              onClick={() => printRx(rx.id, true)}
                              disabled={!detailAppt.consultation_fee_collected || printingId === rx.id}
                              title={!detailAppt.consultation_fee_collected ? 'Collect consultation fee first to print' : 'Print Eye Prescription'}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
                            >
                              <span className="material-symbols-outlined text-sm">
                                {printingId === rx.id ? 'progress_activity' : 'print'}
                              </span>
                              Print
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0">
              {detailAppt.status === 'in-progress' && (
                <button
                  onClick={() => { openPrescription(detailAppt); setDetailAppt(null); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-base">clinical_notes</span>
                  Write Prescription
                </button>
              )}
              {canCollectFee && detailAppt.status === 'completed' && !detailAppt.consultation_fee_collected && (
                <button
                  onClick={() => { openCollectFee(detailAppt); setDetailAppt(null); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-base">payments</span>
                  Collect Consultation Fee
                </button>
              )}
              <button onClick={() => setDetailAppt(null)} className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRescheduleId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Reschedule Appointment</h3>
            <p className="text-sm text-slate-500 mb-4">Pick a new date and time.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">New Date</label>
                <input type="date" value={rescheduleDate} min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleTime(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              {rescheduleDate && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Available Slots</label>
                  {rescheduleLoading ? (
                    <p className="text-xs text-slate-400">Loading slots...</p>
                  ) : rescheduleSlots.length === 0 ? (
                    <p className="text-xs text-slate-400">No slots available on this date</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                      {rescheduleSlots.filter(s => s.available).map(s => (
                        <button key={s.time} onClick={() => setRescheduleTime(s.time)}
                          className={`px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            rescheduleTime === s.time ? 'bg-primary text-white border-primary' : 'border-slate-200 text-slate-600 hover:border-primary'
                          }`}>
                          {(() => { const [h, m] = s.time.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setRescheduleId(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm disabled:opacity-50">Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCancelId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel Appointment</h3>
            <p className="text-sm text-slate-500 mb-4">This action cannot be undone.</p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              rows={3} placeholder="Reason for cancellation..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setCancelId(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Keep</button>
              <button onClick={handleCancel} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 shadow-sm">Cancel Appointment</button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Consultation Fee Modal */}
      {collectAppt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeCollectFee}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Collect Consultation Fee</h3>
              <button onClick={closeCollectFee} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><span className="material-symbols-outlined">close</span></button>
            </div>

            {collectLoading ? (
              <div className="py-8 text-center text-slate-400">
                <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                <p className="text-sm mt-2">Preparing consultation invoice...</p>
              </div>
            ) : collectInvoice ? (
              <>
                <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-slate-500">Appointment</span><span className="font-medium text-slate-900">{collectAppt.appointment_number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-medium text-slate-900">{collectAppt.patient_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Invoice</span><span className="font-medium text-slate-900">{collectInvoice.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Template</span><span className="font-medium text-slate-900">Consultation Fee</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-semibold text-slate-900">Rs {formatMoney(Number(collectInvoice.total_amount || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-semibold text-emerald-700">Rs {formatMoney(Number(collectInvoice.paid_amount || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className="font-bold text-red-600">Rs {formatMoney(Number(collectInvoice.balance_amount || 0))}</span></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                    <input
                      type="number"
                      min="0.01"
                      max={Number(collectInvoice.balance_amount || 0)}
                      step="0.01"
                      value={collectAmount || ''}
                      onChange={(e) => {
                        const balance = Number(collectInvoice.balance_amount || 0);
                        const raw = parseFloat(e.target.value) || 0;
                        setCollectAmount(Math.min(Math.max(0, raw), balance));
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      {collectAmount < Number(collectInvoice.balance_amount || 0)
                        ? `Partial payment — Rs ${formatMoney(Number(collectInvoice.balance_amount || 0) - collectAmount)} will remain after this`
                        : 'Defaults to the full outstanding balance — edit to record a partial payment'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Payment Mode</label>
                    <select
                      value={collectMode}
                      onChange={(e) => setCollectMode(e.target.value as PaymentMode)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    >
                      {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={collectDate}
                      onChange={(e) => setCollectDate(e.target.value)}
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Reference</label>
                    <input
                      type="text"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      placeholder="Txn / UPI / Card ref"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Collected By</label>
                    <select
                      value={collectCollectorId}
                      onChange={(e) => setCollectCollectorId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    >
                      {collectors.length === 0 && user && (
                        <option value={user.id}>{user.first_name} {user.last_name} (you)</option>
                      )}
                      {collectors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name}{c.id === user?.id ? ' (you)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={collectNotes}
                    onChange={(e) => setCollectNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={closeCollectFee} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>
                  <button
                    onClick={submitCollectFee}
                    disabled={collectSaving || Number(collectInvoice.balance_amount || 0) <= 0}
                    className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {collectSaving ? 'Recording...' : 'Record Payment'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentManagement;
