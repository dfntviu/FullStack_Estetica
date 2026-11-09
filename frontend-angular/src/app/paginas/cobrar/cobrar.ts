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
import { catchError, finalize, map, Observable, of, Subject, switchMap } from 'rxjs';
import { CitasApi } from '../../core/datos/citas-api';
import { CobrosApi } from '../../core/datos/cobros-api';
import { ServiciosApi } from '../../core/datos/servicios-api';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { Cita } from '../../core/modelos/cita';
import { Cobro, METODOS_PAGO, MetodoPago } from '../../core/modelos/cobro';
import { Aviso } from '../../compartido/aviso/aviso';
import { ErroresServidor } from '../../compartido/formularios/errores-servidor';
import { MonedaPipe } from '../../compartido/pipes/moneda.pipe';

/** Estados en los que una cita se puede cobrar (si el cliente está en la estética, ya llegó). */
const COBRABLES = new Set(['pendiente', 'confirmada']);

/** Resultado de buscar la cita escrita en "Folio de cita". */
type BusquedaCita = { folio: string; cita: Cita | null } | { folio: string; error: unknown };

/**
 * Antes cobrarServicio.controller.js + cobrarServicio.view.js (F-25 a F-28).
 * - Con folio de cita: el total es el PRECIO CONGELADO de la cita; cliente y servicio se bloquean
 *   porque el servidor los toma de la cita, y la marca terminada en la misma transacción.
 * - Sin folio: venta directa; con el teléfono de un cliente registrado se suma a su historial.
 * - Efectivo admite cambio; tarjeta y transferencia son exactas (lo exige la base).
 * Total y cambio son solo una VISTA PREVIA: los importes oficiales los devuelve el servidor.
 */
@Component({
  selector: 'app-cobrar',
  imports: [ReactiveFormsModule, Aviso, MonedaPipe],
  host: { class: 'pagina' },
  templateUrl: './cobrar.html',
})
export class Cobrar implements OnInit {
  /** ?cita=A010 llega desde el botón "Cobrar" de Verificar. */
  readonly cita = input<string>();

  private readonly citasApi = inject(CitasApi);
  private readonly cobrosApi = inject(CobrosApi);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly metodos = Object.entries(METODOS_PAGO) as [MetodoPago, string][];
  protected readonly nombreMetodo = METODOS_PAGO;

  /** Sin validadores: las reglas las valida el servidor y sus errores se pintan por campo. */
  protected readonly form = inject(NonNullableFormBuilder).group({
    citaFolio: '',
    telefono: '',
    cliente: '',
    servicio: '',
    metodo: 'efectivo' as MetodoPago,
    referencia: '',
    pagado: '',
  });

  protected readonly catalogo = inject(ServiciosApi).catalogo();
  protected readonly errores = new ErroresServidor();
  protected readonly citaCargada = signal<Cita | null>(null);
  protected readonly buscandoCita = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly comprobante = signal<Cobro | null>(null);
  protected readonly aviso = signal<{ texto: string; reintentar: (() => void) | null } | null>(null);
  private readonly mensajeCobro = viewChild<ElementRef<HTMLElement>>('mensajeCobro');

  private readonly metodo = toSignal(this.form.controls.metodo.valueChanges, { initialValue: 'efectivo' as MetodoPago });
  private readonly servicioElegido = toSignal(this.form.controls.servicio.valueChanges, { initialValue: '' });
  private readonly pagadoEscrito = toSignal(this.form.controls.pagado.valueChanges, { initialValue: '' });
  private readonly busquedas = new Subject<string>();

  /** Con cita: su precio pactado. Sin cita: el precio actual del servicio elegido. */
  protected readonly total = computed(() => {
    const cita = this.citaCargada();
    if (cita) return cita.precio;
    const clave = this.servicioElegido();
    return (this.catalogo.hasValue() && this.catalogo.value().find((s) => s.id === clave)?.costo) || 0;
  });

  protected readonly errorCatalogo = computed(() => {
    const e = this.catalogo.error();
    return e ? mensajeDe(e, 'No se pudo cargar el catálogo.') : null;
  });

  protected readonly exacto = computed(() => this.metodo() !== 'efectivo');

  /** Vista previa del cambio (antes Math.round en el controlador, H-6). El oficial lo calcula la base. */
  protected readonly cambioPrevio = computed<number | null>(() => {
    const total = this.total();
    if (!total) return null;
    if (this.exacto()) return 0;
    const escrito = this.pagadoEscrito();
    const pagado = Number(escrito);
    return escrito === '' || !Number.isFinite(pagado) ? null : Math.round((pagado - total) * 100) / 100;
  });

  protected readonly ayudaFolio = computed(() => {
    if (this.buscandoCita()) return 'Buscando la cita…';
    const c = this.citaCargada();
    return c
      ? `Cita ${c.id} del ${c.fecha} a las ${c.hora} (${c.estado}). Se cobra su precio pactado.`
      : 'Con folio se cobra la cita con su precio pactado. Sin folio, es un cliente de paso.';
  });

  constructor() {
    this.busquedas
      .pipe(
        switchMap((folio) => this.buscarCita(folio)),
        takeUntilDestroyed(),
      )
      .subscribe((r) => this.aplicarCita(r));

    // Con cita, sus datos mandan: cliente, teléfono y servicio quedan bloqueados.
    effect(() => {
      const { telefono, cliente, servicio } = this.form.controls;
      for (const c of [telefono, cliente, servicio]) {
        if (this.citaCargada()) c.disable({ emitEvent: false });
        else c.enable({ emitEvent: false });
      }
    });

    // Tarjeta o transferencia: el pago es exacto, así que "Monto pagado" se fija en el total.
    effect(() => {
      const total = this.total();
      if (this.exacto()) this.form.controls.pagado.setValue(total ? String(total) : '', { emitEvent: false });
    });
  }

  ngOnInit(): void {
    const folio = this.cita();
    if (folio) {
      this.form.controls.citaFolio.setValue(folio);
      this.cambiarFolio();
    }
  }

  /** Al salir del campo (evento change), se busca la cita escrita. */
  protected cambiarFolio(): void {
    this.busquedas.next(this.form.controls.citaFolio.value.trim());
  }

  /** De vuelta a efectivo, el monto y la referencia se capturan de nuevo. */
  protected cambiarMetodo(): void {
    if (!this.exacto()) this.form.patchValue({ pagado: '', referencia: '' });
  }

  protected cobrar(): void {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    const v = this.form.getRawValue();
    const pagado = v.pagado === '' ? undefined : Number(v.pagado);
    this.cobrosApi
      .registrar({ ...v, pagado })
      .pipe(finalize(() => this.ocupado.set(false)))
      .subscribe({
        next: (cobro) => this.mostrarComprobante(cobro),
        error: (e: unknown) => {
          if (e instanceof ErrorApi && e.tieneErroresPorCampo) {
            this.aviso.set(null);
            this.errores.mostrar(e.errores, this.host);
          } else {
            this.aviso.set({ texto: mensajeDe(e, 'No se pudo registrar el cobro.'), reintentar: null });
          }
        },
      });
  }

  private buscarCita(folio: string): Observable<BusquedaCita | null> {
    if (!folio) return of(null);
    this.buscandoCita.set(true);
    return this.citasApi.obtener(folio).pipe(
      map((cita): BusquedaCita => ({ folio, cita })),
      catchError((error: unknown) => of<BusquedaCita>({ folio, error })),
      finalize(() => this.buscandoCita.set(false)),
    );
  }

  /** Sin folio vuelve al modo "cliente de paso"; con cita cobrable, fija sus datos y su precio. */
  private aplicarCita(r: BusquedaCita | null): void {
    this.errores.limpiar();
    this.aviso.set(null);
    const anterior = this.citaCargada();
    this.citaCargada.set(null);
    if (anterior) this.form.patchValue({ telefono: '', cliente: '', servicio: '' });
    if (!r) return;

    if ('error' in r) {
      const folio = r.folio;
      this.aviso.set({ texto: mensajeDe(r.error, 'No se pudo consultar la cita.'), reintentar: () => this.busquedas.next(folio) });
      return;
    }
    const cita = r.cita;
    if (!cita) {
      this.errores.mostrar({ citaFolio: `No existe la cita ${r.folio.toUpperCase()}.` }, this.host);
      return;
    }
    if (!COBRABLES.has(cita.estado)) {
      this.errores.mostrar({ citaFolio: `La cita ${cita.id} está ${cita.estado}; no se puede cobrar.` }, this.host);
      return;
    }
    this.form.patchValue({ citaFolio: cita.id, telefono: cita.telefono ?? '', cliente: cita.nombre, servicio: cita.servicioClave });
    this.citaCargada.set(cita);
  }

  private mostrarComprobante(cobro: Cobro): void {
    this.errores.limpiar();
    this.aviso.set(null);
    this.comprobante.set(cobro);
    this.citaCargada.set(null);
    this.form.reset();
    afterNextRender(() => this.mensajeCobro()?.nativeElement.focus(), { injector: this.injector });
  }
}
