import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor } from '../../core/interceptors/api.interceptor';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { RELOJ } from '../../core/servicios/reloj';
import { RETARDO_BUSQUEDA_MS } from '../../core/util/tiempos';
import { Clientes } from './clientes';

const BASE = 'http://api.prueba/api';
const cliente = (folio: string, nombre: string, activo = true) => ({
  folio, nombre, telefono: '722000000' + folio.slice(-1), cumpleanos: null, observaciones: null, fechaRegistro: '2026-01-01', activo,
});
const LISTA = [cliente('C001', 'María Gómez'), cliente('C002', 'Juan Pérez')];

describe('Clientes (F-29 a F-34)', () => {
  let fixture: ComponentFixture<Clientes>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;
  const preguntar = vi.fn(() => true);

  function crear(): void {
    fixture = TestBed.createComponent(Clientes);
    raiz = fixture.nativeElement;
    document.body.appendChild(raiz);
    fixture.autoDetectChanges();
  }

  beforeEach(() => {
    preguntar.mockClear();
    TestBed.configureTestingModule({
      imports: [Clientes],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: Confirmacion, useValue: { preguntar } },
        { provide: RELOJ, useValue: () => new Date(2026, 10, 10) },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    raiz?.remove();
  });

  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
  const filas = () => [...raiz.querySelectorAll('#tablaClientes tr[data-cliente]')];
  const estable = () => fixture.whenStable();
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const lista = (filtro: (p: URLSearchParams) => boolean = () => true): TestRequest => {
    TestBed.tick();
    return backend.expectOne((r) => r.method === 'GET' && r.url === `${BASE}/clientes` && filtro(new URLSearchParams(r.params.toString())));
  };
  function escribir(sel: string, v: string): void {
    const el = $<HTMLInputElement>(sel);
    el.value = v;
    el.dispatchEvent(new Event('input'));
  }
  const boton = (folio: string, nombre: string) =>
    [...$(`tr[data-cliente=${folio}]`).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === nombre)!;

  it('lista los clientes con su contador', async () => {
    crear();
    lista().flush(LISTA);
    await estable();
    expect(filas().length).toBe(2);
    expect($('#contadorClientes').textContent).toContain('2 cliente(s)');
  });

  it('la búsqueda espera 250 ms y manda el texto al servidor', async () => {
    crear();
    lista().flush(LISTA);
    await estable();
    escribir('#buscarCliente', 'mar');
    await pausa(RETARDO_BUSQUEDA_MS + 50);
    lista((p) => p.get('texto') === 'mar').flush([LISTA[0]]);
    await estable();
    expect(filas().length).toBe(1);
  });

  it('teléfono duplicado: el error del servidor se pinta en su campo', async () => {
    crear();
    lista().flush(LISTA);
    await estable();
    escribir('#cliNombre', 'Ana López');
    escribir('#cliTelefono', '7220000001');
    $<HTMLFormElement>('#formCliente').dispatchEvent(new Event('submit'));
    backend
      .expectOne({ method: 'POST', url: `${BASE}/clientes` })
      .flush({ mensaje: 'Duplicado', errores: { telefono: 'Ese teléfono ya está registrado.' } }, { status: 409, statusText: 'Conflict' });
    await estable();
    expect($('#cliTelefono').classList).toContain('is-invalid');
    expect(document.activeElement?.id).toBe('cliTelefono');
  });

  it('baja con confirmación, aviso y recarga de la lista', async () => {
    crear();
    lista().flush(LISTA);
    await estable();
    boton('C002', 'Baja').click();
    expect(preguntar).toHaveBeenCalledOnce();
    backend.expectOne({ method: 'PATCH', url: `${BASE}/clientes/C002/baja` }).flush(cliente('C002', 'Juan Pérez', false));
    lista().flush([LISTA[0]]);
    await estable();
    expect($('#aviso-clientes').textContent).toContain('Juan Pérez quedó dado de baja.');
  });

  it('historial: métricas y la próxima cita activa', async () => {
    crear();
    lista().flush(LISTA);
    await estable();
    boton('C001', 'Historial').click();
    backend.expectOne(`${BASE}/clientes/C001/historial`).flush({
      cliente: LISTA[0], totalCitas: 2, totalGastado: 430, ultimaVisita: '2026-11-01', servicioFrecuente: 'Tinte Permanente',
      citas: [
        { folio: 'A007', fecha: '2026-11-20', hora: '11:00', servicio: 'Corte Normal', precio: 45, estado: 'pendiente' },
        { folio: 'A001', fecha: '2026-11-01', hora: '10:00', servicio: 'Tinte Permanente', precio: 430, estado: 'terminada' },
      ],
    });
    await estable();
    expect($('#historialCliente').textContent).toContain('Historial de María Gómez');
    expect($('#historialCliente').textContent).toContain('Próxima cita: 2026-11-20 a las 11:00');
  });
});
