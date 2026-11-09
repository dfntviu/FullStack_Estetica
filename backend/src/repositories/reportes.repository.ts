// Lecturas de reportes. Toda la lógica vive en PostgreSQL (database/schemas/auditoria-reportes.sql):
// funciones de ingresos y vistas de auditoría. Aquí solo se piden y se nombran las columnas.
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../config/database.service.js';

export interface ResumenIngresos {
  desde: string;
  hasta: string;
  dias: number;
  cobros: number;
  ingresos: number;
  ticketPromedio: number;
  promedioDiario: number;
  ingresosPeriodoAnterior: number;
  variacionPct: number | null;
}

@Injectable()
export class ReportesRepository {
  constructor(private readonly db: DatabaseService) {}

  async resumen(desde: string, hasta: string): Promise<ResumenIngresos> {
    const [r] = await this.db.query<ResumenIngresos>(
      `SELECT desde, hasta, dias, cobros, ingresos, ticket_promedio AS "ticketPromedio",
              promedio_diario AS "promedioDiario", ingresos_periodo_anterior AS "ingresosPeriodoAnterior",
              variacion_pct AS "variacionPct"
         FROM fn_resumen_ingresos($1, $2)`,
      [desde, hasta],
    );
    return r;
  }

  porDia(desde: string, hasta: string) {
    return this.db.query(
      `SELECT dia, cobros, ingresos, acumulado, promedio_7_dias AS "promedio7Dias"
         FROM fn_ingresos_por_dia($1, $2)`,
      [desde, hasta],
    );
  }

  porServicio(desde: string, hasta: string) {
    return this.db.query(
      `SELECT ranking, clave, servicio, cobros, ingresos, ticket_promedio AS "ticketPromedio",
              participacion_pct AS "participacionPct"
         FROM fn_ingresos_por_servicio($1, $2)`,
      [desde, hasta],
    );
  }

  porMetodo(desde: string, hasta: string) {
    return this.db.query(
      `SELECT metodo, cobros, ingresos, participacion_pct AS "participacionPct"
         FROM fn_ingresos_por_metodo($1, $2)`,
      [desde, hasta],
    );
  }

  /** Cambios de precio del periodo, del más reciente al más antiguo. */
  historialCostos(desde: string, hasta: string) {
    return this.db.query(
      `SELECT momento, dia_negocio(momento) AS dia, clave, servicio, costo_anterior AS "costoAnterior",
              costo_nuevo AS "costoNuevo", diferencia, variacion_pct AS "variacionPct", origen, aplicacion
         FROM v_historial_costos
        WHERE momento >= inicio_dia_negocio($1) AND momento < inicio_dia_negocio($2::date + 1)
        ORDER BY momento DESC, id DESC`,
      [desde, hasta],
    );
  }

  /** Altas, bajas y reactivaciones del periodo, del más reciente al más antiguo. */
  movimientosClientes(desde: string, hasta: string) {
    return this.db.query(
      `SELECT momento, dia_negocio(momento) AS dia, folio, nombre, movimiento, origen, aplicacion
         FROM v_movimiento_clientes
        WHERE momento >= inicio_dia_negocio($1) AND momento < inicio_dia_negocio($2::date + 1)
        ORDER BY momento DESC, id DESC`,
      [desde, hasta],
    );
  }

  /** Conteo por tipo de movimiento en UNA pasada: agregados con FILTER. */
  async resumenClientes(desde: string, hasta: string) {
    const [r] = await this.db.query<{
      altas: number;
      bajas: number;
      reactivaciones: number;
    }>(
      `SELECT count(*) FILTER (WHERE movimiento = 'alta')::int         AS altas,
              count(*) FILTER (WHERE movimiento = 'baja')::int         AS bajas,
              count(*) FILTER (WHERE movimiento = 'reactivacion')::int AS reactivaciones
         FROM v_movimiento_clientes
        WHERE momento >= inicio_dia_negocio($1) AND momento < inicio_dia_negocio($2::date + 1)`,
      [desde, hasta],
    );
    return r;
  }
}
