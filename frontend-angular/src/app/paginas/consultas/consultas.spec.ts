import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor } from '../../core/interceptors/api.interceptor';
import { FilaDiagnostico } from '../../core/modelos/consulta';
import { RELOJ } from '../../core/servicios/reloj';
import { aCsv } from '../../compartido/descargar-csv';
import { Consultas, FILAS_DIAGNOSTICO } from './consultas';

const BASE = 'http://api.prueba/api';

const diag = (i: number, extra: Partial<FilaDiagnostico> = {}): FilaDiagnostico => ({
  empleadoFolio: `E${String(i).padStart(3, '0')}`, empleado: `Empleado ${i}`, servicioClave: `serv-${i}`, servicio: `Servicio ${i}`,
  citas: 3, clientes: 2, cobradas: 2, vencidasSinCobro: 0, programadas: 1, canceladas: 0, ingresos: 300, tasaCobroPct: 100,
  ultimaCita: '2026-10-01', ...extra,
});
const DIAGNOSTICO = [
  diag(0, { empleadoFolio: null, empleado: 'Sin asignar', servicioClave: 'corte-fade', servicio: 'Corte Fade', citas: 5, cobradas: 2, vencidasSinCobro: 2, programadas: 1, ingresos: 240, tasaCobroPct: 50 }),
  ...Array.from({ length: 19 }, (_, i) => diag(i + 1)),
];
const vencida = (folio: string, empleadoFolio: string | null, servicioClave: string) => ({
  folio, fecha: '2026-09-01', hora: '10:00', diasVencida: 66, clienteFolio: 'C001', cliente: 'María Gómez', telefono: '7220000001',
  servicioClave, servicio: 'Corte Fade', precio: 120, empleadoFolio, empleado: empleadoFolio ? 'Empleado 1' : 'Sin asignar', estado: 'pendiente',
});

describe('Consultas', () => {
  let fixture: ComponentFixture<Consultas>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Consultas],
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: RELOJ, useValue: () => new Date(2026, 10, 6, 12) },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Consultas);
    raiz = fixture.nativeElement;
    document.body.appendChild(raiz);
    fixture.autoDetectChanges();
  });

  afterEach(() => {
    backend.verify();
    raiz.remove();
  });

  const $ = <T extends HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  const texto = (s: string) => $(s).textContent!.replace(/\s+/g, ' ').trim();
  const estable = () => fixture.whenStable();
  const pedido = (id: string): TestRequest => {
    TestBed.tick();
    return backend.expectOne((r) => r.url === `${BASE}/consultas/${id}`);
  };
  const opcion = (titulo: string) =>
    [...raiz.querySelectorAll<HTMLLabelElement>('label.opcion')].find((l) => l.textContent!.includes(titulo))!;
  async function conDiagnostico(): Promise<void> {
    pedido('diagnostico').flush(DIAGNOSTICO);
    await estable();
  }

  it('al abrir pide solo la maestra, sin periodo ("todo el historial")', async () => {
    TestBed.tick();
    const r = backend.expectOne(`${BASE}/consultas/diagnostico`);
    expect(r.request.params.keys()).toEqual([]);
    r.flush(DIAGNOSTICO);
    await estable();
    expect(raiz.querySelectorAll('#tabla-diagnostico tbody tr')).toHaveLength(FILAS_DIAGNOSTICO);
    expect(texto('#resumen-diagnostico')).toMatch(/Vencidas sin cobro\s*2/);
  });

  it('resumen: totales y tasa de cobro solo sobre lo que ya debía cobrarse', async () => {
    await conDiagnostico();
    // cobradas = 2 + 19×2 = 40; vencidas = 2 → 40 / 42 = 95.2 %
    expect(texto('#resumen-diagnostico')).toMatch(/Cobradas\s*40/);
    expect(texto('#resumen-diagnostico')).toMatch(/Tasa de cobro\s*95\.2 %/);
    expect($('#resumen-diagnostico .dato.alerta')).not.toBeNull();
  });

  it('sin ids: "Sin asignar" con su aclaración; botón para ver las 20 combinaciones', async () => {
    await conDiagnostico();
    expect(texto('#tabla-diagnostico tbody tr')).toMatch(/Sin asignar\s*sin empleado asignado/);
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => /Ver las 20 combinaciones/.test(b.textContent!))!.click();
    await estable();
    expect(raiz.querySelectorAll('#tabla-diagnostico tbody tr')).toHaveLength(20);
  });

  it('casillas: Aplicar solo con cambios; muestra las elegidas en el orden del catálogo', async () => {
    await conDiagnostico();
    expect($<HTMLButtonElement>('#aplicar').disabled).toBe(true);
    opcion('Servicios sin movimiento').click();
    opcion('Agenda detallada').click();
    await estable();
    expect(texto('#aplicar')).toBe('Aplicar (2)');
    backend.expectNone(`${BASE}/consultas/agenda`); // marcar no consulta todavía

    $<HTMLButtonElement>('#aplicar').click();
    pedido('agenda').flush([]);
    pedido('servicios-sin-movimiento').flush([]);
    await estable();
    const ids = [...raiz.querySelectorAll<HTMLElement>('app-tarjeta-consulta section')].map((s) => s.dataset['consulta']);
    expect(ids).toEqual(['agenda', 'servicios-sin-movimiento']);
    expect(texto('[data-consulta="servicios-sin-movimiento"]')).toContain('Todos los servicios tuvieron movimiento en este periodo. ✔');
    expect($<HTMLButtonElement>('#aplicar').disabled).toBe(true);
  });

  it('del número de la maestra al detalle: marca, aplica y filtra por empleado y servicio', async () => {
    await conDiagnostico();
    $<HTMLButtonElement>('#tabla-diagnostico button.vencidas').click();
    pedido('vencidas').flush([
      vencida('A001', null, 'corte-fade'),
      vencida('A002', null, 'corte-fade'),
      vencida('A003', 'E001', 'serv-1'), // otro empleado: no debe aparecer con el filtro
    ]);
    await estable();
    expect(opcion('Citas vencidas sin cobrar').classList.contains('marcada')).toBe(true);
    expect(raiz.querySelectorAll('[data-consulta="vencidas"] tbody tr')).toHaveLength(2);
    expect(texto('[data-consulta="vencidas"] .conteo')).toBe('2 resultado(s) de 3');
    expect(texto('[data-consulta="vencidas"] .filtro')).toContain('Filtrado por Sin asignar · Corte Fade');

    [...raiz.querySelectorAll<HTMLButtonElement>('[data-consulta="vencidas"] button')].find((b) => b.textContent!.trim() === 'Ver todas')!.click();
    await estable();
    expect(raiz.querySelectorAll('[data-consulta="vencidas"] tbody tr')).toHaveLength(3);
  });

  it('periodo: Bimestre = desde hace 60 días y SIN fin; Clientes sin compras ignora el periodo', async () => {
    await conDiagnostico();
    opcion('Clientes sin compras').click();
    await estable(); // el botón se habilita al pintarse: un clic sobre un botón deshabilitado no hace nada
    $<HTMLButtonElement>('#aplicar').click();
    pedido('clientes-sin-compras').flush([]);
    await estable();

    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Bimestre')!.click();
    TestBed.tick();
    const r = backend.expectOne(`${BASE}/consultas/diagnostico?desde=2026-09-08`);
    expect(r.request.params.has('hasta')).toBe(false);
    r.flush(DIAGNOSTICO);
    backend.expectNone((x) => x.url.endsWith('/clientes-sin-compras')); // no se vuelve a pedir: no usa periodo
    await estable();
    expect(texto('#rango')).toBe('Desde el 2026-09-08, incluidas las citas programadas');
  });

  it('tarjeta: nulos con texto de negocio y "de paso" para cobros sin cliente; Ver SQL bajo demanda', async () => {
    await conDiagnostico();
    opcion('Pagos detallados').click();
    await estable();
    $<HTMLButtonElement>('#aplicar').click();
    pedido('pagos').flush([
      { folio: 'V0001', fecha: '2026-10-01', hora: '10:30', tipo: 'Venta directa', citaFolio: null, clienteFolio: null, cliente: 'Cliente de paso',
        servicioClave: 'corte-fade', servicio: 'Corte Fade', metodo: 'efectivo', total: 1450, pagado: 1500, cambio: 50, referencia: null },
    ]);
    await estable();
    const fila = texto('[data-consulta="pagos"] tbody tr');
    expect(fila).toMatch(/Cliente de paso\s*de paso/);
    expect(fila).toContain('$1,450.00 MXN');
    backend.expectNone(`${BASE}/consultas/pagos/sql`);

    [...raiz.querySelectorAll<HTMLButtonElement>('[data-consulta="pagos"] button')].find((b) => /Ver SQL/.test(b.textContent!))!.click();
    pedido('pagos/sql').flush({ consulta: 'pagos', sql: 'CREATE OR REPLACE FUNCTION estetica.fn_pagos_detallados…' });
    await estable();
    expect(texto('[data-consulta="pagos"] pre.sql')).toContain('fn_pagos_detallados');
  });
});

describe('aCsv', () => {
  it('BOM para Excel, comillas solo donde hacen falta y nulos vacíos', () => {
    const csv = aCsv(['Cliente', 'Nota', 'Total'], [['María, "la de siempre"', null, 1450.5], ['Juan', 'línea\nnueva', 0]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual(['Cliente,Nota,Total', '"María, ""la de siempre""",,1450.5', 'Juan,"línea\nnueva",0']);
  });
});
