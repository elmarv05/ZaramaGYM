// ============================================================================
// PRUEBAS FRONTEND: ACTUALIZADOR REMOTO SEGURO (SLICE R3 - TAURI UPDATER)
// Verifica flujo al día, detección OTA, bloqueo por caja abierta, backup preventivo
// y recuperación fluida ante fallos de red.
// Ubicación: src/__tests__/AppUpdater.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppUpdateModal } from '../features/updates/AppUpdateModal';
import { authIpc } from '../services/ipc/authIpc';
import * as appUpdater from '../services/updater/appUpdater';

vi.mock('../services/ipc/authIpc', () => ({
  authIpc: {
    prepareSafeAppUpdate: vi.fn(),
    restoreRuntimeAfterFailedUpdate: vi.fn(),
  },
}));

vi.mock('../services/updater/appUpdater', async () => {
  const actual = await vi.importActual<typeof appUpdater>('../services/updater/appUpdater');
  return {
    ...actual,
    checkForAppUpdate: vi.fn(),
    relaunchAppAfterUpdate: vi.fn(),
  };
});

const mockedCheck = vi.mocked(appUpdater.checkForAppUpdate);
const mockedRelaunch = vi.mocked(appUpdater.relaunchAppAfterUpdate);
const mockedPrepare = vi.mocked(authIpc.prepareSafeAppUpdate);
const mockedRestore = vi.mocked(authIpc.restoreRuntimeAfterFailedUpdate);

describe('Slice R3: AppUpdateModal — Actualización Remota Segura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra estado "ZaramaGYM está actualizado al día" cuando no hay nueva versión', async () => {
    mockedCheck.mockResolvedValueOnce(null);

    render(<AppUpdateModal isOpen={true} onClose={vi.fn()} />);

    expect(
      await screen.findByText(/ZaramaGYM está actualizado al día/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tus datos y configuraciones quedan 100% protegidos/i)
    ).toBeInTheDocument();
  });

  it('bloquea la actualización si hay turno de caja abierto y ofrece acceso directo a Caja', async () => {
    const onGoToPos = vi.fn();
    const onClose = vi.fn();
    const downloadAndInstall = vi.fn();

    mockedPrepare.mockRejectedValueOnce({
      code: 'Validation',
      message:
        'No puedes actualizar ZaramaGYM mientras el Turno de Caja #7 (abierto por @admin) permanezca ABIERTO. Realiza primero el Arqueo y Cierre de Caja en el módulo POS.',
    });

    const user = userEvent.setup();
    render(
      <AppUpdateModal
        isOpen={true}
        onClose={onClose}
        onGoToPos={onGoToPos}
        initialUpdate={{
          version: '0.2.0',
          currentVersion: '0.1.0',
          body: 'Mejoras de rendimiento y reportes.',
          downloadAndInstall,
        }}
      />
    );

    expect(screen.getByText(/Nueva versión v0\.2\.0 disponible/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Respaldar BD y Actualizar a v0\.2\.0/i })
    );

    expect(
      await screen.findByText(/Actualización Bloqueada por Caja Abierta/i)
    ).toBeInTheDocument();
    expect(downloadAndInstall).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Ir a Caja para Arqueo y Cierre/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onGoToPos).toHaveBeenCalled();
  });

  it('ejecuta flujo completo seguro: backup preventivo -> descarga firmada -> relaunch', async () => {
    mockedPrepare.mockResolvedValueOnce({
      current_version: '0.1.0',
      target_version: '0.2.0',
      backup_id: 42,
      backup_filename: 'zaramagym_backup_20261120.db',
      backup_path: 'C:\\Users\\USER\\AppData\\Roaming\\com.zaramagym.app\\backups\\zaramagym_backup_20261120.db',
      backup_size_bytes: 524288,
      backup_sha256: 'ABCDEF123456',
      integrity_verified: true,
      prepared_at: '2026-11-20 12:15:00',
    });

    const downloadAndInstall = vi.fn(async (cb) => {
      cb?.({ event: 'Started', data: { contentLength: 1000 } });
      cb?.({ event: 'Progress', data: { chunkLength: 1000 } });
      cb?.({ event: 'Finished' });
    });

    mockedRelaunch.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    render(
      <AppUpdateModal
        isOpen={true}
        onClose={vi.fn()}
        initialUpdate={{
          version: '0.2.0',
          currentVersion: '0.1.0',
          body: 'Nueva versión oficial.',
          downloadAndInstall,
        }}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Respaldar BD y Actualizar a v0\.2\.0/i })
    );

    await waitFor(() => {
      expect(mockedPrepare).toHaveBeenCalledWith('0.2.0');
      expect(downloadAndInstall).toHaveBeenCalledTimes(1);
      expect(mockedRelaunch).toHaveBeenCalledTimes(1);
    });
    expect(mockedRestore).not.toHaveBeenCalled();
  });

  it('restaura la bandera runtime si la descarga falla por red para mantener el sistema operativo y protegido', async () => {
    mockedPrepare.mockResolvedValueOnce({
      current_version: '0.1.0',
      target_version: '0.2.0',
      backup_id: 43,
      backup_filename: 'zaramagym_backup_retry.db',
      backup_path: 'C:\\backups\\zaramagym_backup_retry.db',
      backup_size_bytes: 102400,
      backup_sha256: '123456',
      integrity_verified: true,
      prepared_at: '2026-11-20 12:20:00',
    });
    mockedRestore.mockResolvedValueOnce(undefined);

    const downloadAndInstall = vi.fn().mockRejectedValueOnce(new Error('Conexión perdida'));

    const user = userEvent.setup();
    render(
      <AppUpdateModal
        isOpen={true}
        onClose={vi.fn()}
        initialUpdate={{
          version: '0.2.0',
          currentVersion: '0.1.0',
          downloadAndInstall,
        }}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Respaldar BD y Actualizar a v0\.2\.0/i })
    );

    await waitFor(() => {
      expect(mockedRestore).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Conexión perdida/i)).toBeInTheDocument();
    });
  });
});
