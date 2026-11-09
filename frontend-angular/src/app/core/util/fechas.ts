const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Interpreta 'AAAA-MM-DD' como fecha local (evita el desfase UTC de `new Date('AAAA-MM-DD')`). */
export function parsearFecha(fechaISO: string | null | undefined): Date | null {
  if (!RE_FECHA.test(fechaISO ?? '')) return null;
  const [a, m, d] = fechaISO!.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  return fecha.getMonth() === m - 1 && fecha.getDate() === d ? fecha : null;
}

/** Date local → 'AAAA-MM-DD'. */
export function fechaISO(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

/** Los últimos `dias` días que terminan en `hoy` ('AAAA-MM-DD'), ambos incluidos. */
export function ultimosDias(hoy: string, dias: number): { desde: string; hasta: string } {
  const fin = parsearFecha(hoy)!;
  return { desde: fechaISO(new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - (dias - 1))), hasta: hoy };
}
