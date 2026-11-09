import { Component, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, finalize, map, Observable, of, Subject, switchMap } from 'rxjs';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { CitasApi } from '../../core/datos/citas-api';
import { Cita, EstadoCita } from '../../core/modelos/cita';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { VisibilidadPagina } from '../../core/servicios/visibilidad-pagina';
import { Aviso, TipoAviso } from '../../compartido/aviso/aviso';

interface AvisoVerificar {
  tipo: TipoAviso;
  texto: string;
  reintentar?: () => void;
}

/** Una búsqueda pedida. `silenciosa`: tras una acción o al volver a la pestaña, sin aviso de conteo. */
interface Busqueda {
  criterio: string;
  silenciosa: boolean;
}

type Resultado = { busqueda: Busqueda; lista: Cita[] } | { busqueda: Busqueda; error: unknown };

const COLOR_ESTADO: Record<EstadoCita, string> = {
  pendiente: 'warning',
  confirmada: 'primary',
  cancelada: 'secondary',
  terminada: 'success',
};

/**
 * Antes cotejarCita.controller.js + cotejarCita.view.js (F-20 a F-24).
 * Es una vista de ACCIONES: las búsquedas se piden (botón, ?q=, después de una acción, al volver
 * a la pestaña) y pasan por un Subject con switchMap, que descarta la búsqueda anterior si llega
 * otra (antes: el contador `turno`). El servidor valida cada cambio de estado.
 */
@Component({
  selector: 'app-verificar',
  imports: [RouterLink, Aviso],
  host: { class: 'pagina' },
  templateUrl: './verificar.html',
})
export class Verificar implements OnInit {
  /** ?q=A010 llega desde la ficha de Agendar. */
  readonly q = input<string>();

  private readonly citasApi = inject(CitasApi);
  private readonly confirmacion = inject(Confirmacion);

  protected readonly citas = signal<Cita[]>([]);
  protected readonly buscando = signal(false);
  protected readonly aviso = signal<AvisoVerificar | null>(null);
  /** Filas con un cambio de estado en curso: sus botones quedan bloqueados (doble clic). */
  protected readonly filasOcupadas = signal<ReadonlySet<string>>(new Set());
  protected readonly colorEstado = COLOR_ESTADO;

  private readonly busquedas = new Subject<Busqueda | null>();
  private ultimoCriterio = '';

  constructor() {
    this.busquedas
      .pipe(
        switchMap((b) => (b ? this.ejecutar(b) : EMPTY)), // null = cancelar la búsqueda en curso
        takeUntilDestroyed(),
      )
      .subscribe((r) => this.mostrarResultado(r));

    // F-24: al volver a la pestaña, otro equipo pudo haber cambiado estados.
    inject(VisibilidadPagina)
      .alVolver$.pipe(takeUntilDestroyed())
      .subscribe(() => this.ultimoCriterio.trim() && this.buscar(this.ultimoCriterio, true));
  }

  ngOnInit(): void {
    const q = this.q();
    if (q) this.buscar(q);
  }

  protected buscar(criterio: string, silenciosa = false): void {
    this.ultimoCriterio = criterio;
    if (!criterio.trim()) {
      this.busquedas.next(null);
      this.buscando.set(false);
      this.citas.set([]);
      this.aviso.set({ tipo: 'warning', texto: 'Escribe un folio (ej. A001), el nombre o el teléfono del cliente.' });
      return;
    }
    this.busquedas.next({ criterio, silenciosa });
  }

  protected confirmar(cita: Cita): void {
    this.cambiarEstado(cita.id, this.citasApi.confirmar(cita.id), (c) => `Cita ${c.id} confirmada.`);
  }

  protected cancelar(cita: Cita): void {
    if (!this.confirmacion.preguntar(`¿Cancelar la cita ${cita.id}? Esta acción libera el horario.`)) return;
    this.cambiarEstado(cita.id, this.citasApi.cancelar(cita.id), (c) => `La cita ${c.id} ha sido cancelada.`);
  }

  protected ocupada(id: string): boolean {
    return this.filasOcupadas().has(id);
  }

  /** Cobrar se ofrece en pendiente o confirmada: si el cliente está en la estética, ya llegó. */
  protected activa(c: Cita): boolean {
    return c.estado === 'pendiente' || c.estado === 'confirmada';
  }

  private ejecutar(busqueda: Busqueda): Observable<Resultado> {
    this.buscando.set(true);
    return this.citasApi.buscar(busqueda.criterio).pipe(
      map((lista): Resultado => ({ busqueda, lista })),
      catchError((error: unknown) => of<Resultado>({ busqueda, error })),
      finalize(() => this.buscando.set(false)),
    );
  }

  private mostrarResultado(r: Resultado): void {
    this.filasOcupadas.set(new Set()); // las filas nuevas ya reflejan el estado real
    if ('error' in r) {
      this.aviso.set({
        tipo: 'danger',
        texto: mensajeDe(r.error, 'No se pudo buscar.'),
        reintentar: () => this.buscar(r.busqueda.criterio),
      });
      return;
    }
    this.citas.set(r.lista);
    if (r.busqueda.silenciosa) return;
    const criterio = r.busqueda.criterio.trim();
    this.aviso.set(
      r.lista.length
        ? { tipo: 'info', texto: `${r.lista.length} cita(s) encontrada(s).` }
        : { tipo: 'warning', texto: `No se encontraron citas para "${criterio}".` },
    );
  }

  /** Bloquea la fila mientras el servidor aplica el cambio y después refresca la lista en silencio. */
  private cambiarEstado(id: string, trabajo: Observable<Cita>, exito: (c: Cita) => string): void {
    if (this.ocupada(id)) return;
    this.filasOcupadas.update((s) => new Set(s).add(id));
    trabajo.subscribe({
      next: (cita) => {
        this.aviso.set({ tipo: 'success', texto: exito(cita) });
        this.buscar(this.ultimoCriterio, true);
      },
      error: (e: unknown) => {
        this.aviso.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo actualizar la cita.') });
        // 409: la transición ya no es válida (otra persona la cambió); 404: ya no existe → estado real
        if (e instanceof ErrorApi && (e.status === 409 || e.status === 404)) this.buscar(this.ultimoCriterio, true);
        else
          this.filasOcupadas.update((s) => {
            const copia = new Set(s);
            copia.delete(id);
            return copia;
          });
      },
    });
  }
}
