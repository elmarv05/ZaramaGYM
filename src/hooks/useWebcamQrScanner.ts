// ============================================================================
// HOOK REUTILIZABLE DE ESCÁNER QR POR CÁMARA WEB E IMAGEN (jsQR OFFLINE)
// Ubicación: src/hooks/useWebcamQrScanner.ts
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodeQrFromCanvas,
  decodeQrFromImageFile,
  normalizeQrTokenClient,
} from '../utils/qrScanner';

export interface UseWebcamQrScannerOptions {
  onDetected: (normalizedOrRawValue: string) => void | Promise<void>;
  active?: boolean;
}

export function useWebcamQrScanner({
  onDetected,
  active = true,
}: UseWebcamQrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDetectedRef = useRef<{ value: string; timestamp: number }>({
    value: '',
    timestamp: 0,
  });
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsStartingCamera(false);
  }, []);

  const emitDetection = useCallback((rawValue: string) => {
    const normalized = normalizeQrTokenClient(rawValue);
    if (!normalized) return;

    const now = Date.now();
    if (
      lastDetectedRef.current.value === normalized &&
      now - lastDetectedRef.current.timestamp < 1800
    ) {
      return;
    }

    lastDetectedRef.current = { value: normalized, timestamp: now };
    void onDetectedRef.current(normalized);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Este entorno o navegador no permite acceso directo a la cámara web. Puedes subir una imagen QR, usar el escáner móvil Wi-Fi o ingresar el token manualmente.',
      );
      return;
    }

    stopCamera();
    setIsStartingCamera(true);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      setIsCameraActive(true);
      setIsStartingCamera(false);

      // Asignar stream en cuanto el elemento <video> esté montado
      setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        void video.play().catch(() => {});
      }, 30);

      intervalRef.current = setInterval(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          return;
        }

        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const decoded = decodeQrFromCanvas(ctx, canvas.width, canvas.height);
        if (decoded) {
          emitDetection(decoded);
        }
      }, 180);
    } catch (err: unknown) {
      stopCamera();
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'No se pudo acceder a la cámara web.';
      setCameraError(`No se pudo iniciar la cámara: ${msg}`);
    }
  }, [emitDetection, stopCamera]);

  const scanImageFile = useCallback(
    async (file: File): Promise<boolean> => {
      setCameraError(null);
      try {
        const decoded = await decodeQrFromImageFile(file);
        if (!decoded) {
          setCameraError('No se detectó un código QR válido dentro de la imagen seleccionada.');
          return false;
        }
        emitDetection(decoded);
        return true;
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Error al leer imagen QR.';
        setCameraError(msg);
        return false;
      }
    },
    [emitDetection],
  );

  useEffect(() => {
    if (!active) {
      stopCamera();
    }
  }, [active, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isCameraActive,
    isStartingCamera,
    cameraError,
    startCamera,
    stopCamera,
    scanImageFile,
    clearCameraError: () => setCameraError(null),
  };
}
