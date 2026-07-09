import { format as formatDateFns } from 'date-fns';

export function formatLocalDateISO(input: Date = new Date()): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, '0');
  const day = String(input.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMonthKey(input: Date = new Date()): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Format a pure calendar-date value ("YYYY-MM-DD", e.g. date_of_birth,
 * appointment_date, invoice_date) for display.
 *
 * Deliberately does NOT go through `new Date(dateOnlyString)` — the JS Date
 * constructor parses a bare "YYYY-MM-DD" string as UTC midnight, and
 * `.toLocaleDateString()`/date-fns then render that in the viewer's local
 * timezone, which can silently shift the displayed date by a day for
 * negative-offset timezones. Building the Date from its year/month/day parts
 * keeps the calendar date fixed no matter what timezone the browser is in.
 */
export function formatDateOnly(dateOnlyString: string | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!dateOnlyString) return '—';
  const [year, month, day] = dateOnlyString.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return '—';
  return formatDateFns(new Date(year, month - 1, day), pattern);
}

// The logged-in user's HOSPITAL timezone (IANA name, e.g. "Asia/Kolkata"),
// set once by AuthContext on login/session-restore. All timestamp display
// below renders in this zone — a clinic's schedule is fixed to its own local
// time regardless of which device/location a staff member is viewing from.
// Falls back to the browser's own timezone if unset (e.g. super_admin, who
// isn't tied to one hospital, or before login state has loaded).
let activeTimeZone: string | null = null;

/** Called by AuthContext whenever the current user's hospital timezone becomes known. */
export function setActiveTimeZone(tz: string | null | undefined): void {
  activeTimeZone = tz || null;
}

function resolveTimeZone(explicit?: string): string {
  return explicit || activeTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Re-express a Date's instant as the wall-clock date/time it corresponds to
 * in `timeZone`, packaged as a plain Date whose getFullYear/getHours/etc.
 * (which always read the JS engine's own local zone) now match that target
 * zone's wall clock — so it can be fed straight into date-fns format() as if
 * it were already local time. This is the standard trick for timezone-aware
 * formatting without pulling in the date-fns-tz package.
 */
function toZonedDate(d: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Format a true timestamp (created_at, updated_at, processed_at, etc.) for
 * display. The backend always stores and returns these as UTC with an
 * explicit offset in the ISO string (e.g. "2026-07-09T10:30:00+00:00").
 * Renders in the hospital's configured timezone (see setActiveTimeZone),
 * not the viewer's device timezone. Pass `timeZone` to override explicitly.
 */
export function formatDateTime(isoString: string | null | undefined, pattern = 'dd MMM yyyy, hh:mm a', timeZone?: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDateFns(toZonedDate(d, resolveTimeZone(timeZone)), pattern);
}

/** Time-of-day portion of a timestamp, in the hospital's configured timezone. */
export function formatTimeOnly(isoString: string | null | undefined, pattern = 'hh:mm a', timeZone?: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDateFns(toZonedDate(d, resolveTimeZone(timeZone)), pattern);
}
