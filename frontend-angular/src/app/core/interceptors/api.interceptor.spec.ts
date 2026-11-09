import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TIMEOUT_MS, API_URL } from '../config/api-config';
import { apiInterceptor, MENSAJE_SIN_CONEXION, MENSAJE_TIEMPO_AGOTADO } from './api.interceptor';
import { ErrorApi } from './error-api';

const BASE = 'http://api.prueba/api';

describe('apiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: API_TIMEOUT_MS, useValue: 50 },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Lanza la petición y devuelve el error que llega al suscriptor. */
  async function errorDe(responder: () => void): Promise<ErrorApi> {
    const promesa = firstValueFrom(http.get(`${BASE}/citas/A001`)).catch((e) => e);
    responder();
    return promesa;
  }

  it('deja pasar la respuesta correcta sin tocarla', async () => {
    const promesa = firstValueFrom(http.get(`${BASE}/servicios`));
    backend.expectOne(`${BASE}/servicios`).flush([{ id: 'corte-normal' }]);
    expect(await promesa).toEqual([{ id: 'corte-normal' }]);
  });

  it('400 con errores por campo → ErrorApi con mensaje y errores', async () => {
    const e = await errorDe(() =>
      backend.expectOne(`${BASE}/citas/A001`).flush(
        { mensaje: 'Revisa los datos.', errores: { telefono: 'El teléfono debe tener 10 dígitos.' } },
        { status: 400, statusText: 'Bad Request' },
      ),
    );
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.status).toBe(400);
    expect(e.mensaje).toBe('Revisa los datos.');
    expect(e.errores).toEqual({ telefono: 'El teléfono debe tener 10 dígitos.' });
    expect(e.tieneErroresPorCampo).toBe(true);
  });

  it('409 conserva la restricción de PostgreSQL', async () => {
    const e = await errorDe(() =>
      backend.expectOne(`${BASE}/citas/A001`).flush(
        { mensaje: 'Ese horario ya está ocupado.', errores: { hora: 'Ocupado' }, restriccion: 'cita_turno_activo_unico' },
        { status: 409, statusText: 'Conflict' },
      ),
    );
    expect(e.status).toBe(409);
    expect(e.restriccion).toBe('cita_turno_activo_unico');
  });

  it('error sin cuerpo JSON → mensaje genérico con el código', async () => {
    const e = await errorDe(() =>
      backend.expectOne(`${BASE}/citas/A001`).flush('fallo', { status: 500, statusText: 'Server Error' }),
    );
    expect(e.mensaje).toBe('Error 500 del servidor.');
    expect(e.errores).toEqual({});
  });

  it('sin conexión o CORS (status 0) → mensaje que apunta a backend/.env', async () => {
    const e = await errorDe(() => backend.expectOne(`${BASE}/citas/A001`).error(new ProgressEvent('error')));
    expect(e.sinConexion).toBe(true);
    expect(e.mensaje).toBe(MENSAJE_SIN_CONEXION);
    expect(e.mensaje).toContain('backend/.env'); // H-3: antes decía api/.env
  });

  it('tiempo agotado → cancela la petición y avisa', async () => {
    vi.useFakeTimers();
    try {
      const promesa = firstValueFrom(http.get(`${BASE}/servicios`)).catch((e) => e);
      const pendiente = backend.expectOne(`${BASE}/servicios`);
      await vi.advanceTimersByTimeAsync(60);
      const e: ErrorApi = await promesa;
      expect(e.sinConexion).toBe(true);
      expect(e.mensaje).toBe(MENSAJE_TIEMPO_AGOTADO);
      expect(pendiente.cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no toca peticiones que no van a la API', async () => {
    const promesa = firstValueFrom(http.get('/assets/datos.json')).catch((e) => e);
    backend.expectOne('/assets/datos.json').flush('x', { status: 404, statusText: 'Not Found' });
    expect(await promesa).not.toBeInstanceOf(ErrorApi);
  });
});
