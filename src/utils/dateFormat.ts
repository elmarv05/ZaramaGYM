/**
 * Formatea un timestamp de inicio de sesión (RFC 3339 con nanosegundos o SQLite)
 * a una expresión natural en español en la zona horaria local del usuario.
 */
export function formatLoginTimestamp(rawTimestamp: string): string {
  if (!rawTimestamp || !rawTimestamp.trim()) {
    return '';
  }

  // Normaliza fracciones de segundo a 3 dígitos (milisegundos) para compatibilidad total en JS
  const normalized = rawTimestamp
    .trim()
    .replace(/(\.\d{3})\d+/, '$1');

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return rawTimestamp;
  }

  const timeFormatter = new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timePart = timeFormatter.format(date);

  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return `hoy a las ${timePart} h`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `ayer a las ${timePart} h`;
  }

  const dateFormatter = new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const datePart = dateFormatter.format(date);

  return `el ${datePart} a las ${timePart} h`;
}
