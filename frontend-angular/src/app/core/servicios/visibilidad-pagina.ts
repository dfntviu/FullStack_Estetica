import { DOCUMENT, inject, Injectable } from '@angular/core';
import { filter, fromEvent, map, Observable, share } from 'rxjs';

/**
 * Antes había un `addEventListener('visibilitychange')` en 5 controladores.
 * `alVolver$` emite cada vez que el usuario regresa a la pestaña, para recargar
 * los datos que otro equipo pudo haber cambiado. Un solo listener para toda la app.
 */
@Injectable({ providedIn: 'root' })
export class VisibilidadPagina {
  private readonly documento = inject(DOCUMENT);

  readonly alVolver$: Observable<void> = fromEvent(this.documento, 'visibilitychange').pipe(
    filter(() => this.documento.visibilityState === 'visible'),
    map(() => undefined),
    share(),
  );
}
