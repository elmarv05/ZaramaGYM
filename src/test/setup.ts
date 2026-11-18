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

// Limpieza entre tests
afterEach(() => {
  vi.clearAllMocks();
});
