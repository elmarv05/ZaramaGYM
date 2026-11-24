// ============================================================================
// CONFIGURACIÓN GLOBAL DE TESTING CON VITEST Y TESTING LIBRARY
// Ubicación: src/test/setup.ts
// ============================================================================

import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// Mock por defecto de @tauri-apps/api/core si los tests lo requieren
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Polyfill mínimo de ResizeObserver para primitivas Radix UI en jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Limpieza entre tests
afterEach(() => {
  vi.clearAllMocks();
});
