import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor, MENSAJE_SIN_CONEXION } from '../../core/interceptors/api.interceptor';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { Verificar } from './verificar';

const BASE = 'http://api.prueba/api';
const cita = (folio: string, estado: string, nombre = 'María Gómez') => ({
  folio, clienteFolio: 'C001', nombre, telefono: '7220000001', servicioClave: 'corte-normal',
  servicio: 'Corte Normal', empleadoFolio: null, fecha: '2026-11-17', hora: '10:00', precio: 45, estado,
});
const MARIA = [cita('A001', 'pendiente'), cita('A002', 'confirmada'), cita('A003', 'cancelada'), cita('A004', 'terminada')];

describe('Verificar (F-20 a F-24)', () => {
  let fixture: ComponentFixture<Verificar>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;
  let respuestaConfirmacion: boolean;
  const preguntar = vi.fn(() => respuestaConfirmacion);

  function crear(q?: string): void {
    fixture = TestBed.createComponent(Verificar);
    if (q) fixture.componentRef.setInput('q', q);
    raiz = fixture.nativeElement;
    fixture.autoDetectChanges();
  }

  beforeEach(() => {
    respuestaConfirmacion = true;
    preguntar.mockClear();
    TestBed.configureTestingModule({
      imports: [Verificar],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: Confirmacion, useValue: { preguntar } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  // ---------- utilidades ----------
  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
  const texto = (sel: string) => $(sel).textContent!.trim();
  const filas = () => [...raiz.querySelectorAll<HTMLTableRowElement>('#resultado tbody tr')];
  const fila = (folio: string) => $<HTMLTableRowElement>(`tr[data-cita="${folio}"]`);
  const acciones = (folio: string) => [...fila(folio).querySelectorAll('button, a')].map((b) => b.textContent!.trim());
  const boton = (folio: string, nombre: string) =>
    [...fila(folio).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === nombre)!;
  const estable = () => fixture.whenStable();

  const busqueda = (criterio: string): TestRequest =>
    backend.expectOne((r) => r.method === 'GET' && r.url === `${BASE}/citas` && r.params.get('buscar') === criterio);
  const patch = (folio: string, accion: string): TestRequest =>
    backend.expectOne({ method: 'PATCH', url: `${BASE}/citas/${folio}/${accion}` });
  function buscarEnPantalla(criterio: string): void {
    $<HTMLInputElement>('#criterio').value = criterio;
    $<HTMLFormElement>('#formBusqueda').dispatchEvent(new Event('submit'));
  }
  async function conMaria(): Promise<void> {
    crear();
    buscarEnPantalla('maria');
    busqueda('maria').flush(MARIA);
    await estable();
  }

  // ---------- búsqueda ----------
  it('?q= (desde la ficha de Agendar) busca al abrir y deja el folio en el campo', async () => {
    crear('A010');
    expect($<HTMLInputElement>('#criterio').value).toBe('A010');
    busqueda('A010').flush([cita('A010', 'pendiente')]);
    await estable();
    expect(filas()).toHaveLength(1);
    expect(texto('#aviso-cotejo')).toBe('1 cita(s) encontrada(s).');
  });

  it('acciones según el estado; Cobrar enlaza a /cobrar?cita= (F-21 a F-23)', async () => {
    await conMaria();
    expect(filas()).toHaveLength(4);
    expect(acciones('A001')).toEqual(['Confirmar', 'Cancelar', 'Cobrar']);
    expect(acciones('A002')).toEqual(['Cancelar', 'Cobrar']);
    expect(acciones('A003')).toEqual([]);
    expect(acciones('A004')).toEqual([]);
    expect(fila('A002').querySelector('a')!.getAttribute('href')).toBe('/cobrar?cita=A002');
    expect($('[data-estado="A001"]').className).toContain('text-bg-warning');
    expect($('[data-estado="A004"]').className).toContain('text-bg-success');
  });

  it('criterio vacío: pide escribir algo, limpia la tabla y no consulta', async () => {
    await conMaria();
    buscarEnPantalla('   ');
    await estable();
    expect(filas()).toHaveLength(0);
    expect(texto('#aviso-cotejo')).toBe('Escribe un folio (ej. A001), el nombre o el teléfono del cliente.');
  });

  it('sin resultados: aviso con el criterio', async () => {
    crear();
    buscarEnPantalla(' zzz ');
    busqueda('zzz').flush([]);
    await estable();
    expect(texto('#aviso-cotejo')).toBe('No se encontraron citas para "zzz".');
  });

  it('mientras busca: botón "Buscando…" y aria-busy; una búsqueda nueva cancela la anterior', async () => {
    crear();
    buscarEnPantalla('maria');
    const primera = busqueda('maria');
    await Promise.resolve();
    fixture.detectChanges();
    expect(texto('#formBusqueda button')).toBe('Buscando…');
    expect($('#resultado').getAttribute('aria-busy')).toBe('true');

    buscarEnPantalla('A004');
    expect(primera.cancelled).toBe(true);
    busqueda('A004').flush([cita('A004', 'terminada')]);
    await estable();
    expect(filas()).toHaveLength(1);
    expect(texto('#formBusqueda button')).toBe('Buscar');
  });

  it('sin conexión: aviso con Reintentar, que repite la búsqueda', async () => {
    crear();
    buscarEnPantalla('maria');
    busqueda('maria').error(new ProgressEvent('error'));
    await estable();
    expect(texto('#aviso-cotejo')).toContain(MENSAJE_SIN_CONEXION);
    $<HTMLButtonElement>('#aviso-cotejo button').click();
    busqueda('maria').flush(MARIA);
    await estable();
    expect(filas()).toHaveLength(4);
  });

  // ---------- acciones ----------
  it('confirmar: bloquea la fila, avisa y refresca en silencio con el estado real (F-21)', async () => {
    await conMaria();
    boton('A001', 'Confirmar').click();
    boton('A001', 'Confirmar').click(); // doble clic
    const p = patch('A001', 'confirmar');
    await Promise.resolve();
    fixture.detectChanges();
    expect(boton('A001', 'Confirmar').disabled).toBe(true);
    expect(fila('A001').querySelector('a')!.classList.contains('disabled')).toBe(true);

    p.flush(cita('A001', 'confirmada'));
    busqueda('maria').flush([cita('A001', 'confirmada'), ...MARIA.slice(1)]);
    await estable();
    expect(texto('[data-estado="A001"]')).toBe('confirmada');
    expect(acciones('A001')).toEqual(['Cancelar', 'Cobrar']);
    expect(texto('#aviso-cotejo')).toBe('Cita A001 confirmada.'); // la búsqueda silenciosa no lo pisa
  });

  it('cancelar pide confirmación; si se responde que no, no hay petición', async () => {
    await conMaria();
    respuestaConfirmacion = false;
    boton('A002', 'Cancelar').click();
    expect(preguntar).toHaveBeenCalledWith('¿Cancelar la cita A002? Esta acción libera el horario.');
    backend.expectNone({ method: 'PATCH' });

    respuestaConfirmacion = true;
    boton('A002', 'Cancelar').click();
    patch('A002', 'cancelar').flush(cita('A002', 'cancelada'));
    busqueda('maria').flush([MARIA[0], cita('A002', 'cancelada'), ...MARIA.slice(2)]);
    await estable();
    expect(texto('#aviso-cotejo')).toBe('La cita A002 ha sido cancelada.');
    expect(acciones('A002')).toEqual([]);
  });

  it('409 (otra persona ya la cambió): aviso del servidor y la lista muestra el estado real (F-22)', async () => {
    await conMaria();
    boton('A001', 'Cancelar').click();
    patch('A001', 'cancelar').flush(
      { mensaje: 'No se puede pasar de "cancelada" a "cancelada".' },
      { status: 409, statusText: 'Conflict' },
    );
    busqueda('maria').flush([cita('A001', 'cancelada'), ...MARIA.slice(1)]);
    await estable();
    expect(texto('#aviso-cotejo')).toBe('No se puede pasar de "cancelada" a "cancelada".');
    expect(texto('[data-estado="A001"]')).toBe('cancelada');
  });

  it('otro error: aviso y la fila se libera, sin refrescar', async () => {
    await conMaria();
    boton('A001', 'Confirmar').click();
    patch('A001', 'confirmar').flush({ mensaje: 'Error interno.' }, { status: 500, statusText: 'Server Error' });
    await estable();
    expect(texto('#aviso-cotejo')).toBe('Error interno.');
    expect(boton('A001', 'Confirmar').disabled).toBe(false);
  });

  it('al volver a la pestaña repite la última búsqueda en silencio (F-24)', async () => {
    await conMaria();
    document.dispatchEvent(new Event('visibilitychange'));
    busqueda('maria').flush([cita('A001', 'cancelada')]);
    await estable();
    expect(filas()).toHaveLength(1);
    expect(texto('#aviso-cotejo')).toBe('4 cita(s) encontrada(s).'); // silenciosa: no cambia el aviso
  });
});
