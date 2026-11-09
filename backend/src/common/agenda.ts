// Reglas de agenda que dependen de la FECHA ACTUAL. Un CHECK de PostgreSQL no puede
// usar current_date, así que viven aquí. Las reglas fijas (domingo, sábado, horario,
// traslape) las aplica la base; aquí solo se replican para calcular horarios libres.

export const ZONA_NEGOCIO = process.env.ZONA_NEGOCIO ?? 'America/Mexico_City';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha y minutos actuales en la zona horaria de la estética (no la del servidor). */
export function ahoraNegocio(ahora = new Date()): { fecha: string; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_NEGOCIO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ahora)
      .map((p) => [p.type, p.value]),
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

export function esFechaValida(fecha: string): boolean {
  if (!RE_FECHA.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** 0 = domingo … 6 = sábado */
const diaSemana = (fecha: string) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Turnos del día: lunes a viernes 09:00–18:30, sábado hasta 14:00, domingo ninguno. */
export function turnosDelDia(fecha: string): string[] {
  if (!esFechaValida(fecha)) return [];
  const dia = diaSemana(fecha);
  if (dia === 0) return [];
  const ultimo = dia === 6 ? aMinutos('14:00') : aMinutos('18:30');
  const turnos: string[] = [];
  for (let t = aMinutos('09:00'); t <= ultimo; t += 30) {
    turnos.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return turnos;
}

/** Motivo por el que no se puede agendar en esa fecha/hora por TIEMPO (pasado), o null. */
export function motivoTiempo(fecha: string, hora?: string, ahora = ahoraNegocio()): string | null {
  if (fecha < ahora.fecha) return 'No se pueden agendar citas en fechas pasadas.';
  if (hora && fecha === ahora.fecha && aMinutos(hora) <= ahora.minutos) return 'Ese horario de hoy ya pasó.';
  return null;
}

export function horariosLibres(fecha: string, ocupados: string[], ahora = ahoraNegocio()): string[] {
  if (fecha < ahora.fecha) return [];
  const set = new Set(ocupados);
  return turnosDelDia(fecha).filter((h) => !set.has(h) && motivoTiempo(fecha, h, ahora) === null);
}
