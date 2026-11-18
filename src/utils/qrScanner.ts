// ============================================================================
// UTILIDADES DE LECTURA Y NORMALIZACIÓN ÓPTICA DE CÓDIGOS QR
// Decodificación offline con jsQR (cámara web e imágenes) + corrección HID
// Ubicación: src/utils/qrScanner.ts
// ============================================================================

import jsQR from 'jsqr';

/**
 * Normaliza lecturas provenientes de pistolas láser HID (teclado ES donde `-` se
 * escribe como `'`), cámara web o pegado manual.
 */
export function normalizeQrTokenClient(raw: string): string {
  const cleaned = raw.trim().replace(/['’´]/g, '-');
  if (!cleaned) return '';

  const upper = cleaned.toUpperCase();
  const match = upper.match(/ZG-[A-Z0-9-]+/);
  if (match) {
    return match[0];
  }

  return upper.startsWith('ZG') ? upper : cleaned;
}

/**
 * Decodifica un QR desde un canvas ya dibujado utilizando jsQR.
 */
export function decodeQrFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return null;
  const decodeFn =
    typeof jsQR === 'function'
      ? jsQR
      : (jsQR as unknown as { default?: typeof jsQR })?.default;
  if (typeof decodeFn !== 'function') return null;

  const imageData = ctx.getImageData(0, 0, width, height);
  const result = decodeFn(imageData.data, width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data?.trim() || null;
}

interface BarcodeDetectorLike {
  detect: (source: ImageBitmap | HTMLImageElement | HTMLCanvasElement) => Promise<Array<{ rawValue?: string }>>;
}

/**
 * Decodifica un código QR desde un archivo de imagen (PNG/JPG/WEBP).
 */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  // Intento 1: API nativa BarcodeDetector si existe (Chromium / WebView2 moderno)
  try {
    const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike })
      .BarcodeDetector;
    if (Detector && typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      try {
        const detector = new Detector({ formats: ['qr_code'] });
        const codes = await detector.detect(bitmap);
        const raw = codes?.[0]?.rawValue?.trim();
        if (raw) return raw;
      } finally {
        bitmap.close();
      }
    }
  } catch {
    // Fallback automático hacia jsQR vía Canvas
  }

  // Intento 2: Canvas 2D + jsQR (universal y offline)
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
      el.src = objectUrl;
    });

    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
    const targetW = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    const targetH = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, targetW, targetH);
    return decodeQrFromCanvas(ctx, targetW, targetH);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
