import { ahoraNegocio, esFechaValida, horariosLibres, motivoTiempo, turnosDelDia } from './agenda.js';

describe('agenda (reglas que dependen de la fecha actual)', () => {
  const ahora = { fecha: '2026-11-03', minutos: 10 * 60 + 5 }; // martes 10:05

  it('turnos: entre semana 20, sábado hasta 14:00, domingo ninguno', () => {
    expect(turnosDelDia('2026-11-03')).toHaveLength(20);
    expect(turnosDelDia('2026-11-07').at(-1)).toBe('14:00');
    expect(turnosDelDia('2026-11-08')).toEqual([]);
    expect(turnosDelDia('2026-02-30')).toEqual([]);
  });

  it('fechas válidas', () => {
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('03/11/2026')).toBe(false);
  });

  it('motivo de tiempo: pasado y hora de hoy ya transcurrida', () => {
    expect(motivoTiempo('2026-11-02', undefined, ahora)).toMatch(/pasadas/);
    expect(motivoTiempo('2026-11-03', '10:00', ahora)).toMatch(/ya pasó/);
    expect(motivoTiempo('2026-11-03', '10:30', ahora)).toBeNull();
  });

  it('horarios libres: quita ocupados y los ya transcurridos de hoy', () => {
    const libres = horariosLibres('2026-11-03', ['10:30', '11:00'], ahora);
    expect(libres[0]).toBe('11:30');
    expect(libres).not.toContain('10:30');
  });

  it('la fecha de negocio usa la zona de la estética, no la del servidor', () => {
    // 2026-11-04 03:00 UTC = 2026-11-03 21:00 en Ciudad de México
    expect(ahoraNegocio(new Date('2026-11-04T03:00:00Z'))).toEqual({ fecha: '2026-11-03', minutos: 21 * 60 });
  });
});
