import { Component, input, output } from '@angular/core';

export type TipoAviso = 'success' | 'danger' | 'warning' | 'info' | 'secondary';

/**
 * Antes `mostrarAviso()` de dom.js + el botón Reintentar que cada vista agregaba a mano.
 * Mismo marcado que la versión nativa: el botón va debajo del texto.
 */
@Component({
  selector: 'app-aviso',
  template: `
    @if (texto()) {
      <div class="alert alert-{{ tipo() }} mb-0" role="alert">
        {{ texto() }}
        @if (conReintentar()) {
          <button type="button" class="btn btn-outline-danger btn-sm mt-2 d-block" (click)="reintentar.emit()">Reintentar</button>
        }
      </div>
    }
  `,
})
export class Aviso {
  readonly tipo = input<TipoAviso>('info');
  readonly texto = input<string | null>(null);
  readonly conReintentar = input(false);
  readonly reintentar = output<void>();
}
