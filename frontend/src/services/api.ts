import axios from 'axios';
import feLogger from './loggerService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Token expiry helpers ───────────────────────────────────────────────────

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, thresholdSeconds = 300): boolean {
  const exp = getTokenExpiry(token);
  if (!exp) return false;
  return exp - Date.now() / 1000 < thresholdSeconds;
}

// Shared promise so simultaneous requests all wait on the same refresh call
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Uses the long-lived refresh token, not the access token being replaced —
  // this is what actually lets refresh work once the access token has
  // already expired (the old /auth/refresh re-minted from the access token
  // itself, so it failed exactly when it was needed). The refresh token is
  // rotated (single-use) on every call, so both are persisted on success.
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  try {
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
    const newAccessToken: string = response.data.access_token;
    const newRefreshToken: string = response.data.refresh_token;
    localStorage.setItem('access_token', newAccessToken);
    localStorage.setItem('refresh_token', newRefreshToken);
    return newAccessToken;
  } catch {
    return null;
  }
}

// ── Request interceptor: attach JWT, auto-refresh when near expiry ─────────

api.interceptors.request.use(
  async (config) => {
    let token = localStorage.getItem('access_token');
    if (!token) return config;

    if (isTokenExpiringSoon(token)) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const refreshed = await refreshPromise;
      if (refreshed) token = refreshed;
    }

    config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Error detail normalization ──────────────────────────────────────────────

/**
 * FastAPI's `detail` field is a plain string for handwritten HTTPExceptions
 * (e.g. "Cannot delete", "Batch number already exists") — those are already
 * good, specific, human messages and are left untouched. But on a 422
 * (pydantic request-validation failure), `detail` is instead an ARRAY of
 * `{loc, msg, type}` objects. ~50 pages across the app do
 * `showToast('error', err?.response?.data?.detail || 'fallback')`, and
 * ToastContainer renders that value directly as a React child — handed an
 * array of objects, React throws ("Objects are not valid as a React child"),
 * crashing the toast (and the current view) instead of showing a message.
 * Flattening it to a readable string here, once, fixes every one of those
 * call sites without touching them individually.
 */
function humanizeFieldName(loc: unknown): string {
  if (!Array.isArray(loc)) return '';
  const field = loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'path').pop();
  if (typeof field !== 'string') return '';
  return field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function normalizeErrorDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => {
        if (typeof d === 'string') return d;
        const field = humanizeFieldName(d?.loc);
        const msg = typeof d?.msg === 'string' ? d.msg : '';
        if (!msg) return '';
        return field ? `${field}: ${msg}` : msg;
      })
      .filter(Boolean);
    return messages.length ? messages.join('; ') : 'Please check the highlighted fields and try again.';
  }
  return 'Please check your input and try again.';
}

// ── Response interceptor: handle 401 / 402, log failures ──────────────────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = error.config?.url || 'unknown';
    const statusCode = error.response?.status;
    const method = (error.config?.method || 'unknown').toUpperCase();

    if (statusCode) {
      feLogger.error('api', `${method} ${url} → ${statusCode} ${error.response?.statusText || ''}`);
    } else {
      feLogger.error('api', `${method} ${url} → Network error: ${error.message}`);
    }

    if (statusCode === 401) {
      const requestUrl = error.config?.url || '';
      const isAuthEndpoint = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/refresh');

      // The request interceptor already refreshes proactively when a token is
      // close to expiry, but that can still miss (a request already in flight
      // when expiry was crossed, a network blip during that refresh, clock
      // skew). Without this fallback, any 401 that slips through means an
      // instant, unrecoverable logout — which is what made session expiry
      // look like "the invoices page is broken" instead of "please wait, retrying".
      if (!isAuthEndpoint && !error.config?._retriedAfterRefresh) {
        error.config._retriedAfterRefresh = true;
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
        }
        const refreshed = await refreshPromise;
        if (refreshed) {
          error.config.headers = error.config.headers || {};
          error.config.headers.Authorization = `Bearer ${refreshed}`;
          return api(error.config);
        }
      }

      if (!isAuthEndpoint) {
        feLogger.warn('api', 'Session expired — redirecting to login');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }

    if (statusCode === 402) {
      // Subscription / quota limit reached — dispatch event so UI can show a banner
      window.dispatchEvent(new CustomEvent('hms:quota-exceeded', {
        detail: { message: error.response?.data?.detail || 'Subscription limit reached.' }
      }));
    }

    // Flatten any non-string `detail` (currently only ever a pydantic 422
    // validation array in practice) into a readable string, for every status
    // code, before anything else reads it — see normalizeErrorDetail() above.
    if (error.response && typeof error.response.data?.detail !== 'undefined' && typeof error.response.data.detail !== 'string') {
      error.response.data = { ...error.response.data, detail: normalizeErrorDetail(error.response.data.detail) };
    }

    // Every role/permission/subscription-gate denial across the app (Roles &
    // Permissions matrix, module-not-in-plan, hospital inactive/suspended)
    // comes back as a 403 with a backend-internal `detail` string like
    // "Insufficient role permissions" or "Module 'X' is not enabled for your
    // subscription plan" — fine for logs, confusing/unprofessional as a user-
    // facing toast. ~50 pages across the app already do
    // `showToast('error', err?.response?.data?.detail || 'fallback')`, so
    // rewriting `detail` here to a clean message — once, at the one place
    // every request passes through — fixes every one of those call sites
    // without touching any of them individually.
    if (statusCode === 403 && error.response) {
      const rawDetail: string | undefined = error.response.data?.detail;
      feLogger.error('api', `${method} ${url} → 403 (raw detail: ${rawDetail || 'none'})`);

      let friendly: string;
      if (rawDetail && /not enabled for your subscription plan/i.test(rawDetail)) {
        friendly = "This feature isn't included in your hospital's current plan. Contact your administrator.";
      } else if (rawDetail && /(hospital is inactive|invalid hospital context|could not verify tenant status|tenant.*suspend)/i.test(rawDetail)) {
        friendly = 'Your hospital account is not active right now. Contact your administrator.';
      } else {
        const isMutating = ['post', 'put', 'patch', 'delete'].includes(method.toLowerCase());
        friendly = isMutating
          ? "You don't have access to edit this."
          : "You don't have access to view this.";
      }

      error.response.data = { ...(error.response.data || {}), detail: friendly };
    }

    return Promise.reject(error);
  }
);

export { API_BASE_URL };
export default api;
