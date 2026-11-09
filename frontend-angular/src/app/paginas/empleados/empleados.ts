import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, finalize, map, merge, Observable } from 'rxjs';
import { EmpleadosApi } from '../../core/datos/empleados-api';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { Empleado, EstadoEmpleados } from '../../core/modelos/empleado';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { RELOJ } from '../../core/servicios/reloj';
import { VisibilidadPagina } from '../../core/servicios/visibilidad-pagina';
import { fechaISO } from '../../core/util/fechas';
import { Aviso, TipoAviso } from '../../compartido/aviso/aviso';
import { ErroresServidor } from '../../compartido/formularios/errores-servidor';
import { TelefonoPipe } from '../../compartido/pipes/telefono.pipe';
import { RETARDO_BUSQUEDA_MS } from '../../core/util/tiempos';

interface Mensaje {
  tipo: TipoAviso;
  texto: string;
}

/**
 * Antes empleados.controller.js + empleados.view.js (F-35 a F-38).
 * Registrar, consultar, editar y dar de baja / reactivar. La baja es lógica: el empleado queda
 * inactivo y conserva sus datos. "Fecha de ingreso no futura" la valida la API.
 */
@Component({
  selector: 'app-empleados',
  imports: [ReactiveFormsModule, Aviso, TelefonoPipe],
  host: { class: 'pagina' },
  templateUrl: './empleados.html',
})
export class Empleados {
  private readonly api = inject(EmpleadosApi);
  private readonly confirmacion = inject(Confirmacion);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  /** El calendario no ofrece fechas futuras (la regla definitiva está en la API). */
  protected readonly hoy = fechaISO(inject(RELOJ)());

  protected readonly busqueda = new FormControl('', { nonNullable: true });
  protected readonly estado = new FormControl<EstadoEmpleados>('activos', { nonNullable: true });
  private readonly filtro = toSignal(
    merge(this.busqueda.valueChanges.pipe(debounceTime(RETARDO_BUSQUEDA_MS)), this.estado.valueChanges).pipe(
      map(() => ({ texto: this.busqueda.value, estado: this.estado.value })),
    ),
    { initialValue: { texto: '', estado: 'activos' as EstadoEmpleados } },
  );
  protected readonly lista = this.api.lista(this.filtro);

  protected readonly form = inject(NonNullableFormBuilder).group({ nombre: '', telefono: '', fechaIngreso: '' });
  protected readonly errores = new ErroresServidor();
  protected readonly editandoId = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly avisoForm = signal<Mensaje | null>(null);
  protected readonly avisoLista = signal<Mensaje | null>(null);

  protected readonly errorLista = computed(() => {
    const e = this.lista.error();
    return e ? mensajeDe(e, 'No se pudo cargar la lista.') : null;
  });

  protected readonly contador = computed(() => {
    if (this.lista.isLoading()) return 'Cargando…';
    return this.lista.hasValue() ? `${this.lista.value().length} empleado(s)` : '';
  });

  constructor() {
    inject(VisibilidadPagina)
      .alVolver$.pipe(takeUntilDestroyed())
      .subscribe(() => this.lista.reload());
    merge(this.busqueda.valueChanges, this.estado.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.avisoLista.set(null));
  }

  protected guardar(): void {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    const id = this.editandoId();
    const datos = this.form.getRawValue();
    const peticion: Observable<Empleado> = id ? this.api.editar(id, datos) : this.api.registrar(datos);
    peticion.pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: (e) => {
        this.salirDeEdicion();
        this.avisoForm.set({ tipo: 'success', texto: id ? `Datos de ${e.nombre} actualizados.` : `Empleado ${e.id} — ${e.nombre} registrado.` });
        this.lista.reload();
      },
      error: (e: unknown) => {
        if (e instanceof ErrorApi && e.tieneErroresPorCampo) {
          this.avisoForm.set(null);
          this.errores.mostrar(e.errores, this.host);
        } else {
          this.avisoForm.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo guardar.') });
        }
      },
    });
  }

  protected editar(emp: Empleado): void {
    this.api.obtener(emp.id).subscribe({
      next: (e) => {
        this.errores.limpiar();
        this.avisoForm.set(null);
        this.editandoId.set(e.id);
        this.form.setValue({ nombre: e.nombre, telefono: e.telefono, fechaIngreso: e.fechaIngreso });
        this.host.querySelector<HTMLElement>('#empNombre')?.focus();
      },
      error: (e: unknown) => this.avisoLista.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo abrir el empleado.') }),
    });
  }

  protected salirDeEdicion(): void {
    this.editandoId.set(null);
    this.errores.limpiar();
    this.form.reset();
  }

  protected darDeBaja(e: Empleado): void {
    if (!this.confirmacion.preguntar(`¿Dar de baja a ${e.nombre}? Sus datos se conservan como inactivo.`)) return;
    if (this.editandoId() === e.id) this.salirDeEdicion();
    this.accionLista(this.api.darDeBaja(e.id), (r) => `${r.nombre} quedó inactivo.`); 
  }

  protected reactivar(e: Empleado): void {
    this.accionLista(this.api.reactivar(e.id), (r) => `${r.nombre} está activo de nuevo.`);  //cambio de bandera
  }

  private accionLista(trabajo: Observable<Empleado>, exito: (e: Empleado) => string): void {
    trabajo.pipe(finalize(() => this.lista.reload())).subscribe({  //actualizacion lista empleado. recorriendo n posiciones segun el periodo de inactividad en la lista
      next: (e) => this.avisoLista.set({ tipo: 'success', texto: exito(e) }),
      error: (e: unknown) => this.avisoLista.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo completar la acción.') }), //
    });
  }
}
