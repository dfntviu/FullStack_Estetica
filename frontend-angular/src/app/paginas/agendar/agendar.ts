import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, finalize, map, Observable, of, switchMap, tap } from 'rxjs';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { CitasApi } from '../../core/datos/citas-api';
import { ClientesApi } from '../../core/datos/clientes-api';
import { ServiciosApi } from '../../core/datos/servicios-api';
import { CitaAgendada } from '../../core/modelos/cita';
import { Cliente } from '../../core/modelos/cliente';
import { RELOJ } from '../../core/servicios/reloj';
import { VisibilidadPagina } from '../../core/servicios/visibilidad-pagina';
import { fechaISO } from '../../core/util/fechas';
import { esTelefonoValido, limpiarTelefono } from '../../core/util/telefono';
import { Aviso } from '../../compartido/aviso/aviso';
import { ErroresServidor } from '../../compartido/formularios/errores-servidor';
import { MonedaPipe } from '../../compartido/pipes/moneda.pipe';

/** Resultado de reconocer al cliente por su teléfono (F-16). */
type EstadoTelefono = { tipo: 'incompleto' } | { tipo: 'nuevo' } | { tipo: 'encontrado'; cliente: Cliente };

/** Lo que muestra el selector de hora según la disponibilidad (F-15). */
interface EstadoHoras {
  opciones: string[];
  placeholder: string;
  deshabilitado: boolean;
  /** Falla de conexión: se muestra como aviso general con Reintentar. */
  falla: string | null;
}

/** Retardo del reconocimiento por teléfono (igual que la versión nativa). */
export const RETARDO_TELEFONO_MS = 300;

/**
 * Antes iniciarCita.controller.js + iniciarCita.view.js (F-14 a F-19).
 * El servidor identifica (o registra) al cliente y crea la cita en una transacción;
 * aquí se coordina el formulario y se muestra lo que responde.
 */
@Component({
  selector: 'app-agendar',
  imports: [ReactiveFormsModule, RouterLink, Aviso, MonedaPipe],
  host: { class: 'pagina' },
  templateUrl: './agendar.html',
  styleUrl: './agendar.css',
})
export class Agendar implements OnInit {
  // ---- Query params (?servicio=, ?fecha=&hora=, ?telefono=) gracias a withComponentInputBinding ----
  readonly servicio = input<string>();
  readonly fecha = input<string>();
  readonly hora = input<string>();
  readonly telefono = input<string>();

  private readonly citas = inject(CitasApi);
  private readonly clientes = inject(ClientesApi);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly hoy = fechaISO(inject(RELOJ)());

  /**
   * Sin validadores en el navegador: las reglas las valida el servidor y sus errores se
   * pintan por campo (F-04). Así no se duplican reglas entre front y API.
   */
  protected readonly form = inject(NonNullableFormBuilder).group({
    telefono: '',
    cliente: '',
    servicio: '',
    fecha: '',
    hora: '',
  });

  protected readonly catalogo = inject(ServiciosApi).catalogo();
  private readonly fechaElegida = toSignal(this.form.controls.fecha.valueChanges, { initialValue: '' });
  protected readonly disponibilidad = this.citas.disponibilidad(this.fechaElegida);

  protected readonly errores = new ErroresServidor();
  protected readonly estadoTelefono = signal<EstadoTelefono>({ tipo: 'incompleto' });
  protected readonly ocupado = signal(false);
  protected readonly ficha = signal<CitaAgendada | null>(null);
  private readonly errorEnvio = signal<string | null>(null);
  private readonly fichaCita = viewChild<ElementRef<HTMLElement>>('fichaCita');
  /** Hora que llega de Horarios (?hora=): se elige en cuanto aparece entre las libres. */
  private horaPendiente: string | null = null;

  protected readonly horas = computed<EstadoHoras>(() => {
    const vacio = (placeholder: string, falla: string | null = null): EstadoHoras => ({
      opciones: [],
      placeholder,
      deshabilitado: true,
      falla,
    });
    if (!this.fechaElegida()) return vacio('Primero elige una fecha');

    const r = this.disponibilidad;
    if (r.isLoading()) return vacio('Consultando horarios…');
    const error = r.error();
    if (error) {
      if (error instanceof ErrorApi && error.status === 400) return vacio(error.errores['fecha'] ?? error.mensaje);
      return vacio('No se pudieron consultar los horarios', mensajeDe(error, 'No se pudieron consultar los horarios.'));
    }
    if (!r.hasValue()) return vacio('Primero elige una fecha');
    const d = r.value();
    if (!d.horarios.length) return vacio(d.motivo ?? 'Sin horarios disponibles ese día');
    return { opciones: d.horarios, placeholder: 'Selecciona una hora', deshabilitado: false, falla: null };
  });

  protected readonly ayudaCliente = computed(() => {
    const e = this.estadoTelefono();
    if (e.tipo === 'encontrado') {
      const extra = e.cliente.activo ? '' : ' (estaba dado de baja; se reactivará al agendar)';
      return `Cliente registrado: ${e.cliente.nombre} (${e.cliente.id})${extra}.`;
    }
    if (e.tipo === 'nuevo') return 'Teléfono no registrado: se dará de alta un cliente nuevo con este nombre.';
    return 'Si el cliente ya está registrado, se completa su nombre.';
  });

  /** Aviso general sobre el formulario. Prioridad: catálogo, horarios, envío. */
  protected readonly aviso = computed(() => {
    const errCatalogo = this.catalogo.error();
    if (errCatalogo) return { texto: mensajeDe(errCatalogo, 'No se pudo cargar el catálogo.'), reintentar: () => this.catalogo.reload() };
    const fallaHoras = this.horas().falla;
    if (fallaHoras) return { texto: fallaHoras, reintentar: () => this.disponibilidad.reload() };
    const errEnvio = this.errorEnvio();
    return errEnvio ? { texto: errEnvio, reintentar: null } : null;
  });

  constructor() {
    this.reconocerClientePorTelefono();
    this.sincronizarSelects();
    // F-19: al volver a la pestaña, otro equipo pudo haber ocupado turnos.
    inject(VisibilidadPagina)
      .alVolver$.pipe(takeUntilDestroyed())
      .subscribe(() => this.fechaElegida() && this.disponibilidad.reload());
  }

  /**
   * Primer hook del ciclo de vida que ve los input(): en el constructor todavía no existen.
   * Precarga lo que viene de Servicios (?servicio=), Horarios (?fecha=&hora=) o Clientes (?telefono=).
   */
  ngOnInit(): void {
    this.horaPendiente = this.hora() ?? null;
    this.form.patchValue({ servicio: this.servicio() ?? '', fecha: this.fecha() ?? '', telefono: this.telefono() ?? '' });
  }

  protected registrar(): void {
    if (this.ocupado()) return; // doble clic: el segundo llega antes de que se pinte el botón deshabilitado
    this.ocupado.set(true);
    this.citas
      .agendar(this.form.getRawValue())
      .pipe(finalize(() => this.ocupado.set(false)))
      .subscribe({
        next: (r) => {
          this.errorEnvio.set(null);
          this.errores.limpiar();
          this.mostrarFicha(r);
        },
        error: (e: unknown) => {
          if (e instanceof ErrorApi && e.tieneErroresPorCampo) {
            this.errores.mostrar(e.errores, this.host);
            if (e.errores['hora']) this.disponibilidad.reload(); // el turno se acaba de ocupar
          } else {
            this.errorEnvio.set(mensajeDe(e, 'No se pudo agendar la cita.'));
          }
        },
      });
  }

  /**
   * F-16. Al escribir se suelta de inmediato el nombre autocompletado (un envío rápido nunca
   * manda el nombre de otra persona); 300 ms después de dejar de escribir se consulta.
   * switchMap cancela la consulta anterior (antes: el contador `turnoTelefono`).
   */
  private reconocerClientePorTelefono(): void {
    this.form.controls.telefono.valueChanges
      .pipe(
        tap(() => this.soltarCliente()),
        debounceTime(RETARDO_TELEFONO_MS),
        map(limpiarTelefono),
        switchMap((digitos): Observable<EstadoTelefono> => {
          if (!esTelefonoValido(digitos)) return of({ tipo: 'incompleto' });
          return this.clientes.porTelefono(digitos).pipe(
            map((c): EstadoTelefono => (c ? { tipo: 'encontrado', cliente: c } : { tipo: 'nuevo' })),
            // Sin conexión no se bloquea la captura: el servidor resolverá al cliente al agendar.
            catchError(() => of<EstadoTelefono>({ tipo: 'nuevo' })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((estado) => {
        this.estadoTelefono.set(estado);
        if (estado.tipo === 'encontrado') this.form.controls.cliente.setValue(estado.cliente.nombre);
      });
  }

  private soltarCliente(): void {
    if (this.estadoTelefono().tipo === 'encontrado') this.form.controls.cliente.setValue('');
    this.estadoTelefono.set({ tipo: 'incompleto' });
  }

  /**
   * Estado de los selects según lo que responde la API:
   * - Servicio deshabilitado hasta tener catálogo; Hora deshabilitada sin horas libres.
   * - Al cambiar las horas libres se conserva la elegida solo si sigue libre, y se aplica ?hora=.
   * disable()/enable() no afectan los errores del servidor: viven en `errores`, no en los controles.
   */
  private sincronizarSelects(): void {
    effect(() => {
      const servicio = this.form.controls.servicio;
      if (this.catalogo.hasValue()) servicio.enable({ emitEvent: false });
      else servicio.disable({ emitEvent: false });

      const { opciones, deshabilitado } = this.horas();
      const hora = this.form.controls.hora;
      if (deshabilitado) hora.disable({ emitEvent: false });
      else hora.enable({ emitEvent: false });
      if (this.disponibilidad.isLoading()) return; // mientras consulta no se descarta la hora elegida
      if (hora.value && !opciones.includes(hora.value)) hora.setValue('');
      if (this.horaPendiente && opciones.includes(this.horaPendiente)) {
        hora.setValue(this.horaPendiente);
        this.horaPendiente = null;
      }
    });
  }

  private mostrarFicha(r: CitaAgendada): void {
    this.ficha.set(r);
    this.horaPendiente = null;
    this.form.reset(); // teléfono y fecha vacíos sueltan al cliente y las horas
    afterNextRender(() => this.fichaCita()?.nativeElement.focus(), { injector: this.injector });
  }
}
