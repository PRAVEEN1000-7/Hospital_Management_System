import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import walkInService from '../services/walkInService';
import appointmentService from '../services/appointmentService';
import type { UnassignedWalkIn } from '../services/walkInService';
import scheduleService from '../services/scheduleService';
import type { QueueStatus as QueueStatusType, QueueItem, DoctorOption, Appointment } from '../types/appointment';
import AppointmentStatusBadge from '../components/appointments/AppointmentStatusBadge';
import AvailabilityCalendar from '../components/common/AvailabilityCalendar';
import { useDoctorMonthAvailability } from '../hooks/useDoctorMonthAvailability';
import { useVisiblePolling } from '../hooks/useVisiblePolling';
import { formatTimeOnly, formatDateOnly } from '../utils/calendarDate';
import { formatLocalDateISO, formatMonthKey } from '../utils/calendarDate';
import type { Patient } from '../types/patient';
import { canEdit } from '../config/modulePermissions';
import VerifiedBadge from '../components/patients/VerifiedBadge';
import invoiceService from '../services/invoiceService';
import paymentService from '../services/paymentService';
import type { Invoice, PaymentMode, PaymentCollector } from '../types/billing';
import SearchableSelect, { type SuggestionOption } from '../components/common/SearchableSelect';

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'insurance', label: 'Insurance' },
];

// ── Priority helpers ───────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  emergency: { label: 'Emergency', bg: 'bg-red-50',    text: 'text-red-700',    icon: 'emergency' },
  urgent:    { label: 'Urgent',    bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'priority_high' },
  normal:    { label: 'Normal',    bg: 'bg-slate-100',  text: 'text-slate-600',  icon: 'schedule' },
};

const QUEUE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  waiting:          { label: 'Waiting',         bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  called:           { label: 'Called',           bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  sent_to_doctor:   { label: 'Sent to Doctor',  bg: 'bg-teal-50',    text: 'text-teal-700',    dot: 'bg-teal-500' },
  in_consultation:  { label: 'In Consultation',  bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  completed:        { label: 'Completed',        bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  skipped:          { label: 'Skipped',          bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-400' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

// ── Main Component ─────────────────────────────────────────────────
const WalkInQueue: React.FC = () => {
  const { user, isEyeHospitalFeatureEnabled, isModuleEnabled } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const roles = user?.roles || [];
  const isDoctor = roles.includes('doctor');
  const isReception = roles.includes('receptionist');
  const isAdmin = roles.includes('admin') || roles.includes('super_admin');
  const isNurse = roles.includes('nurse');
  const canFilter = isReception || isAdmin;
  // Only doctors ever see this console at all, but a hospital admin can still
  // downgrade the "doctor" role to view-only on appt.queue_display via the
  // Roles & Permissions UI — canEdit() closes that gap so the clinical
  // action buttons (Call/Skip/Start/Complete/Refer) correctly disappear
  // instead of rendering controls that would just 403 on click.
  const canActOnQueue = isDoctor && canEdit('appt.queue_display', roles);
  // Vitals entry (nurse's pre-consultation flow, see NurseVitals.tsx) — the
  // Walk-in Queue button is restricted to the literal nurse role only, even
  // though rx.vitals also grants admin/doctor edit at the API level (kept
  // there for API-level consistency — a doctor still enters vitals directly
  // as part of the normal Prescription Builder consultation flow, and admin
  // needs no quick-entry button here at all). Checking isNurse directly
  // (not canEdit) is deliberate: canEdit('rx.vitals', roles) would also be
  // true for admin, which would put this action back in a non-nurse login.
  const canEnterVitals = isNurse && canEdit('rx.vitals', roles);
  // Optical entry (nurse's pre-consultation eye-exam measurements, see
  // NewOpticalPrescription.tsx) — same nurse-only restriction as
  // canEnterVitals above, for the same reason: "optical.exam" also grants
  // admin/doctor edit at the API level (doctor's own embedded "Add Optical"
  // section in Prescription Builder needs it), but this queue action must
  // only ever appear in a nurse login. Module-enabled + eye-hospital checks
  // match the Optical Store nav link's own gate (Layout.tsx's canAccessOptical).
  const canEnterOptical = isNurse && canEdit('optical.exam', roles) && isModuleEnabled('optical') && isEyeHospitalFeatureEnabled;
  const today = formatLocalDateISO();

  const [queueData, setQueueData] = useState<QueueStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [sendModalId, setSendModalId] = useState<string | null>(null);
  const [sendModalQueueId, setSendModalQueueId] = useState<string | null>(null);
  const [sendModalBookedDoctorId, setSendModalBookedDoctorId] = useState<string>('');
  const [sendModalPatientName, setSendModalPatientName] = useState<string>('');
  const [sendModalLocked, setSendModalLocked] = useState(false);
  const [sendDoctorId, setSendDoctorId] = useState<string>('');
  const [doctorLoads, setDoctorLoads] = useState<Record<string, number>>({});
  const [sendingInProgress, setSendingInProgress] = useState(false);
  const [detailItem, setDetailItem] = useState<QueueItem | null>(null);
  const [unassigned, setUnassigned] = useState<UnassignedWalkIn[]>([]);

  // ── Collect Consultation Fee (BRD 5.1) — same flow as
  // AppointmentManagement.tsx's Collect Fee modal, adapted to work off a
  // QueueItem instead of a full Appointment (Invoice already carries
  // patient_name/invoice_number, so no separate appointment fetch is needed).
  const [collectItem, setCollectItem] = useState<QueueItem | null>(null);
  const [collectInvoice, setCollectInvoice] = useState<Invoice | null>(null);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectSaving, setCollectSaving] = useState(false);
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMode, setCollectMode] = useState<PaymentMode>('cash');
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectDate, setCollectDate] = useState(formatLocalDateISO());
  const [collectors, setCollectors] = useState<PaymentCollector[]>([]);
  const [collectCollectorId, setCollectCollectorId] = useState('');
  const collectRequestRef = useRef(0);

  // ── Doctor View: Tab + Scheduled Appointments ─────────────────
  const [activeTab, setActiveTab] = useState<'queue' | 'scheduled' | 'completed' | 'upcoming'>('queue');
  const [scheduledAppts, setScheduledAppts] = useState<Appointment[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [notesModal, setNotesModal] = useState<{ id: string; notes: string } | null>(null);

  // ── Upcoming Queue State ──────────────────────────────────────
  const [upcomingData, setUpcomingData] = useState<Awaited<ReturnType<typeof walkInService.getUpcomingQueue>> | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingDays, setUpcomingDays] = useState<7 | 14 | 30>(7);
  const [upcomingDateFilter, setUpcomingDateFilter] = useState<string>('all');
  const [upcomingSearch, setUpcomingSearch] = useState<string>('');

  // ── Date Picker for browsing queue by date ────────────────────
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const isSelectedDateToday = selectedDate === today;

  // ── Book Next Appointment Modal State ─────────────────────────
  const [bookNextItem, setBookNextItem] = useState<QueueItem | null>(null);
  const [bookNextDate, setBookNextDate] = useState<string>('');
  const [bookNextTime, setBookNextTime] = useState<string>('');
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookCalendarMonth, setBookCalendarMonth] = useState<string>(formatMonthKey());

  // ── Refer to Doctor Modal State ───────────────────────────────
  const [referItem, setReferItem] = useState<QueueItem | null>(null);
  const [referDoctorId, setReferDoctorId] = useState<string>('');
  const [referDoctorLabel, setReferDoctorLabel] = useState('');
  const [referDate, setReferDate] = useState<string>('');
  const [referReason, setReferReason] = useState<string>('');
  const [referSaving, setReferSaving] = useState(false);
  const [allDoctors, setAllDoctors] = useState<DoctorOption[]>([]);
  const [referDoctorLoad, setReferDoctorLoad] = useState<number | null>(null);
  const [referCalendarMonth, setReferCalendarMonth] = useState<string>(formatMonthKey());

  // ── Reception View: Tab for New/Ongoing/Completed/Upcoming ─────────
  const [receptionTab, setReceptionTab] = useState<'new' | 'ongoing' | 'completed' | 'upcoming'>('new');
  const tomorrow = formatLocalDateISO(new Date(Date.now() + 86400000));

  const {
    availabilityMap: bookDateAvailability,
    loading: bookAvailabilityLoading,
    reset: resetBookAvailability,
  } = useDoctorMonthAvailability({
    doctorId: bookNextItem?.doctor_id,
    monthKey: bookCalendarMonth,
    minDateISO: tomorrow,
    enabled: !!bookNextItem?.doctor_id,
  });

  const {
    availabilityMap: referDateAvailability,
    loading: referAvailabilityLoading,
    reset: resetReferAvailability,
  } = useDoctorMonthAvailability({
    doctorId: referDoctorId,
    monthKey: referCalendarMonth,
    minDateISO: today,
    enabled: !!referItem && !!referDoctorId,
  });

  const fetchScheduledAppts = useCallback(async () => {
    if (!isDoctor || !user?.id) return;
    setScheduledLoading(true);
    try {
      // Always fetch TODAY's scheduled appointments for the doctor.
      // selectedDate controls the reception's queue date picker — do NOT use it
      // here, otherwise browsing a past queue date empties the scheduled tab.
      const data = await appointmentService.getDoctorToday(user.id, today);
      // Filter out walk-in types since those show in the queue tab
      setScheduledAppts(data.filter(a => a.appointment_type !== 'walk-in' && (a.appointment_type as string) !== 'walk_in'));
    } catch { /* silent */ }
    setScheduledLoading(false);
  }, [isDoctor, user?.id, today]);

  // ── Fetch unassigned walk-ins (reception/admin only) ──────────
  const fetchUnassigned = useCallback(async () => {
    if (!canFilter) return;
    if (!isSelectedDateToday) {
      setUnassigned([]);
      return;
    }
    try {
      const data = await walkInService.getUnassigned();
      setUnassigned(data.items);
    } catch { /* silent */ }
  }, [canFilter, isSelectedDateToday]);

  // ── Fetch queue ────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      // Doctor: backend auto-filters, no doctor_id needed
      // Reception/Admin: pass selected doctor filter
      const docId = isDoctor ? undefined : (filterDoctor || undefined);
      const dateParam = selectedDate || undefined;
      const data = await walkInService.getQueueStatus(docId, dateParam);
      setQueueData(data);
    } catch {
      toast.error('Failed to load queue');
    }
    setLoading(false);
  }, [filterDoctor, isDoctor, selectedDate]);

  // ── Fetch upcoming queue (doctor + reception) ─────────────────────
  const fetchUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    try {
      const data = await walkInService.getUpcomingQueue(upcomingDays);
      setUpcomingData(data);
    } catch { /* silent */ }
    setUpcomingLoading(false);
  }, [upcomingDays]);

  // Load doctor list for filter dropdown and send modal (reception/admin only)
  useEffect(() => {
    if (canFilter) {
      scheduleService.getDoctors().then(setDoctors).catch(() => {});
      walkInService.getDoctorLoads().then(setDoctorLoads).catch(() => {});
      fetchUnassigned();
    }
  }, [canFilter, fetchUnassigned]);

  // Refresh doctor waiting counts every time the Send to Doctor modal opens —
  // otherwise it shows whatever was fetched on page load (or after the last
  // send), which drifts stale as other patients are called/completed/sent in
  // the meantime, so the badge disagrees with the doctor's actual live queue.
  useEffect(() => {
    if (sendModalId) {
      walkInService.getDoctorLoads().then(setDoctorLoads).catch(() => {});
    }
  }, [sendModalId]);

  // Load doctor list for referral modal (doctor role)
  useEffect(() => {
    if (isDoctor) {
      scheduleService.getDoctors().then(setAllDoctors).catch(() => {});
    }
  }, [isDoctor]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  useEffect(() => { paymentService.getCollectors().then(setCollectors).catch(() => {}); }, []);

  const openCollectFee = async (item: QueueItem) => {
    const requestId = ++collectRequestRef.current;
    setCollectItem(item);
    setCollectLoading(true);
    try {
      const invoice = await invoiceService.getOrCreateConsultationInvoice(item.appointment_id);
      if (collectRequestRef.current !== requestId) return; // dialog closed/reopened since this fetch started
      setCollectInvoice(invoice);
      setCollectAmount(Number(invoice.balance_amount || 0));
      setCollectMode('cash');
      setCollectRef('');
      setCollectNotes('');
      setCollectDate(formatLocalDateISO());
      setCollectCollectorId(user?.id || '');
    } catch (err: any) {
      if (collectRequestRef.current !== requestId) return;
      toast.error(err?.response?.data?.detail || 'Failed to prepare consultation invoice');
      setCollectItem(null);
      setCollectInvoice(null);
    } finally {
      if (collectRequestRef.current === requestId) setCollectLoading(false);
    }
  };

  const closeCollectFee = () => {
    collectRequestRef.current++; // invalidate any in-flight invoice fetch
    setCollectItem(null);
    setCollectInvoice(null);
    setCollectLoading(false);
    setCollectSaving(false);
    setCollectAmount(0);
    setCollectMode('cash');
    setCollectRef('');
    setCollectNotes('');
    setCollectCollectorId('');
  };

  const submitCollectFee = async () => {
    if (!collectItem || !collectInvoice) return;
    if (collectInvoice.status === 'paid') {
      toast.info('Consultation invoice is already fully collected');
      closeCollectFee();
      return;
    }
    const balance = Number(collectInvoice.balance_amount || 0);
    const isFreeConsultation = balance <= 0;
    // A free (₹0-balance) consultation only ever accepts a ₹0 confirmation
    // payment, which is what moves it from "issued" to "paid" — see
    // payment_service.record_payment on the backend for the matching rule.
    if (isFreeConsultation) {
      if (collectAmount !== 0) {
        toast.error('This is a free consultation — nothing to collect');
        return;
      }
    } else if (collectAmount <= 0) {
      toast.error('Payment amount must be greater than zero');
      return;
    } else if (collectAmount > balance) {
      toast.error(`Amount cannot exceed balance (Rs ${collectInvoice.balance_amount})`);
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
        isFreeConsultation
          ? 'Free consultation confirmed — complete'
          : Number(refreshed.balance_amount || 0) <= 0
          ? 'Consultation fee fully collected'
          : 'Payment recorded (partial)'
      );
      fetchQueue();
      closeCollectFee();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setCollectSaving(false);
    }
  };

  // Fetch scheduled appointments for doctors
  useEffect(() => { fetchScheduledAppts(); }, [fetchScheduledAppts]);

  // Fetch upcoming on mount and when tab switches to upcoming
  useEffect(() => { fetchUpcoming(); }, [fetchUpcoming]);
  useEffect(() => {
    if (activeTab === 'upcoming' || receptionTab === 'upcoming') fetchUpcoming();
  }, [activeTab, receptionTab, fetchUpcoming]);

  // Auto-refresh every 15s — skips the fetch while this tab is backgrounded
  // (nobody's looking at stale data anyway) and fires one immediate refresh
  // the moment the tab regains focus, so new arrivals in the queue show up
  // right away instead of waiting up to 15s after switching back.
  useVisiblePolling(() => {
    fetchQueue();
    fetchUnassigned();
    fetchUpcoming();
    if (isDoctor) fetchScheduledAppts();
  }, 15000);

  // ── Queue actions ──────────────────────────────────────────────
  const handleCall = async (queueId: string) => {
    try {
      if (!isSelectedDateToday) {
        toast.error("Call action is allowed only for today's queue");
        return;
      }
      await walkInService.callPatient(queueId);
      toast.success('Patient called');
      fetchQueue();
    } catch { toast.error('Failed to call patient'); }
  };

  const handleStartConsultation = async (queueId: string) => {
    try {
      if (!isSelectedDateToday) {
        toast.error("Consultation can be started only for today's queue");
        return;
      }
      await walkInService.startConsultation(queueId);
      toast.success('Consultation started');
      fetchQueue();
      // Navigate to prescription builder in consultation mode
      const item = (queueData?.items || []).find(i => i.queue_id === queueId);
      if (item) {
        const params = new URLSearchParams({
          patient_id: item.patient_id || '',
          appointment_id: item.appointment_id || '',
          queue_id: item.queue_id,
        });
        navigate(`/prescriptions/new?${params.toString()}`);
      }
    } catch { toast.error('Failed to start consultation'); }
  };

  const handleEnterVitals = (item: QueueItem) => {
    const params = new URLSearchParams({
      patient_id: item.patient_id || '',
      appointment_id: item.appointment_id || '',
      queue_id: item.queue_id,
    });
    navigate(`/prescriptions/vitals/new?${params.toString()}`);
  };

  const handleEnterOptical = (item: QueueItem) => {
    const params = new URLSearchParams({
      patient_id: item.patient_id || '',
      appointment_id: item.appointment_id || '',
      queue_id: item.queue_id,
    });
    navigate(`/optical/prescriptions/new?${params.toString()}`);
  };

  const handleComplete = async (queueId: string) => {
    try {
      if (!isSelectedDateToday) {
        toast.error("Complete action is allowed only for today's queue");
        return;
      }
      await walkInService.completePatient(queueId);
      toast.success('Consultation completed');
      fetchQueue();
    } catch { toast.error('Failed to complete'); }
  };

  const handleSkip = async (queueId: string) => {
    try {
      if (!isSelectedDateToday) {
        toast.error("Skip action is allowed only for today's queue");
        return;
      }
      await walkInService.skipPatient(queueId);
      toast.success('Patient skipped');
      fetchQueue();
    } catch { toast.error('Failed to skip'); }
  };

  // ── Book Next Appointment Handler ────────────────────────────────
  const handleBookNextAppointment = async () => {
    if (!bookNextItem || !bookNextDate || !bookNextItem.patient_id || !bookNextItem.doctor_id) return;
    if (bookDateAvailability[bookNextDate] === false) {
      toast.error('No slot available on selected date. Please choose another date.');
      return;
    }
    setBookingSaving(true);
    try {
      await appointmentService.createAppointment({
        patient_id: bookNextItem.patient_id,
        doctor_id: bookNextItem.doctor_id,
        appointment_type: 'follow-up',
        visit_type: 'scheduled',
        appointment_date: bookNextDate,
        start_time: bookNextTime || undefined,
        chief_complaint: `Follow-up: ${bookNextItem.chief_complaint || 'General'}`,
        priority: 'normal',
      });
      toast.success('Follow-up appointment booked successfully');
      fetchUpcoming();
      closeBookNextModal();
    } catch {
      toast.error('Failed to book appointment');
    }
    setBookingSaving(false);
  };

  const openBookNextModal = (item: QueueItem) => {
    setBookNextItem(item);
    setBookNextDate('');
    setBookNextTime('');
    setBookCalendarMonth(tomorrow.slice(0, 7));
    resetBookAvailability();
  };

  const closeBookNextModal = () => {
    setBookNextItem(null);
    setBookNextDate('');
    setBookNextTime('');
    setBookCalendarMonth(tomorrow.slice(0, 7));
    resetBookAvailability();
  };

  // ── Refer to Doctor Handler ─────────────────────────────────────
  const handleReferToDoctor = async () => {
    if (!referItem || !referDoctorId || !referDate) return;
    setReferSaving(true);
    try {
      const result = await walkInService.referToDoctor({
        queue_id: referItem.queue_id,
        to_doctor_id: referDoctorId,
        referral_date: referDate,
        referral_reason: referReason || undefined,
      });
      toast.success(result.message);
      setReferItem(null);
      setReferDoctorId('');
      setReferDoctorLabel('');
      setReferDate('');
      setReferReason('');
      setReferDoctorLoad(null);
      fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to refer patient');
    }
    setReferSaving(false);
  };

  const openReferModal = (item: QueueItem) => {
    setReferItem(item);
    setReferDoctorId('');
    setReferDoctorLabel('');
    setReferDate('');
    setReferReason('');
    setReferDoctorLoad(null);
    setReferCalendarMonth(today.slice(0, 7));
    resetReferAvailability();
  };

  const closeReferModal = () => {
    setReferItem(null);
    setReferDoctorId('');
    setReferDoctorLabel('');
    setReferDate('');
    setReferReason('');
    setReferDoctorLoad(null);
    setReferCalendarMonth(today.slice(0, 7));
    resetReferAvailability();
  };

  // ── Fetch doctor load for referral warning ─────────────────────
  useEffect(() => {
    if (!referDoctorId || !referDate) { setReferDoctorLoad(null); return; }
    let cancelled = false;
    walkInService.getDoctorLoads(referDate).then(loads => {
      if (cancelled) return;
      setReferDoctorLoad(loads[referDoctorId] ?? 0);
    }).catch(() => { if (!cancelled) setReferDoctorLoad(null); });
    return () => { cancelled = true; };
  }, [referDoctorId, referDate]);

  const isSelectedReferralDateUnavailable = referDate ? referDateAvailability[referDate] === false : false;

  const referDoctorSuggestions: SuggestionOption[] = allDoctors
    .filter(d => d.doctor_id !== referItem?.doctor_id)
    .map(d => ({
      id: d.doctor_id,
      label: d.name,
      sublabel: d.specialization || undefined,
      metadata: { id: d.doctor_id },
    }));
  const handleReferDoctorSelect = (value: string, metadata?: Record<string, unknown>) => {
    setReferDoctorLabel(value);
    setReferDoctorId(metadata?.id ? (metadata.id as string) : '');
  };
  const isSelectedFollowUpDateUnavailable = bookNextDate ? bookDateAvailability[bookNextDate] === false : false;

  // ── Scheduled Appointment Actions (doctor view) ────────────────
  const handleScheduledStatusChange = async (id: string, newStatus: string) => {
    try {
      await appointmentService.updateStatus(id, newStatus);
      toast.success(`Status updated to ${newStatus}`);
      fetchScheduledAppts();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update');
    }
  };

  const handleSaveScheduledNotes = async () => {
    if (!notesModal) return;
    try {
      await appointmentService.updateAppointment(notesModal.id, { doctor_notes: notesModal.notes });
      toast.success('Notes saved');
      setNotesModal(null);
      fetchScheduledAppts();
    } catch {
      toast.error('Failed to save notes');
    }
  };

  const formatTime = (t?: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const handleSendToDoctor = async () => {
    if (!sendModalId || !sendDoctorId) return;
    setSendingInProgress(true);
    try {
      const docName = doctors.find(d => d.doctor_id === sendDoctorId)?.name || 'doctor';
      const isSameAsBooked = !!sendModalQueueId && !!sendModalBookedDoctorId && sendDoctorId === sendModalBookedDoctorId;

      if (isSameAsBooked && sendModalQueueId) {
        await walkInService.sendPatientToDoctor(sendModalQueueId);
        toast.success(`Patient sent to ${docName}'s queue`);
      } else {
        const result = await walkInService.sendToDoctor(sendModalId, sendDoctorId);
        const token = (result as any).queue_number;
        toast.success(`Patient sent to ${docName}'s queue${token ? ` (Token #${token})` : ''}`);
      }

      setSendModalId(null);
      setSendModalQueueId(null);
      setSendModalBookedDoctorId('');
      setSendDoctorId('');
      setSendModalPatientName('');
      setSendModalLocked(false);
      // Refresh doctor loads + queue + unassigned
      walkInService.getDoctorLoads().then(setDoctorLoads).catch(() => {});
      fetchQueue();
      fetchUnassigned();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to send patient');
    }
    setSendingInProgress(false);
  };

  // ── Send patient already in queue to doctor's NEXT UP ──────────
  const handleSendPatientToDoctor = async (queueId: string, patientName: string) => {
    try {
      if (!isSelectedDateToday) {
        toast.error("Send action is allowed only for today's queue");
        return;
      }
      await walkInService.sendPatientToDoctor(queueId);
      toast.success(`${patientName} sent to doctor's queue`);
      fetchQueue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to send patient');
    }
  };

  // ── Derived data ───────────────────────────────────────────────
  const activeItems = (queueData?.items || []).filter(
    i => !['completed', 'skipped'].includes(i.status),
  );
  const completedItems = (queueData?.items || []).filter(
    i => ['completed', 'skipped'].includes(i.status),
  );
  // Always show active items first, then completed/skipped at the bottom
  const displayItems = [...activeItems, ...completedItems];

  // ── Reception Tabs Derived Data ────────────────────────────────
  // New: waiting patients + called patients + sent_to_doctor (called = highlighted, waiting for reception to send)
  const receptionNewItems = (queueData?.items || []).filter(i => ['waiting', 'called', 'sent_to_doctor'].includes(i.status));
  // Ongoing: only in consultation (doctor has started consultation)
  const receptionOngoingItems = (queueData?.items || []).filter(i => i.status === 'in_consultation');
  // Completed: finished consultations
  const receptionCompletedItems = (queueData?.items || []).filter(i => ['completed', 'skipped'].includes(i.status));

  // Get display items based on reception tab
  const getReceptionDisplayItems = () => {
    switch (receptionTab) {
      case 'new': return receptionNewItems;
      case 'ongoing': return receptionOngoingItems;
      case 'completed': return receptionCompletedItems;
      default: return displayItems;
    }
  };

  /** Check if an item was completed within the last 60 seconds */
  const isRecentlyCompleted = (item: QueueItem): boolean => {
    if (item.status !== 'completed' || !item.consultation_end_at) return false;
    return Date.now() - new Date(item.consultation_end_at).getTime() < 60000;
  };

  const upcomingDateGroups = upcomingData?.date_groups || [];
  const normalizedUpcomingSearch = upcomingSearch.trim().toLowerCase();
  const filteredUpcomingDateGroups = upcomingDateGroups
    .filter(group => upcomingDateFilter === 'all' || group.date === upcomingDateFilter)
    .map(group => {
      const items = normalizedUpcomingSearch
        ? group.items.filter(item =>
            (item.patient_name || '').toLowerCase().includes(normalizedUpcomingSearch) ||
            (item.patient_reference_number || '').toLowerCase().includes(normalizedUpcomingSearch) ||
            (item.chief_complaint || '').toLowerCase().includes(normalizedUpcomingSearch),
          )
        : group.items;

      return {
        ...group,
        count: items.length,
        items,
      };
    })
    .filter(group => group.items.length > 0);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isDoctor
              ? (selectedDate && selectedDate !== today
                ? `Patients — ${new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                : 'Today Patients')
              : 'Walk-in Queue'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isDoctor
              ? 'All your patients — walk-ins & scheduled appointments'
              : 'Real-time walk-in queue — sorted by urgency (auto-refreshes every 15s)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* BRD-004: direct link into OPD Assignment from the Walk-in Queue
              page, instead of only being reachable via the sidebar — cuts the
              navigation gap between the two screens. Reception-only; doctors
              don't register walk-ins. */}
          {!isDoctor && (
            <button onClick={() => navigate('/appointments/walk-in')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-lg">person_add</span> New Walk-in
            </button>
          )}
          {/* Date Picker — browse queue for any date */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setLoading(true); }}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-[150px]"
              title="Browse queue by date"
            />
          </div>
          {selectedDate && selectedDate !== today && (
            <button onClick={() => { setSelectedDate(today); setLoading(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-sm">today</span> Back to Today
            </button>
          )}
          <button onClick={() => { setLoading(true); fetchQueue(); if (isDoctor) fetchScheduledAppts(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-lg">refresh</span> Refresh
          </button>
        </div>
      </div>

      {!isSelectedDateToday && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          Viewing {new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} queue in read-only mode. Call/Send/Consultation actions are available only for today.
        </div>
      )}

      {/* Stats Cards */}
      {queueData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'In Queue', value: queueData.total_waiting, icon: 'hourglass_top', color: 'text-amber-500', bg: 'bg-amber-50' },
            { label: 'In Progress', value: queueData.total_in_progress, icon: 'clinical_notes', color: 'text-purple-500', bg: 'bg-purple-50' },
            { label: 'Completed', value: queueData.total_completed, icon: 'task_alt', color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'Total Active', value: activeItems.length, icon: 'groups', color: 'text-blue-500', bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
                <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}>
                  <span className={`material-symbols-outlined text-lg ${s.color}`}>{s.icon}</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Doctor View Tabs */}
      {isDoctor && (
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
          <button onClick={() => setActiveTab('queue')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'queue' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">queue</span>
            Walk-in Queue
            {queueData && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'queue' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{activeItems.length}</span>}
          </button>
          <button onClick={() => setActiveTab('scheduled')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'scheduled' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">calendar_month</span>
            Scheduled
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'scheduled' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{scheduledAppts.length}</span>
          </button>
          <button onClick={() => setActiveTab('completed')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'completed' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">task_alt</span>
            Completed
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'completed' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>{completedItems.length}</span>
          </button>
          <button onClick={() => setActiveTab('upcoming')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'upcoming' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">event_upcoming</span>
            Upcoming
            {upcomingData && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'upcoming' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>{upcomingData.total_upcoming}</span>}
          </button>
        </div>
      )}

      {/* ── Doctor Queue View — Card-based efficient layout ────────── */}
      {isDoctor && activeTab === 'queue' && (
        <>
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No patients waiting</p>
              <p className="text-xs mt-1">Patients will appear here when sent by reception</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Patient — In Consultation */}
              {(() => {
                const currentPatient = activeItems.find(i => i.status === 'in_consultation');
                if (!currentPatient) return null;
                const pri = PRIORITY_CONFIG[currentPatient.priority] || PRIORITY_CONFIG.normal;
                return (
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100/50 rounded-2xl border-2 border-purple-200 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-purple-600">clinical_notes</span>
                      <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Current Patient — In Consultation</span>
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 bg-purple-200 rounded-xl flex items-center justify-center text-xl font-bold text-purple-700 shrink-0">
                          {currentPatient.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-bold text-slate-900 truncate">{currentPatient.patient_name || 'Unknown'}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {currentPatient.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">PRN: {currentPatient.patient_reference_number}</span>
                            )}
                            {currentPatient.patient_gender && (
                              <span className="text-sm text-slate-600 font-medium capitalize">{currentPatient.patient_gender}</span>
                            )}
                            {currentPatient.patient_age != null && (
                              <span className="text-sm text-slate-600 font-medium">{currentPatient.patient_age} years</span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{pri.icon}</span>
                              {pri.label}
                            </span>
                            {currentPatient.is_specialist_assignment && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary" title="Locked to this doctor — cannot be reassigned or referred">
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>lock</span>
                                Specialist
                              </span>
                            )}
                          </div>
                          {currentPatient.chief_complaint && (
                            <p className="text-sm text-slate-600 mt-2 bg-white/60 rounded-lg px-3 py-1.5 inline-block">
                              <span className="font-medium text-slate-500">Complaint:</span> {currentPatient.chief_complaint}
                            </p>
                          )}
                          {currentPatient.appointment_type === 'referral' && (
                            <p className="text-sm text-orange-700 mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 inline-flex items-start gap-1.5 max-w-full">
                              <span className="material-symbols-outlined shrink-0" style={{ fontSize: 15 }}>forward_to_inbox</span>
                              <span className="truncate">
                                {currentPatient.referring_doctor_name ? `From ${currentPatient.referring_doctor_name}` : 'Referred patient'}
                                {currentPatient.referral_notes ? ` — ${currentPatient.referral_notes}` : ''}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(currentPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Patient Info
                        </button>
                        <button onClick={() => {
                          const params = new URLSearchParams({
                            patient_id: currentPatient.patient_id || '',
                            appointment_id: currentPatient.appointment_id || '',
                            queue_id: currentPatient.queue_id,
                          });
                          navigate(`/prescriptions/new?${params.toString()}`);
                        }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-purple-700 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">edit_note</span>
                          Consultation
                        </button>
                        <button onClick={() => openBookNextModal(currentPatient)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">event_upcoming</span>
                          Book Follow-up
                        </button>
                        {canActOnQueue && !currentPatient.is_specialist_assignment && (
                          <button onClick={() => openReferModal(currentPatient)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-orange-700 bg-white border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">
                            <span className="material-symbols-outlined text-sm">send</span>
                            Refer to Doctor
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Called Patient — Waiting for Reception to Send */}
              {(() => {
                const calledPatient = activeItems.find(i => i.status === 'called');
                if (!calledPatient) return null;
                const pri = PRIORITY_CONFIG[calledPatient.priority] || PRIORITY_CONFIG.normal;
                return (
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 rounded-2xl border-2 border-blue-200 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-blue-600 animate-pulse">campaign</span>
                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Called — Waiting for Reception</span>
                      <span className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-semibold animate-pulse">Pending Send</span>
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 bg-blue-200 rounded-xl flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
                          {calledPatient.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-bold text-slate-900 truncate">{calledPatient.patient_name || 'Unknown'}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {calledPatient.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">PRN: {calledPatient.patient_reference_number}</span>
                            )}
                            {calledPatient.patient_gender && (
                              <span className="text-sm text-slate-600 font-medium capitalize">{calledPatient.patient_gender}</span>
                            )}
                            {calledPatient.patient_age != null && (
                              <span className="text-sm text-slate-600 font-medium">{calledPatient.patient_age}y</span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                              {pri.label}
                            </span>
                            {calledPatient.is_specialist_assignment && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary" title="Locked to this doctor — cannot be reassigned or referred">
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>lock</span>
                                Specialist
                              </span>
                            )}
                          </div>
                          {calledPatient.chief_complaint && (
                            <p className="text-sm text-slate-600 mt-2">{calledPatient.chief_complaint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(calledPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Info
                        </button>
                        {canActOnQueue && (
                          <button onClick={() => handleSkip(calledPatient.queue_id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="No Show">
                            <span className="material-symbols-outlined text-lg">person_off</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Next Up — Sent by Reception (only sent_to_doctor patients) */}
              {(() => {
                const sentPatients = activeItems.filter(i => i.status === 'sent_to_doctor');
                const nextPatient = sentPatients[0];
                if (!nextPatient) return null;
                const pri = PRIORITY_CONFIG[nextPatient.priority] || PRIORITY_CONFIG.normal;
                const hasCalledOrConsulting = activeItems.some(i => i.status === 'called' || i.status === 'in_consultation');
                return (
                  <div className={`bg-white rounded-xl border-2 p-5 ${hasCalledOrConsulting ? 'border-slate-200' : 'border-teal-300 bg-teal-50/30'}`}>
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`material-symbols-outlined ${hasCalledOrConsulting ? 'text-slate-500' : 'text-teal-600'}`}>send</span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${hasCalledOrConsulting ? 'text-slate-500' : 'text-teal-700'}`}>
                        Next Up {sentPatients.length > 1 ? `(+${sentPatients.length - 1} ready)` : ''}
                      </span>
                      <span className="text-[10px] text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full font-semibold">Sent by Reception</span>
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${
                          nextPatient.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                          nextPatient.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>
                          {nextPatient.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900">{nextPatient.patient_name || 'Unknown'}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {nextPatient.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">PRN: {nextPatient.patient_reference_number}</span>
                            )}
                            {nextPatient.patient_gender && (
                              <span className="text-sm text-slate-500 font-medium capitalize">{nextPatient.patient_gender}</span>
                            )}
                            {nextPatient.patient_age != null && (
                              <span className="text-sm text-slate-500 font-medium">{nextPatient.patient_age}y</span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                              {pri.label}
                            </span>
                            {nextPatient.is_specialist_assignment && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary" title="Locked to this doctor — cannot be reassigned or referred">
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>lock</span>
                                Specialist
                              </span>
                            )}
                            <span className="text-xs text-slate-400">• {timeAgo(nextPatient.check_in_at)}</span>
                          </div>
                          {nextPatient.chief_complaint && (
                            <p className="text-sm text-slate-500 mt-1 truncate">{nextPatient.chief_complaint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(nextPatient)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Info
                        </button>
                        {canActOnQueue && (
                          <button onClick={() => handleStartConsultation(nextPatient.queue_id)}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors shadow-sm">
                            <span className="material-symbols-outlined text-base">clinical_notes</span>
                            Start Consultation
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Remaining Waiting Queue — Patients waiting for reception to send */}
              {(() => {
                const waitingPatients = activeItems.filter(i => i.status === 'waiting' || i.status === 'called');
                if (waitingPatients.length === 0) return null;
                return (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500 text-sm">hourglass_top</span>
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                          Waiting ({waitingPatients.length})
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-600 mt-0.5">You can start consultation directly or wait for reception to send them</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {waitingPatients.map(item => {
                        const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                        const isCalled = item.status === 'called';
                        return (
                          <div key={item.queue_id} className={`flex items-center gap-3 px-4 py-3 ${
                            isCalled ? 'bg-blue-50/50' :
                            item.priority === 'emergency' ? 'bg-red-50/30' :
                            item.priority === 'urgent' ? 'bg-amber-50/20' : ''
                          }`}>
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                              isCalled ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' :
                              item.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                              item.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {item.queue_number}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-900">{item.patient_name || 'Unknown'}</p>
                                {isCalled && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Called</span>
                                )}
                                {item.patient_reference_number && (
                                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">PRN: {item.patient_reference_number}</span>
                                )}
                                {item.is_specialist_assignment && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary" title="Locked to this doctor — cannot be reassigned or referred">
                                    <span className="material-symbols-outlined" style={{ fontSize: 10 }}>lock</span>
                                    Specialist
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.patient_gender && <span className="text-xs text-slate-500 font-medium capitalize">{item.patient_gender}</span>}
                                {item.patient_age != null && <span className="text-xs text-slate-500 font-medium">{item.patient_age}y</span>}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                                <span className="text-xs text-slate-400">{timeAgo(item.check_in_at)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {canActOnQueue && !isCalled && isSelectedDateToday && (
                                <button onClick={() => handleCall(item.queue_id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-sm">campaign</span>
                                  Call
                                </button>
                              )}
                              {canActOnQueue && isSelectedDateToday && (
                                <button onClick={() => handleStartConsultation(item.queue_id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-sm">clinical_notes</span>
                                  Start
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Completed Today — Collapsible section */}
              {/* {completedItems.length > 0 && (
                <details className="bg-white rounded-xl border border-slate-200 overflow-hidden group">
                  <summary className="px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Completed Today ({completedItems.length})
                    </span>
                    <span className="material-symbols-outlined text-slate-400 text-sm group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <div className="divide-y divide-slate-100">
                    {completedItems.map(item => (
                      <div key={item.queue_id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                        <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-xs font-bold text-emerald-600">
                          {item.queue_number}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 truncate">{item.patient_name || 'Unknown'}</p>
                        </div>
                        <span className="text-[10px] text-emerald-600 font-medium">{item.status === 'completed' ? 'Completed' : 'Skipped'}</span>
                        <button onClick={() => setDetailItem(item)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded" title="View">
                          <span className="material-symbols-outlined text-base">visibility</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )} */}
            </div>
          )}
        </>
      )}

      {/* ── Reception/Admin Queue View — Table layout ────────────── */}
      {!isDoctor && (<>
      {/* Reception Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setReceptionTab('new')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'new' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">hourglass_top</span>
            Waiting
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'new' ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>
              {receptionNewItems.length + unassigned.length}
            </span>
          </button>
          <button onClick={() => setReceptionTab('ongoing')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'ongoing' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">clinical_notes</span>
            In Consultation
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'ongoing' ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-500'}`}>
              {receptionOngoingItems.length}
            </span>
          </button>
          <button onClick={() => setReceptionTab('completed')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'completed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">task_alt</span>
            Completed
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
              {receptionCompletedItems.length}
            </span>
          </button>
          <button onClick={() => setReceptionTab('upcoming')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              receptionTab === 'upcoming' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="material-symbols-outlined text-lg">event_upcoming</span>
            Upcoming
            {upcomingData && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${receptionTab === 'upcoming' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>{upcomingData.total_upcoming}</span>}
          </button>
        </div>
        {/* Doctor Filter */}
        {canFilter && (
          <select value={filterDoctor} onChange={(e) => { setFilterDoctor(e.target.value); setLoading(true); }}
            className="w-full sm:w-64 px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
            <option value="">All Doctors</option>
            {doctors.map(d => (
              <option key={d.doctor_id} value={d.doctor_id}>
                {d.name}{d.specialization ? ` — ${d.specialization}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Unassigned Walk-ins — only show in New tab */}
      {canFilter && isSelectedDateToday && unassigned.length > 0 && receptionTab === 'new' && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-orange-500">warning</span>
            <h3 className="text-sm font-bold text-orange-800">
              Unassigned Patients ({unassigned.length})
            </h3>
            <span className="text-xs text-orange-600">— No doctor assigned yet, route them to a queue</span>
          </div>
          <div className="space-y-2">
            {unassigned.map(item => {
              const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
              return (
                <div key={item.appointment_id}
                  className={`flex items-center justify-between gap-3 bg-white rounded-lg border border-orange-100 px-4 py-3 ${
                    item.priority === 'emergency' ? 'ring-1 ring-red-200' :
                    item.priority === 'urgent' ? 'ring-1 ring-amber-200' : ''
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-500">
                      {(item.patient_name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.patient_name || 'Unknown Patient'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.patient_reference_number && (
                          <span className="text-xs font-mono text-slate-500">PRN: {item.patient_reference_number}</span>
                        )}
                        {item.patient_gender && (
                          <span className="text-xs text-slate-500 font-medium capitalize">{item.patient_gender}</span>
                        )}
                        {item.patient_age != null && (
                          <span className="text-xs text-slate-500 font-medium">{item.patient_age}y</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{pri.icon}</span>
                      {pri.label}
                    </span>
                    {item.chief_complaint && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={item.chief_complaint}>
                        {item.chief_complaint}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{timeAgo(item.check_in_at)}</span>
                    <button
                      onClick={() => {
                        setSendModalId(item.appointment_id);
                        setSendModalQueueId(null);
                        setSendModalBookedDoctorId('');
                        setSendDoctorId('');
                        setSendModalPatientName(item.patient_name || 'Patient');
                        setSendModalLocked(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-white bg-orange-500 hover:bg-orange-600 hover:scale-105 active:scale-95 rounded-lg transition-all shadow-sm"
                      title="Send to Doctor">
                      <span className="material-symbols-outlined text-lg">send</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reception Upcoming View ── */}
      {receptionTab === 'upcoming' && (
        <div>
          {upcomingLoading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : filteredUpcomingDateGroups.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No upcoming patients found</p>
              <p className="text-xs mt-1">Try changing date range or clearing filters</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredUpcomingDateGroups.map(group => {
                const groupDate = new Date(group.date + 'T00:00');
                const dayLabel = groupDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={group.date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                          <span className="material-symbols-outlined text-orange-600 text-sm">calendar_today</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{dayLabel}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{group.count} patient{group.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedDate(group.date); setReceptionTab('new'); setLoading(true); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        View Queue
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-5 py-2">#</th>
                            <th className="px-4 py-2">Time</th>
                            <th className="px-4 py-2">Patient</th>
                            <th className="px-4 py-2">Doctor / Referral</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Priority</th>
                            <th className="px-4 py-2">Complaint</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.items.map(item => {
                            const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                            const typeConfig: Record<string, { label: string; bg: string; text: string }> = {
                              referral: { label: 'Referral', bg: 'bg-orange-100', text: 'text-orange-700' },
                              'follow-up': { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                              follow_up: { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                              scheduled: { label: 'Scheduled', bg: 'bg-green-100', text: 'text-green-700' },
                              'walk-in': { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                              walk_in: { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                            };
                            const apptType = typeConfig[item.appointment_type] || { label: item.appointment_type, bg: 'bg-slate-100', text: 'text-slate-600' };
                            return (
                              <tr key={item.queue_id} className="hover:bg-slate-50/50">
                                <td className="px-5 py-2.5 text-sm font-bold text-slate-400">{item.queue_number}</td>
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
                                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>schedule</span>
                                    {formatTime(item.start_time || undefined)}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-sm font-semibold text-slate-900">{item.patient_name || 'Unknown'}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.patient_reference_number && <span className="text-[10px] font-mono text-slate-400">PRN: {item.patient_reference_number}</span>}
                                    {item.patient_gender && <span className="text-[10px] text-slate-400 capitalize">{item.patient_gender}</span>}
                                    {item.patient_age != null && <span className="text-[10px] text-slate-400">{item.patient_age}y</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-sm text-slate-700">{item.doctor_name || '—'}</p>
                                  {item.appointment_type === 'referral' && item.referring_doctor_name && (
                                    <p className="text-[10px] text-orange-600 flex items-center gap-0.5 mt-0.5">
                                      <span className="material-symbols-outlined" style={{ fontSize: 10 }}>person</span>
                                      Ref: {item.referring_doctor_name}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${apptType.bg} ${apptType.text}`}>{apptType.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-xs text-slate-500 truncate max-w-[200px]" title={item.chief_complaint || ''}>
                                    {item.chief_complaint || <span className="text-slate-300">—</span>}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Queue Table */}
      {receptionTab !== 'upcoming' && (loading ? (
        <div className="text-center py-20 text-slate-400">
          <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
        </div>
      ) : getReceptionDisplayItems().length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-5xl mb-3 block">
            {receptionTab === 'new' ? 'hourglass_empty' : receptionTab === 'ongoing' ? 'clinical_notes' : 'task_alt'}
          </span>
          <p className="text-sm font-medium">
            {receptionTab === 'new' ? 'No patients waiting or called' : 
             receptionTab === 'ongoing' ? 'No ongoing consultations' : 
             'No completed consultations today'}
          </p>
          <p className="text-xs mt-1">
            {receptionTab === 'new' ? 'Waiting & doctor-called patients appear here' : 
             receptionTab === 'ongoing' ? 'Patients in consultation appear here' : 
             'Completed patients will appear here'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-14">Token</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-36">Doctor</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-36">Complaint</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Priority</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">Status</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">
                    {receptionTab === 'completed' ? 'Completed' : 'Wait'}
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {getReceptionDisplayItems().map((item) => {
                  const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                  const qs = QUEUE_STATUS_CONFIG[item.status] || QUEUE_STATUS_CONFIG.waiting;
                  const recentComplete = isRecentlyCompleted(item);
                  const isCalled = item.status === 'called';
                  const isInConsultation = item.status === 'in_consultation';
                  const isSentToDoctor = item.status === 'sent_to_doctor';
                  const isCompleted = ['completed', 'skipped'].includes(item.status);
                  return (
                    <tr key={item.queue_id}
                      className={`border-b border-slate-100 transition-colors ${
                        isInConsultation ? 'bg-purple-50/50' :
                        isCalled ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset animate-pulse' :
                        isSentToDoctor ? 'bg-teal-50/40' :
                        recentComplete ? 'bg-emerald-50/50 animate-pulse' :
                        isCompleted && receptionTab === 'completed' ? 'hover:bg-slate-50/50' :
                        item.priority === 'emergency' ? 'bg-red-50/30' :
                        item.priority === 'urgent' ? 'bg-amber-50/20' : 'hover:bg-slate-50/50'
                      }`}>
                      {/* Token / Queue Number */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                          isCalled ? 'bg-blue-500 text-white ring-2 ring-blue-300' :
                          isSentToDoctor ? 'bg-teal-100 text-teal-700' :
                          isCompleted ? 'bg-emerald-100 text-emerald-700' :
                          item.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                          item.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {item.queue_number}
                        </span>
                      </td>

                      {/* Patient */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailItem(item)}
                          className="text-left hover:bg-slate-50 rounded-lg -m-1 p-1 transition-colors group w-full min-w-0"
                        >
                          <p className="font-semibold text-slate-900 group-hover:text-primary transition-colors truncate">
                            {item.patient_name || '—'}
                          </p>
                          {/* Wraps onto a second line on a narrow viewport instead of
                              forcing the cell (and the whole table) wider — PRN, gender,
                              and age just flow to fill whatever space is actually there. */}
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {item.patient_reference_number && (
                              <span className="text-[11px] font-mono text-slate-400">
                                {item.patient_reference_number}
                              </span>
                            )}
                            {item.patient_gender && (
                              <span className="text-[11px] text-slate-400 capitalize">{item.patient_gender}</span>
                            )}
                            {item.patient_age != null && (
                              <span className="text-[11px] text-slate-400">{item.patient_age}y</span>
                            )}
                          </div>
                        </button>
                      </td>

                      {/* Doctor — separate column, own truncation, so a long doctor
                          name can never push this row (and the table) wider than the
                          viewport the way it did sharing a cell with Patient. */}
                      <td className="px-4 py-3">
                        {item.doctor_name ? (
                          <div className="flex items-center gap-1.5 min-w-0" title={item.doctor_name}>
                            <span className="material-symbols-outlined text-slate-400 shrink-0" style={{ fontSize: 14 }}>stethoscope</span>
                            <span className="text-xs text-slate-600 font-medium truncate">{item.doctor_name}</span>
                            {item.is_specialist_assignment && (
                              <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: 14 }} title="Specialist Assignment — locked to this doctor">lock</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Complaint */}
                      <td className="px-4 py-3">
                        <p className="text-slate-600 text-sm truncate max-w-[140px]" title={item.chief_complaint || ''}>
                          {item.chief_complaint || <span className="text-slate-300">—</span>}
                        </p>
                      </td>

                      {/* Priority Badge */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.bg} ${pri.text}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{pri.icon}</span>
                          {pri.label}
                        </span>
                      </td>

                      {/* Queue Status */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${qs.bg} ${qs.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${qs.dot}`}></span>
                          {qs.label}
                        </span>
                      </td>

                      {/* Wait Time / Completed Time */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-slate-500">
                          {receptionTab === 'completed' && item.consultation_end_at
                            ? formatTimeOnly(item.consultation_end_at)
                            : timeAgo(item.check_in_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Send to Doctor: for reception/admin on waiting OR called items */}
                          {canFilter && isSelectedDateToday && (item.status === 'waiting' || item.status === 'called') && item.doctor_id && (
                            <button onClick={() => {
                              setSendModalId(item.appointment_id);
                              setSendModalQueueId(item.queue_id);
                              setSendModalBookedDoctorId(item.doctor_id || '');
                              setSendDoctorId(item.doctor_id || '');
                              setSendModalPatientName(item.patient_name || 'Patient');
                              setSendModalLocked(!!item.is_specialist_assignment);
                            }}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-sm text-xs font-semibold ${
                                isCalled 
                                  ? 'bg-blue-500 text-white ring-2 ring-blue-300 animate-pulse' 
                                  : 'bg-primary text-white hover:bg-primary/90'
                              }`}
                              title={isCalled ? 'Doctor Called — Send Now!' : 'Send to Doctor'}>
                              <span className="material-symbols-outlined text-base">send</span>
                              {isCalled ? 'Send Now' : 'Send'}
                            </button>
                          )}
                          {/* Assign doctor: for unassigned items */}
                          {canFilter && isSelectedDateToday && (item.status === 'waiting' || item.status === 'called') && !item.doctor_id && (
                            <button onClick={() => {
                              setSendModalId(item.appointment_id);
                              setSendModalQueueId(null);
                              setSendModalBookedDoctorId('');
                              setSendDoctorId('');
                              setSendModalPatientName(item.patient_name || 'Patient');
                              setSendModalLocked(false);
                            }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 hover:scale-105 active:scale-95 transition-all shadow-sm text-xs font-semibold"
                              title="Assign & Send to Doctor">
                              <span className="material-symbols-outlined text-base">person_add</span>
                              Assign
                            </button>
                          )}
                          {/* "Sent to Doctor" / "In Consultation" badges intentionally
                              removed here — the Status column two cells to the left
                              already shows the exact same state (qs.label), so repeating
                              it in Actions was pure duplication that pushed this cell
                              wider than the viewport for no benefit. */}
                          {/* Consultation Fee (BRD 5.1) — collected/uncollected state right
                              in the queue row, no navigation to another module needed.
                              Receptionist is allowed here too even without general "billing"
                              access — the backend narrowly permits receptionist on the
                              consultation-invoice/payment endpoints only, not general billing. */}
                          {(canEdit('billing', roles) || isReception) && item.appointment_id && (
                            item.consultation_fee_collected ? (
                              // Compact icon-only once collected — it's a status marker at
                              // this point, not an action, so it doesn't need a text label
                              // competing for space with the still-actionable buttons.
                              <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-700" title="Consultation fee collected">
                                <span className="material-symbols-outlined text-base">paid</span>
                              </span>
                            ) : (
                              <button onClick={() => openCollectFee(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all shadow-sm text-xs font-semibold"
                                title="Collect Consultation Fee">
                                <span className="material-symbols-outlined text-base">payments</span>
                                Fee
                              </button>
                            )
                          )}
                          {/* OPD Assignment (BRD 5.2) — navigates to the OPD Assignment
                              (Book Appointment) wizard with the patient pre-filled, distinct
                              from the "Assign"/"Send" doctor-picker above. */}
                          {canFilter && item.patient_id && (
                            item.opd_assigned_at ? (
                              // Compact icon-only once assigned — same reasoning as the
                              // "Paid" badge above.
                              <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-100 text-indigo-700" title="Sent to OPD Assignment">
                                <span className="material-symbols-outlined text-base">assignment_turned_in</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => navigate(`/appointments/book?patient_id=${item.patient_id}&from_queue=${item.queue_id}`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:scale-105 active:scale-95 transition-all text-xs font-semibold"
                                title="OPD Assignment">
                                <span className="material-symbols-outlined text-base">assignment_ind</span>
                                OPD
                              </button>
                            )
                          )}
                          {/* Nurse pre-consultation data entry — quick-entry vitals
                              and/or optical exam details, saved as a draft that
                              auto-loads into the doctor's Prescription Builder when
                              they start the consultation (see NurseVitals.tsx /
                              NewOpticalPrescription.tsx). Lives directly in the
                              queue row action bar, not behind the view/detail
                              dialog, per BRD ask. */}
                          {canEnterVitals && isSelectedDateToday && item.patient_id && item.appointment_id && !['completed', 'skipped'].includes(item.status) && (
                            <button onClick={() => handleEnterVitals(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary/20 text-primary hover:bg-primary/5 hover:scale-105 active:scale-95 transition-all text-xs font-semibold"
                              title="Enter Vitals">
                              <span className="material-symbols-outlined text-base">vital_signs</span>
                              Vitals
                            </button>
                          )}
                          {canEnterOptical && isSelectedDateToday && item.patient_id && item.appointment_id && !['completed', 'skipped'].includes(item.status) && (
                            <button onClick={() => handleEnterOptical(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 hover:scale-105 active:scale-95 transition-all text-xs font-semibold"
                              title="Enter Optical Check">
                              <span className="material-symbols-outlined text-base">visibility</span>
                              Optical
                            </button>
                          )}
                          {/* View Details button for any item — icon + text, matching the
                              app-wide convention (see docs/print-download-pattern.md) of
                              never leaving a bare icon action without a visible label. */}
                          <button onClick={() => setDetailItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors text-xs font-semibold" title="View Patient Details">
                            <span className="material-symbols-outlined text-base">visibility</span>
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      </>)}

      {/* ── Scheduled Appointments Tab (Doctor only) ─────────────── */}
      {isDoctor && activeTab === 'scheduled' && (
        <div>
          {scheduledLoading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : scheduledAppts.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No scheduled appointments for today</p>
              <p className="text-xs mt-1">Only walk-in patients are in your queue</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledAppts.map(appt => (
                <div key={appt.id} className={`bg-white rounded-xl border p-5 transition-shadow hover:shadow-sm ${
                  appt.status === 'in-progress' ? 'border-purple-200 ring-1 ring-purple-100' : 'border-slate-200'
                }`}>
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Time Block */}
                    <div className="flex-shrink-0 w-28 lg:text-center">
                      <div className="inline-flex lg:flex lg:flex-col items-center gap-2 lg:gap-0 bg-slate-50 px-3 py-2 rounded-xl">
                        <span className="material-symbols-outlined text-primary text-lg lg:mb-1">schedule</span>
                        <p className="text-lg font-bold text-slate-900">{formatTime(appt.start_time || undefined)}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 capitalize">{appt.visit_type || 'General Visit'}</p>
                    </div>
                    {/* Patient Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-base font-bold text-slate-900">{appt.patient_name || 'Unknown Patient'}</span>
                        <AppointmentStatusBadge status={appt.status} />
                        {appt.priority && appt.priority !== 'normal' && appt.priority !== 'routine' && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            appt.priority === 'emergency' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                          }`}>{appt.priority}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-sm">
                        {appt.patient_reference_number && (
                          <span className="font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">PRN: {appt.patient_reference_number}</span>
                        )}
                        <span className="text-slate-400 font-medium">{appt.appointment_number}</span>
                        {appt.consultation_fee != null && (
                          <span className="text-emerald-600 font-semibold">₹{Number(appt.consultation_fee).toLocaleString()}</span>
                        )}
                      </div>
                      {appt.chief_complaint && (
                        <div className="mt-2 flex items-start gap-2">
                          <span className="material-symbols-outlined text-slate-400 text-base mt-0.5">symptoms</span>
                          <p className="text-sm text-slate-600">{appt.chief_complaint}</p>
                        </div>
                      )}
                      {appt.check_in_at && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="material-symbols-outlined text-sm">login</span>
                          Checked in at {formatTimeOnly(appt.check_in_at)}
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setNotesModal({ id: appt.id, notes: (appt as any).doctor_notes || appt.notes || '' })}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors" title="Add Notes">
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        Notes
                      </button>
                      {(appt.status === 'pending' || appt.status === 'confirmed' || appt.status === 'scheduled') && (
                        <button onClick={() => handleScheduledStatusChange(appt.id, 'in-progress')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors shadow-sm">
                          <span className="material-symbols-outlined text-sm">play_arrow</span>
                          Start
                        </button>
                      )}
                      {appt.status === 'in-progress' && (
                        <button onClick={() => handleScheduledStatusChange(appt.id, 'completed')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors shadow-sm">
                          <span className="material-symbols-outlined text-sm">task_alt</span>
                          Complete
                        </button>
                      )}
                      {appt.status !== 'completed' && appt.status !== 'cancelled' && appt.status !== 'no-show' && (
                        <button onClick={() => handleScheduledStatusChange(appt.id, 'no-show')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                          <span className="material-symbols-outlined text-sm">person_off</span>
                          No Show
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Completed Patients Tab (Doctor only) ─────────────────── */}
      {isDoctor && activeTab === 'completed' && (
        <div>
          {completedItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">task_alt</span>
              <p className="text-sm font-medium">No completed consultations today</p>
              <p className="text-xs mt-1">Patients you complete will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedItems.map(item => {
                const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                return (
                  <div key={item.queue_id} className="bg-white rounded-xl border border-slate-200 p-5 transition-shadow hover:shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-lg font-bold text-emerald-700 shrink-0">
                          {item.queue_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-slate-900">{item.patient_name || 'Unknown'}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                                {item.status === 'completed' ? 'check_circle' : 'person_off'}
                              </span>
                              {item.status === 'completed' ? 'Completed' : 'Skipped'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            {item.patient_reference_number && (
                              <span className="text-sm font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">PRN: {item.patient_reference_number}</span>
                            )}
                            {item.patient_gender && (
                              <span className="text-sm text-slate-500 font-medium capitalize">{item.patient_gender}</span>
                            )}
                            {item.patient_age != null && (
                              <span className="text-sm text-slate-500 font-medium">{item.patient_age}y</span>
                            )}
                            <span className={`text-[10px] font-bold ${pri.text}`}>{pri.label}</span>
                            {item.consultation_end_at && (
                              <span className="text-xs text-slate-400">
                                Completed {formatTimeOnly(item.consultation_end_at)}
                              </span>
                            )}
                          </div>
                          {item.chief_complaint && (
                            <p className="text-sm text-slate-500 mt-1">{item.chief_complaint}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setDetailItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                          Patient Info
                        </button>
                        {canActOnQueue && item.status === 'completed' && !item.is_specialist_assignment && (
                          <button onClick={() => openReferModal(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                            <span className="material-symbols-outlined text-sm">send</span>
                            Refer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Doctor Upcoming View — Future bookings grouped by date ── */}
      {isDoctor && activeTab === 'upcoming' && (
        <div>
          <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={upcomingDays}
                onChange={(e) => setUpcomingDays(Number(e.target.value) as 7 | 14 | 30)}
                className="input-field"
              >
                <option value={7}>Next 7 days</option>
                <option value={14}>Next 14 days</option>
                <option value={30}>Next 30 days</option>
              </select>
              <select
                value={upcomingDateFilter}
                onChange={(e) => setUpcomingDateFilter(e.target.value)}
                className="input-field"
              >
                <option value="all">All dates</option>
                {upcomingDateGroups.map(group => (
                  <option key={group.date} value={group.date}>
                    {new Date(group.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={upcomingSearch}
                onChange={(e) => setUpcomingSearch(e.target.value)}
                placeholder="Search patient / PRN / complaint"
                className="input-field"
              />
            </div>
          </div>
          {upcomingLoading ? (
            <div className="text-center py-20 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
            </div>
          ) : !upcomingData || upcomingData.date_groups.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl mb-3 block">event_available</span>
              <p className="text-sm font-medium">No upcoming patients in the next 7 days</p>
              <p className="text-xs mt-1">Referrals, follow-ups, and scheduled appointments will appear here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingData.date_groups.map(group => {
                const groupDate = new Date(group.date + 'T00:00');
                const dayLabel = groupDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={group.date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                          <span className="material-symbols-outlined text-orange-600 text-sm">calendar_today</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{dayLabel}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{group.count} patient{group.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedDate(group.date); setActiveTab('queue'); setLoading(true); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        View Queue
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-5 py-2">#</th>
                            <th className="px-4 py-2">Time</th>
                            <th className="px-4 py-2">Patient</th>
                            <th className="px-4 py-2">Doctor</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Priority</th>
                            <th className="px-4 py-2">Complaint</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.items.map(item => {
                            const pri = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                            const typeConfig: Record<string, { label: string; bg: string; text: string }> = {
                              referral: { label: 'Referral', bg: 'bg-orange-100', text: 'text-orange-700' },
                              'follow-up': { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                              'follow_up': { label: 'Follow-up', bg: 'bg-blue-100', text: 'text-blue-700' },
                              scheduled: { label: 'Scheduled', bg: 'bg-green-100', text: 'text-green-700' },
                              'walk-in': { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                              walk_in: { label: 'Walk-in', bg: 'bg-slate-100', text: 'text-slate-600' },
                            };
                            const apptType = typeConfig[item.appointment_type] || { label: item.appointment_type, bg: 'bg-slate-100', text: 'text-slate-600' };
                            return (
                              <tr key={item.queue_id} className="hover:bg-slate-50/50">
                                <td className="px-5 py-2.5 text-sm font-bold text-slate-400">{item.queue_number}</td>
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700">
                                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>schedule</span>
                                    {formatTime(item.start_time || undefined)}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-sm font-semibold text-slate-900">{item.patient_name || 'Unknown'}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.patient_reference_number && <span className="text-[10px] font-mono text-slate-400">PRN: {item.patient_reference_number}</span>}
                                    {item.patient_gender && <span className="text-[10px] text-slate-400 capitalize">{item.patient_gender}</span>}
                                    {item.patient_age != null && <span className="text-[10px] text-slate-400">{item.patient_age}y</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-sm text-slate-700">{item.doctor_name || '—'}</p>
                                  {item.appointment_type === 'referral' && item.referring_doctor_name && (
                                    <p className="text-[10px] text-orange-600 flex items-center gap-0.5 mt-0.5">
                                      <span className="material-symbols-outlined" style={{ fontSize: 10 }}>person</span>
                                      Ref: {item.referring_doctor_name}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${apptType.bg} ${apptType.text}`}>{apptType.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-xs text-slate-500 truncate max-w-[260px]" title={item.chief_complaint || ''}>
                                    {item.chief_complaint || <span className="text-slate-300">—</span>}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Collect Consultation Fee Modal (BRD 5.1) */}
      {collectItem && (
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
                {Number(collectInvoice.total_amount || 0) <= 0 && (
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      <span className="material-symbols-outlined text-sm">verified</span>
                      FREE — no fee to collect
                    </span>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-slate-500">Token</span><span className="font-medium text-slate-900">#{collectItem.queue_number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-medium text-slate-900">{collectItem.patient_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Doctor</span><span className="font-medium text-slate-900">{collectItem.doctor_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Invoice</span><span className="font-medium text-slate-900">{collectInvoice.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-semibold text-slate-900">Rs {Number(collectInvoice.total_amount || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-semibold text-emerald-700">Rs {Number(collectInvoice.paid_amount || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{collectInvoice.status === 'paid' ? 'Status' : 'Balance'}</span>
                    {collectInvoice.status === 'paid' ? (
                      <span className="font-bold text-emerald-600">Complete</span>
                    ) : (
                      <span className="font-bold text-red-600">Rs {Number(collectInvoice.balance_amount || 0).toFixed(2)}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                    <input
                      type="number"
                      min="0"
                      max={Number(collectInvoice.balance_amount || 0)}
                      step="0.01"
                      disabled={collectInvoice.status === 'paid'}
                      value={collectAmount || ''} placeholder="0.00"
                      onChange={(e) => {
                        const balance = Number(collectInvoice.balance_amount || 0);
                        const raw = parseFloat(e.target.value) || 0;
                        setCollectAmount(Math.min(Math.max(0, raw), balance));
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none disabled:opacity-50"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      {collectAmount < Number(collectInvoice.balance_amount || 0)
                        ? `Partial payment — Rs ${(Number(collectInvoice.balance_amount || 0) - collectAmount).toFixed(2)} will remain after this`
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
                    disabled={collectSaving || collectInvoice.status === 'paid'}
                    className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {collectSaving
                      ? 'Recording...'
                      : Number(collectInvoice.balance_amount || 0) <= 0 && collectInvoice.status !== 'paid'
                      ? 'Confirm Free Consultation'
                      : 'Record Payment'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Scheduled Notes Modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setNotesModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Appointment Notes</h3>
            <textarea value={notesModal.notes} onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
              rows={5} placeholder="Enter clinical notes, observations..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setNotesModal(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveScheduledNotes} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm">Save Notes</button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Doctor Modal */}
      {sendModalId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => {
          setSendModalId(null);
          setSendModalQueueId(null);
          setSendModalBookedDoctorId('');
          setSendModalLocked(false);
        }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-500">send</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Send to Doctor</h3>
                <p className="text-xs text-slate-500">Route <strong>{sendModalPatientName}</strong> to a doctor's queue</p>
              </div>
            </div>

            {sendModalLocked && (
              <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3">
                <span className="material-symbols-outlined text-primary text-base mt-0.5">lock</span>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Specialist Assignment —</span> this patient is locked to their assigned doctor and cannot be routed elsewhere.
                </p>
              </div>
            )}

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {doctors.map(d => {
                const waitCount = doctorLoads[d.doctor_id] || 0;
                const isSelected = sendDoctorId === d.doctor_id;
                const isLockedOut = sendModalLocked && d.doctor_id !== sendModalBookedDoctorId;
                return (
                  <button key={d.doctor_id} onClick={() => { if (!isLockedOut) setSendDoctorId(d.doctor_id); }}
                    disabled={isLockedOut}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-all border ${
                      isLockedOut ? 'opacity-40 cursor-not-allowed border-slate-100' :
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSelected ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {d.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-slate-900'}`}>{d.name}</p>
                        {d.specialization && <p className="text-[10px] text-slate-400 truncate">{d.specialization}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        waitCount === 0 ? 'bg-emerald-50 text-emerald-600' :
                        waitCount <= 3 ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>groups</span>
                        {waitCount} waiting
                      </span>
                      {isSelected && <span className="material-symbols-outlined text-primary text-lg">check_circle</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => {
                setSendModalId(null);
                setSendModalQueueId(null);
                setSendModalBookedDoctorId('');
                setSendModalLocked(false);
              }} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSendToDoctor} disabled={!sendDoctorId || sendingInProgress}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm">
                <span className="material-symbols-outlined text-base">send</span>
                {sendingInProgress ? 'Sending...' : 'Send to Doctor'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Patient Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl">person</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900 truncate flex items-center gap-1">
                  {detailItem.patient_name || 'Unknown Patient'}
                  <VerifiedBadge patient={detailItem} />
                </h3>
                {detailItem.patient_reference_number && (
                  <p className="text-xs text-slate-400 font-mono">PRN: {detailItem.patient_reference_number}</p>
                )}
              </div>
              <button onClick={() => setDetailItem(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Demographics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gender</p>
                <p className="text-sm font-semibold text-slate-800 capitalize">{detailItem.patient_gender || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Age</p>
                <p className="text-sm font-semibold text-slate-800">
                  {detailItem.patient_age != null ? `${detailItem.patient_age} years` : '—'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date of Birth</p>
                <p className="text-sm font-semibold text-slate-800">
                  {detailItem.patient_date_of_birth ? formatDateOnly(detailItem.patient_date_of_birth) : '—'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Blood Group</p>
                <p className="text-sm font-semibold text-slate-800">{detailItem.patient_blood_group || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                <p className="text-sm font-semibold text-slate-800">{detailItem.patient_phone || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{detailItem.patient_email || '—'}</p>
              </div>
            </div>

            {/* Visit Snapshot */}
            <div className="mb-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-xs align-text-bottom mr-1">event_note</span>
                Visit Snapshot
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Assigned Doctor</p>
                  <p className="text-sm font-semibold text-indigo-900 truncate">{detailItem.doctor_name || '—'}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Time Slot</p>
                  <p className="text-sm font-semibold text-indigo-900">{formatTime(detailItem.start_time || undefined)}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Queue Date</p>
                  <p className="text-sm font-semibold text-indigo-900">
                    {new Date(selectedDate + 'T00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Called At</p>
                  <p className="text-sm font-semibold text-indigo-900">
                    {detailItem.called_at ? formatTimeOnly(detailItem.called_at) : '—'}
                  </p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Consultation Start</p>
                  <p className="text-sm font-semibold text-indigo-900">
                    {detailItem.consultation_start_at ? formatTimeOnly(detailItem.consultation_start_at) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Clinical Info — Allergies & Chronic Conditions */}
            {(detailItem.patient_known_allergies || detailItem.patient_chronic_conditions) && (
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  <span className="material-symbols-outlined text-xs align-text-bottom mr-1">medical_information</span>
                  Clinical Information
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {detailItem.patient_known_allergies && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="material-symbols-outlined text-red-500" style={{ fontSize: 16 }}>warning</span>
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Known Allergies</p>
                      </div>
                      <p className="text-sm text-red-800">{detailItem.patient_known_allergies}</p>
                    </div>
                  )}
                  {detailItem.patient_chronic_conditions && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="material-symbols-outlined text-blue-500" style={{ fontSize: 16 }}>monitor_heart</span>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Chronic Conditions</p>
                      </div>
                      <p className="text-sm text-blue-800">{detailItem.patient_chronic_conditions}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Emergency Contact */}
            {detailItem.patient_emergency_contact_name && (
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  <span className="material-symbols-outlined text-xs align-text-bottom mr-1">emergency</span>
                  Emergency Contact
                </p>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-semibold text-orange-900">{detailItem.patient_emergency_contact_name}</p>
                      {detailItem.patient_emergency_contact_relation && (
                        <p className="text-[10px] text-orange-600 capitalize">{detailItem.patient_emergency_contact_relation}</p>
                      )}
                    </div>
                    {detailItem.patient_emergency_contact_phone && (
                      <p className="text-sm font-medium text-orange-800">
                        <span className="material-symbols-outlined text-xs align-text-bottom mr-0.5">call</span>
                        {detailItem.patient_emergency_contact_phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Queue / Appointment Info */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Queue Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">confirmation_number</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Token</p>
                    <p className="text-sm font-bold text-slate-800">#{detailItem.queue_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">priority_high</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Priority</p>
                    <p className={`text-sm font-bold capitalize ${
                      detailItem.priority === 'emergency' ? 'text-red-600' :
                      detailItem.priority === 'urgent' ? 'text-amber-600' : 'text-slate-800'
                    }`}>{detailItem.priority}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">schedule</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Check-in</p>
                    <p className="text-sm font-semibold text-slate-800">{timeAgo(detailItem.check_in_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-slate-400">info</span>
                  <div>
                    <p className="text-[10px] text-slate-400">Status</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize">{detailItem.status.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>
              {detailItem.chief_complaint && (
                <div className="mt-3 bg-amber-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Chief Complaint</p>
                  <p className="text-sm text-amber-900">{detailItem.chief_complaint}</p>
                </div>
              )}
              {detailItem.is_specialist_assignment && (
                <div className="mt-3 flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">lock</span>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Specialist Assignment —</span> locked to {detailItem.doctor_name || 'this doctor'}, cannot be reassigned or referred.
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
              {canActOnQueue && isSelectedDateToday && detailItem.status === 'waiting' && (
                <button onClick={() => { handleCall(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">campaign</span> Call Patient
                </button>
              )}
              {canFilter && isSelectedDateToday && (detailItem.status === 'waiting' || detailItem.status === 'called') && detailItem.doctor_id && (
                <button onClick={() => { handleSendPatientToDoctor(detailItem.queue_id, detailItem.patient_name || 'Patient'); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">send</span> Send to Doctor
                </button>
              )}
              {canActOnQueue && isSelectedDateToday && (detailItem.status === 'called' || detailItem.status === 'sent_to_doctor') && (
                <button onClick={() => { handleStartConsultation(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-500 rounded-lg hover:bg-purple-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">clinical_notes</span> Start Consultation
                </button>
              )}
              {canActOnQueue && isSelectedDateToday && detailItem.status === 'in_consultation' && (
                <button onClick={() => {
                  const params = new URLSearchParams({
                    patient_id: detailItem.patient_id || '',
                    appointment_id: detailItem.appointment_id || '',
                    queue_id: detailItem.queue_id,
                  });
                  navigate(`/prescriptions/new?${params.toString()}`);
                  setDetailItem(null);
                }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-500 rounded-lg hover:bg-purple-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">edit_note</span> Open Consultation
                </button>
              )}
              {canActOnQueue && isSelectedDateToday && detailItem.status === 'in_consultation' && (
                <button onClick={() => { handleComplete(detailItem.queue_id); setDetailItem(null); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-base">task_alt</span> Mark Complete
                </button>
              )}
              <button onClick={() => setDetailItem(null)}
                className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Book Next Appointment Modal ──────────────────────────────────── */}
      {bookNextItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600">event_upcoming</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Book Follow-up Appointment</h3>
                  <p className="text-xs text-slate-500">{bookNextItem.patient_name}</p>
                </div>
              </div>
              <button onClick={closeBookNextModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Appointment Date <span className="text-red-500">*</span>
                </label>
                <AvailabilityCalendar
                  monthKey={bookCalendarMonth}
                  onMonthKeyChange={setBookCalendarMonth}
                  selectedDate={bookNextDate}
                  onSelectDate={setBookNextDate}
                  minDateISO={tomorrow}
                  availabilityMap={bookDateAvailability}
                  loading={bookAvailabilityLoading}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Preferred Time (Optional)
                </label>
                <input
                  type="time"
                  value={bookNextTime}
                  onChange={(e) => setBookNextTime(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={closeBookNextModal}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleBookNextAppointment}
                disabled={!bookNextDate || bookingSaving || isSelectedFollowUpDateUnavailable}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 shadow-sm transition-all">
                <span className="material-symbols-outlined text-base">check</span>
                {bookingSaving ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Refer to Doctor Modal ──────────────────────────────────────── */}
      {referItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-orange-600">send</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Refer to Another Doctor</h3>
                  <p className="text-xs text-slate-500">{referItem.patient_name}</p>
                </div>
              </div>
              <button onClick={closeReferModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Select Doctor / Specialist <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={referDoctorLabel}
                  onChange={handleReferDoctorSelect}
                  suggestions={referDoctorSuggestions}
                  placeholder="Search doctor..."
                  allowManualEntry={false}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Appointment Date <span className="text-red-500">*</span>
                </label>
                <AvailabilityCalendar
                  monthKey={referCalendarMonth}
                  onMonthKeyChange={setReferCalendarMonth}
                  selectedDate={referDate}
                  onSelectDate={setReferDate}
                  minDateISO={today}
                  availabilityMap={referDateAvailability}
                  loading={referAvailabilityLoading}
                />
              </div>
              {referDoctorLoad !== null && referDoctorId && referDate && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
                  referDoctorLoad >= 15 ? 'bg-red-50 text-red-700 border border-red-200' :
                  referDoctorLoad >= 8 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span className="material-symbols-outlined text-base">
                    {referDoctorLoad >= 15 ? 'warning' : referDoctorLoad >= 8 ? 'info' : 'check_circle'}
                  </span>
                  <span>
                    {allDoctors.find(d => d.doctor_id === referDoctorId)?.name || 'Selected doctor'} already has <strong>{referDoctorLoad}</strong> patient{referDoctorLoad !== 1 ? 's' : ''} on this date
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Referral Reason
                </label>
                <textarea
                  value={referReason}
                  onChange={(e) => setReferReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Needs cardiology evaluation for chest pain..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button onClick={closeReferModal}
                className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleReferToDoctor}
                disabled={!referDoctorId || !referDate || referSaving || isSelectedReferralDateUnavailable}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-all">
                <span className="material-symbols-outlined text-base">send</span>
                {referSaving ? 'Referring...' : 'Confirm Referral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkInQueue;
