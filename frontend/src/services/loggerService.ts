/**
 * Frontend Logging Service
 * =========================
 *
 * How logging works:
 * - UI code calls `feLogger.info('component', 'message')` etc.
 * - Logs are buffered in memory and flushed to the backend every 10 seconds
 *   or when the buffer reaches 20 entries (whichever comes first).
 * - On page unload the buffer is flushed immediately via `navigator.sendBeacon`.
 * - The backend writes each entry to `logs/fe.log` using a RotatingFileHandler.
 *
 * How log rotation works (server-side):
 * - fe.log rotates at 20 MB → fe.log.1 (1 backup kept, older deleted).
 *
 * Where logs are stored:
 * - <project_root>/logs/fe.log
 *
 * Log levels: DEBUG, INFO, WARNING, ERROR
 *
 * Format (written by the backend):
 *   2026-03-08 14:12:02 | INFO | component_name | message
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
const FLUSH_INTERVAL_MS = 10_000;  // Flush every 10 seconds
const MAX_BUFFER_SIZE = 20;         // Flush when buffer reaches 20 entries

interface LogEntry {
  level: string;
  component: string;
  message: string;
  url: string;
}

class FrontendLogger {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor() {
    // Periodically flush buffered logs to the server
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

    // Flush on page unload so we don't lose pending logs
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush(true));
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  debug(component: string, message: string): void {
    this.enqueue('DEBUG', component, message);
  }

  info(component: string, message: string): void {
    this.enqueue('INFO', component, message);
  }

  warn(component: string, message: string): void {
    this.enqueue('WARNING', component, message);
  }

  error(component: string, message: string): void {
    this.enqueue('ERROR', component, message);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private enqueue(level: string, component: string, message: string): void {
    this.buffer.push({
      level,
      component,
      message,
      url: typeof window !== 'undefined' ? window.location.pathname : '',
    });

    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  /** Send buffered logs to the backend. Uses sendBeacon on page unload. */
  flush(useBeacon = false): void {
    if (this.buffer.length === 0 || this.isFlushing) return;

    const payload = JSON.stringify({ logs: this.buffer });
    this.buffer = [];
    this.isFlushing = true;

    const url = `${API_BASE_URL}/logs/frontend`;

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // sendBeacon guarantees delivery even during page unload
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (!sent) {
        // If sendBeacon fails, log to console in development
        console.warn('[Logger] sendBeacon failed, logs may be lost');
      }
      this.isFlushing = false;
      return;
    }

    // Normal async POST (fire-and-forget — logging should never block the UI)
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Silently ignore — logging failures must not break the app
    }).finally(() => {
      this.isFlushing = false;
    });
  }

  /** Stop the periodic flush timer (for cleanup in tests). */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

/** Singleton frontend logger instance */
const feLogger = new FrontendLogger();

export default feLogger;
