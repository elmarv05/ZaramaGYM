// ============================================================================
// COMPONENTE: SIMULADOR INTERACTIVO DE VISTAS MÓVILES (M1 Y M2)
// Permite emular y verificar la experiencia iOS/Android y el Semáforo LAN (< 1s)
// Ubicación: src/features/lan/MobileScannerSimulatorModal.tsx
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/primitives/Icon';
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
      // Rojo no tiene auto-cierre: exige intervención consciente del operador
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
      const msg = err && typeof err === 'object' && 'message' in err
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
      const msg = err && typeof err === 'object' && 'message' in err
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

  if (!isOpen) return null;

  const isLiveFeedActive = isCameraActive || isPreviewSimulated;

  const lastPassStatusMeta = (() => {
    if (!lastEvaluation) {
      return {
        dotClass: 'bg-slate-500',
        textClass: 'text-slate-400',
        label: 'En espera',
      };
    }
    if (lastEvaluation.colorSemaforo === 'VERDE') {
      return {
        dotClass: 'bg-emerald-400',
        textClass: 'text-emerald-400',
        label: 'Acceso Autorizado',
      };
    }
    if (lastEvaluation.colorSemaforo === 'AMARILLO') {
      return {
        dotClass: 'bg-amber-400',
        textClass: 'text-amber-400',
        label: 'Alerta Preventiva',
      };
    }
    return {
      dotClass: 'bg-red-500',
      textClass: 'text-rose-400',
      label: 'Acceso Denegado',
    };
  })();

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulator-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain zg-modal-backdrop"
    >
      <div className="relative w-full max-w-sm my-auto flex flex-col items-center">
        {/* Barra superior de controles del simulador */}
        <div className="w-full flex items-center justify-between pb-2 text-xs text-white/85">
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
            <span id="simulator-modal-title">Simulador Móvil Wi-Fi Local</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded text-xs transition-colors inline-flex items-center gap-1"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
            <span>Cerrar Simulador</span>
          </button>
        </div>

        {/* ==================================================================== */}
        {/* CARCASA DEL SMARTPHONE (iOS / Android Ergonomics)                    */}
        {/* ==================================================================== */}
        <div className="w-full h-[660px] max-h-[86vh] bg-[#090e1a] border-4 border-slate-700/80 rounded-[38px] shadow-2xl overflow-hidden flex flex-col relative select-none">
          {/* Dynamic Island / Notch superior */}
          <div className="w-full bg-[#090e1a] pt-2 pb-1 px-6 flex items-center justify-between z-20 text-[11px] text-slate-300 font-mono shrink-0">
            <span>9:41</span>
            <div className="w-20 h-4 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-slate-950" />
            </div>
            <div className="flex items-center gap-1 text-slate-300">
              <span>5G</span>
              <Icon name="wifi" className="w-3.5 h-3.5" />
              <Icon name="activity" className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* HEADER INTERNO DEL SMARTPHONE (COMPARTIDO M1 Y M2) */}
          <header className="px-3.5 py-2.5 bg-[#0d1424]/95 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/zaramagym-logo.png"
                alt="ZaramaGYM"
                className="w-8 h-8 rounded-full object-cover ring-1 ring-emerald-400/60 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-white">
                    Zarama<span className="text-emerald-400">GYM</span>
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                    PWA
                  </span>
                </div>
                {mobileSession && (
                  <p className="text-[10px] text-slate-400 leading-tight truncate">
                    Control de Accesos
                  </p>
                )}
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/35 text-[10px] font-mono font-bold text-emerald-300 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <Icon name="lock" className="w-3 h-3 text-emerald-400" />
              <span>{mobileSession ? '3443' : 'HTTPS 3443'}</span>
            </div>
          </header>

          {/* CUERPO INTERNO DE LA PANTALLA */}
          <div className="flex-1 bg-[#090e1a] flex flex-col relative overflow-y-auto text-slate-100">
            {/* ============================================================== */}
            {/* VISTA M1: PANTALLA DE VINCULACIÓN POR CÓDIGO                   */}
            {/* ============================================================== */}
            {!mobileSession && (
              <div className="flex-1 flex flex-col justify-between p-4 bg-[#090e1a]">
                <div className="bg-[#101728] border border-slate-700/40 rounded-2xl p-5 my-auto shadow-xl flex flex-col gap-4">
                  <div className="text-center space-y-1.5">
                    <h3 className="text-xl font-extrabold tracking-tight text-white">
                      Vincular Celular
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Conecta este teléfono a la red Wi-Fi del gimnasio e introduce el código de 6 caracteres generado en la PC principal.
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
                        className="w-full bg-[#090e1a] border border-slate-700 focus:border-emerald-500 rounded-xl font-mono text-2xl font-black tracking-[0.38em] text-white uppercase py-3 text-center placeholder:text-slate-600 focus:outline-none transition-colors"
                        autoFocus
                      />
                    </div>

                    {pairingError && (
                      <div
                        role="alert"
                        className="text-xs font-semibold text-rose-300 bg-rose-950/50 border border-rose-500/40 rounded-xl p-2.5 text-center"
                      >
                        {pairingError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isPairingLoading || !pairingCodeInput.trim()}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl transition-all shadow-[0_10px_24px_-6px_rgba(16,185,129,0.55)] active:scale-[0.99] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
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

                  <div className="h-px bg-slate-800/90" />

                  <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                    Para habilitar la cámara en vivo en iOS/Android usa siempre{' '}
                    <strong className="text-slate-200">HTTPS</strong>. Si tu navegador muestra alerta de certificado local, pulsa{' '}
                    <strong className="text-slate-200">Avanzado → Continuar</strong> o instala el Certificado CA Local desde la PC principal.
                  </p>
                </div>

                <footer className="pt-3 pb-1 flex items-center justify-center gap-2 text-[10px] font-mono text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>SQLite Local-First: OK • Build: v0.1.0-prod</span>
                </footer>
              </div>
            )}

            {/* ============================================================== */}
            {/* VISTA M2: ESCÁNER QR Y CONTROL DE ASISTENCIAS                  */}
            {/* ============================================================== */}
            {mobileSession && (
              <div className="flex-1 flex flex-col justify-between p-3.5 gap-2.5 bg-[#090e1a] text-white relative">
                <div className="flex flex-col gap-2.5">
                  {/* Barra de Terminal Conectada */}
                  <div className="bg-[#101728] border border-slate-700/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-[#090e1a] border border-slate-700/60 text-sky-400 flex items-center justify-center shrink-0">
                        <Icon name="smartphone" className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-xs text-white truncate">
                            Terminal: {mobileSession.nombreDispositivo}
                          </p>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          Wi-Fi LAN :3443 Conectado
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleUnpair}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 px-2 py-1 rounded-lg transition-colors shrink-0"
                    >
                      <span>Desvincular</span>
                      <Icon name="logout" className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Cabecera ENTRADA DE VIDEO */}
                  <div className="flex items-center justify-between px-0.5">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-slate-300">
                      <Icon name="camera" className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ENTRADA DE VIDEO</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsTorchHighlighted((prev) => !prev)}
                        aria-label="Alternar iluminación de visor"
                        aria-pressed={isTorchHighlighted}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                          isTorchHighlighted
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-[#101728] border-slate-700/60 text-slate-300 hover:text-white'
                        }`}
                      >
                        <Icon name="sparkles" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPreviewSimulated((prev) => !prev)}
                        aria-label="Alternar vista previa de cámara"
                        aria-pressed={isPreviewSimulated}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                          isPreviewSimulated
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-[#101728] border-slate-700/60 text-slate-300 hover:text-white'
                        }`}
                      >
                        <Icon name="refresh" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Visor de Cámara Obsidian + Retícula Esmeralda */}
                  <div
                    className={`relative w-full h-44 bg-[#050a14] border rounded-2xl overflow-hidden flex items-center justify-center transition-colors ${
                      isTorchHighlighted
                        ? 'border-emerald-400/70 shadow-[inset_0_0_28px_rgba(16,185,129,0.2)]'
                        : 'border-emerald-500/40 shadow-[inset_0_0_28px_rgba(0,0,0,0.7)]'
                    }`}
                    style={{
                      backgroundImage: 'radial-gradient(rgba(16, 185, 129, 0.16) 1px, transparent 1px)',
                      backgroundSize: '14px 14px',
                    }}
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

                    {/* Badge Top-Left Telemetría */}
                    <span className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-[#090e1a]/85 border border-emerald-500/35 text-[10px] font-mono font-bold text-emerald-300 tracking-wider">
                      {isLiveFeedActive ? 'EN VIVO • HD' : 'STANDBY • LISTO'}
                    </span>

                    {/* Retícula Esmeralda con 4 esquinas en L */}
                    <div className="absolute inset-x-10 inset-y-6 pointer-events-none z-10">
                      <span className="absolute top-0 left-0 w-5 h-5 border-t-[3px] border-l-[3px] border-emerald-400 rounded-tl-lg" />
                      <span className="absolute top-0 right-0 w-5 h-5 border-t-[3px] border-r-[3px] border-emerald-400 rounded-tr-lg" />
                      <span className="absolute bottom-0 left-0 w-5 h-5 border-b-[3px] border-l-[3px] border-emerald-400 rounded-bl-lg" />
                      <span className="absolute bottom-0 right-0 w-5 h-5 border-b-[3px] border-r-[3px] border-emerald-400 rounded-br-lg" />

                      {/* Retícula central sutil */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 opacity-40">
                        <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-emerald-300 rounded-tl-sm" />
                        <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-emerald-300 rounded-tr-sm" />
                        <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-emerald-300 rounded-bl-sm" />
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-emerald-300 rounded-br-sm" />
                      </div>

                      {/* Línea láser esmeralda limpia horizontal con sombra luminosa */}
                      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_14px_2px_rgba(16,185,129,0.85)]" />
                    </div>

                    {/* Píldora inferior */}
                    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#090e1a]/90 border border-slate-700/70 text-[10px] font-semibold text-slate-200 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                      <span>ENFOCAR CREDENCIAL QR</span>
                    </div>
                  </div>

                  {/* Fila de 2 botones: Cámara PC + Subir Foto QR */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isStartingCamera}
                      onClick={() => (isCameraActive ? stopCamera() : void startCamera())}
                      className={`text-xs font-bold py-2.5 px-3 rounded-xl transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                        isCameraActive
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_6px_16px_-4px_rgba(225,29,72,0.5)]'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_6px_16px_-4px_rgba(16,185,129,0.45)]'
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
                    <label className="cursor-pointer text-xs font-bold py-2.5 px-3 rounded-xl bg-[#101728] hover:bg-slate-800 border border-slate-700/60 text-slate-100 transition-colors inline-flex items-center justify-center gap-1.5">
                      <Icon name="upload" className="w-3.5 h-3.5 text-sky-400" />
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
                    <p className="text-[10px] text-amber-300 text-center px-2 leading-tight">
                      {cameraError}
                    </p>
                  )}

                  {/* Selector Rápido de Socios para Pruebas Inmediatas */}
                  {clients.length > 0 && (
                    <div>
                      <label
                        htmlFor="quick-client-select"
                        className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"
                      >
                        <Icon name="sparkles" className="w-3 h-3 text-emerald-400" />
                        <span>Simular Lectura de Socio del Gimnasio</span>
                      </label>
                      <select
                        id="quick-client-select"
                        value={selectedClientId}
                        onChange={(e) => handleSelectClient(e.target.value)}
                        className="w-full text-xs bg-[#101728] border border-slate-700/60 focus:border-emerald-500 rounded-xl px-2.5 py-2 text-slate-100 font-medium focus:outline-none"
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

                  {/* Tarjeta INGRESO MANUAL / RESPALDO */}
                  <div className="bg-[#101728] border border-slate-700/40 rounded-2xl p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-slate-200">
                        <Icon name="edit" className="w-3.5 h-3.5 text-emerald-400" />
                        <span>INGRESO MANUAL / RESPALDO</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        Terminal #{String(mobileSession.deviceId).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Fila 1: TOKEN DIRECTO DE APLICACIÓN */}
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sim-qr-token-input"
                        className="text-[10px] font-bold tracking-wider uppercase text-slate-400"
                      >
                        TOKEN DIRECTO DE APLICACIÓN
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="sim-qr-token-input"
                          type="text"
                          placeholder="Pegar token QR (ZG-...)"
                          value={qrTokenInput}
                          onChange={(e) => setQrTokenInput(e.target.value)}
                          className="flex-1 min-w-0 bg-[#090e1a] border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          disabled={isScanLoading}
                          onClick={() => void handleExecuteScan('qr')}
                          className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 shrink-0"
                        >
                          {isScanLoading ? '...' : 'Escanear'}
                        </button>
                      </div>
                    </div>

                    {/* Fila 2: BÚSQUEDA POR DOCUMENTO */}
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sim-dni-input"
                        className="text-[10px] font-bold tracking-wider uppercase text-slate-400"
                      >
                        BÚSQUEDA POR DOCUMENTO
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="sim-dni-input"
                          type="text"
                          placeholder="Ingreso manual por DNI / CE"
                          value={dniInput}
                          onChange={(e) => setDniInput(e.target.value)}
                          className="flex-1 min-w-0 bg-[#090e1a] border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          disabled={isScanLoading}
                          onClick={() => void handleExecuteScan('dni')}
                          className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-colors disabled:opacity-50 shrink-0"
                        >
                          {isScanLoading ? '...' : 'DNI'}
                        </button>
                      </div>
                    </div>

                    {scanError && (
                      <div
                        role="alert"
                        className="text-[11px] font-semibold text-rose-300 bg-rose-950/50 border border-rose-500/40 rounded-xl p-2 text-center"
                      >
                        {scanError}
                      </div>
                    )}

                    {/* Barra empotrada Último pase */}
                    <div className="bg-[#090e1a] border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${lastPassStatusMeta.dotClass}`}
                          aria-hidden="true"
                        />
                        <span className="text-slate-400 shrink-0">Último pase:</span>
                        <strong className="text-white font-semibold truncate">
                          {lastEvaluation ? lastEvaluation.nombreCompleto : 'Sin lecturas'}
                        </strong>
                      </div>
                      <span className={`font-mono text-[10px] font-bold shrink-0 ${lastPassStatusMeta.textClass}`}>
                        {lastPassStatusMeta.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer dividido izquierda/derecha */}
                <footer className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5 px-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span>SQLite Local-First: OK</span>
                  </span>
                  <span>Build: v0.1.0-prod</span>
                </footer>

                {/* ========================================================== */}
                {/* OVERLAY SEMAFÓRICO A PANTALLA COMPLETA (< 1s)              */}
                {/* ========================================================== */}
                {currentEvaluation && (
                  <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={`Resultado de Asistencia Semáforo ${currentEvaluation.colorSemaforo}`}
                    className={`absolute inset-0 z-30 flex flex-col justify-between p-6 text-white transition-opacity duration-150 ${
                      currentEvaluation.colorSemaforo === 'VERDE'
                        ? 'bg-[radial-gradient(circle_at_50%_25%,#10b981_0%,#065f46_75%,#042f2e_100%)]'
                        : currentEvaluation.colorSemaforo === 'AMARILLO'
                        ? 'bg-[radial-gradient(circle_at_50%_25%,#f59e0b_0%,#b45309_75%,#451a03_100%)]'
                        : 'bg-[radial-gradient(circle_at_50%_25%,#ef4444_0%,#991b1b_75%,#450a0a_100%)]'
                    }`}
                  >
                    {/* Encabezado Semáforo */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest bg-black/25 px-3 py-1 rounded-full inline-flex items-center gap-1.5 border border-white/15">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ring-1 ring-white/70 ${
                            currentEvaluation.colorSemaforo === 'VERDE'
                              ? 'bg-emerald-300'
                              : currentEvaluation.colorSemaforo === 'AMARILLO'
                              ? 'bg-amber-300'
                              : 'bg-red-300'
                          }`}
                          aria-hidden="true"
                        />
                        <span>
                          {currentEvaluation.colorSemaforo === 'VERDE' && 'INGRESO CONCEDIDO'}
                          {currentEvaluation.colorSemaforo === 'AMARILLO' && 'ALERTA PREVENTIVA'}
                          {currentEvaluation.colorSemaforo === 'ROJO' && 'ACCESO BLOQUEADO'}
                        </span>
                      </span>
                      {countdownSeconds !== null && (
                        <span className="text-xs font-mono font-bold bg-black/25 border border-white/15 px-2 py-0.5 rounded">
                          {countdownSeconds}s
                        </span>
                      )}
                    </div>

                    {/* Contenido Central: Icono, Nombre y Mensaje */}
                    <div className="flex flex-col items-center text-center my-auto gap-2">
                      <div className="w-20 h-20 rounded-full bg-white/15 border-2 border-white/35 backdrop-blur-sm flex items-center justify-center shadow-lg mb-1">
                        {currentEvaluation.colorSemaforo === 'VERDE' && (
                          <Icon name="check" className="w-10 h-10" />
                        )}
                        {currentEvaluation.colorSemaforo === 'AMARILLO' && (
                          <Icon name="warning" className="w-10 h-10" />
                        )}
                        {currentEvaluation.colorSemaforo === 'ROJO' && (
                          <Icon name="danger" className="w-10 h-10" />
                        )}
                      </div>

                      <h2 className="text-2xl font-black tracking-tight leading-tight">
                        {currentEvaluation.nombreCompleto}
                      </h2>

                      <p className="text-xs font-mono font-medium text-white/90">
                        {currentEvaluation.tipoDocumento}: {currentEvaluation.numeroDocumento}
                      </p>

                      {currentEvaluation.nombrePlan && (
                        <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold mt-1">
                          {currentEvaluation.nombrePlan}
                        </div>
                      )}

                      {/* Motivo Semafórico */}
                      <p className="text-sm font-semibold mt-2 px-3 py-1.5 bg-[#090e1a]/35 border border-white/15 rounded-xl">
                        {currentEvaluation.motivoSemaforo}
                      </p>

                      {/* Días restantes o Deuda */}
                      {currentEvaluation.diasRestantes !== null && currentEvaluation.diasRestantes !== undefined && (
                        <p className="text-xs font-bold">
                          {currentEvaluation.diasRestantes > 0
                            ? `¡Quedan ${currentEvaluation.diasRestantes} días de vigencia!`
                            : `Vencido hace ${Math.abs(currentEvaluation.diasRestantes)} días`}
                        </p>
                      )}

                      {Number(currentEvaluation.deudaTotalPendiente || 0) > 0 && (
                        <div className="bg-black/35 border border-amber-200/40 text-amber-100 text-xs font-bold px-3 py-1 rounded-lg mt-1">
                          Saldo deudor: S/ {currentEvaluation.deudaTotalPendiente}
                        </div>
                      )}

                      {currentEvaluation.colorSemaforo === 'ROJO' && (
                        <div className="mt-3 bg-white text-red-700 font-black text-sm px-4 py-2 rounded-xl shadow-lg tracking-wide uppercase">
                          POR FAVOR DIRÍJASE A CAJA
                        </div>
                      )}
                    </div>

                    {/* Botón de Cierre Manual */}
                    <button
                      type="button"
                      onClick={dismissOverlay}
                      className="w-full bg-white hover:bg-slate-100 text-[#090e1a] font-extrabold py-2.5 rounded-xl transition-colors text-xs uppercase tracking-wider shadow-lg"
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

          {/* Barra inferior del smartphone */}
          <div className="w-full bg-[#090e1a] py-2 flex items-center justify-center z-20 shrink-0">
            <div className="w-32 h-1 bg-slate-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
