/** Una fila de cualquier consulta: columnas en camelCase (folios, nombres, claves; nunca ids). */
export type FilaConsulta = Record<string, string | number | boolean | null>;

/** Periodo de Consultas: sin límite por defecto; sin `hasta` incluye las citas programadas. */
export interface PeriodoAbierto {
  desde?: string;
  hasta?: string;
}

/** Fila de la consulta maestra (fn_diagnostico_negocio). */
export interface FilaDiagnostico {
  empleadoFolio: string | null;
  empleado: string;
  servicioClave: string;
  servicio: string;
  citas: number;
  clientes: number;
  cobradas: number;
  vencidasSinCobro: number;
  programadas: number;
  canceladas: number;
  ingresos: number;
  /** null si no hay citas que ya debieran cobrarse (solo programadas o canceladas). */
  tasaCobroPct: number | null;
  ultimaCita: string;
}
