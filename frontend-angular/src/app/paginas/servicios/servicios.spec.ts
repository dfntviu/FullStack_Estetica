import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor, MENSAJE_SIN_CONEXION } from '../../core/interceptors/api.interceptor';
import { rutaImagen } from '../../core/datos/servicios-api';
import { Servicios } from './servicios';

const BASE = 'http://api.prueba/api';
const CATALOGO = [
  { clave: 'corte-normal', nombre: 'Corte Normal', costo: 45, imagen: '../assets/img/Img.vect-01.jpg' },
  { clave: 'barba-hipster', nombre: 'Barba Hipster', costo: 650, imagen: '../assets/img/Img.vect-07.jpg' },
];

describe('Servicios (F-07, F-08, F-09)', () => {
  let fixture: ComponentFixture<Servicios>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Servicios],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Servicios);
    raiz = fixture.nativeElement;
    fixture.autoDetectChanges();
  });

  afterEach(() => backend.verify());

  const estado = () => raiz.querySelector('#estado-servicios')!.textContent!.trim();
  const tarjetas = () => raiz.querySelectorAll('#lista-servicios article');

  /**
   * El recurso lanza la petición al ejecutar sus efectos (TestBed.tick()). Hay que responderla
   * ANTES de whenStable(): una petición abierta cuenta como tarea pendiente y la espera no terminaría.
   */
  async function responder(fn: (r: ReturnType<HttpTestingController['expectOne']>) => void) {
    TestBed.tick();
    fn(backend.expectOne(`${BASE}/servicios`));
    await fixture.whenStable();
  }

  it('muestra "Cargando…" y luego una tarjeta por servicio, con precio y una sola petición', async () => {
    TestBed.tick();
    expect(estado()).toBe('Cargando servicios…');
    backend.expectOne(`${BASE}/servicios`).flush(CATALOGO);
    await fixture.whenStable();

    expect(tarjetas()).toHaveLength(2);
    expect(estado()).toBe('');
    expect(raiz.querySelector('#lista-servicios')!.textContent).toContain('$650.00 MXN');
  });

  it('cada tarjeta enlaza a Agendar con la clave del servicio (F-08)', async () => {
    await responder((r) => r.flush(CATALOGO));
    const enlaces = [...raiz.querySelectorAll<HTMLAnchorElement>('#lista-servicios a.btn')];
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual([
      '/agendar?servicio=corte-normal',
      '/agendar?servicio=barba-hipster',
    ]);
  });

  it('normaliza la ruta de imagen guardada en la base', async () => {
    await responder((r) => r.flush(CATALOGO));
    expect(raiz.querySelector('#lista-servicios img')!.getAttribute('src')).toBe('assets/img/Img.vect-01.jpg');
    expect(rutaImagen('./assets/x.jpg')).toBe('assets/x.jpg');
    expect(rutaImagen('assets/x.jpg')).toBe('assets/x.jpg');
  });

  it('catálogo vacío → aviso, sin tarjetas', async () => {
    await responder((r) => r.flush([]));
    expect(tarjetas()).toHaveLength(0);
    expect(estado()).toBe('No hay servicios disponibles por ahora.');
  });

  it('sin conexión → mensaje del interceptor + Reintentar, que recupera el catálogo (F-09)', async () => {
    await responder((r) => r.error(new ProgressEvent('error')));
    expect(estado()).toContain(MENSAJE_SIN_CONEXION);
    expect(tarjetas()).toHaveLength(0);

    raiz.querySelector<HTMLButtonElement>('#estado-servicios button')!.click();
    await responder((r) => r.flush(CATALOGO));
    expect(tarjetas()).toHaveLength(2);
    expect(estado()).toBe('');
  });
});
