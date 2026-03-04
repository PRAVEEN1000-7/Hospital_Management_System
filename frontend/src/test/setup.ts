/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// Mock import.meta.env for Vite
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_BASE_URL: 'http://localhost:8000/api/v1',
    MODE: 'test',
  },
  writable: true,
});

// Mock window.location so redirect tests work
const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
Object.defineProperty(window, 'location', {
  configurable: true,
  value: {
    href: '',
    pathname: '/',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
});

afterEach(() => {
  localStorage.clear();
  (window.location as any).href = '';
});
