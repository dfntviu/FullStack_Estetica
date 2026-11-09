/**
 * CSV para Excel: separador coma, comillas solo cuando hacen falta y BOM UTF-8 al inicio
 * (sin el BOM, Excel en Windows muestra "MarÃ­a" en lugar de "María").
 */
export function aCsv(
  encabezados: string[],
  filas: (string | number | boolean | null | undefined)[][],
): string {
  const celda = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
}

/** Descarga un texto como archivo, sin pasar por el servidor. */
export function descargar(
  documento: Document,
  nombre: string,
  contenido: string,
  tipo = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = documento.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
