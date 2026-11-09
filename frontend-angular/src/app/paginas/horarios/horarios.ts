import { Component, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { CitasApi } from '../../core/datos/citas-api';
import { RELOJ } from '../../core/servicios/reloj';
import { VisibilidadPagina } from '../../core/servicios/visibilidad-pagina';
import { fechaISO } from '../../core/util/fechas';
import { Aviso, TipoAviso } from '../../compartido/aviso/aviso';

/** Lo que muestra la página para una respuesta (o falla) de disponibilidad. */
interface Resultado {
  tipo: TipoAviso;
  texto: string;
  fecha: string;
  horarios: string[];
  reintentar: boolean;
}

/**
 * Antes horarios.controller.js + horarios.view.js (F-10 a F-13).
 * La página no decide reglas: muestra los horarios libres o el motivo que da el servidor.
 */
@Component({
  selector: 'app-horarios',
  imports: [RouterLink, Aviso],
  host: { class: 'pagina' },
  templateUrl: './horarios.html',
  styleUrl: './horarios.css',
})
export class Horarios {
  protected readonly hoy = fechaISO(inject(RELOJ)());
  /** Al abrir, la disponibilidad de hoy, sin pulsar nada. */
  protected readonly fecha = signal(this.hoy);
  protected readonly disponibilidad = inject(CitasApi).disponibilidad(this.fecha);

  /**
   * Mientras la API responde se conserva lo último mostrado (igual que la versión nativa);
   * solo el botón y aria-busy indican la consulta en curso.
   */
  protected readonly resultado = linkedSignal<Resultado | null, Resultado | null>({
    source: () => this.calcularResultado(),
    computation: (nuevo, previo) => nuevo ?? previo?.value ?? null,
  });

  constructor() {
    // F-13: al volver a la pestaña, otro equipo pudo haber ocupado turnos.
    inject(VisibilidadPagina)
      .alVolver$.pipe(takeUntilDestroyed())
      .subscribe(() => this.fecha() && this.disponibilidad.reload());
  }

  /** Cambio de fecha o botón "Ver disponibilidad". La misma fecha vuelve a consultar. */
  protected consultar(fecha: string): void {
    if (fecha && fecha === this.fecha()) this.disponibilidad.reload();
    else this.fecha.set(fecha);
  }

  /** null = consultando (se conserva lo anterior). */
  private calcularResultado(): Resultado | null {
    const fecha = this.fecha();
    if (!fecha) return motivo(fecha, 'Selecciona una fecha.');

    const r = this.disponibilidad;
    if (r.isLoading()) return null;

    const error = r.error();
    if (error) {
      // 400 = fecha inválida: es un motivo, no una falla del sistema.
      if (error instanceof ErrorApi && error.status === 400) return motivo(fecha, error.errores['fecha'] ?? error.mensaje);
      return {
        tipo: 'danger',
        texto: mensajeDe(error, 'No se pudo consultar la disponibilidad.'),
        fecha,
        horarios: [],
        reintentar: true,
      };
    }

    if (!r.hasValue()) return null;
    const d = r.value();
    if (!d.horarios.length) return motivo(d.fecha, d.motivo ?? 'No quedan horarios disponibles ese día.');
    return {
      tipo: 'success',
      texto: `${d.horarios.length} horarios disponibles el ${d.fecha}.`,
      fecha: d.fecha,
      horarios: d.horarios,
      reintentar: false,
    };
  }
}

function motivo(fecha: string, texto: string): Resultado {
  return { tipo: 'warning', texto: `⛔ ${texto}`, fecha, horarios: [], reintentar: false };
}
