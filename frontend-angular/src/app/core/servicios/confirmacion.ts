import { DOCUMENT, inject, Injectable } from '@angular/core';

/** Antes `confirmarAccion = window.confirm`. Como servicio, se sustituye en las pruebas. */
@Injectable({ providedIn: 'root' })
export class Confirmacion {
  private readonly ventana = inject(DOCUMENT).defaultView;

  preguntar(mensaje: string): boolean {
    return this.ventana?.confirm(mensaje) ?? false;
  }
}
