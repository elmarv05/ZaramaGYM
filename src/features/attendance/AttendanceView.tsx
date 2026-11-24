// ============================================================================
// VISTA PRINCIPAL: CONTROL DE ASISTENCIAS, SEMÁFORO Y RECUPERACIÓN (SLICE 5)
// Wireframe Pro con KPIs en vivo, 3 Pestañas operativas y modales especializados
// Ubicación: src/features/attendance/AttendanceView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Icon,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/primitives';
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

  const isAdmin = currentSession.rol === 'ADMINISTRADOR';

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
        className={
          isAdmin
            ? 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3'
            : 'grid grid-cols-2 sm:grid-cols-4 gap-3'
        }
      >
        <Card padding="sm" className="shadow-2xs gap-0">
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
        </Card>

        <Card padding="sm" className="shadow-2xs gap-0">
          <span className="text-[10px] uppercase font-bold text-status-success tracking-wider inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-success shrink-0" aria-hidden="true" />
            <span>Verdes</span>
          </span>
          <span className="text-2xl font-black text-status-success mt-1">
            {todaySummary?.totalVerde ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary">Membresía activa al día y sin deudas</span>
        </Card>

        <Card padding="sm" className="shadow-2xs gap-0">
          <span className="text-[10px] uppercase font-bold text-status-warning tracking-wider inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-warning shrink-0" aria-hidden="true" />
            <span>Amarillos</span>
          </span>
          <span className="text-2xl font-black text-status-warning mt-1">
            {todaySummary?.totalAmarillo ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary">Membresia por vender o deuda</span>
        </Card>

        <Card padding="sm" className="shadow-2xs gap-0">
          <span className="text-[10px] uppercase font-bold text-status-danger tracking-wider inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-danger shrink-0" aria-hidden="true" />
            <span>Rojos</span>
          </span>
          <span className="text-2xl font-black text-status-danger mt-1">
            {todaySummary?.totalPaseCredito ?? todaySummary?.totalRojoAutorizados ?? 0}
          </span>
          <span className="text-[11px] text-txt-secondary">Pases diarios autorizados sin membresía</span>
        </Card>

        {/* Acceso a Configuración de Semáforo (Exclusivo Administrador) */}
        {isAdmin && (
          <Card
            padding="sm"
            className="shadow-2xs justify-between gap-2 col-span-2 sm:col-span-4 lg:col-span-1"
          >
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
                Parámetros Semáforo
              </span>
              <span className="text-xs font-semibold text-txt-secondary mt-0.5">
                Umbral: {systemConfig?.diasAlertaAmarillo ?? 5}d • Anti-Rebote: {systemConfig?.minutosAntireboteQr ?? 3}m
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="btn-open-system-config"
              onClick={() => setIsConfigModalOpen(true)}
              leftIcon={<Icon name="settings" className="w-4 h-4" />}
              className="w-full"
            >
              Configuración
            </Button>
          </Card>
        )}
      </section>

      {/* Banner de Error Global si existe */}
      {error && (
        <Alert variant="danger" floating={false} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* 2. SUB-NAVEGACIÓN POR PESTAÑAS (RADIX TABS) */}
      <Tabs
        value={activeTab}
        onValueChange={(nextValue) => {
          const nextTab = nextValue as AttendanceMainTab;
          setActiveTab(nextTab);
          if (nextTab === 'extensions') {
            void loadMemberships();
          }
        }}
        className="gap-6"
      >
        <TabsList aria-label="Pestañas de Asistencias">
          <TabsTrigger value="monitor">
            <Icon name="activity" className="w-4 h-4" aria-hidden="true" />
            <span>Monitor en Vivo & Escáner QR</span>
          </TabsTrigger>

          <TabsTrigger value="history">
            <Icon name="audit" className="w-4 h-4" aria-hidden="true" />
            <span>Historial de Asistencias</span>
          </TabsTrigger>

          <TabsTrigger value="extensions">
            <Icon name="calendar" className="w-4 h-4" aria-hidden="true" />
            <span>Recuperación Manual de Días</span>
          </TabsTrigger>
        </TabsList>

        {/* 3. CONTENIDO SEGÚN PESTAÑA */}
        {/* ===================================================================== */}
        {/* PESTAÑA 1: MONITOR EN VIVO & ESCÁNER QR */}
        {/* ===================================================================== */}
        <TabsContent value="monitor">
          <section aria-label="Monitor de Control de Acceso" className="flex flex-col gap-6">
          {/* Zona de Escaneo QR (Cámara Web, Imagen o Token Manual) */}
          <Card padding="md" className="rounded-2xl gap-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Formulario de Validación Manual de Token QR */}
              <form onSubmit={handleScanQrSubmit} className="flex-1 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    id="scanner-qr-input"
                    data-testid="scanner-qr-input"
                    type="text"
                    autoFocus
                    aria-label="Token QR del socio"
                    placeholder="Pegue o ingrese el token QR (ZG-...) y presione Enter"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    disabled={isActionLoading}
                    leftIcon={<Icon name="qr" className="w-4 h-4" />}
                    className="py-2.5 font-bold bg-canvas rounded-xl shadow-inner"
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isActionLoading || !qrInput.trim()}
                  className="rounded-xl whitespace-nowrap"
                >
                  {isActionLoading ? 'Validando...' : 'Escanear / Validar'}
                </Button>
              </form>

              {/* Controles de Cámara Web, Foto QR e Ingreso Manual */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={isCameraActive ? 'danger' : 'secondary'}
                  size="md"
                  disabled={isStartingCamera}
                  onClick={() => {
                    clearCameraError();
                    if (isCameraActive) {
                      stopCamera();
                    } else {
                      void startCamera();
                    }
                  }}
                  leftIcon={<Icon name={isCameraActive ? 'x' : 'camera'} className="w-4 h-4" />}
                  className="rounded-xl whitespace-nowrap text-xs font-bold"
                >
                  {isStartingCamera
                    ? 'Abriendo cámara...'
                    : isCameraActive
                    ? 'Cerrar Cámara Web'
                    : 'Usar Cámara Web'}
                </Button>

                <label className="cursor-pointer px-3.5 py-2 min-h-[38px] rounded-xl bg-surface border border-border hover:bg-surface-hover text-txt-primary font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap focus-within:ring-2 focus-within:ring-border-focus">
                  <Icon name="upload" className="w-4 h-4" aria-hidden="true" />
                  <span>Leer Imagen QR</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void scanImageFile(file);
                    }}
                  />
                </label>

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  data-testid="btn-manual-olvido-qr"
                  onClick={() => setIsManualModalOpen(true)}
                  leftIcon={<Icon name="user" className="w-4 h-4" />}
                  className="rounded-xl whitespace-nowrap text-xs font-bold"
                >
                  Ingreso Manual por Olvido de QR
                </Button>
              </div>
            </div>

            {cameraError && (
              <Alert variant="warning" floating={false} onClose={clearCameraError}>
                {cameraError}
              </Alert>
            )}

            {isCameraActive && (
              <div className="bg-canvas-subtle rounded-xl p-3 flex flex-col sm:flex-row items-center gap-4 border border-status-success/40">
                <div className="relative w-48 h-36 rounded-lg overflow-hidden border-2 border-status-success/70 bg-black shrink-0">
                  <video
                    ref={webcamVideoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-4 border-2 border-status-success/60 rounded-md" />
                </div>
                <div className="text-xs text-txt-primary flex flex-col gap-1">
                  <span className="font-bold text-status-success flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" aria-hidden="true" />
                    Cámara Web Activa — Escaneo Automático
                  </span>
                  <span className="text-txt-secondary">
                    Muestra la credencial QR frente a la cámara. El sistema validará automáticamente sin presionar Enter.
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* SIMULADOR RÁPIDO DE SOCIOS REGISTRADOS (Acceso 1-clic para pruebas manuales y demo) */}
          {clients.length > 0 && (
            <Card variant="subtle" padding="sm" className="gap-2">
              <span className="text-[11px] font-bold text-txt-secondary flex items-center gap-1.5">
                <Icon name="sparkles" className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                <span>Simulación rápida de escaneo con 1 clic (Socios en el gimnasio):</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {clients.slice(0, 8).map((client) => (
                  <Button
                    key={client.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleQuickSimulateScan(client)}
                    disabled={isActionLoading}
                    leftIcon={
                      <Icon
                        name={client.codigo_qr_token ? 'qr' : 'user'}
                        className="w-3.5 h-3.5 text-txt-muted"
                      />
                    }
                    className="hover:border-brand"
                  >
                    <span>
                      {client.nombres} {client.apellidos}{' '}
                      <span className="text-[10px] text-txt-muted font-normal">
                        ({client.numero_documento})
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </Card>
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
        </TabsContent>

        {/* ===================================================================== */}
        {/* PESTAÑA 2: HISTORIAL DE ASISTENCIAS */}
        {/* ===================================================================== */}
        <TabsContent value="history">
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
        </TabsContent>

        {/* ===================================================================== */}
        {/* PESTAÑA 3: RECUPERACIÓN MANUAL DE DÍAS (PRÓRROGAS) */}
        {/* ===================================================================== */}
        <TabsContent value="extensions">
          <section aria-label="Recuperación Manual de Días de Membresía">
            <MembershipExtensionsTable
              extensions={extensions}
              isLoading={isLoading}
              error={error}
              canExtendMembership={true}
              onOpenExtendModal={() => setIsExtendModalOpen(true)}
              onRetry={() => void fetchExtensions()}
            />
          </section>
        </TabsContent>
      </Tabs>

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
      {isAdmin && (
        <SystemConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          config={systemConfig}
          onSave={async (input) => {
            await updateConfig(input);
          }}
          isLoading={isActionLoading}
        />
      )}
    </div>
  );
};
