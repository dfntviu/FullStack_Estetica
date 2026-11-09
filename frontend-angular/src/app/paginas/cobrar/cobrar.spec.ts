import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor } from '../../core/interceptors/api.interceptor';
import { Cobrar } from './cobrar';

const BASE = 'http://api.prueba/api';
const CATALOGO = [
  { clave: 'corte-normal', nombre: 'Corte Normal', costo: 60, imagen: '' },
  { clave: 'tinte-permanente', nombre: 'Tinte Permanente', costo: 430, imagen: '' },
];
const cita = (estado: string) => ({
  folio: 'A010', clienteFolio: 'C001', nombre: 'María Gómez', telefono: '7220000001', servicioClave: 'tinte-permanente',
  servicio: 'Tinte Permanente', empleadoFolio: null, fecha: '2026-11-17', hora: '10:00', precio: 400, estado,
});
const COBRO = {
  folio: 'V0001', citaFolio: 'A010', clienteFolio: 'C001', cliente: 'María Gómez', servicio: 'Tinte Permanente',
  total: 400, metodo: 'efectivo', pagado: 500, cambio: 100, referencia: null, fechaHora: '2026-11-17T16:00:00Z',
};

describe('Cobrar (F-25 a F-28)', () => {
  let fixture: ComponentFixture<Cobrar>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;

  function crear(params: Record<string, string> = {}): void {
    fixture = TestBed.createComponent(Cobrar);
    for (const [k, v] of Object.entries(params)) fixture.componentRef.setInput(k, v);
    raiz = fixture.nativeElement;
    document.body.appendChild(raiz);
    fixture.autoDetectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Cobrar],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    raiz?.remove();
  });

  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
  const valor = (sel: string) => $<HTMLInputElement>(sel).value;
  const catalogo = (): TestRequest => {
    TestBed.tick();
    return backend.expectOne(`${BASE}/servicios`);
  };
  const estable = () => fixture.whenStable();
  function escribir(sel: string, v: string, evento = 'input'): void {
    const el = $<HTMLInputElement>(sel);
    el.value = v;
    el.dispatchEvent(new Event(evento));
  }
  function elegir(sel: string, v: string): void {
    const el = $<HTMLSelectElement>(sel);
    el.value = v;
    el.dispatchEvent(new Event('change'));
  }
  const enviar = () => $<HTMLFormElement>('#formCobroServicio').dispatchEvent(new Event('submit'));

  it('sin cita: el total es el precio del servicio y el cambio se calcula en vivo', async () => {
    crear();
    catalogo().flush(CATALOGO);
    await estable();
    elegir('#servicio', 'corte-normal');
    await estable();
    expect(valor('#totalCobro')).toMatch(/^\$60\.00/);
    escribir('#pagado', '100');
    await estable();
    expect(valor('#cambio')).toMatch(/^\$40\.00/);
  });

  it('?cita=: carga la cita, bloquea cliente y servicio, cobra su precio pactado y no los envía', async () => {
    crear({ cita: 'A010' });
    catalogo().flush(CATALOGO);
    backend.expectOne(`${BASE}/citas/A010`).flush(cita('confirmada'));
    await estable();
    expect(valor('#cliente')).toBe('María Gómez');
    expect($<HTMLFieldSetElement>('#datosSinCita').disabled).toBe(true);
    expect(valor('#totalCobro')).toMatch(/^\$400\.00/); // precio congelado, no los $430 del catálogo
    escribir('#pagado', '500');
    enviar();
    const post = backend.expectOne({ method: 'POST', url: `${BASE}/cobros` });
    expect(post.request.body).toEqual({ citaFolio: 'A010', metodo: 'efectivo', pagado: 500 });
    post.flush(COBRO);
    await estable();
    expect($('#msgFolio').textContent).toContain('V0001 (cita A010)');
    expect($('#msgCambio').textContent).toMatch(/\$100\.00/);
  });

  it('una cita terminada no se cobra: el aviso va en el folio', async () => {
    crear({ cita: 'A010' });
    catalogo().flush(CATALOGO);
    backend.expectOne(`${BASE}/citas/A010`).flush(cita('terminada'));
    await estable();
    expect($('[data-error-for=citaFolio]').textContent).toMatch(/terminada; no se puede cobrar/);
    expect($<HTMLFieldSetElement>('#datosSinCita').disabled).toBe(false);
  });

  it('folio inexistente (404): aviso en el folio, no error general', async () => {
    crear({ cita: 'A999' });
    catalogo().flush(CATALOGO);
    backend.expectOne(`${BASE}/citas/A999`).flush({ mensaje: 'No existe' }, { status: 404, statusText: 'Not Found' });
    await estable();
    expect($('[data-error-for=citaFolio]').textContent).toMatch(/No existe la cita A999/);
  });

  it('tarjeta o transferencia: el pago se fija al total, de solo lectura, y se pide referencia', async () => {
    crear();
    catalogo().flush(CATALOGO);
    await estable();
    elegir('#servicio', 'tinte-permanente');
    elegir('#metodo', 'transferencia');
    await estable();
    expect(valor('#pagado')).toBe('430');
    expect($<HTMLInputElement>('#pagado').readOnly).toBe(true);
    expect($('#grupoReferencia').hidden).toBe(false);
    elegir('#metodo', 'efectivo');
    await estable();
    expect(valor('#pagado')).toBe('');
    expect($('#grupoReferencia').hidden).toBe(true);
  });

  it('errores por campo del servidor se pintan en su campo', async () => {
    crear();
    catalogo().flush(CATALOGO);
    await estable();
    elegir('#servicio', 'corte-normal');
    escribir('#pagado', '10');
    enviar();
    backend
      .expectOne({ method: 'POST', url: `${BASE}/cobros` })
      .flush({ mensaje: 'Pago insuficiente', errores: { pagado: 'El pago no cubre el total.' } }, { status: 400, statusText: 'Bad Request' });
    await estable();
    expect($('#pagado').classList).toContain('is-invalid');
    expect($('[data-error-for=pagado]').textContent).toContain('El pago no cubre el total.');
  });
});
