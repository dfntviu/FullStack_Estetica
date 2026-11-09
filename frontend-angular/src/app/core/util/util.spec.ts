import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { MonedaPipe } from '../../compartido/pipes/moneda.pipe';
import { TelefonoPipe } from '../../compartido/pipes/telefono.pipe';
import { fechaISO, parsearFecha } from './fechas';
import { esTelefonoValido, limpiarTelefono, telefonoValido } from './telefono';

describe('fechas', () => {
  it('parsea AAAA-MM-DD como fecha local, sin desfase UTC', () => {
    const f = parsearFecha('2026-11-06')!;
    expect([f.getFullYear(), f.getMonth(), f.getDate()]).toEqual([2026, 10, 6]);
  });

  it('rechaza fechas imposibles o mal escritas', () => {
    expect(parsearFecha('2026-02-31')).toBeNull();
    expect(parsearFecha('06/11/2026')).toBeNull();
    expect(parsearFecha(null)).toBeNull();
  });

  it('fechaISO rellena mes y día con ceros', () => {
    expect(fechaISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('teléfono', () => {
  it('limpia espacios, guiones y paréntesis', () => {
    expect(limpiarTelefono('(722) 000-00 01')).toBe('7220000001');
  });

  it('exige exactamente 10 dígitos', () => {
    expect(esTelefonoValido('722 000 0001')).toBe(true);
    expect(esTelefonoValido('72200000')).toBe(false);
  });

  it('validador de formulario: vacío lo deja a required; inválido da mensaje', () => {
    expect(telefonoValido(new FormControl(''))).toBeNull();
    expect(telefonoValido(new FormControl('722 000 0001'))).toBeNull();
    expect(telefonoValido(new FormControl('123'))).toEqual({ telefono: 'El teléfono debe tener 10 dígitos.' });
  });
});

describe('pipes', () => {
  it('moneda: mismo formato que la versión nativa', () => {
    const p = new MonedaPipe();
    expect(p.transform(45)).toBe('$45.00 MXN');
    expect(p.transform('350.5')).toBe('$350.50 MXN');
    expect(p.transform(null)).toBe('$0.00 MXN');
    expect(p.transform(126745)).toBe('$126,745.00 MXN'); // separador de miles (reportes)
  });

  it('teléfono: agrupa 3-3-4 y muestra guion si no hay', () => {
    const p = new TelefonoPipe();
    expect(p.transform('7221234567')).toBe('722 123 4567');
    expect(p.transform('')).toBe('—');
    expect(p.transform('123')).toBe('123');
  });
});
