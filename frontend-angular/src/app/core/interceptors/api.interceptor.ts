import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, timeout, TimeoutError } from 'rxjs';
import { API_TIMEOUT_MS, API_URL } from '../config/api-config';
import { ErrorApi } from './error-api';

export const MENSAJE_TIEMPO_AGOTADO = 'El servidor tardó demasiado en responder. Intenta de nuevo.';
// El navegador no distingue "servidor apagado" de "bloqueado por CORS": se mencionan ambos.
export const MENSAJE_SIN_CONEXION =
  'No hay conexión con el servidor. Verifica que la API esté encendida (npm run start:dev) ' +
  'y que la dirección de esta página esté en CORS_ORIGIN del archivo backend/.env.';

/**
 * Antes `services/api.js` (`solicitar`). Solo actúa sobre peticiones a la API:
 * 1. tiempo máximo de espera (al vencer, RxJS cancela la petición);
 * 2. convierte cualquier falla en ErrorApi, con la forma que esperan los componentes.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_URL);
  if (!req.url.startsWith(base)) return next(req);

  return next(req).pipe(
    timeout(inject(API_TIMEOUT_MS)),
    catchError((e: unknown) => throwError(() => aErrorApi(e))),
  );
};

function aErrorApi(e: unknown): ErrorApi {
  if (e instanceof ErrorApi) return e;
  if (e instanceof TimeoutError) return new ErrorApi({ status: 0, mensaje: MENSAJE_TIEMPO_AGOTADO });
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return new ErrorApi({ status: 0, mensaje: MENSAJE_SIN_CONEXION });
    const cuerpo = (typeof e.error === 'object' && e.error) || {};
    return new ErrorApi({
      status: e.status,
      mensaje: cuerpo.mensaje ?? `Error ${e.status} del servidor.`,
      errores: cuerpo.errores ?? {},
      restriccion: cuerpo.restriccion ?? null,
    });
  }
  return new ErrorApi({ mensaje: 'Error inesperado.' });
}
