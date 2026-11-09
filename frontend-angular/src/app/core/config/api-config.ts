import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** URL base de la API. Su valor viene de `src/environments/environment.ts`; las pruebas lo sustituyen con un provider. */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

/** Tiempo máximo de espera de cada petición a la API. */
export const API_TIMEOUT_MS = new InjectionToken<number>('API_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => environment.apiTimeoutMs,
});
