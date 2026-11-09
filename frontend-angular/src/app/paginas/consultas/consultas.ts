import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { mensajeDe } from '../../core/interceptors/error-api';
import { ConsultasApi } from '../../core/datos/consultas-api';
import { FilaDiagnostico, PeriodoAbierto } from '../../core/modelos/consulta';
import { RELOJ } from '../../core/servicios/reloj';
import { fechaISO, ultimosDias } from '../../core/util/fechas';
import { Aviso } from '../../compartido/aviso/aviso';
import { MonedaPipe } from '../../compartido/pipes/moneda.pipe';
import { CONSULTAS, definicion } from './catalogo';
import { FiltroConsulta, TarjetaConsulta } from './tarjeta-consulta/tarjeta-consulta';

type Preset = 'todo' | 60 | 90 | 120;

export const PERIODOS_CONSULTA: readonly { valor: Preset; texto: string }[] = [
  { valor: 'todo', texto: 'Todo el historial' },
  { valor: 60, texto: 'Bimestre' },
  { valor: 90, texto: 'Trimestre' },
  { valor: 120, texto: 'Cuatrimestre' },
];

/** Filas de la maestra visibles antes de "Ver todas". */
export const FILAS_DIAGNOSTICO = 15;

/**
 * Consultas para el administrador (no necesita saber SQL).
 * - Arriba, siempre visible: la consulta maestra (diagnóstico por empleado y servicio).
 * - Debajo: casillas con título y descripción; "Aplicar" muestra las elegidas como tarjetas.
 * - Un número de la maestra lleva a su detalle: marca la consulta, la filtra y la muestra.
 */
@Component({
  selector: 'app-consultas',
  imports: [Aviso, MonedaPipe, TarjetaConsulta],
  host: { class: 'pagina' },
  templateUrl: './consultas.html',
  styleUrl: './consultas.css',
})
export class Consultas {
  private readonly api = inject(ConsultasApi);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly hoy = fechaISO(inject(RELOJ)());
  protected readonly periodos = PERIODOS_CONSULTA;
  protected readonly catalogo = CONSULTAS;
  protected readonly filasVisibles = FILAS_DIAGNOSTICO;

  // ---- Periodo: "todo" sin límites; los demás desde hace N días y SIN fin (incluye lo programado) ----
  protected readonly preset = signal<Preset>('todo');
  protected readonly periodo = computed<PeriodoAbierto>(() => {
    const p = this.preset();
    return p === 'todo' ? {} : { desde: ultimosDias(this.hoy, p).desde };
  });

  // ---- Consulta maestra ----
  protected readonly diagnostico = this.api.diagnostico(this.periodo);
  protected readonly verTodoDiagnostico = signal(false);
  private readonly filasDiagnostico = computed(() =>
    this.diagnostico.hasValue() ? this.diagnostico.value() : [],
  );
  protected readonly diagnosticoVisible = computed(() =>
    this.verTodoDiagnostico()
      ? this.filasDiagnostico()
      : this.filasDiagnostico().slice(0, FILAS_DIAGNOSTICO),
  );
  protected readonly totalCombinaciones = computed(() => this.filasDiagnostico().length);
  protected readonly totales = computed(() => {
    const t = { citas: 0, cobradas: 0, vencidas: 0, programadas: 0, canceladas: 0, ingresos: 0 };
    for (const f of this.filasDiagnostico()) {
      t.citas += f.citas;
      t.cobradas += f.cobradas;
      t.vencidas += f.vencidasSinCobro;
      t.programadas += f.programadas;
      t.canceladas += f.canceladas;
      t.ingresos += f.ingresos;
    }
    const base = t.cobradas + t.vencidas;
    return { ...t, tasa: base ? Math.round((1000 * t.cobradas) / base) / 10 : null };
  });
  protected readonly errorDiagnostico = computed(() => {
    const e = this.diagnostico.error();
    return e ? mensajeDe(e, 'No se pudo calcular el diagnóstico.') : null;
  });

  // ---- Casillas, consultas aplicadas y filtros ----
  protected readonly seleccion = signal<ReadonlySet<string>>(new Set());
  protected readonly aplicadas = signal<readonly string[]>([]);
  protected readonly filtros = signal<Readonly<Record<string, FiltroConsulta | null>>>({});
  /** El botón Aplicar solo se habilita si la selección cambió. */
  protected readonly hayCambios = computed(() => {
    const sel = this.seleccion();
    const apl = this.aplicadas();
    return sel.size !== apl.length || apl.some((id) => !sel.has(id));
  });
  protected readonly definicion = definicion;

  protected alternar(id: string): void {
    this.seleccion.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /** Muestra las elegidas, en el orden del catálogo. */
  protected aplicar(): void {
    const sel = this.seleccion();
    this.aplicadas.set(CONSULTAS.map((c) => c.id).filter((id) => sel.has(id)));
  }

  protected quitar(id: string): void {
    this.seleccion.update((s) => new Set([...s].filter((x) => x !== id)));
    this.aplicadas.update((a) => a.filter((x) => x !== id));
    this.quitarFiltro(id);
  }

  protected quitarFiltro(id: string): void {
    this.filtros.update((f) => ({ ...f, [id]: null }));
  }

  /** De un número de la maestra a su detalle: marca, aplica, filtra y lleva la vista ahí. */
  protected verDetalle(id: 'agenda' | 'vencidas', fila: FilaDiagnostico): void {
    this.seleccion.update((s) => new Set(s).add(id));
    this.aplicadas.update((a) =>
      a.includes(id) ? a : CONSULTAS.map((c) => c.id).filter((x) => x === id || a.includes(x)),
    );
    this.filtros.update((f) => ({
      ...f,
      [id]: {
        empleadoFolio: fila.empleadoFolio,
        servicioClave: fila.servicioClave,
        etiqueta: `${fila.empleado} · ${fila.servicio}`,
      },
    }));
    afterNextRender(
      () =>
        this.host
          .querySelector<HTMLElement>(`[data-consulta="${id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
  }

  protected rangoTexto(): string {
    const p = this.periodo();
    return p.desde
      ? `Desde el ${p.desde}, incluidas las citas programadas`
      : 'Todo el historial, incluidas las citas programadas';
  }
}
