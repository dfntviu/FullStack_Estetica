import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor } from '../../core/interceptors/api.interceptor';
import { IngresoDia, ReporteIngresos } from '../../core/modelos/reporte';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { RELOJ } from '../../core/servicios/reloj';
import { GraficaIngresos } from './grafica-ingresos/grafica-ingresos';
import { ultimosDias } from '../../core/util/fechas';
import { Reportes } from './reportes';

const BASE = 'http://api.prueba/api';
const HOY = '2026-11-05';

const dias = (n: number, desde = '2026-08-08'): IngresoDia[] => {
  const [a, m, d] = desde.split('-').map(Number);
  let acumulado = 0;
  return Array.from({ length: n }, (_, k) => {
    const f = new Date(a, m - 1, d + k);
    const ingresos = k % 7 === 6 ? 0 : 1000 + k * 10;
    acumulado += ingresos;
    const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    return { dia: iso, cobros: ingresos ? 4 : 0, ingresos, acumulado, promedio7Dias: 1100 };
  });
};

const REPORTE = (n = 90): ReporteIngresos => ({
  resumen: { desde: '2026-08-08', hasta: HOY, dias: n, cobros: 406, ingresos: 125475, ticketPromedio: 309.05,
    promedioDiario: 1394.17, ingresosPeriodoAnterior: 113750, variacionPct: 10.3 },
  porDia: dias(n),
  porServicio: Array.from({ length: 12 }, (_, i) => ({ ranking: i + 1, clave: `s${i}`, servicio: `Servicio ${i}`, cobros: 10,
    ingresos: 1000 - i, ticketPromedio: 100, participacionPct: i === 0 ? 11 : 8.1 })),
  porMetodo: [
    { metodo: 'efectivo', cobros: 218, ingresos: 65820, participacionPct: 52.5 },
    { metodo: 'total', cobros: 406, ingresos: 125475, participacionPct: 100 },
  ],
});

describe('ultimosDias (función pura)', () => {
  it('n días que terminan hoy, ambos incluidos', () => {
    expect(ultimosDias(HOY, 90)).toEqual({ desde: '2026-08-08', hasta: HOY });
    expect(ultimosDias('2026-03-01', 2)).toEqual({ desde: '2026-02-28', hasta: '2026-03-01' });
  });
});

describe('Reportes', () => {
  let fixture: ComponentFixture<Reportes>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;
  let respuesta = true;
  const preguntar = vi.fn(() => respuesta);

  beforeEach(() => {
    respuesta = true;
    preguntar.mockClear();
    TestBed.configureTestingModule({
      imports: [Reportes],
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: RELOJ, useValue: () => new Date(2026, 10, 5, 12) },
        { provide: Confirmacion, useValue: { preguntar } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Reportes);
    raiz = fixture.nativeElement;
    fixture.autoDetectChanges();
  });

  afterEach(() => backend.verify());

  const $ = <T extends HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  const texto = (s: string) => $(s).textContent!.replace(/\s+/g, ' ').trim();
  const estable = () => fixture.whenStable();
  const pedido = (ruta: string, desde?: string, hasta = HOY): TestRequest => {
    TestBed.tick();
    return backend.expectOne((r) => r.url === `${BASE}/${ruta}` && (!desde || (r.params.get('desde') === desde && r.params.get('hasta') === hasta)));
  };
  const pestana = (nombre: RegExp) =>
    [...raiz.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => nombre.test(b.textContent!))!.click();
  const boton = (nombre: RegExp) => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => nombre.test(b.textContent!))!;

  it('al abrir pide SOLO ingresos del trimestre; KPIs, variación y gráfica', async () => {
    pedido('reportes/ingresos', '2026-08-08').flush(REPORTE());
    backend.expectNone(`${BASE}/reportes/costos`); // pestañas cerradas: recursos inactivos
    await estable();
    expect(texto('#kpis')).toContain('$125,475.00 MXN');
    expect(texto('#kpis')).toContain('+10.3 % vs. los 90 días anteriores');
    expect(raiz.querySelectorAll('app-grafica-ingresos path.barra')).toHaveLength(90 - 12); // 12 días en 0 (k = 6, 13, …, 83) no dibujan barra
    expect(texto('#tabla-metodos .fila-total')).toContain('100.0');
  });

  it('por servicio: 10 filas, botón para ver los 12 y porcentajes con un decimal', async () => {
    pedido('reportes/ingresos').flush(REPORTE());
    await estable();
    expect(raiz.querySelectorAll('#tabla-servicios tbody tr')).toHaveLength(10);
    expect(texto('#tabla-servicios tbody tr')).toContain('11.0 %');
    boton(/Mostrar los 12 servicios/).click();
    await estable();
    expect(raiz.querySelectorAll('#tabla-servicios tbody tr')).toHaveLength(12);
  });

  it('cambiar de periodo vuelve a pedir con el rango nuevo', async () => {
    pedido('reportes/ingresos').flush(REPORTE());
    await estable();
    boton(/^\s*Bimestre\s*$/).click();
    pedido('reportes/ingresos', '2026-09-07').flush(REPORTE(60));
    await estable();
    expect(raiz.querySelectorAll('app-grafica-ingresos rect.zona')).toHaveLength(60);
    expect(texto('#rango')).toBe('Del 2026-09-07 al 2026-11-05');
  });

  it('un 400 del servidor (periodo inválido) es un aviso sin Reintentar', async () => {
    pedido('reportes/ingresos').flush(
      { mensaje: 'Revisa los datos.', errores: { hasta: 'La fecha final no puede ser anterior a la inicial.' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await estable();
    expect(texto('#panel-ingresos')).toContain('La fecha final no puede ser anterior a la inicial.');
    expect(raiz.querySelector('#panel-ingresos .alert button')).toBeNull();
  });

  it('Auditoría pide costos y clientes al abrirse; marca los cambios manuales', async () => {
    pedido('reportes/ingresos').flush(REPORTE());
    pestana(/Auditoría/);
    pedido('reportes/costos').flush({ desde: '2026-08-08', hasta: HOY, cambios: [
      { momento: 'x', dia: HOY, clave: 'corte-normal', servicio: 'Corte Normal', costoAnterior: 45, costoNuevo: 48,
        diferencia: 3, variacionPct: 6.7, origen: 'manual', aplicacion: 'psql' },
    ] });
    pedido('reportes/clientes').flush({ desde: '2026-08-08', hasta: HOY, resumen: { altas: 3, bajas: 1, reactivaciones: 0 }, movimientos: [] });
    await estable();
    expect(texto('#tabla-costos tbody')).toContain('+6.7 %');
    expect(texto('#tabla-costos tbody')).toContain('manual');
    expect(texto('#resumen-clientes')).toMatch(/Altas\s*3\s*Bajas\s*1/);
  });

  it('Caja: cerrar hoy pide confirmación; con "no" no hay petición; con "sí" cierra y recarga', async () => {
    pedido('reportes/ingresos').flush(REPORTE());
    pestana(/Cierres de caja/);
    pedido('caja/cierres').flush([]);
    await estable();

    respuesta = false;
    $<HTMLButtonElement>('#cerrar-caja').click();
    expect(preguntar).toHaveBeenCalled();
    backend.expectNone({ method: 'POST' });

    respuesta = true;
    $<HTMLButtonElement>('#cerrar-caja').click();
    backend.expectOne({ method: 'POST', url: `${BASE}/caja/cierres` }).flush({ dia: HOY, cobros: 4, total: 900 });
    const cierre = { dia: HOY, cobros: 4, efectivo: 900, tarjeta: 0, transferencia: 0, total: 900, cerradoEn: 'x', origen: 'sistema', totalActual: 900, descuadre: 0 };
    pedido('caja/cierres').flush([cierre]);
    await estable();
    expect(texto('#aviso-caja')).toBe('Caja del 2026-11-05 cerrada: 4 cobro(s).');
    expect($<HTMLButtonElement>('#cerrar-caja').disabled).toBe(true);
    expect(texto('#panel-caja')).toContain('La caja de hoy (2026-11-05) ya está cerrada.');
  });

  it('Caja: un descuadre resalta la fila', async () => {
    pedido('reportes/ingresos').flush(REPORTE());
    pestana(/Cierres de caja/);
    pedido('caja/cierres').flush([
      { dia: '2026-11-02', cobros: 5, efectivo: 1000, tarjeta: 0, transferencia: 0, total: 1000, cerradoEn: 'x', origen: 'manual', totalActual: 1045, descuadre: 45 },
    ]);
    await estable();
    expect($('tr[data-dia="2026-11-02"]').classList.contains('table-warning')).toBe(true);
    expect(texto('tr[data-dia="2026-11-02"]')).toContain('$45.00 MXN');
  });
});

describe('GraficaIngresos', () => {
  it('escala "redonda", etiquetas de mes y tooltip al pasar el cursor', async () => {
    const fixture = TestBed.createComponent(GraficaIngresos);
    fixture.componentRef.setInput('dias', dias(90));
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const raiz: HTMLElement = fixture.nativeElement;

    const ejes = [...raiz.querySelectorAll('text.eje')].map((t) => t.textContent);
    expect(ejes.slice(0, 5)).toEqual(['$0', '$500', '$1k', '$1.5k', '$2k']); // máx 1,890 → paso 500
    expect(ejes).toContain('sep 2026');

    raiz.querySelectorAll('rect.zona')[10].dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();
    expect(raiz.querySelector('.tooltip-grafica')!.textContent).toContain('18 ago');
    expect(raiz.querySelector('details table')!.querySelectorAll('tbody tr')).toHaveLength(90); // misma información en tabla
  });
});
