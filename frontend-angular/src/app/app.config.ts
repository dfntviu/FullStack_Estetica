import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { apiInterceptor } from './core/interceptors/api.interceptor';

/**
 * Antes `app.js`: allí se creaba a mano cada Modelo → Vista → Controlador.
 * Ahora la inyección de dependencias resuelve los servicios y el Router decide qué página mostrar.
 * Para apuntar a otra API: `{ provide: API_URL, useValue: 'http://otro-host:3000/api' }`.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: los query params (?servicio=, ?cita=…) y `data` llegan como input()
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
  ],
};
