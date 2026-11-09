import { Component, computed, inject, signal } from '@angular/core';
import { HttpResourceRef } from '@angular/common/http';
import { ErrorApi, mensajeDe } from '../../core/interceptors/error-api';
import { ReportesApi } from '../../core/datos/reportes-api';
import { Periodo } from '../../core/modelos/reporte';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { RELOJ } from '../../core/servicios/reloj';
import { fechaISO, parsearFecha, ultimosDias } from '../../core/util/fechas';
import { Aviso, TipoAviso } from '../../compartido/aviso/aviso';
import { MonedaPipe } from '../../compartido/pipes/moneda.pipe';
import { GraficaIngresos } from './grafica-ingresos/grafica-ingresos';

type Pestana = 'ingresos' | 'auditoria' | 'caja';

interface AvisoReporte {
  tipo: TipoAviso;
  texto: string;
  reintentar?: () => void;
}

/** Periodos rápidos: terminan HOY e incluyen n días. */
export const PERIODOS = [
  { dias: 60, texto: 'Bimestre', detalle: '60 días' },
  { dias: 90, texto: 'Trimestre', detalle: '90 días' },
  { dias: 120, texto: 'Cuatrimestre', detalle: '120 días' },
] as const;

const SERVICIOS_VISIBLES = 10;

/**
 * Reportes del administrador (vista nueva, sin equivalente nativo).
 * - Ingresos: funciones de PostgreSQL con ventanas, generate_series y ROLLUP.
 * - Auditoría: vistas sobre la tabla genérica `auditoria` (precios y movimientos de clientes).
 * - Caja: cierres del procedimiento sp_cerrar_caja, con su descuadre.
 * Cada pestaña pide sus datos solo mientras está abierta.
 */
@Component({
  selector: 'app-reportes',
  imports: [Aviso, MonedaPipe, GraficaIngresos],
  host: { class: 'pagina' },
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes {
  private readonly api = inject(ReportesApi);
  private readonly confirmacion = inject(Confirmacion);

  protected readonly hoy = fechaISO(inject(RELOJ)());
  protected readonly periodos = PERIODOS;

  // ---- Estado de la vista ----
  protected readonly pestana = signal<Pestana>('ingresos');
  protected readonly preset = signal<number | 'personalizado'>(90);
  protected readonly periodo = signal<Periodo>(ultimosDias(this.hoy, 90));
  protected readonly mostrarTodosServicios = signal(false);
  protected readonly cerrando = signal(false);
  protected readonly avisoCaja = signal<AvisoReporte | null>(null);

  // ---- Recursos: solo la pestaña abierta tiene periodo (las demás quedan inactivas) ----
  private periodoSi(p: Pestana) {
    return computed(() => (this.pestana() === p ? this.periodo() : undefined));
  }
  protected readonly ingresos = this.api.ingresos(this.periodoSi('ingresos'));
  protected readonly costos = this.api.costos(this.periodoSi('auditoria'));
  protected readonly clientes = this.api.clientes(this.periodoSi('auditoria'));
  protected readonly cierres = this.api.cierres(this.periodoSi('caja'));

  // ---- Derivados ----
  protected readonly variacion = computed(() => {
    const v = this.ingresos.hasValue() ? this.ingresos.value().resumen.variacionPct : null;
    if (v === null) return null;
    const sube = v >= 0;
    return { texto: `${sube ? '+' : '−'}${Math.abs(v).toFixed(1)} %`, sube };
  });

  protected readonly servicios = computed(() => {
    const todos = this.ingresos.hasValue() ? this.ingresos.value().porServicio : [];
    return this.mostrarTodosServicios() ? todos : todos.slice(0, SERVICIOS_VISIBLES);
  });
  protected readonly totalServicios = computed(() => (this.ingresos.hasValue() ? this.ingresos.value().porServicio.length : 0));
  protected readonly serviciosVisibles = SERVICIOS_VISIBLES;

  protected readonly hoyCerrado = computed(
    () => this.cierres.hasValue() && this.cierres.value().some((c) => c.dia === this.hoy),
  );

  protected readonly avisoIngresos = computed(() => this.avisoDe(this.ingresos, 'No se pudo cargar el reporte de ingresos.'));
  protected readonly avisoAuditoria = computed(
    () => this.avisoDe(this.costos, 'No se pudo cargar la auditoría.') ?? this.avisoDe(this.clientes, 'No se pudo cargar la auditoría.'),
  );
  protected readonly avisoCierres = computed(() => this.avisoDe(this.cierres, 'No se pudieron cargar los cierres.'));

  // ---- Acciones ----
  protected elegirPeriodo(dias: number): void {
    this.preset.set(dias);
    this.periodo.set(ultimosDias(this.hoy, dias));
  }

  /** Periodo personalizado. El servidor valida orden y tamaño; aquí solo se evita lo obvio. */
  protected aplicarPersonalizado(desde: string, hasta: string): void {
    if (!parsearFecha(desde) || !parsearFecha(hasta)) return;
    this.preset.set('personalizado');
    this.periodo.set({ desde, hasta });
  }

  protected cerrarCajaHoy(): void {
    if (this.cerrando()) return;
    const pregunta = `¿Cerrar la caja de hoy (${this.hoy})? Después del cierre no se podrán registrar más cobros con fecha de hoy.`;
    if (!this.confirmacion.preguntar(pregunta)) return;
    this.cerrando.set(true);
    this.api.cerrarCaja(this.hoy).subscribe({
      next: (c) => {
        this.cerrando.set(false);
        this.avisoCaja.set({ tipo: 'success', texto: `Caja del ${c.dia} cerrada: ${c.cobros} cobro(s).` });
        this.cierres.reload();
      },
      error: (e: unknown) => {
        this.cerrando.set(false);
        this.avisoCaja.set({ tipo: 'danger', texto: mensajeDe(e, 'No se pudo cerrar la caja.') });
        this.cierres.reload();
      },
    });
  }

  /** Porcentajes siempre con un decimal: JSON convierte 11.0 en 11. */
  protected pct(valor: number): string {
    return valor.toFixed(1);
  }

  protected etiquetaMetodo(metodo: string): string {
    return { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', total: 'Total' }[metodo] ?? metodo;
  }

  /** 400 = periodo inválido (motivo, sin Reintentar); otra falla = error con Reintentar. */
  private avisoDe(r: HttpResourceRef<unknown>, respaldo: string): AvisoReporte | null {
    const e = r.error();
    if (!e) return null;
    if (e instanceof ErrorApi && e.status === 400) {
      return { tipo: 'warning', texto: Object.values(e.errores)[0] ?? e.mensaje };
    }
    return { tipo: 'danger', texto: mensajeDe(e, respaldo), reintentar: () => r.reload() };
  }
}
