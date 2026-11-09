import { Component, computed, DOCUMENT, inject, input, output, signal } from '@angular/core';
import { mensajeDe } from '../../../core/interceptors/error-api';
import { ConsultasApi } from '../../../core/datos/consultas-api';
import { FilaConsulta, PeriodoAbierto } from '../../../core/modelos/consulta';
import { Aviso } from '../../../compartido/aviso/aviso';
import { aCsv, descargar } from '../../../compartido/descargar-csv';
import { MonedaPipe } from '../../../compartido/pipes/moneda.pipe';
import { Columna, DefinicionConsulta } from '../catalogo';

/** Filtro que llega al hacer clic en un número de la consulta maestra. */
export interface FiltroConsulta {
  empleadoFolio: string | null;
  servicioClave: string;
  /** "Ana Ruiz · Balayage" */
  etiqueta: string;
}

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'text-bg-warning',
  confirmada: 'text-bg-primary',
  terminada: 'text-bg-success',
  cancelada: 'text-bg-secondary',
};
const BADGE_SITUACION: Record<string, { clase: string; icono: string }> = {
  cobrada: { clase: 'text-bg-success', icono: 'fa-circle-check' },
  'vencida sin cobro': { clase: 'text-bg-warning', icono: 'fa-triangle-exclamation' },
  programada: { clase: 'text-bg-info', icono: 'fa-calendar' },
  cancelada: { clase: 'text-bg-secondary', icono: 'fa-ban' },
};

/**
 * Tarjeta genérica: muestra cualquier consulta del catálogo con su tabla, número de resultados,
 * "Descargar CSV" y "Ver SQL" (el SQL real instalado en la base, para quien quiera verlo).
 */
@Component({
  selector: 'app-tarjeta-consulta',
  imports: [Aviso],
  templateUrl: './tarjeta-consulta.html',
  styleUrl: './tarjeta-consulta.css',
})
export class TarjetaConsulta {
  readonly definicion = input.required<DefinicionConsulta>();
  readonly periodo = input.required<PeriodoAbierto>();
  readonly filtro = input<FiltroConsulta | null>(null);
  readonly quitarFiltro = output<void>();
  readonly cerrar = output<void>();

  private readonly api = inject(ConsultasApi);
  private readonly documento = inject(DOCUMENT);
  private readonly moneda = new MonedaPipe();

  protected readonly id = computed(() => this.definicion().id);
  /** Las consultas sobre todo el historial ignoran el periodo de la página. */
  private readonly periodoEfectivo = computed<PeriodoAbierto>(() =>
    this.definicion().usaPeriodo ? this.periodo() : {},
  );
  protected readonly datos = this.api.resultado(this.id, this.periodoEfectivo);

  protected readonly verSql = signal(false);
  protected readonly sql = this.api.sql(this.id, this.verSql);

  protected readonly todas = computed(() => (this.datos.hasValue() ? this.datos.value() : []));
  protected readonly filas = computed(() => {
    const f = this.filtro();
    if (!f) return this.todas();
    return this.todas().filter(
      (x) => x['empleadoFolio'] === f.empleadoFolio && x['servicioClave'] === f.servicioClave,
    );
  });
  protected readonly error = computed(() => {
    const e = this.datos.error();
    return e ? mensajeDe(e, 'No se pudo cargar la consulta.') : null;
  });

  protected valor(c: Columna, fila: FilaConsulta): string {
    const v = fila[c.clave];
    if (v === null || v === undefined) return c.siVacio ?? '—';
    switch (c.tipo) {
      case 'moneda':
        return this.moneda.transform(v as number);
      case 'si-no':
        return v ? 'Sí' : 'No';
      default:
        return String(v);
    }
  }

  protected secundaria(c: Columna, fila: FilaConsulta): string | null {
    if (!c.secundaria) return null;
    const v = fila[c.secundaria];
    if (v === null || v === undefined) {
      // Sin folio: cliente de paso o cita sin empleado asignado
      return c.secundaria === 'clienteFolio' ? 'de paso' : null;
    }
    return String(v);
  }

  protected badgeEstado(v: unknown): string {
    return BADGE_ESTADO[String(v)] ?? 'text-bg-light';
  }

  protected badgeSituacion(v: unknown) {
    return BADGE_SITUACION[String(v)] ?? { clase: 'text-bg-light', icono: 'fa-circle' };
  }

  protected esNumerica(c: Columna): boolean {
    return c.tipo === 'numero' || c.tipo === 'moneda';
  }

  /** CSV con los datos tal como están (sin formato de moneda), y las columnas secundarias aparte. */
  protected descargarCsv(): void {
    const columnas = this.definicion().columnas.flatMap((c) =>
      c.secundaria
        ? [
            { clave: c.clave, titulo: c.titulo },
            { clave: c.secundaria, titulo: `${c.titulo} (folio/clave)` },
          ]
        : [{ clave: c.clave, titulo: c.titulo }],
    );
    const csv = aCsv(
      columnas.map((c) => c.titulo),
      this.filas().map((f) => columnas.map((c) => f[c.clave])),
    );
    descargar(this.documento, `${this.id()}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }
}
