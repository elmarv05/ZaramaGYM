// ============================================================================
// COMPONENTE: SIMULADOR INTERACTIVO DE VISTAS MÓVILES (M1 Y M2)
// Permite emular y verificar la experiencia iOS/Android y el Semáforo LAN (< 1s)
// Ubicación: src/features/lan/MobileScannerSimulatorModal.tsx
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
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
  const [inputMode, setInputMode] = useState<'qr' | 'dni'>('qr');
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [dniInput, setDniInput] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [isScanLoading, setIsScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Overlay Semafórico a Pantalla Completa
  const [currentEvaluation, setCurrentEvaluation] = useState<CheckInEvaluationDto | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Actualizar código si viene desde el modal padre
  useEffect(() => {
    if (initialPairingCode) {
      setPairingCodeInput(normalizePairingCode(initialPairingCode));
    }
  }, [initialPairingCode]);

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
        setCurrentEvaluation(null);
      }, 2500);
    } else if (colorSemaforo === 'AMARILLO') {
      playWebAudioTone(660, 0.1);
      setTimeout(() => playWebAudioTone(880, 0.15), 120);
      setCountdownSeconds(4);

      timerRef.current = setTimeout(() => {
        setCurrentEvaluation(null);
      }, 3500);
    } else if (colorSemaforo === 'ROJO') {
      playWebAudioTone(220, 0.35, 'sawtooth');
      // Rojo no tiene auto-cierre: exige intervención consciente del operador
      setCountdownSeconds(null);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentEvaluation]);

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
    setPairingCodeInput('');
    setPairingError(null);
  };

  // Acción: Ejecutar escaneo QR o consulta por DNI (Vista M2)
  const handleExecuteScan = async (overrideQr?: string) => {
    if (!mobileSession) return;
    setScanError(null);

    const tokenToUse = overrideQr !== undefined ? overrideQr : qrTokenInput.trim();
    const dniToUse = dniInput.trim();

    if (inputMode === 'qr' && !tokenToUse) {
      setScanError('Por favor ingresa o selecciona un token QR.');
      return;
    }

    if (inputMode === 'dni' && !dniToUse) {
      setScanError('Por favor ingresa un número de documento.');
      return;
    }

    setIsScanLoading(true);
    try {
      const result = await lanIpc.mobileScanQr({
        tokenSesion: mobileSession.tokenSesion,
        qrToken: overrideQr !== undefined || inputMode === 'qr' ? tokenToUse : undefined,
        numeroDocumento: overrideQr === undefined && inputMode === 'dni' ? dniToUse : undefined,
      });
      setCurrentEvaluation(result);
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
      setInputMode('qr');
      setQrTokenInput(decodedToken);
      await handleExecuteScan(decodedToken);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulator-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-sm my-auto flex flex-col items-center">
        {/* Barra superior de controles del simulador */}
        <div className="w-full flex items-center justify-between pb-2 text-xs text-white/80">
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
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
        <div className="w-full h-[640px] max-h-[85vh] bg-slate-900 border-4 border-slate-700 rounded-[38px] shadow-2xl overflow-hidden flex flex-col relative select-none">
          {/* Dynamic Island / Notch superior */}
          <div className="w-full bg-slate-900 pt-2 pb-1 px-6 flex items-center justify-between z-20 text-[11px] text-slate-300 font-mono">
            <span>9:41</span>
            <div className="w-20 h-4 bg-slate-800 rounded-full flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-slate-900"></span>
            </div>
            <div className="flex items-center gap-1">
              <span>5G</span>
              <Icon name="wifi" className="w-3.5 h-3.5" />
              <Icon name="activity" className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* CUERPO INTERNO DE LA PANTALLA */}
          <div className="flex-1 bg-canvas flex flex-col relative overflow-y-auto text-txt-primary">
            {/* ============================================================== */}
            {/* VISTA M1: PANTALLA DE VINCULACIÓN POR CÓDIGO                   */}
            {/* ============================================================== */}
            {!mobileSession && (
              <div className="flex-1 flex flex-col justify-between p-5 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
                <div className="flex flex-col items-center text-center mt-4">
                  <div className="w-14 h-14 rounded-2xl bg-brand text-brand-text flex items-center justify-center font-black text-2xl shadow-md mb-3">
                    ZG
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight text-txt-primary">
                    ZaramaGYM Móvil
                  </h3>
                  <p className="text-xs text-txt-muted mt-1 px-2">
                    Escáner Wi-Fi de alta velocidad para control de acceso y credenciales QR.
                  </p>

                  <div className="mt-4 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-700 dark:text-indigo-300 text-left">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Icon name="wifi" className="w-3.5 h-3.5" />
                      <span>Red Wi-Fi Local Conectada</span>
                    </p>
                    <p className="mt-0.5 text-txt-muted dark:text-slate-400">
                      Ingresa el código de 6 caracteres generado en la PC principal.
                    </p>
                  </div>
                </div>

                <form onSubmit={handlePairDevice} className="flex flex-col gap-3 my-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="pairing-code-input"
                      className="text-xs font-bold text-txt-secondary uppercase tracking-wider text-center"
                    >
                      Código de Vinculación
                    </label>
                    <input
                      id="pairing-code-input"
                      type="text"
                      maxLength={8}
                      placeholder="K9M2PX"
                      value={pairingCodeInput}
                      onChange={(e) => setPairingCodeInput(normalizePairingCode(e.target.value))}
                      className="text-center font-mono text-2xl font-black tracking-widest uppercase bg-surface border-2 border-brand/50 focus:border-brand rounded-xl py-3 shadow-inner focus:outline-hidden"
                      autoFocus
                    />
                  </div>

                  {pairingError && (
                    <div
                      role="alert"
                      className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-2 text-center"
                    >
                      {pairingError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isPairingLoading || !pairingCodeInput.trim()}
                    className="w-full bg-brand hover:bg-brand/90 text-brand-text font-bold py-3 rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                  >
                    {isPairingLoading ? (
                      <span>Vinculando dispositivo...</span>
                    ) : (
                      <>
                        <Icon name="smartphone" className="w-4 h-4" />
                        <span>Vincular este Teléfono</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="text-center pb-2 text-[10px] text-txt-muted">
                  <span>Conexión segura local vía TLS / Axum :3443</span>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* VISTA M2: ESCÁNER QR Y CONTROL DE ASISTENCIAS                  */}
            {/* ============================================================== */}
            {mobileSession && (
              <div className="flex-1 flex flex-col bg-slate-900 text-white relative">
                {/* Header Superior del Teléfono */}
                <header className="px-4 py-2.5 bg-slate-950/80 backdrop-blur-xs border-b border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <div className="truncate">
                      <p className="font-bold truncate text-[12px]">{mobileSession.nombreDispositivo}</p>
                      <p className="text-[10px] text-slate-400">Wi-Fi LAN :3443 Conectado</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleUnpair}
                    className="text-[10px] text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                  >
                    Desvincular
                  </button>
                </header>

                {/* VISOR DE CÁMARA ESCÁNER QR */}
                <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden bg-radial from-slate-800 to-slate-950">
                  {/* Visor / Retícula de Escaneo */}
                  <div className="relative w-52 h-52 border-2 border-emerald-400/60 rounded-2xl flex items-center justify-center bg-slate-900/40 backdrop-blur-xs shadow-2xl overflow-hidden">
                    {isCameraActive && (
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {/* Esquinas destacadas del visor */}
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-md z-10"></div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-md z-10"></div>
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-md z-10"></div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-md z-10"></div>

                    {/* Línea láser de escaneo animada */}
                    <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-bounce relative z-10"></div>

                    <p className="absolute bottom-2 text-[10px] text-slate-300 bg-slate-950/60 px-2 py-0.5 rounded font-mono tracking-wider z-10">
                      ENFOCAR CREDENCIAL QR
                    </p>
                  </div>

                  {/* Controles de Cámara Web PC e Imagen QR */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      type="button"
                      disabled={isStartingCamera}
                      onClick={() => (isCameraActive ? stopCamera() : void startCamera())}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1 ${
                        isCameraActive
                          ? 'bg-rose-600/90 border-rose-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
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
                    <label className="cursor-pointer text-[10px] font-bold px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1">
                      <Icon name="upload" className="w-3.5 h-3.5" />
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
                    <p className="text-[10px] text-amber-300 text-center px-3 mt-1 leading-tight">
                      {cameraError}
                    </p>
                  )}

                  {/* Selector Rápido de Socios para Pruebas Inmediatas */}
                  {clients.length > 0 && (
                    <div className="w-full mt-3 px-2">
                      <label
                        htmlFor="quick-client-select"
                        className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1 mb-1"
                      >
                        <Icon name="sparkles" className="w-3.5 h-3.5 text-amber-400" />
                        <span>Simular Lectura de Socio del Gimnasio:</span>
                      </label>
                      <select
                        id="quick-client-select"
                        value={selectedClientId}
                        onChange={(e) => handleSelectClient(e.target.value)}
                        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-medium focus:outline-hidden"
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

                  {/* Alternador de Modo: QR vs DNI */}
                  <div className="w-full flex items-center gap-1 mt-2.5 px-2">
                    <button
                      type="button"
                      onClick={() => setInputMode('qr')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors inline-flex items-center justify-center gap-1 ${
                        inputMode === 'qr'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon name="qr" className="w-3.5 h-3.5" />
                      <span>Modo Escáner QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('dni')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors inline-flex items-center justify-center gap-1 ${
                        inputMode === 'dni'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon name="user" className="w-3.5 h-3.5" />
                      <span>Ingreso por DNI</span>
                    </button>
                  </div>

                  {/* Campo de Entrada Dinámico */}
                  <div className="w-full mt-2 px-2 flex flex-col gap-1.5">
                    {inputMode === 'qr' ? (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Token QR (ej. ZG-A1B2C3D4...)"
                          value={qrTokenInput}
                          onChange={(e) => setQrTokenInput(e.target.value)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-hidden focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          disabled={isScanLoading}
                          onClick={() => handleExecuteScan()}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isScanLoading ? '...' : 'Escanear'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Número de DNI / Documento"
                          value={dniInput}
                          onChange={(e) => setDniInput(e.target.value)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          disabled={isScanLoading}
                          onClick={() => handleExecuteScan()}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isScanLoading ? '...' : 'Buscar'}
                        </button>
                      </div>
                    )}

                    {scanError && (
                      <div
                        role="alert"
                        className="text-[11px] font-semibold text-red-400 bg-red-950/60 border border-red-800 rounded p-1.5 text-center"
                      >
                        {scanError}
                      </div>
                    )}
                  </div>
                </div>

                {/* ========================================================== */}
                {/* OVERLAY SEMAFÓRICO A PANTALLA COMPLETA (< 1s)              */}
                {/* ========================================================== */}
                {currentEvaluation && (
                  <div
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={`Resultado de Asistencia Semáforo ${currentEvaluation.colorSemaforo}`}
                    className={`absolute inset-0 z-30 flex flex-col justify-between p-6 text-white animate-in fade-in duration-150 ${
                      currentEvaluation.colorSemaforo === 'VERDE'
                        ? 'bg-emerald-600'
                        : currentEvaluation.colorSemaforo === 'AMARILLO'
                        ? 'bg-amber-500'
                        : 'bg-red-600'
                    }`}
                  >
                    {/* Encabezado Semáforo */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest bg-black/25 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ring-1 ring-white/70 ${
                            currentEvaluation.colorSemaforo === 'VERDE'
                              ? 'bg-status-success'
                              : currentEvaluation.colorSemaforo === 'AMARILLO'
                              ? 'bg-status-warning'
                              : 'bg-status-danger'
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
                        <span className="text-xs font-mono font-bold bg-black/20 px-2 py-0.5 rounded">
                          {countdownSeconds}s
                        </span>
                      )}
                    </div>

                    {/* Contenido Central: Icono, Nombre y Mensaje */}
                    <div className="flex flex-col items-center text-center my-auto gap-2">
                      <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-lg mb-1">
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

                      <p className="text-xs font-medium text-white/90">
                        {currentEvaluation.tipoDocumento}: {currentEvaluation.numeroDocumento}
                      </p>

                      {currentEvaluation.nombrePlan && (
                        <div className="bg-white/20 px-3 py-1 rounded-lg text-xs font-bold mt-1">
                          {currentEvaluation.nombrePlan}
                        </div>
                      )}

                      {/* Motivo Semafórico */}
                      <p className="text-sm font-semibold mt-2 px-3 py-1.5 bg-black/15 rounded-lg">
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
                        <div className="bg-red-950/60 border border-red-300 text-white text-xs font-bold px-3 py-1 rounded-md mt-1">
                          Saldo deudor: S/ {currentEvaluation.deudaTotalPendiente}
                        </div>
                      )}

                      {currentEvaluation.colorSemaforo === 'ROJO' && (
                        <div className="mt-3 bg-white text-red-700 font-black text-sm px-4 py-2 rounded-xl shadow-lg animate-pulse tracking-wide uppercase">
                          POR FAVOR DIRÍJASE A CAJA
                        </div>
                      )}
                    </div>

                    {/* Botón de Cierre Manual */}
                    <button
                      type="button"
                      onClick={() => setCurrentEvaluation(null)}
                      className="w-full bg-black/30 hover:bg-black/40 text-white font-bold py-2.5 rounded-xl transition-colors text-xs uppercase tracking-wider"
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
          <div className="w-full bg-slate-900 py-2 flex items-center justify-center z-20">
            <div className="w-32 h-1 bg-slate-600 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
