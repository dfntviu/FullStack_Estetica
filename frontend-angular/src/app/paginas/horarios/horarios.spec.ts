import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor, MENSAJE_SIN_CONEXION } from '../../core/interceptors/api.interceptor';
import { RELOJ } from '../../core/servicios/reloj';
import { Horarios } from './horarios';

const BASE = 'http://api.prueba/api';
const URL = `${BASE}/citas/disponibilidad`;
const HOY = '2026-11-10'; // martes
const TURNOS = ['09:00', '09:30', '10:00'];

describe('Horarios (F-10 a F-13)', () => {
  let fixture: ComponentFixture<Horarios>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Horarios],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: RELOJ, useValue: () => new Date(2026, 10, 10, 12, 0) },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Horarios);
    raiz = fixture.nativeElement;
    fixture.autoDetectChanges();
  });

  afterEach(() => backend.verify());

  const aviso = () => raiz.querySelector('#aviso-horarios')!.textContent!.trim();
  const enlaces = () => [...raiz.querySelectorAll<HTMLAnchorElement>('#sugerencias a.btn')];
  const boton = () => raiz.querySelector<HTMLButtonElement>('#form-disponibilidad button[type=submit]')!;
  const inputDia = () => raiz.querySelector<HTMLInputElement>('#dia')!;

  /** Ejecuta efectos y devuelve la petición pendiente de esa fecha (sin esperar estabilidad: hay HTTP abierto). */
  function pedida(fecha: string): TestRequest {
    TestBed.tick();
    return backend.expectOne((r) => r.url === URL && r.params.get('fecha') === fecha);
  }
  async function cerrar(): Promise<void> {
    await fixture.whenStable();
  }
  function elegirFecha(fecha: string): void {
    inputDia().value = fecha;
    inputDia().dispatchEvent(new Event('change'));
  }

  it('al abrir consulta hoy, fija la fecha mínima y pinta un enlace por turno hacia Agendar', async () => {
    expect(inputDia().min).toBe(HOY);
    expect(inputDia().value).toBe(HOY);
    pedida(HOY).flush({ fecha: HOY, horarios: TURNOS, motivo: null });
    await cerrar();

    expect(aviso()).toBe(`3 horarios disponibles el ${HOY}.`);
    expect(enlaces().map((a) => a.getAttribute('href'))).toEqual([
      `/agendar?fecha=${HOY}&hora=09:00`,
      `/agendar?fecha=${HOY}&hora=09:30`,
      `/agendar?fecha=${HOY}&hora=10:00`,
    ]);
  });

  it('sin turnos muestra el motivo del servidor (domingo, pasada, día lleno)', async () => {
    pedida(HOY).flush({ fecha: HOY, horarios: [], motivo: 'La estética no trabaja los domingos.' });
    await cerrar();
    expect(aviso()).toBe('⛔ La estética no trabaja los domingos.');
    expect(enlaces()).toHaveLength(0);
  });

  it('un 400 (fecha inválida) es un motivo, no un error con Reintentar', async () => {
    pedida(HOY).flush({ mensaje: 'Revisa los datos.', errores: { fecha: 'La fecha no es válida.' } }, { status: 400, statusText: 'Bad Request' });
    await cerrar();
    expect(aviso()).toBe('⛔ La fecha no es válida.');
    expect(raiz.querySelector('#aviso-horarios .alert-warning')).not.toBeNull();
    expect(raiz.querySelector('#aviso-horarios button')).toBeNull();
  });

  it('cambiar la fecha consulta sola; mientras responde, conserva lo anterior y marca el botón', async () => {
    pedida(HOY).flush({ fecha: HOY, horarios: TURNOS, motivo: null });
    await cerrar();

    elegirFecha('2026-11-14');
    const sabado = pedida('2026-11-14');
    fixture.detectChanges();
    expect(boton().disabled).toBe(true);
    expect(boton().textContent!.trim()).toBe('Consultando…');
    expect(raiz.querySelector('#sugerencias')!.getAttribute('aria-busy')).toBe('true');
    expect(enlaces()).toHaveLength(3); // sigue viéndose lo anterior

    sabado.flush({ fecha: '2026-11-14', horarios: ['13:30', '14:00'], motivo: null });
    await cerrar();
    expect(boton().disabled).toBe(false);
    expect(enlaces().map((a) => a.textContent)).toEqual(['13:30', '14:00']);
  });

  it('una respuesta vieja no pisa a la nueva: la petición anterior se cancela', async () => {
    const primera = pedida(HOY);
    elegirFecha('2026-11-12');
    const segunda = pedida('2026-11-12');
    expect(primera.cancelled).toBe(true);
    segunda.flush({ fecha: '2026-11-12', horarios: ['11:00'], motivo: null });
    await cerrar();
    expect(aviso()).toBe('1 horarios disponibles el 2026-11-12.');
  });

  it('"Ver disponibilidad" con la misma fecha vuelve a consultar', async () => {
    pedida(HOY).flush({ fecha: HOY, horarios: TURNOS, motivo: null });
    await cerrar();
    raiz.querySelector<HTMLFormElement>('#form-disponibilidad')!.dispatchEvent(new Event('submit'));
    pedida(HOY).flush({ fecha: HOY, horarios: ['09:00'], motivo: null }); // alguien ocupó turnos
    await cerrar();
    expect(enlaces()).toHaveLength(1);
  });

  it('fecha vacía: pide elegir una, sin petición', async () => {
    pedida(HOY).flush({ fecha: HOY, horarios: TURNOS, motivo: null });
    await cerrar();
    elegirFecha('');
    TestBed.tick();
    backend.expectNone(() => true);
    await cerrar();
    expect(aviso()).toBe('⛔ Selecciona una fecha.');
    expect(enlaces()).toHaveLength(0);
  });

  it('sin conexión: aviso con Reintentar, que vuelve a consultar (F-13)', async () => {
    pedida(HOY).error(new ProgressEvent('error'));
    await cerrar();
    expect(aviso()).toContain(MENSAJE_SIN_CONEXION);
    expect(boton().disabled).toBe(false);

    raiz.querySelector<HTMLButtonElement>('#aviso-horarios button')!.click();
    pedida(HOY).flush({ fecha: HOY, horarios: TURNOS, motivo: null });
    await cerrar();
    expect(enlaces()).toHaveLength(3);
  });

  it('al volver a la pestaña vuelve a consultar la fecha elegida (F-13)', async () => {
    pedida(HOY).flush({ fecha: HOY, horarios: TURNOS, motivo: null });
    await cerrar();
    document.dispatchEvent(new Event('visibilitychange')); // jsdom: visibilityState = 'visible'
    pedida(HOY).flush({ fecha: HOY, horarios: ['10:00'], motivo: null });
    await cerrar();
    expect(enlaces().map((a) => a.textContent)).toEqual(['10:00']);
  });
});
