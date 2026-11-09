import { InjectionToken } from '@angular/core';

/**
 * "Ahora" inyectable (antes `reloj = () => new Date()` en los controladores nativos).
 * Las pruebas lo sustituyen para fijar el día: `{ provide: RELOJ, useValue: () => new Date(2026, 10, 10) }`.
 */
export const RELOJ = new InjectionToken<() => Date>('RELOJ', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
