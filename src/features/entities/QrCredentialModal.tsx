// ============================================================================
// COMPONENTE: MODAL DE CREDENCIAL QR LOCAL-FIRST (QR CREDENTIAL MODAL)
// Emisión, Descarga PNG y Envío 1-clic a WhatsApp Web
// Ubicación: src/features/entities/QrCredentialModal.tsx
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { ClientDetail, ClientListItem } from '../../types/entity';
import { buildWhatsAppWelcomeLink } from '../../domain/entity';
import { normalizeAppError, openExternalUrl } from '../../services/ipc/client';
import { Modal } from '../../components/primitives/Modal';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Alert } from '../../components/primitives/Alert';

export interface QrCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: ClientDetail | ClientListItem | null;
  entity?: any; // Compatibilidad
  onRegenerateQr: (clientId: number) => Promise<string | null>;
  isLoading?: boolean;
}

export const QrCredentialModal: React.FC<QrCredentialModalProps> = ({
  isOpen,
  onClose,
  client,
  entity,
  onRegenerateQr,
  isLoading = false,
}) => {
  const activeClient = client || entity;
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [isOpeningWhatsApp, setIsOpeningWhatsApp] = useState(false);
  const [downloadedPng, setDownloadedPng] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    variant: 'success' | 'info' | 'warning' | 'danger';
    title: string;
    message: string;
  } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showConfirmRegenerate, setShowConfirmRegenerate] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const qrToken = activeClient?.codigo_qr_token || '';
  const fullName = activeClient
    ? `${activeClient.nombres}${activeClient.apellidos ? ' ' + activeClient.apellidos : ''}`
    : '';

  // Generación 100% Local-First del código QR con QRCode
  useEffect(() => {
    if (!isOpen || !qrToken) {
      setQrDataUrl('');
      return;
    }

    let isMounted = true;
    QRCode.toDataURL(qrToken, {
      width: 256,
      margin: 2,
      color: {
        dark: '#0f172a', // Slate 900
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
          setQrError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setQrError('No se pudo generar el código QR localmente.');
          console.error(err);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, qrToken]);

  if (!activeClient) return null;

  const whatsAppLink = buildWhatsAppWelcomeLink(activeClient.telefono, fullName, qrToken);

  const handleOpenWhatsApp = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!whatsAppLink || isOpeningWhatsApp) return;
    setWhatsAppError(null);
    setIsOpeningWhatsApp(true);
    try {
      await openExternalUrl(whatsAppLink);
      setFeedbackToast({
        variant: 'info',
        title: 'Abriendo WhatsApp',
        message: `Iniciando conversación con ${fullName}...`,
      });
    } catch (err) {
      setWhatsAppError(normalizeAppError(err).message);
    } finally {
      setIsOpeningWhatsApp(false);
    }
  };

  const handleDownloadPng = () => {
    if (!qrDataUrl) return;
    const fileName = `Credencial_${activeClient.numero_documento}_${qrToken.replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
    setDownloadedPng(true);
    setFeedbackToast({
      variant: 'success',
      title: 'Credencial QR Descargada',
      message: `El archivo ${fileName} se guardó en tu carpeta de Descargas.`,
    });
    window.setTimeout(() => setDownloadedPng(false), 3000);

    // Crear un canvas para armar la tarjeta física completa
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fondo blanco con borde
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cabecera oscura
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, 100);

    // Título ZaramaGYM
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZARAMAGYM', canvas.width / 2, 45);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('CREDENCIAL DIGITAL DE SOCIO', canvas.width / 2, 75);

    // Imagen QR
    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, (canvas.width - 240) / 2, 130, 240, 240);

      // Nombre
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fullName, canvas.width / 2, 410);

      // Documento
      ctx.fillStyle = '#64748b';
      ctx.font = '14px monospace';
      ctx.fillText(
        `${activeClient.tipo_documento}: ${activeClient.numero_documento}`,
        canvas.width / 2,
        438
      );

      // Token
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(qrToken, canvas.width / 2, 475);

      // Pie
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText('Presenta este código en recepción para registrar tu ingreso.', canvas.width / 2, 530);
      ctx.fillText('ZaramaGYM • Sistema Seguro Offline', canvas.width / 2, 550);

      // Disparar descarga directa
      const a = document.createElement('a');
      a.download = `Credencial_${activeClient.numero_documento}_${qrToken.replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };

    qrImg.src = qrDataUrl;
  };

  const handleConfirmRegenerate = async () => {
    try {
      setIsRegenerating(true);
      await onRegenerateQr(activeClient.id);
      setShowConfirmRegenerate(false);
      setFeedbackToast({
        variant: 'success',
        title: 'Token QR Regenerado',
        message: 'Se emitió una nueva credencial QR y la anterior quedó invalidada.',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Credencial Digital de Socio"
      description="Token QR criptográfico de acceso sin conexión al gimnasio."
      size="md"
    >
      <div className="flex flex-col items-center gap-5">
        {feedbackToast && (
          <Alert
            variant={feedbackToast.variant}
            title={feedbackToast.title}
            onClose={() => setFeedbackToast(null)}
          >
            {feedbackToast.message}
          </Alert>
        )}

        {qrError && (
          <Alert variant="danger" title="Error de renderizado">
            {qrError}
          </Alert>
        )}

        {whatsAppError && (
          <Alert
            variant="danger"
            title="No se pudo abrir WhatsApp"
            onClose={() => setWhatsAppError(null)}
          >
            {whatsAppError}
          </Alert>
        )}

        {/* Tarjeta Visual de Credencial */}
        <div
          ref={cardRef}
          className="w-full max-w-[340px] bg-surface rounded-2xl border-2 border-border shadow-md overflow-hidden flex flex-col items-center select-none"
        >
          {/* Header de la Tarjeta */}
          <div className="w-full bg-slate-900 text-white p-4 flex flex-col items-center gap-1">
            <span className="text-lg font-black tracking-widest text-brand">ZARAMAGYM</span>
            <span className="text-[10px] tracking-wider uppercase text-slate-300">
              Credencial Digital de Socio
            </span>
          </div>

          {/* Cuerpo QR */}
          <div className="p-5 flex flex-col items-center gap-4 bg-white w-full">
            <div className="p-2 border border-slate-200 rounded-xl bg-white shadow-xs">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR ${qrToken}`}
                  className="w-48 h-48 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-50 text-xs text-txt-muted animate-pulse">
                  Generando QR local...
                </div>
              )}
            </div>

            <div className="flex flex-col items-center text-center gap-1">
              <span className="text-base font-bold text-slate-900 leading-tight">
                {fullName}
              </span>
              <span className="text-xs font-mono text-slate-500">
                {activeClient.tipo_documento}: {activeClient.numero_documento}
              </span>
              <div className="mt-1">
                <Badge variant="info" size="sm">
                  {qrToken}
                </Badge>
              </div>
            </div>
          </div>

          {/* Footer de Tarjeta */}
          <div className="w-full bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Acceso Seguro</span>
            <span className="font-semibold text-brand">ZaramaGYM</span>
          </div>
        </div>

        {/* Panel de Regeneración Peligrosa */}
        {showConfirmRegenerate ? (
          <div className="w-full p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-xs text-amber-900 dark:text-amber-200">
                <span className="font-bold">¿Regenerar credencial QR?</span> El código actual será invalidado de inmediato y cualquier credencial impresa previa dejará de funcionar.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirmRegenerate(false)}
                disabled={isRegenerating}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmRegenerate}
                isLoading={isRegenerating}
                disabled={isRegenerating}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Sí, Regenerar QR
              </Button>
            </div>
          </div>
        ) : null}

        {/* Acciones Rápidas */}
        <div className="w-full flex flex-col gap-2 pt-2 border-t border-border">
          {activeClient.telefono && (
            <div className="flex items-center justify-between text-xs text-txt-secondary bg-canvas-subtle px-3 py-1.5 rounded-lg border border-border">
              <span>Celular WhatsApp del socio:</span>
              <span className="font-mono font-bold text-txt-primary">
                {activeClient.telefono}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant={downloadedPng ? 'primary' : 'secondary'}
              size="md"
              onClick={handleDownloadPng}
              disabled={!qrDataUrl || isLoading}
              className="flex-1"
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d={
                      downloadedPng
                        ? 'M5 13l4 4L19 7'
                        : 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4'
                    }
                  />
                </svg>
              }
            >
              {downloadedPng ? '¡PNG Descargado!' : 'Descargar PNG'}
            </Button>

            {whatsAppLink ? (
              <a
                key={whatsAppLink}
                href={whatsAppLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenWhatsApp}
                aria-busy={isOpeningWhatsApp}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                </svg>
                <span>{isOpeningWhatsApp ? 'Abriendo WhatsApp...' : 'Enviar WhatsApp'}</span>
              </a>
            ) : (
              <span
                className="text-xs text-txt-muted text-center flex-1 px-2 py-1 bg-canvas-subtle rounded border border-border"
                title="Ingresa un celular válido de 9 dígitos para activar el botón"
              >
                Sin celular WhatsApp
              </span>
            )}
          </div>

          {!showConfirmRegenerate && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmRegenerate(true)}
                className="text-xs text-status-danger hover:underline font-medium"
              >
                Regenerar nuevo token QR...
              </button>

              <Button variant="ghost" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
