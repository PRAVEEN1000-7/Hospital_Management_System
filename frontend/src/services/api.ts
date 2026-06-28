import axios from 'axios';
import feLogger from './loggerService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

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

// ── Response interceptor: handle 401 / 402, log failures ──────────────────

api.interceptors.response.use(
  (response) => response,
  (error) => {
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
      if (!requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/refresh')) {
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

    return Promise.reject(error);
  }
);

export { API_BASE_URL };
export default api;
