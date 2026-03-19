import axios, { AxiosError } from 'axios';
import feLogger from './loggerService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15 second timeout — balances between slow operations and UX
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and log API failures
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    const url = error.config?.url || 'unknown';
    const status = error.response?.status;
    const method = (error.config?.method || 'unknown').toUpperCase();

    // Log all API failures (4xx/5xx or network errors)
    if (status) {
      const detail = error.response?.data?.detail || error.response?.statusText || 'Unknown error';
      feLogger.error('api', `${method} ${url} → ${status} ${detail}`);
    } else {
      feLogger.error('api', `${method} ${url} → Network error: ${error.message}`);
    }

    if (error.response?.status === 401) {
      // Don't redirect if this is a login request — let the login page handle its own errors
      const requestUrl = error.config?.url || '';
      if (!requestUrl.includes('/auth/login')) {
        feLogger.warn('api', 'Session expired — redirecting to login');
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export { API_BASE_URL };
export default api;
