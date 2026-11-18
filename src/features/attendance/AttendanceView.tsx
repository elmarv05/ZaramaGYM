// ============================================================================
// VISTA PRINCIPAL: CONTROL DE ASISTENCIAS, SEMÁFORO Y RECUPERACIÓN (SLICE 5)
// Wireframe Pro con KPIs en vivo, 3 Pestañas operativas y modales especializados
// Ubicación: src/features/attendance/AttendanceView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/primitives/Icon';
import { useAttendance } from '../../hooks/useAttendance';
import { useWebcamQrScanner } from '../../hooks/useWebcamQrScanner';
import { normalizeQrTokenClient } from '../../utils/qrScanner';
import { posIpc } from '../../services/ipc/posIpc';
import { AuthSession } from '../../types/auth';
import { ClientListItem } from '../../types/entity';
import { ClientMembershipDto } from '../../types/pos';
import {
  CheckInEvaluationDto,
  CheckInInput,
} from '../../types/attendance';
import { TrafficLightCard } from './TrafficLightCard';
import { ManualCheckInModal } from './ManualCheckInModal';
import { AuthorizeRedPassModal } from './AuthorizeRedPassModal';
import { ExtendMembershipModal } from './ExtendMembershipModal';
import { SystemConfigModal } from './SystemConfigModal';
import { AttendanceHistoryTable } from './AttendanceHistoryTable';
import { MembershipExtensionsTable } from './MembershipExtensionsTable';

export type AttendanceMainTab = 'monitor' | 'history' | 'extensions';

export interface AttendanceViewProps {
  currentSession: AuthSession;
  clients?: ClientListItem[];
  initialTab?: AttendanceMainTab;
  onNavigateToPos?: (subTab?: 'pos' | 'deudores') => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  currentSession,
  clients = [],
  initialTab = 'monitor',
  onNavigateToPos,
}) => {
  const [activeTab, setActiveTab] = useState<AttendanceMainTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [qrInput, setQrInput] = useState('');
  const [activeMemberships, setActiveMemberships] = useState<ClientMembershipDto[]>([]);

  // Modales
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isAuthRedPassModalOpen, setIsAuthRedPassModalOpen] = useState(false);
  const [redPassTargetEvaluation, setRedPassTargetEvaluation] = useState<CheckInEvaluationDto | null>(null);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const isAdminOrSupervisor =
    currentSession.rol === 'ADMINISTRADOR' || currentSession.rol === 'SUPERVISOR';

  const {
    currentEvaluation,
    todaySummary,
    attendances,
    extensions,
    systemConfig,
    isLoading,
    isActionLoading,
    error,
    checkIn,
    authorizeRedPass,
    extendMembership,
    fetchAttendances,
    fetchExtensions,
    updateConfig,
    resetCurrentEvaluation,
    clearError,
  } = useAttendance(true);

  const {
    videoRef: webcamVideoRef,
    isCameraActive,
    isStartingCamera,
    cameraError,
    startCamera,
    stopCamera,
    scanImageFile,
    clearCameraError,
  } = useWebcamQrScanner({
    active: activeTab === 'monitor',
    onDetected: async (decodedToken) => {
      try {
        await checkIn({
          qrToken: decodedToken,
          modoIngreso: 'QR_LOCAL',
        });
        setQrInput('');
      } catch {
        // Error ya manejado por el hook
      }
    },
  });

  // Cargar membresías emitidas para la pestaña de extensiones
  const loadMemberships = async () => {
    try {
      const list = await posIpc.listClientMemberships({ estado: 'ACTIVA' });
      setActiveMemberships(list);
    } catch {
      // Ignorar fallback silencioso
    }
  };

  useEffect(() => {
    void loadMemberships();
  }, []);

  // Manejo de validación manual de token QR (Teclado Enter)
  const handleScanQrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeQrTokenClient(qrInput);
    if (!token) return;

    try {
      await checkIn({
        qrToken: token,
        modoIngreso: 'QR_LOCAL',
      });
      setQrInput('');
    } catch {
      // Error ya manejado por el hook
    }
  };

  // Simulación rápida de escaneo con un clic en un socio registrado
  const handleQuickSimulateScan = async (client: ClientListItem) => {
    try {
      if (client.codigo_qr_token) {
        await checkIn({
          qrToken: client.codigo_qr_token,
          modoIngreso: 'QR_LOCAL',
        });
      } else {
        await checkIn({
          clienteId: client.id,
          numeroDocumento: client.numero_documento,
          modoIngreso: 'MANUAL_OLVIDO_QR',
        });
      }
    } catch {
      // Error ya manejado por el hook
    }
  };

  // Apertura de modal de autorización de pase en rojo
  const handleOpenAuthRedPass = (evaluation: CheckInEvaluationDto) => {
    setRedPassTargetEvaluation(evaluation);
    setIsAuthRedPassModalOpen(true);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* 1. BARRA SUPERIOR DE KPIS EN VIVO DE LA JORNADA */}
      <section
        aria-label="Métricas del Semáforo en Vivo"
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3"
      >
        <div className="bg-surface border border-border rounded-xl p-4 shadow-2xs flex flex-col">
          <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
            Ingresos Hoy
          </span>
          <span className="text-2xl font-black text-txt-primary mt-1">
            {todaySummary?.totalIngresosHoy ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary truncate">
            {todaySummary?.ultimoIngresoHora
              ? `Último: ${todaySummary.ultimoIngresoHora.split(' ')[1] || todaySummary.ultimoIngresoHora}`
              : 'Sin ingresos aún'}
          </span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 shadow-2xs flex flex-col">
          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-success shrink-0" aria-hidden="true" />
            <span>Verdes (Acceso Total)</span>
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {todaySummary?.totalVerde ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary">Membresía activa al día</span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 shadow-2xs flex flex-col">
          <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 tracking-wider inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-warning shrink-0" aria-hidden="true" />
            <span>Amarillos (Alerta)</span>
          </span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {todaySummary?.totalAmarillo ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary">Vencen $\le 5$d o deuda</span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4 shadow-2xs flex flex-col">
          <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 tracking-wider inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-danger shrink-0" aria-hidden="true" />
            <span>Pases a Crédito en Rojo</span>
          </span>
          <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {todaySummary?.totalPaseCredito ?? todaySummary?.totalRojoAutorizados ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary">Pases diarios autorizados</span>
        </div>

        {/* Acceso a Configuración de Semáforo (Admin / Supervisor) */}
        <div className="bg-surface border border-border rounded-xl p-4 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
              Parámetros Semáforo
            </span>
            <span className="text-xs font-semibold text-txt-secondary mt-0.5">
              Umbral: {systemConfig?.diasAlertaAmarillo ?? 5}d • Anti-Rebote: {systemConfig?.minutosAntireboteQr ?? 3}m
            </span>
          </div>
          {isAdminOrSupervisor && (
            <button
              type="button"
              data-testid="btn-open-system-config"
              onClick={() => setIsConfigModalOpen(true)}
              className="mt-2 text-xs font-bold text-txt-secondary hover:text-txt-primary bg-canvas hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-border transition-colors flex items-center justify-center gap-1.5"
            >
              <Icon name="settings" className="w-4 h-4" />
              <span>Configuración</span>
            </button>
          )}
        </div>
      </section>

      {/* Banner de Error Global si existe */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Icon name="warning" className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-xs font-bold px-2 py-1 rounded bg-black/10 hover:bg-black/20 transition-colors inline-flex items-center gap-1"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
            <span>Cerrar</span>
          </button>
        </div>
      )}

      {/* 2. SUB-NAVEGACIÓN POR PESTAÑAS (ROLE TABLIST) */}
      <nav
        role="tablist"
        aria-label="Pestañas de Asistencias"
        className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'monitor'}
          onClick={() => setActiveTab('monitor')}
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'monitor'
              ? 'bg-surface text-txt-primary shadow-xs border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="activity" className="w-4 h-4" />
          <span>Monitor en Vivo & Escáner QR</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-surface text-txt-primary shadow-xs border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="audit" className="w-4 h-4" />
          <span>Historial de Asistencias</span>
          {attendances.length > 0 && (
            <span className="text-[10px] bg-canvas px-1.5 py-0.5 rounded-full font-bold">
              {attendances.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'extensions'}
          onClick={() => {
            setActiveTab('extensions');
            void loadMemberships();
          }}
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'extensions'
              ? 'bg-surface text-txt-primary shadow-xs border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="calendar" className="w-4 h-4" />
          <span>Recuperación Manual de Días (Prórrogas)</span>
          {extensions.length > 0 && (
            <span className="text-[10px] bg-canvas px-1.5 py-0.5 rounded-full font-bold">
              {extensions.length}
            </span>
          )}
        </button>
      </nav>

      {/* 3. CONTENIDO SEGÚN PESTAÑA */}
      {/* ===================================================================== */}
      {/* PESTAÑA 1: MONITOR EN VIVO & ESCÁNER QR */}
      {/* ===================================================================== */}
      {activeTab === 'monitor' && (
        <section aria-label="Monitor de Control de Acceso" className="flex flex-col gap-6">
          {/* Zona de Escaneo QR (Cámara Web, Imagen o Token Manual) */}
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col gap-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Formulario de Validación Manual de Token QR */}
              <form onSubmit={handleScanQrSubmit} className="flex-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    id="scanner-qr-input"
                    data-testid="scanner-qr-input"
                    type="text"
                    autoFocus
                    placeholder="Pegue o ingrese el token QR (ZG-...) y presione Enter"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    disabled={isActionLoading}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-canvas text-sm font-bold text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand shadow-inner"
                  />
                  <Icon
                    name="qr"
                    className="w-4 h-4 absolute left-3.5 top-3.5 text-txt-muted pointer-events-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isActionLoading || !qrInput.trim()}
                  className="px-5 py-3 rounded-xl bg-brand hover:bg-brand-hover text-brand-text font-black text-xs shadow-xs transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {isActionLoading ? 'Validando...' : 'Escanear / Validar'}
                </button>
              </form>

              {/* Controles de Cámara Web, Foto QR e Ingreso Manual */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isStartingCamera}
                  onClick={() => {
                    clearCameraError();
                    if (isCameraActive) {
                      stopCamera();
                    } else {
                      void startCamera();
                    }
                  }}
                  className={`px-3.5 py-3 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap ${
                    isCameraActive
                      ? 'bg-rose-600 hover:bg-rose-500 border-rose-500 text-white'
                      : 'bg-canvas border-border hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-primary'
                  }`}
                >
                  <Icon name={isCameraActive ? 'x' : 'camera'} className="w-4 h-4" />
                  <span>
                    {isStartingCamera
                      ? 'Abriendo cámara...'
                      : isCameraActive
                        ? 'Cerrar Cámara Web'
                        : 'Usar Cámara Web'}
                  </span>
                </button>

                <label className="cursor-pointer px-3.5 py-3 rounded-xl bg-canvas border border-border hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-primary font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap">
                  <Icon name="upload" className="w-4 h-4" />
                  <span>Leer Imagen QR</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void scanImageFile(file);
                    }}
                  />
                </label>

                <button
                  type="button"
                  data-testid="btn-manual-olvido-qr"
                  onClick={() => setIsManualModalOpen(true)}
                  className="px-4 py-3 rounded-xl bg-canvas border border-border hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-primary font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-2xs whitespace-nowrap"
                >
                  <Icon name="user" className="w-4 h-4" />
                  <span>Ingreso Manual por Olvido de QR</span>
                </button>
              </div>
            </div>

            {cameraError && (
              <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 dark:border-amber-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="warning" className="w-4 h-4 shrink-0" />
                  <span>{cameraError}</span>
                </span>
                <button
                  type="button"
                  onClick={clearCameraError}
                  className="font-bold hover:underline shrink-0"
                >
                  Ocultar
                </button>
              </div>
            )}

            {isCameraActive && (
              <div className="bg-slate-950 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4 border border-emerald-500/40">
                <div className="relative w-48 h-36 rounded-lg overflow-hidden border-2 border-emerald-400/70 bg-black shrink-0">
                  <video
                    ref={webcamVideoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-4 border-2 border-emerald-400/60 rounded-md" />
                </div>
                <div className="text-xs text-slate-200 flex flex-col gap-1">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Cámara Web Activa — Escaneo Automático
                  </span>
                  <span className="text-slate-400">
                    Muestra la credencial QR frente a la cámara. El sistema validará automáticamente sin presionar Enter.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* SIMULADOR RÁPIDO DE SOCIOS REGISTRADOS (Acceso 1-clic para pruebas manuales y demo) */}
          {clients.length > 0 && (
            <div className="bg-canvas-subtle border border-border rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-txt-secondary flex items-center gap-1.5">
                <Icon name="sparkles" className="w-3.5 h-3.5 text-brand" />
                <span>Simulación rápida de escaneo con 1 clic (Socios en el gimnasio):</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {clients.slice(0, 8).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleQuickSimulateScan(client)}
                    disabled={isActionLoading}
                    className="text-xs bg-surface border border-border hover:border-brand px-3 py-1.5 rounded-lg text-txt-primary font-semibold transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <Icon name={client.codigo_qr_token ? 'qr' : 'user'} className="w-3.5 h-3.5 text-txt-muted" />
                    <span>
                      {client.nombres} {client.apellidos}
                    </span>
                    <span className="text-[10px] text-txt-muted font-normal">
                      ({client.numero_documento})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gran Tarjeta Visual del Semáforo */}
          <TrafficLightCard
            evaluation={currentEvaluation}
            onClear={resetCurrentEvaluation}
            onAuthorizeRedPass={handleOpenAuthRedPass}
            onNavigateToPos={onNavigateToPos}
            isActionLoading={isActionLoading}
          />
        </section>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 2: HISTORIAL DE ASISTENCIAS */}
      {/* ===================================================================== */}
      {activeTab === 'history' && (
        <section aria-label="Historial Operacional de Asistencias">
          <AttendanceHistoryTable
            attendances={attendances}
            isLoading={isLoading}
            error={error}
            onFilterChange={(filter) => void fetchAttendances(filter)}
            onRetry={() => void fetchAttendances()}
            onOpenManualModal={() => setIsManualModalOpen(true)}
          />
        </section>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 3: RECUPERACIÓN MANUAL DE DÍAS (PRÓRROGAS) */}
      {/* ===================================================================== */}
      {activeTab === 'extensions' && (
        <section aria-label="Recuperación Manual de Días de Membresía">
          <MembershipExtensionsTable
            extensions={extensions}
            isLoading={isLoading}
            error={error}
            onOpenExtendModal={() => setIsExtendModalOpen(true)}
            onRetry={() => void fetchExtensions()}
          />
        </section>
      )}

      {/* MODAL 1: INGRESO MANUAL POR OLVIDO DE QR */}
      <ManualCheckInModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        clients={clients}
        onSubmit={async (input: CheckInInput) => {
          await checkIn(input);
        }}
        isLoading={isActionLoading}
      />

      {/* MODAL 2: AUTORIZAR PASE DIARIO A CRÉDITO EN ROJO */}
      <AuthorizeRedPassModal
        isOpen={isAuthRedPassModalOpen}
        onClose={() => {
          setIsAuthRedPassModalOpen(false);
          setRedPassTargetEvaluation(null);
        }}
        evaluation={redPassTargetEvaluation}
        defaultMonto={systemConfig?.precioPaseDiarioCreditoDefault ?? '10.00'}
        onConfirm={async (input) => {
          await authorizeRedPass(input);
        }}
        isLoading={isActionLoading}
      />

      {/* MODAL 3: OTORGAR PRÓRROGA MANUAL DE DÍAS */}
      <ExtendMembershipModal
        isOpen={isExtendModalOpen}
        onClose={() => setIsExtendModalOpen(false)}
        memberships={activeMemberships}
        onSubmit={async (input, permiteRecuperacionDias) => {
          await extendMembership(input, permiteRecuperacionDias);
          await loadMemberships();
        }}
        isLoading={isActionLoading}
      />

      {/* MODAL 4: CONFIGURACIÓN DE PARÁMETROS OPERATIVOS */}
      <SystemConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={systemConfig}
        onSave={async (input) => {
          await updateConfig(input);
        }}
        isLoading={isActionLoading}
      />
    </div>
  );
};
