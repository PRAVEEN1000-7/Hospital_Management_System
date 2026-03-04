/**
 * TC-FE-AUTH-001 to TC-FE-AUTH-012
 * Real tests for authService — verifies localStorage state, API calls, and error handling.
 * No running server needed: all HTTP calls are intercepted by axios-mock-adapter.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import api from '../../services/api';
import authService from '../../services/authService';

const mock = new MockAdapter(api);

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsInJvbGUiOiJzdXBlcmFkbWluIn0.sig';
const FAKE_USER = {
  id: 'abc-123',
  username: 'superadmin',
  email: 'admin@test.com',
  first_name: 'Super',
  last_name: 'Admin',
  roles: ['super_admin'],
};
const LOGIN_RESPONSE = { access_token: FAKE_TOKEN, token_type: 'bearer', user: FAKE_USER };

beforeEach(() => {
  mock.reset();
  localStorage.clear();
});

// ─── Login ───────────────────────────────────────────────────────────────────

describe('TC-FE-AUTH-001: login() stores access_token in localStorage', () => {
  it('should persist token after successful login', async () => {
    mock.onPost('/auth/login').reply(200, LOGIN_RESPONSE);

    await authService.login({ username: 'superadmin', password: 'Admin@123' });

    const stored = localStorage.getItem('access_token');
    expect(stored).toBe(FAKE_TOKEN);
  });
});

describe('TC-FE-AUTH-002: login() stores serialised user object in localStorage', () => {
  it('should persist user JSON after successful login', async () => {
    mock.onPost('/auth/login').reply(200, LOGIN_RESPONSE);

    await authService.login({ username: 'superadmin', password: 'Admin@123' });

    const raw = localStorage.getItem('user');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.username).toBe('superadmin');
    expect(parsed.roles).toContain('super_admin');
    expect(parsed.id).toBe('abc-123');
  });
});

describe('TC-FE-AUTH-003: login() returns full AuthResponse data', () => {
  it('should return access_token and user from login()', async () => {
    mock.onPost('/auth/login').reply(200, LOGIN_RESPONSE);

    const result = await authService.login({ username: 'superadmin', password: 'Admin@123' });

    expect(result.access_token).toBe(FAKE_TOKEN);
    expect(result.user.username).toBe('superadmin');
  });
});

describe('TC-FE-AUTH-004: login() throws on 401 invalid credentials', () => {
  it('should reject with error when credentials are wrong', async () => {
    mock.onPost('/auth/login').reply(401, { detail: 'Invalid credentials' });

    await expect(
      authService.login({ username: 'superadmin', password: 'wrongpass' })
    ).rejects.toThrow();
    // localStorage must NOT be set on failure
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('TC-FE-AUTH-005: logout() clears access_token from localStorage', () => {
  it('should remove token on logout', async () => {
    localStorage.setItem('access_token', FAKE_TOKEN);
    mock.onPost('/auth/logout').reply(200);

    await authService.logout();

    expect(localStorage.getItem('access_token')).toBeNull();
  });
});

describe('TC-FE-AUTH-006: logout() clears user from localStorage', () => {
  it('should remove user on logout', async () => {
    localStorage.setItem('user', JSON.stringify(FAKE_USER));
    mock.onPost('/auth/logout').reply(200);

    await authService.logout();

    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('TC-FE-AUTH-007: logout() clears localStorage even when server returns 500', () => {
  it('should still remove local state on server error', async () => {
    localStorage.setItem('access_token', FAKE_TOKEN);
    localStorage.setItem('user', JSON.stringify(FAKE_USER));
    mock.onPost('/auth/logout').reply(500);

    await authService.logout();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

// ─── getStoredUser ────────────────────────────────────────────────────────────

describe('TC-FE-AUTH-008: getStoredUser() returns null when localStorage is empty', () => {
  it('should return null when no user stored', () => {
    expect(authService.getStoredUser()).toBeNull();
  });
});

describe('TC-FE-AUTH-009: getStoredUser() returns parsed User object', () => {
  it('should correctly deserialise stored user', () => {
    localStorage.setItem('user', JSON.stringify(FAKE_USER));

    const user = authService.getStoredUser();

    expect(user).not.toBeNull();
    expect(user!.username).toBe('superadmin');
    expect(user!.roles).toContain('super_admin');
  });
});

describe('TC-FE-AUTH-010: getStoredUser() returns null for corrupt JSON in localStorage', () => {
  it('should not throw and return null for invalid JSON', () => {
    localStorage.setItem('user', '{BROKEN JSON');

    const user = authService.getStoredUser();

    expect(user).toBeNull();
  });
});

// ─── isAuthenticated ─────────────────────────────────────────────────────────

describe('TC-FE-AUTH-011: isAuthenticated() returns true when token present', () => {
  it('should be truthy when access_token is in localStorage', () => {
    localStorage.setItem('access_token', FAKE_TOKEN);
    expect(authService.isAuthenticated()).toBe(true);
  });
});

describe('TC-FE-AUTH-012: isAuthenticated() returns false when token absent', () => {
  it('should be falsy with empty localStorage', () => {
    expect(authService.isAuthenticated()).toBe(false);
  });
});

// ─── API interceptor ─────────────────────────────────────────────────────────

describe('TC-FE-AUTH-013: request interceptor attaches Authorization header', () => {
  it('should add Bearer token to outgoing requests', async () => {
    localStorage.setItem('access_token', FAKE_TOKEN);
    let capturedHeader = '';
    mock.onGet('/patients').reply((config) => {
      capturedHeader = config.headers?.Authorization ?? '';
      return [200, { items: [], total: 0 }];
    });

    await api.get('/patients');

    expect(capturedHeader).toBe(`Bearer ${FAKE_TOKEN}`);
  });
});

describe('TC-FE-AUTH-014: request interceptor skips Authorization when no token', () => {
  it('should not set Authorization header when localStorage is empty', async () => {
    let capturedHeader: string | undefined;
    mock.onGet('/patients').reply((config) => {
      capturedHeader = config.headers?.Authorization;
      return [200, { items: [], total: 0 }];
    });

    await api.get('/patients');

    expect(capturedHeader).toBeUndefined();
  });
});

describe('TC-FE-AUTH-015: 401 response clears localStorage', () => {
  it('should remove token and user on any 401 response', async () => {
    localStorage.setItem('access_token', FAKE_TOKEN);
    localStorage.setItem('user', JSON.stringify(FAKE_USER));
    mock.onGet('/patients').reply(401);

    await api.get('/patients').catch(() => {});

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
