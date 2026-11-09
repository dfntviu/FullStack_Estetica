// Consultas del administrador. Cada una es una FUNCIÓN de PostgreSQL (database/schemas/consultas.sql):
// aquí solo hay una lista blanca de nombres. Nunca se arma SQL con texto que venga de la URL.
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../config/database.service.js';

/** id público (URL) → función de PostgreSQL. Todas reciben (p_desde date, p_hasta date). */
export const CONSULTAS = {
  diagnostico: 'fn_diagnostico_negocio',
  agenda: 'fn_agenda_detallada',
  pagos: 'fn_pagos_detallados',
  'carga-empleados': 'fn_carga_empleados',
  vencidas: 'fn_citas_vencidas',
  'clientes-sin-compras': 'fn_clientes_sin_compras',
  'servicios-sin-movimiento': 'fn_servicios_sin_movimiento',
} as const;

export type IdConsulta = keyof typeof CONSULTAS;

/** Las que clasifican citas con situacion_cita(): su SQL se muestra junto con esa función. */
const USAN_SITUACION: readonly IdConsulta[] = [
  'diagnostico',
  'agenda',
  'vencidas',
];

export const esConsulta = (id: string): id is IdConsulta =>
  Object.hasOwn(CONSULTAS, id);

/** snake_case → camelCase: la API habla camelCase como el resto de los endpoints. */
const camel = (fila: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(fila).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase()),
      v,
    ]),
  );

@Injectable()
export class ConsultasRepository {
  constructor(private readonly db: DatabaseService) {}

  async ejecutar(
    id: IdConsulta,
    desde: string | null,
    hasta: string | null,
  ): Promise<Record<string, unknown>[]> {
    const filas = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM ${CONSULTAS[id]}($1::date, $2::date)`, // nombre de la lista blanca, nunca de la URL
      [desde, hasta],
    );
    return filas.map(camel);
  }

  /**
   * El SQL real con el que se calculó: pg_get_functiondef lo reconstruye desde la base, así que
   * siempre coincide con lo instalado (no es una copia que pueda quedar desactualizada).
   */
  async sql(id: IdConsulta): Promise<string> {
    const funciones = USAN_SITUACION.includes(id)
      ? [
          `${CONSULTAS[id]}(date,date)`,
          'situacion_cita(estado_cita,date,boolean)',
        ]
      : [`${CONSULTAS[id]}(date,date)`];
    const filas = await this.db.query<{ sql: string }>(
      `SELECT pg_get_functiondef(f::regprocedure) AS sql FROM unnest($1::text[]) WITH ORDINALITY AS t(f, n) ORDER BY n`,
      [funciones.map((f) => `estetica.${f}`)],
    );
    return filas.map((f) => f.sql.trim()).join('\n\n');
  }
}
