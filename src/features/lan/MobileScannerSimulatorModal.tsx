// ============================================================================
// COMPONENTE: SIMULADOR INTERACTIVO DE VISTAS MÓVILES (M1 Y M2)
// Emula la PWA /scanner en Modo Claro y Modo Oscuro sin saturación ni neón
// Ubicación: src/features/lan/MobileScannerSimulatorModal.tsx
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/primitives/Icon';
import { Dialog, DialogContent, DialogTitle } from '../../components/primitives/Modal';
import { useModalScrollLock } from '../../components/primitives/modalScrollLock';
import { normalizePairingCode, playWebAudioTone, validatePairingCode } from '../../domain/lan';
import { useWebcamQrScanner } from '../../hooks/useWebcamQrScanner';
import { lanIpc } from '../../services/ipc/lanIpc';
import { CheckInEvaluationDto } from '../../types/attendance';
import { ClientListItem } from '../../types/entity';
import { PairedMobileSessionDto } from '../../types/lan';

export interface MobileScannerSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPairingCode?: string;
  clients?: ClientListItem[];
}

export const MobileScannerSimulatorModal: React.FC<MobileScannerSimulatorModalProps> = ({
  isOpen,
  onClose,
  initialPairingCode = '',
  clients = [],
}) => {
  // Tema independiente del escáner móvil (Claro / Oscuro), inicializado según la app
  const [simTheme, setSimTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
    return 'light';
  });

  // Estado de la sesión del teléfono móvil en el simulador
  const [mobileSession, setMobileSession] = useState<PairedMobileSessionDto | null>(null);

  // Estados de Vista M1 (Vinculación)
  const [pairingCodeInput, setPairingCodeInput] = useState(initialPairingCode);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  // Estados de Vista M2 (Escáner y Semáforo)
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [dniInput, setDniInput] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [isScanLoading, setIsScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isPreviewSimulated, setIsPreviewSimulated] = useState(false);
  const [isTorchHighlighted, setIsTorchHighlighted] = useState(false);

  // Overlay Semafórico y Registro de Último Pase
  const [currentEvaluation, setCurrentEvaluation] = useState<CheckInEvaluationDto | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<CheckInEvaluationDto | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar tema inicial cuando el modal se abre
  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      setSimTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    }
  }, [isOpen]);

  // Actualizar código si viene desde el modal padre
  useEffect(() => {
    if (initialPairingCode) {
      setPairingCodeInput(normalizePairingCode(initialPairingCode));
    }
  }, [initialPairingCode]);

  // Cierra el overlay actual y lo registra como Último pase
  const dismissOverlay = useCallback(() => {
    setCurrentEvaluation((prev) => {
      if (prev) {
        setLastEvaluation(prev);
      }
      return null;
    });
  }, []);

  // Manejo de sonido y temporizadores al recibir evaluación semafórica
  useEffect(() => {
    if (!currentEvaluation) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCountdownSeconds(null);
      return;
    }

    const { colorSemaforo } = currentEvaluation;

    if (colorSemaforo === 'VERDE') {
      playWebAudioTone(880, 0.15);
      setCountdownSeconds(3);

      timerRef.current = setTimeout(() => {
        dismissOverlay();
      }, 2500);
    } else if (colorSemaforo === 'AMARILLO') {
      playWebAudioTone(660, 0.1);
      setTimeout(() => playWebAudioTone(880, 0.15), 120);
      setCountdownSeconds(4);

      timerRef.current = setTimeout(() => {
        dismissOverlay();
      }, 3500);
    } else if (colorSemaforo === 'ROJO') {
      playWebAudioTone(220, 0.35, 'sawtooth');
      setCountdownSeconds(null);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentEvaluation, dismissOverlay]);

  // Acción: Vincular teléfono móvil (Vista M1 -> M2)
  const handlePairDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingError(null);

    const validation = validatePairingCode(pairingCodeInput);
    if (validation) {
      setPairingError(validation);
      return;
    }

    setIsPairingLoading(true);
    try {
      const session = await lanIpc.pairMobileDevice({
        codigoVinculacion: normalizePairingCode(pairingCodeInput),
        userAgent: 'Simulador iOS/Android ZaramaGYM v2',
        ipAddress: '127.0.0.1',
      });
      setMobileSession(session);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Código de vinculación inválido, expirado o ya utilizado.';
      setPairingError(msg);
    } finally {
      setIsPairingLoading(false);
    }
  };

  // Acción: Desvincular teléfono del simulador
  const handleUnpair = () => {
    setMobileSession(null);
    setCurrentEvaluation(null);
    setLastEvaluation(null);
    setPairingCodeInput('');
    setPairingError(null);
    setQrTokenInput('');
    setDniInput('');
    setSelectedClientId('');
    setScanError(null);
    setIsPreviewSimulated(false);
    setIsTorchHighlighted(false);
  };

  // Acción: Ejecutar escaneo QR o consulta por DNI (Vista M2)
  const handleExecuteScan = async (mode: 'qr' | 'dni', overrideQr?: string) => {
    if (!mobileSession) return;
    setScanError(null);

    const tokenToUse = overrideQr !== undefined ? overrideQr : qrTokenInput.trim();
    const dniToUse = dniInput.trim();

    if (mode === 'qr' && !tokenToUse) {
      setScanError('Por favor ingresa o selecciona un token QR.');
      return;
    }

    if (mode === 'dni' && !dniToUse) {
      setScanError('Por favor ingresa un número de documento.');
      return;
    }

    setIsScanLoading(true);
    try {
      const result = await lanIpc.mobileScanQr({
        tokenSesion: mobileSession.tokenSesion,
        qrToken: mode === 'qr' ? tokenToUse : undefined,
        numeroDocumento: mode === 'dni' ? dniToUse : undefined,
      });
      setCurrentEvaluation((prev) => {
        if (prev) {
          setLastEvaluation(prev);
        }
        return result;
      });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al procesar la lectura en el servidor LAN.';
      setScanError(msg);
    } finally {
      setIsScanLoading(false);
    }
  };

  const {
    videoRef,
    isCameraActive,
    isStartingCamera,
    cameraError,
    startCamera,
    stopCamera,
    scanImageFile,
  } = useWebcamQrScanner({
    active: isOpen && Boolean(mobileSession),
    onDetected: async (decodedToken) => {
      setQrTokenInput(decodedToken);
      await handleExecuteScan('qr', decodedToken);
    },
  });

  // Selección rápida de un socio existente para simular lectura óptica
  const handleSelectClient = (clientIdStr: string) => {
    setSelectedClientId(clientIdStr ? Number(clientIdStr) : '');
    if (!clientIdStr) return;

    const found = clients.find((c) => c.id === Number(clientIdStr));
    if (found) {
      setQrTokenInput(found.codigo_qr_token);
      setDniInput(found.numero_documento);
    }
  };

  useModalScrollLock(isOpen);

  if (!isOpen) return null;

  const isLiveFeedActive = isCameraActive || isPreviewSimulated;

  const lastPassStatusMeta = (() => {
    if (!lastEvaluation) {
      return {
        dotClass: 'bg-txt-muted',
        textClass: 'text-txt-muted',
        label: 'En espera',
      };
    }
    if (lastEvaluation.colorSemaforo === 'VERDE') {
      return {
        dotClass: 'bg-brand',
        textClass: 'text-status-success',
        label: 'Acceso Autorizado',
      };
    }
    if (lastEvaluation.colorSemaforo === 'AMARILLO') {
      return {
        dotClass: 'bg-status-warning',
        textClass: 'text-status-warning',
        label: 'Alerta Preventiva',
      };
    }
    return {
      dotClass: 'bg-status-danger',
      textClass: 'text-status-danger',
      label: 'Acceso Denegado',
    };
  })();

  const toggleSimTheme = () => setSimTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        size="sm"
        aria-describedby={undefined}
        className="bg-transparent border-none shadow-none p-0 overflow-visible max-w-sm items-center"
      >
        {/* Barra superior de controles del simulador */}
        <div className="w-full flex items-center justify-between gap-2 pb-2 text-xs text-white/90">
          <div className="flex items-center gap-1.5 font-semibold min-w-0">
            <span className="w-2 h-2 rounded-full bg-brand shrink-0" aria-hidden="true" />
            <DialogTitle className="text-xs font-semibold text-white/90 truncate">
              Simulador Móvil Wi-Fi Local
            </DialogTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleSimTheme}
              aria-pressed={simTheme === 'dark'}
              aria-label={
                simTheme === 'dark'
                  ? 'Cambiar simulador a modo claro'
                  : 'Cambiar simulador a modo oscuro'
              }
              className="hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md text-[11px] font-medium transition-colors inline-flex items-center gap-1"
            >
              <Icon name={simTheme === 'dark' ? 'sun' : 'moon'} className="w-3.5 h-3.5" />
              <span>{simTheme === 'dark' ? 'Claro' : 'Oscuro'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md text-xs transition-colors inline-flex items-center gap-1"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
              <span>Cerrar Simulador</span>
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* CARCASA DEL SMARTPHONE (Bordes atenuados + Tema Claro/Oscuro real)   */}
        {/* ==================================================================== */}
        <div
          data-testid="mobile-scanner-preview"
          data-scanner-theme={simTheme}
          className="zg-mobile-preview w-full h-[652px] max-h-[85vh] bg-canvas text-txt-primary border-[3px] border-border-strong rounded-[24px] shadow-lg overflow-hidden flex flex-col relative select-none"
        >
          {/* Barra de estado discreta del teléfono */}
          <div className="w-full bg-chrome-bar pt-2 pb-1 px-5 flex items-center justify-between z-20 text-[10px] text-chrome-bar-muted font-mono shrink-0">
            <span>9:41</span>
            <div className="w-16 h-3.5 bg-chrome-bar-border/60 rounded-full" aria-hidden="true" />
            <div className="flex items-center gap-1 text-chrome-bar-muted">
              <span>Wi-Fi</span>
              <Icon name="wifi" className="w-3 h-3" />
            </div>
          </div>

          {/* HEADER INTERNO DEL SMARTPHONE (PARIDAD CON /scanner) */}
          <header className="zg-chrome-header px-3.5 py-2.5 bg-chrome-bar border-b border-chrome-bar-border flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/zaramagym-logo.png"
                alt="ZaramaGYM"
                className="w-7 h-7 rounded-full object-cover bg-white border border-chrome-bar-border shrink-0"
              />
              <div className="min-w-0">
                <span className="text-sm font-extrabold tracking-tight text-chrome-bar-text block leading-tight">
                  Zarama<span className="text-status-success">GYM</span>
                </span>
                {mobileSession && (
                  <p className="text-[10px] text-chrome-bar-muted leading-tight truncate">
                    Control de Accesos
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={toggleSimTheme}
                aria-label="Alternar tema de vista móvil"
                aria-pressed={simTheme === 'dark'}
                title={simTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                className="w-7 h-7 rounded-md bg-chrome-bar-surface hover:bg-chrome-bar-hover border border-chrome-bar-border text-chrome-bar-text inline-flex items-center justify-center transition-colors"
              >
                <Icon name={simTheme === 'dark' ? 'sun' : 'moon'} className="w-3.5 h-3.5" />
              </button>

              <div className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-status-success-bg border border-status-success-border text-[10px] font-mono font-bold text-status-success shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
                <Icon name="lock" className="w-3 h-3" />
                <span>{mobileSession ? '3443' : 'HTTPS 3443'}</span>
              </div>
            </div>
          </header>

          {/* CUERPO INTERNO DE LA PANTALLA */}
          <div className="flex-1 bg-canvas flex flex-col relative overflow-y-auto text-txt-primary">
            {/* ============================================================== */}
            {/* VISTA M1: PANTALLA DE VINCULACIÓN POR CÓDIGO                   */}
            {/* ============================================================== */}
            {!mobileSession && (
              <div className="flex-1 flex flex-col justify-between p-4 bg-canvas">
                <div className="bg-surface border border-border rounded-xl p-5 my-auto shadow-xs flex flex-col gap-4">
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-extrabold tracking-tight text-txt-primary">
                      Vincular Celular
                    </h3>
                    <p className="text-xs text-txt-secondary leading-relaxed">
                      Conecta este teléfono al Wi-Fi del gimnasio e introduce el código de 6 caracteres generado en la PC principal.
                    </p>
                  </div>

                  <form onSubmit={handlePairDevice} className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="pairing-code-input" className="sr-only">
                        Código de Vinculación
                      </label>
                      <input
                        id="pairing-code-input"
                        type="text"
                        maxLength={8}
                        placeholder="K9M2PX"
                        value={pairingCodeInput}
                        onChange={(e) => setPairingCodeInput(normalizePairingCode(e.target.value))}
                        className="w-full bg-canvas-subtle border border-border-strong focus:border-border-focus focus:ring-[3px] focus:ring-ring/20 rounded-lg font-mono text-2xl font-extrabold tracking-[0.34em] text-txt-primary uppercase py-2.5 text-center placeholder:text-txt-muted/70 focus:outline-none transition-[border-color,box-shadow]"
                        autoFocus
                      />
                    </div>

                    {pairingError && (
                      <div
                        role="alert"
                        className="text-xs font-medium text-status-danger bg-status-danger-bg border border-status-danger-border rounded-md p-2.5 text-center"
                      >
                        {pairingError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isPairingLoading || !pairingCodeInput.trim()}
                      className="w-full bg-brand hover:bg-brand-hover text-brand-text font-semibold py-2.5 rounded-lg transition-colors active:scale-[0.99] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                    >
                      {isPairingLoading ? (
                        <span>Vinculando dispositivo...</span>
                      ) : (
                        <>
                          <Icon name="key" className="w-4 h-4" />
                          <span>Vincular este Teléfono</span>
                        </>
                      )}
                    </button>
                  </form>

                  <p className="text-[11px] text-txt-secondary text-center leading-relaxed pt-3 border-t border-border">
                    Usa <strong className="text-txt-primary">HTTPS</strong> para habilitar la cámara en vivo. Si el navegador muestra aviso local, pulsa{' '}
                    <strong className="text-txt-primary">Avanzado → Continuar</strong> o instala el Certificado CA Local.
                  </p>
                </div>

                <footer className="pt-3 pb-1 flex items-center justify-center gap-2 text-[10px] font-mono text-txt-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
                  <span>SQLite Local-First: OK • Build: v0.1.0-prod</span>
                </footer>
              </div>
            )}

            {/* ============================================================== */}
            {/* VISTA M2: ESCÁNER QR Y CONTROL DE ASISTENCIAS                  */}
            {/* ============================================================== */}
            {mobileSession && (
              <div className="flex-1 flex flex-col justify-between p-3 gap-2.5 bg-canvas text-txt-primary relative">
                <div className="flex flex-col gap-2.5">
                  {/* Barra de Terminal Conectada */}
                  <div className="bg-surface border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
                        <p className="font-bold text-xs text-txt-primary truncate">
                          Terminal: {mobileSession.nombreDispositivo}
                        </p>
                      </div>
                      <p className="text-[10px] text-txt-muted truncate pl-3">
                        Wi-Fi LAN :3443 Conectado
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleUnpair}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-danger hover:bg-status-danger-bg border border-transparent hover:border-status-danger-border px-2 py-1 rounded-md transition-colors shrink-0"
                    >
                      <span>Desvincular</span>
                      <Icon name="logout" className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Tarjeta cohesionada de Escáner QR */}
                  <div className="bg-surface border border-border rounded-xl p-2.5 flex flex-col gap-2 shadow-2xs">
                    <div className="flex items-center justify-between px-0.5">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-txt-secondary">
                        <Icon name="camera" className="w-3.5 h-3.5 text-status-success" />
                        <span>ENTRADA DE VIDEO</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setIsTorchHighlighted((prev) => !prev)}
                          aria-label="Alternar iluminación de visor"
                          aria-pressed={isTorchHighlighted}
                          className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${
                            isTorchHighlighted
                              ? 'bg-status-success-bg border-status-success-border text-status-success'
                              : 'bg-canvas-subtle border-border text-txt-secondary hover:text-txt-primary'
                          }`}
                        >
                          <Icon name="sparkles" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPreviewSimulated((prev) => !prev)}
                          aria-label="Alternar vista previa de cámara"
                          aria-pressed={isPreviewSimulated}
                          className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${
                            isPreviewSimulated
                              ? 'bg-status-success-bg border-status-success-border text-status-success'
                              : 'bg-canvas-subtle border-border text-txt-secondary hover:text-txt-primary'
                          }`}
                        >
                          <Icon name="refresh" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Visor sobrio de cámara (sin grilla neón ni resplandores) */}
                    <div
                      className={`relative w-full h-40 bg-[#101513] border rounded-lg overflow-hidden flex items-center justify-center transition-colors ${
                        isTorchHighlighted ? 'border-brand' : 'border-border-strong'
                      }`}
                    >
                      {isCameraActive && (
                        <video
                          ref={videoRef}
                          playsInline
                          muted
                          autoPlay
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}

                      <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-sm bg-black/75 border border-white/15 text-[10px] font-mono font-semibold text-white/90 tracking-wide">
                        {isLiveFeedActive ? 'EN VIVO • HD' : 'STANDBY • LISTO'}
                      </span>

                      {/* Retícula limpia de 4 esquinas */}
                      <div className="absolute inset-x-10 inset-y-6 pointer-events-none z-10">
                        <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/80 rounded-tl-sm" />
                        <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/80 rounded-tr-sm" />
                        <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/80 rounded-bl-sm" />
                        <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/80 rounded-br-sm" />
                        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-[1.5px] bg-brand/60" />
                      </div>

                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-black/80 border border-white/15 text-[10px] font-medium text-white/90 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
                        <span>ENFOCAR CREDENCIAL QR</span>
                      </div>
                    </div>

                    {/* Fila de 2 botones: Cámara PC + Subir Foto QR */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isStartingCamera}
                        onClick={() => (isCameraActive ? stopCamera() : void startCamera())}
                        className={`text-xs font-semibold py-2 px-2.5 rounded-md transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                          isCameraActive
                            ? 'bg-status-danger-bg text-status-danger border border-status-danger-border'
                            : 'bg-brand hover:bg-brand-hover text-brand-text border border-transparent'
                        }`}
                      >
                        <Icon name={isCameraActive ? 'x' : 'camera'} className="w-3.5 h-3.5" />
                        <span>
                          {isStartingCamera
                            ? 'Iniciando...'
                            : isCameraActive
                              ? 'Apagar Cámara PC'
                              : 'Usar Cámara PC'}
                        </span>
                      </button>
                      <label className="cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-md bg-canvas-subtle hover:bg-surface-hover border border-border-strong text-txt-primary transition-colors inline-flex items-center justify-center gap-1.5">
                        <Icon name="upload" className="w-3.5 h-3.5 text-txt-secondary" />
                        <span>Subir Foto QR</span>
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
                    </div>

                    {cameraError && (
                      <p className="text-[10px] text-status-warning text-center px-1 leading-tight">
                        {cameraError}
                      </p>
                    )}
                  </div>

                  {/* Barra de Último pase (lectura rápida sin saturar formularios) */}
                  <div className="bg-surface border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${lastPassStatusMeta.dotClass}`}
                        aria-hidden="true"
                      />
                      <span className="text-txt-secondary shrink-0">Último pase:</span>
                      <strong className="text-txt-primary font-semibold truncate">
                        {lastEvaluation ? lastEvaluation.nombreCompleto : 'Sin lecturas'}
                      </strong>
                    </div>
                    <span className={`font-mono text-[10px] font-semibold shrink-0 ${lastPassStatusMeta.textClass}`}>
                      {lastPassStatusMeta.label}
                    </span>
                  </div>

                  {/* Selector Rápido de Socios para Pruebas Inmediatas */}
                  {clients.length > 0 && (
                    <div>
                      <label
                        htmlFor="quick-client-select"
                        className="text-[10px] font-semibold text-txt-secondary flex items-center gap-1 mb-1"
                      >
                        <span>Simular lectura de socio del gimnasio</span>
                      </label>
                      <select
                        id="quick-client-select"
                        value={selectedClientId}
                        onChange={(e) => handleSelectClient(e.target.value)}
                        className="w-full text-xs bg-surface border border-border-strong focus:border-border-focus rounded-md px-2.5 py-1.5 text-txt-primary font-medium focus:outline-none"
                      >
                        <option value="">-- Seleccionar socio para escanear --</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombres} {c.apellidos} ({c.tipo_documento}: {c.numero_documento})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Tarjeta sobria INGRESO MANUAL / RESPALDO */}
                  <div className="bg-canvas-subtle border border-border rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-txt-secondary">
                        <Icon name="edit" className="w-3.5 h-3.5 text-status-success" />
                        <span>INGRESO MANUAL / RESPALDO</span>
                      </div>
                      <span className="text-[10px] font-mono text-txt-muted">
                        Terminal #{String(mobileSession.deviceId).padStart(2, '0')}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sim-qr-token-input"
                        className="text-[11px] font-medium text-txt-secondary"
                      >
                        Token QR directo
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="sim-qr-token-input"
                          type="text"
                          placeholder="Pegar token QR (ZG-...)"
                          value={qrTokenInput}
                          onChange={(e) => setQrTokenInput(e.target.value)}
                          className="flex-1 min-w-0 bg-surface border border-border-strong rounded-md px-2.5 py-1.5 text-xs text-txt-primary font-mono placeholder:text-txt-muted focus:outline-none focus:border-border-focus"
                        />
                        <button
                          type="button"
                          disabled={isScanLoading}
                          onClick={() => void handleExecuteScan('qr')}
                          className="bg-surface hover:bg-surface-hover border border-border-strong text-txt-primary font-semibold text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 shrink-0"
                        >
                          {isScanLoading ? '...' : 'Escanear'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sim-dni-input"
                        className="text-[11px] font-medium text-txt-secondary"
                      >
                        Documento de identidad
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="sim-dni-input"
                          type="text"
                          placeholder="Ingreso manual por DNI / CE"
                          value={dniInput}
                          onChange={(e) => setDniInput(e.target.value)}
                          className="flex-1 min-w-0 bg-surface border border-border-strong rounded-md px-2.5 py-1.5 text-xs text-txt-primary font-mono placeholder:text-txt-muted focus:outline-none focus:border-border-focus"
                        />
                        <button
                          type="button"
                          disabled={isScanLoading}
                          onClick={() => void handleExecuteScan('dni')}
                          className="bg-surface hover:bg-surface-hover border border-border-strong text-txt-primary font-semibold text-xs px-3.5 py-1.5 rounded-md transition-colors disabled:opacity-50 shrink-0"
                        >
                          {isScanLoading ? '...' : 'DNI'}
                        </button>
                      </div>
                    </div>

                    {scanError && (
                      <div
                        role="alert"
                        className="text-[11px] font-medium text-status-danger bg-status-danger-bg border border-status-danger-border rounded-md p-2 text-center"
                      >
                        {scanError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer compacto */}
                <footer className="flex items-center justify-between text-[10px] font-mono text-txt-muted pt-0.5 px-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
                    <span>SQLite Local-First: OK</span>
                  </span>
                  <span>Build: v0.1.0-prod</span>
                </footer>

                {/* ========================================================== */}
                {/* OVERLAY SEMAFÓRICO MATE A PANTALLA COMPLETA (< 1s)         */}
                {/* ========================================================== */}
                {currentEvaluation && (
                  <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={`Resultado de Asistencia Semáforo ${currentEvaluation.colorSemaforo}`}
                    className={`absolute inset-0 z-30 flex flex-col justify-between p-5 text-white transition-opacity duration-150 ${
                      currentEvaluation.colorSemaforo === 'VERDE'
                        ? 'bg-[#065f46]'
                        : currentEvaluation.colorSemaforo === 'AMARILLO'
                        ? 'bg-[#92400e]'
                        : 'bg-[#991b1b]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-black/25 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 border border-white/15">
                        <span className="w-2 h-2 rounded-full bg-white" aria-hidden="true" />
                        <span>
                          {currentEvaluation.colorSemaforo === 'VERDE' && 'INGRESO CONCEDIDO'}
                          {currentEvaluation.colorSemaforo === 'AMARILLO' && 'ALERTA PREVENTIVA'}
                          {currentEvaluation.colorSemaforo === 'ROJO' && 'ACCESO BLOQUEADO'}
                        </span>
                      </span>
                      {countdownSeconds !== null && (
                        <span className="text-xs font-mono font-bold bg-black/25 border border-white/15 px-2 py-0.5 rounded-sm">
                          {countdownSeconds}s
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col items-center text-center my-auto gap-2">
                      <div className="w-16 h-16 rounded-full bg-white/15 border border-white/30 flex items-center justify-center mb-1">
                        {currentEvaluation.colorSemaforo === 'VERDE' && (
                          <Icon name="check" className="w-8 h-8" />
                        )}
                        {currentEvaluation.colorSemaforo === 'AMARILLO' && (
                          <Icon name="warning" className="w-8 h-8" />
                        )}
                        {currentEvaluation.colorSemaforo === 'ROJO' && (
                          <Icon name="danger" className="w-8 h-8" />
                        )}
                      </div>

                      <h2 className="text-xl font-extrabold tracking-tight leading-tight">
                        {currentEvaluation.nombreCompleto}
                      </h2>

                      <p className="text-xs font-mono font-medium text-white/90">
                        {currentEvaluation.tipoDocumento}: {currentEvaluation.numeroDocumento}
                      </p>

                      {currentEvaluation.nombrePlan && (
                        <div className="bg-white/15 px-2.5 py-0.5 rounded-sm text-xs font-semibold mt-0.5">
                          {currentEvaluation.nombrePlan}
                        </div>
                      )}

                      <p className="text-xs font-medium mt-2 px-3 py-1.5 bg-black/25 border border-white/15 rounded-lg">
                        {currentEvaluation.motivoSemaforo}
                      </p>

                      {currentEvaluation.diasRestantes !== null &&
                        currentEvaluation.diasRestantes !== undefined && (
                          <p className="text-xs font-bold">
                            {currentEvaluation.diasRestantes > 0
                              ? `¡Quedan ${currentEvaluation.diasRestantes} días de vigencia!`
                              : `Vencido hace ${Math.abs(currentEvaluation.diasRestantes)} días`}
                          </p>
                        )}

                      {Number(currentEvaluation.deudaTotalPendiente || 0) > 0 && (
                        <div className="bg-black/30 border border-white/25 text-white text-xs font-bold px-3 py-1 rounded-md mt-1">
                          Saldo deudor: S/ {currentEvaluation.deudaTotalPendiente}
                        </div>
                      )}

                      {currentEvaluation.colorSemaforo === 'ROJO' && (
                        <div className="mt-2 bg-white text-[#991b1b] font-extrabold text-xs px-3.5 py-2 rounded-md tracking-wide uppercase">
                          POR FAVOR DIRÍJASE A CAJA
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={dismissOverlay}
                      className="w-full bg-white hover:bg-white/90 text-[#0f1714] font-bold py-2.5 rounded-md transition-colors text-xs uppercase tracking-wider"
                    >
                      {currentEvaluation.colorSemaforo === 'ROJO'
                        ? 'Cerrar y Escanear Siguiente'
                        : 'Continuar'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Barra inferior discreta del smartphone */}
          <div className="w-full bg-canvas py-1.5 flex items-center justify-center z-20 shrink-0 border-t border-border/60">
            <div className="w-24 h-1 bg-border-strong/70 rounded-full" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
