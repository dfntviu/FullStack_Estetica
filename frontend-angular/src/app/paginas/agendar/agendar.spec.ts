import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor, MENSAJE_SIN_CONEXION } from '../../core/interceptors/api.interceptor';
import { RELOJ } from '../../core/servicios/reloj';
import { Agendar, RETARDO_TELEFONO_MS } from './agendar';

const BASE = 'http://api.prueba/api';
const MARTES = '2026-11-17';
const CATALOGO = [
  { clave: 'corte-normal', nombre: 'Corte Normal', costo: 45, imagen: '../assets/img/1.jpg' },
  { clave: 'tinte-permanente', nombre: 'Tinte Permanente', costo: 430, imagen: '../assets/img/2.jpg' },
];
const MARIA = { folio: 'C001', nombre: 'María Gómez', telefono: '7220000001', cumpleanos: null, observaciones: null, fechaRegistro: '2026-01-01', activo: true };
const CITA = { folio: 'A010', clienteFolio: 'C001', nombre: 'María Gómez', telefono: '7220000001', servicioClave: 'tinte-permanente',
  servicio: 'Tinte Permanente', empleadoFolio: null, fecha: MARTES, hora: '10:00', precio: 430, estado: 'pendiente' };

describe('Agendar (F-14 a F-19)', () => {
  let fixture: ComponentFixture<Agendar>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;

  function crear(params: Record<string, string> = {}): void {
    fixture = TestBed.createComponent(Agendar);
    for (const [k, v] of Object.entries(params)) fixture.componentRef.setInput(k, v);
    raiz = fixture.nativeElement;
    document.body.appendChild(raiz); // para comprobar el foco
    fixture.autoDetectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Agendar],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: RELOJ, useValue: () => new Date(2026, 10, 10, 12, 0) },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    raiz?.remove();
  });

  // ---------- utilidades ----------
  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
  const texto = (sel: string) => $(sel).textContent!.trim();
  const opciones = (sel: string) => [...$<HTMLSelectElement>(sel).options].filter((o) => o.value).map((o) => o.textContent!.trim());
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function pendiente(filtro: (url: string, params: URLSearchParams | null) => boolean): TestRequest {
    TestBed.tick();
    return backend.expectOne((r) => filtro(r.url, new URLSearchParams(r.params.toString())));
  }
  const catalogo = () => pendiente((u) => u === `${BASE}/servicios`);
  const horasDe = (fecha: string) => pendiente((u, p) => u === `${BASE}/citas/disponibilidad` && p!.get('fecha') === fecha);
  const telefonoDe = (tel: string) => pendiente((u) => u === `${BASE}/clientes/telefono/${tel}`);
  async function estable(): Promise<void> {
    await fixture.whenStable();
  }
  function escribir(sel: string, valor: string): void {
    const el = $<HTMLInputElement>(sel);
    el.value = valor;
    el.dispatchEvent(new Event('input'));
  }
  function elegir(sel: string, valor: string): void {
    const el = $<HTMLSelectElement>(sel);
    el.value = valor;
    el.dispatchEvent(new Event('change'));
  }
  async function conCatalogo(params: Record<string, string> = {}): Promise<void> {
    crear(params);
    catalogo().flush(CATALOGO);
    await estable();
  }
  async function conHoras(fecha = MARTES, horarios = ['09:00', '10:00', '12:00']): Promise<void> {
    escribir('#fecha', fecha);
    horasDe(fecha).flush({ fecha, horarios, motivo: null });
    await estable();
  }

  // ---------- catálogo y horas ----------
  it('catálogo en el select con precio; Hora pide primero una fecha (F-14, F-15)', async () => {
    crear();
    TestBed.tick();
    expect(texto('#servicio option')).toBe('Cargando servicios…');
    expect($<HTMLSelectElement>('#servicio').disabled).toBe(true);
    catalogo().flush(CATALOGO);
    await estable();

    expect(opciones('#servicio')).toEqual(['Corte Normal ($45.00 MXN)', 'Tinte Permanente ($430.00 MXN)']);
    expect($<HTMLSelectElement>('#servicio').disabled).toBe(false);
    expect(texto('#hora option')).toBe('Primero elige una fecha');
    expect($<HTMLSelectElement>('#hora').disabled).toBe(true);
    expect($<HTMLInputElement>('#fecha').min).toBe('2026-11-10');
  });

  it('al elegir fecha consulta las horas libres; sin turnos muestra el motivo en el select', async () => {
    await conCatalogo();
    await conHoras();
    expect(opciones('#hora')).toEqual(['09:00', '10:00', '12:00']);
    expect($<HTMLSelectElement>('#hora').disabled).toBe(false);

    escribir('#fecha', '2026-11-15');
    TestBed.tick();
    expect(texto('#hora option')).toBe('Consultando horarios…');
    horasDe('2026-11-15').flush({ fecha: '2026-11-15', horarios: [], motivo: 'La estética no trabaja los domingos.' });
    await estable();
    expect(texto('#hora option')).toBe('La estética no trabaja los domingos.');
    expect($<HTMLSelectElement>('#hora').disabled).toBe(true);
  });

  it('sin conexión al cargar el catálogo: aviso con Reintentar que lo recupera', async () => {
    crear();
    catalogo().error(new ProgressEvent('error'));
    await estable();
    expect(texto('#aviso-agendar')).toContain(MENSAJE_SIN_CONEXION);
    $<HTMLButtonElement>('#aviso-agendar button').click();
    catalogo().flush(CATALOGO);
    await estable();
    expect(texto('#aviso-agendar')).toBe('');
    expect(opciones('#servicio')).toHaveLength(2);
  });

  // ---------- reconocimiento por teléfono ----------
  it('teléfono registrado: completa y bloquea el nombre; cambiarlo lo suelta de inmediato (F-16)', async () => {
    await conCatalogo();
    escribir('#telefono', '722 000 0001');
    await pausa(RETARDO_TELEFONO_MS + 50);
    telefonoDe('7220000001').flush(MARIA);
    await estable();

    expect($<HTMLInputElement>('#cliente').value).toBe('María Gómez');
    expect($<HTMLInputElement>('#cliente').readOnly).toBe(true);
    expect(texto('#clienteEncontrado')).toBe('Cliente registrado: María Gómez (C001).');
    expect($('#clienteEncontrado').classList.contains('text-success')).toBe(true);

    escribir('#telefono', '722 000 000'); // sin esperar el retardo
    await estable();
    expect($<HTMLInputElement>('#cliente').value).toBe('');
    expect($<HTMLInputElement>('#cliente').readOnly).toBe(false);
    expect(texto('#clienteEncontrado')).toBe('Si el cliente ya está registrado, se completa su nombre.');
  });

  it('teléfono no registrado (404) o sin conexión: avisa alta de cliente nuevo', async () => {
    await conCatalogo();
    escribir('#telefono', '7229998888');
    await pausa(RETARDO_TELEFONO_MS + 50);
    telefonoDe('7229998888').flush({ mensaje: 'No existe.' }, { status: 404, statusText: 'Not Found' });
    await estable();
    expect(texto('#clienteEncontrado')).toBe('Teléfono no registrado: se dará de alta un cliente nuevo con este nombre.');

    escribir('#telefono', '7229998887');
    await pausa(RETARDO_TELEFONO_MS + 50);
    telefonoDe('7229998887').error(new ProgressEvent('error'));
    await estable();
    expect(texto('#clienteEncontrado')).toContain('cliente nuevo');
  });

  it('escribir rápido consulta una sola vez, con el último teléfono', async () => {
    await conCatalogo();
    for (const t of ['722000000', '7220000001']) escribir('#telefono', t);
    await pausa(RETARDO_TELEFONO_MS + 50);
    telefonoDe('7220000001').flush(MARIA); // expectOne: si hubiera dos peticiones, fallaría
    await estable();
  });

  // ---------- precarga desde la URL ----------
  it('precarga servicio, fecha, hora y teléfono desde la URL (Servicios, Horarios, Clientes)', async () => {
    crear({ servicio: 'tinte-permanente', fecha: MARTES, hora: '12:00', telefono: '7220000001' });
    catalogo().flush(CATALOGO);
    horasDe(MARTES).flush({ fecha: MARTES, horarios: ['09:00', '12:00'], motivo: null });
    await estable();
    await pausa(RETARDO_TELEFONO_MS + 50);
    telefonoDe('7220000001').flush(MARIA);
    await estable();

    expect($<HTMLSelectElement>('#servicio').value).toBe('tinte-permanente');
    expect($<HTMLInputElement>('#fecha').value).toBe(MARTES);
    expect($<HTMLSelectElement>('#hora').value).toBe('12:00');
    expect($<HTMLInputElement>('#cliente').value).toBe('María Gómez');
  });

  // ---------- envío ----------
  async function llenar(): Promise<void> {
    await conCatalogo();
    escribir('#telefono', '7220000001');
    await pausa(RETARDO_TELEFONO_MS + 50);
    telefonoDe('7220000001').flush(MARIA);
    elegir('#servicio', 'tinte-permanente');
    await conHoras();
    elegir('#hora', '10:00');
    await estable();
  }
  const enviar = () => $<HTMLFormElement>('#formIniciarCita').dispatchEvent(new Event('submit'));

  it('agenda: un solo POST aunque se envíe dos veces; ficha con folio, enlace a Verificar y formulario limpio', async () => {
    await llenar();
    enviar();
    enviar(); // doble clic
    const post = backend.expectOne({ method: 'POST', url: `${BASE}/citas` });
    expect(post.request.body).toEqual({ telefono: '7220000001', cliente: 'María Gómez', servicio: 'tinte-permanente', fecha: MARTES, hora: '10:00' });
    await estable();
    expect($<HTMLButtonElement>('#formIniciarCita button[type=submit]').textContent!.trim()).toBe('Registrando…');

    post.flush({ cita: CITA, clienteNuevo: false }, { status: 201, statusText: 'Created' });
    await estable();
    expect(texto('#fichaNumero')).toBe('A010');
    expect(texto('#fichaCliente')).toBe('María Gómez');
    expect($('#fichaClienteNuevo').hidden).toBe(true);
    expect($('#fichaCita a').getAttribute('href')).toBe('/verificar?q=A010');
    expect(document.activeElement).toBe($('#fichaCita'));
    expect($<HTMLInputElement>('#telefono').value).toBe('');
    expect($<HTMLInputElement>('#cliente').readOnly).toBe(false);
    expect(texto('#hora option')).toBe('Primero elige una fecha');
    expect($<HTMLButtonElement>('#formIniciarCita button[type=submit]').disabled).toBe(false);
  });

  it('cliente nuevo: la ficha lo indica', async () => {
    await llenar();
    enviar();
    backend.expectOne({ method: 'POST', url: `${BASE}/citas` }).flush({ cita: { ...CITA, nombre: 'Pedro Nuevo' }, clienteNuevo: true });
    await estable();
    expect($('#fichaClienteNuevo').hidden).toBe(false);
  });

  it('errores del servidor por campo: se pintan y el foco va al primero (F-04)', async () => {
    await conCatalogo();
    enviar();
    backend.expectOne({ method: 'POST', url: `${BASE}/citas` }).flush(
      { mensaje: 'Revisa los datos.', errores: { telefono: 'El teléfono debe tener 10 dígitos.', servicio: 'Selecciona un servicio del catálogo.' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await estable();
    expect($('#telefono').classList.contains('is-invalid')).toBe(true);
    expect(texto('[data-error-for=telefono]')).toBe('El teléfono debe tener 10 dígitos.');
    expect($('#servicio').classList.contains('is-invalid')).toBe(true);
    expect($('#cliente').classList.contains('is-invalid')).toBe(false);
    expect(document.activeElement).toBe($('#telefono'));

    // Como en la versión nativa: el error se queda hasta el siguiente envío
    escribir('#telefono', '722');
    await estable();
    expect($('#telefono').classList.contains('is-invalid')).toBe(true);
    await pausa(RETARDO_TELEFONO_MS + 50); // el reconocimiento no consulta con 3 dígitos

    enviar();
    backend.expectOne({ method: 'POST', url: `${BASE}/citas` }).flush({ cita: CITA, clienteNuevo: false });
    await estable();
    expect(raiz.querySelectorAll('.is-invalid')).toHaveLength(0);
  });

  it('turno ocupado por otro mientras se llenaba: error en Hora y horas refrescadas sin ese turno (F-17)', async () => {
    await llenar();
    elegir('#hora', '12:00');
    enviar();
    backend.expectOne({ method: 'POST', url: `${BASE}/citas` }).flush(
      { mensaje: 'Ese horario ya está ocupado.', errores: { hora: 'Ese horario ya está ocupado.' }, restriccion: 'cita_turno_activo_unico' },
      { status: 409, statusText: 'Conflict' },
    );
    horasDe(MARTES).flush({ fecha: MARTES, horarios: ['09:00', '10:00'], motivo: null });
    await estable();

    expect(opciones('#hora')).toEqual(['09:00', '10:00']);
    expect($<HTMLSelectElement>('#hora').value).toBe('');
    expect(texto('[data-error-for=hora]')).toBe('Ese horario ya está ocupado.');
    expect($('#hora').classList.contains('is-invalid')).toBe(true);
  });

  it('falla sin errores por campo: aviso general, sin Reintentar', async () => {
    await llenar();
    enviar();
    backend.expectOne({ method: 'POST', url: `${BASE}/citas` }).error(new ProgressEvent('error'));
    await estable();
    expect(texto('#aviso-agendar')).toContain(MENSAJE_SIN_CONEXION);
    expect(raiz.querySelector('#aviso-agendar button')).toBeNull();
    expect($<HTMLButtonElement>('#formIniciarCita button[type=submit]').disabled).toBe(false);
  });

  it('al volver a la pestaña refresca las horas de la fecha elegida (F-19)', async () => {
    await conCatalogo();
    await conHoras();
    document.dispatchEvent(new Event('visibilitychange'));
    horasDe(MARTES).flush({ fecha: MARTES, horarios: ['09:00'], motivo: null });
    await estable();
    expect(opciones('#hora')).toEqual(['09:00']);
  });
});
