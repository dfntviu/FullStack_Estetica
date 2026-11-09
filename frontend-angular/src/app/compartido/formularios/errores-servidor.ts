import { signal } from '@angular/core';
import { ErroresCampo } from '../../core/interceptors/error-api';

/**
 * Antes `pintarErrores()` de dom.js (F-04). Las reglas las valida el servidor; sus errores
 * `{ campo: 'mensaje' }` se guardan aquí y el template los pinta (is-invalid + invalid-feedback).
 *
 * Se guardan en un signal y NO dentro de cada FormControl a propósito:
 * - deshabilitar o cambiar un control por código (p. ej. quitar una hora que ya no está libre)
 *   recalcula su validez y borraría el error del servidor;
 * - igual que en la versión nativa, los errores se quedan hasta el siguiente envío.
 *
 * Uso: un campo por componente, `readonly errores = new ErroresServidor();`.
 */
export class ErroresServidor {
  private readonly porCampo = signal<ErroresCampo>({});

  /** Mensaje del servidor para un campo, o null. */
  de(campo: string): string | null {
    return this.porCampo()[campo] ?? null;
  }

  /** Muestra los errores y pone el foco en el primer campo con error, en el orden del formulario. */
  mostrar(errores: ErroresCampo, formulario: HTMLElement): void {
    this.porCampo.set(errores);
    const campos = [...formulario.querySelectorAll<HTMLElement>('[formcontrolname]')];
    campos.find((el) => errores[el.getAttribute('formcontrolname') ?? ''])?.focus();
  }

  limpiar(): void {
    this.porCampo.set({});
  }
}
