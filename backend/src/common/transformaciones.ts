// Normalizaciones compartidas por los DTO (antes de validar).
import { Transform } from 'class-transformer';

/** Quita espacios al inicio/fin; '' se vuelve undefined (campo opcional vacío). */
export const Recortar = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim();
    return v === '' ? undefined : v;
  });

/** "722 123-4567" → "7221234567" */
export const SoloDigitos = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value));

/** Para comparar sin acentos ni mayúsculas en SQL: translate(lower(col), …) */
export const SQL_SIN_ACENTOS = (columna: string) => `translate(lower(${columna}), 'áéíóúüñ', 'aeiouun')`;

export function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
