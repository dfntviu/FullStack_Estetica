import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, finalize, map, merge, Observable } from 'rxjs';
import { ClientesApi } from '../../core/datos/clientes-api';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { Cliente, HistorialCliente } from '../../core/modelos/cliente';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { VisibilidadPagina } from '../../core/servicios/visibilidad-pagina';
import { Aviso, TipoAviso } from '../../compartido/aviso/aviso';
import { ErroresServidor } from '../../compartido/formularios/errores-servidor';
import { TelefonoPipe } from '../../compartido/pipes/telefono.pipe';
import { RETARDO_BUSQUEDA_MS } from '../../core/util/tiempos';
import { HistorialClienteComponent } from './historial-cliente/historial-cliente';

interface Mensaje {
  tipo: TipoAviso;
  texto: string;
}

/**
 * Antes clientes.controller.js + clientes.view.js (F-29 a F-34).
 * Registrar, consultar, editar, dar de baja / reactivar y ver el historial. Las reglas (teléfono
 * único, formatos, baja lógica) las valida el servidor; aquí se coordina y se muestra.
 */
@Component({
  selector: 'app-clientes',
  imports: [ReactiveFormsModule, Aviso, TelefonoPipe, HistorialClienteComponent],
  host: { class: 'pagina' },
  templateUrl: './clientes.html',
})
export class Clientes {
  private readonly api = inject(ClientesApi);
  private readonly confirmacion = inject(Confirmacion);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  // ---- Filtro: el texto espera 250 ms; la casilla se aplica de inmediato ----
  protected readonly busqueda = new FormControl('', { nonNullable: true });
  protected readonly inactivos = new FormControl(false, { nonNullable: true });
  private readonly filtro = toSignal(
    merge(this.busqueda.valueChanges.pipe(debounceTime(RETARDO_BUSQUEDA_MS)), this.inactivos.valueChanges).pipe(
      map(() => ({ texto: this.busqueda.value, incluirInactivos: this.inactivos.value })),
    ),
    { initialValue: { texto: '', incluirInactivos: false } },
  );
  protected readonly lista = this.api.lista(this.filtro);

  // ---- Formulario: alta y edición comparten campos ----
  protected readonly form = inject(NonNullableFormBuilder).group({
    nombre: '',
    telefono: '',
    cumpleanos: '',
    observaciones: '',
  });
  protected readonly errores = new ErroresServidor();
  protected readonly editandoId = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly avisoForm = signal<Mensaje | null>(null);
  protected readonly avisoLista = signal<Mensaje | null>(null);

  // ---- Historial ----
  protected readonly historial = signal<HistorialCliente | null>(null);
  private historialId: string | null = null;

  protected readonly errorLista = computed(() => {
    const e = this.lista.error();
    return e ? mensajeDe(e, 'No se pudo cargar la lista.') : null;
  });

  protected readonly contador = computed(() => {
    if (this.lista.isLoading()) return 'Cargando…';
    if (this.lista.error()) return '';
    return this.lista.hasValue() ? `${this.lista.value().length} cliente(s)` : '';
  });

  constructor() {
    // Al volver a la pestaña se traen los cambios hechos desde otro equipo.
    inject(VisibilidadPagina)
      .alVolver$.pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.lista.reload();
        this.refrescarHistorial();
      });
    this.busqueda.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.avisoLista.set(null));
  }

  protected guardar(): void {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    const id = this.editandoId();
    const datos = this.form.getRawValue();
    const peticion: Observable<Cliente> = id ? this.api.editar(id, datos) : this.api.registrar(datos);
    peticion.pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: (c) => {
        this.salirDeEdicion();
        this.avisoForm.set({ tipo: 'success', texto: id ? `Datos de ${c.nombre} actualizados.` : `Cliente ${c.id} — ${c.nombre} registrado.` });
        this.lista.reload();
        if (this.historialId === c.id) this.refrescarHistorial();
      },
      error: (e: unknown) => {
        // 400/409 con campos (teléfono duplicado, formato…) van al formulario; lo demás, como aviso.
        if (e instanceof ErrorApi && e.tieneErroresPorCampo) {
          this.avisoForm.set(null);
          this.errores.mostrar(e.errores, this.host);
        } else {
          this.avisoForm.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo guardar.') });
        }
      },
    });
  }

  protected editar(c: Cliente): void {
    this.api.obtener(c.id).subscribe({
      next: (cliente) => {
        this.errores.limpiar();
        this.avisoForm.set(null);
        this.editandoId.set(cliente.id);
        this.form.setValue({
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          cumpleanos: cliente.cumpleanos,
          observaciones: cliente.observaciones,
        });
        this.host.querySelector<HTMLElement>('#cliNombre')?.focus();
      },
      error: (e: unknown) => this.avisoLista.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo abrir el cliente.') }),
    });
  }

  protected salirDeEdicion(): void {
    this.editandoId.set(null);
    this.errores.limpiar();
    this.form.reset();
  }

  protected darDeBaja(c: Cliente): void {
    if (!this.confirmacion.preguntar(`¿Dar de baja a ${c.nombre}? Su historial se conserva y puedes reactivarlo.`)) return;
    if (this.editandoId() === c.id) this.salirDeEdicion();
    this.accionLista(this.api.darDeBaja(c.id), (r) => `${r.nombre} quedó dado de baja.`);
  }

  protected reactivar(c: Cliente): void {
    this.accionLista(this.api.reactivar(c.id), (r) => `${r.nombre} está activo de nuevo.`);
  }

  protected verHistorial(c: Cliente): void {
    this.historialId = c.id;
    this.refrescarHistorial(true);
  }

  protected cerrarHistorial(): void {
    this.historialId = null;
    this.historial.set(null);
  }

  /** Baja o reactivación: muestra el resultado y refresca la lista y el historial abierto. */
  private accionLista(trabajo: Observable<Cliente>, exito: (c: Cliente) => string): void {
    trabajo
      .pipe(
        finalize(() => {
          this.lista.reload();
          this.refrescarHistorial();
        }),
      )
      .subscribe({
        next: (c) => this.avisoLista.set({ tipo: 'success', texto: exito(c) }),
        error: (e: unknown) => this.avisoLista.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo completar la acción.') }),
      });
  }

  private refrescarHistorial(desplazar = false): void {
    const id = this.historialId;
    if (!id) return;
    this.api.historial(id).subscribe({
      next: (h) => {
        if (this.historialId !== id) return; // se cerró o se abrió otro mientras llegaba
        this.historial.set(h);
        if (desplazar) {
          afterNextRender(() => this.host.querySelector('#historialCliente')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), {
            injector: this.injector,
          });
        }
      },
      error: (e: unknown) => {
        if (e instanceof ErrorApi && e.status === 404) return this.cerrarHistorial();
        this.avisoLista.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo cargar el historial.') });
      },
    });
  }
}
