import { parsearFecha } from './fechas';

/** Antigüedad legible, p. ej. "2 años, 3 meses" (función pura: fácil de probar). */
export function antiguedad(fechaIngreso: string, hoy: Date): string {
  const inicio = parsearFecha(fechaIngreso);
  if (!inicio) return '';
  let meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
  if (hoy.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 1) return 'Menos de un mes';
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const partes: string[] = [];
  if (a) partes.push(`${a} año${a > 1 ? 's' : ''}`);
  if (m) partes.push(`${m} mes${m > 1 ? 'es' : ''}`);
  return partes.join(', ');
}
