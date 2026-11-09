/** Periodo de un reporte, ambos días incluidos (AAAA-MM-DD). */
export interface Periodo {
  desde: string;
  hasta: string;
}

// ---- GET /api/reportes/ingresos ----
export interface ResumenIngresos extends Periodo {
  dias: number;
  cobros: number;
  ingresos: number;
  ticketPromedio: number;
  promedioDiario: number;
  ingresosPeriodoAnterior: number;
  /** null si el periodo anterior no tuvo ingresos. */
  variacionPct: number | null;
}

export interface IngresoDia {
  dia: string;
  cobros: number;
  ingresos: number;
  acumulado: number;
  promedio7Dias: number;
}

export interface IngresoServicio {
  ranking: number;
  clave: string;
  servicio: string;
  cobros: number;
  ingresos: number;
  ticketPromedio: number;
  participacionPct: number;
}

export interface IngresoMetodo {
  /** 'efectivo' | 'tarjeta' | 'transferencia' | 'total' (la fila del ROLLUP) */
  metodo: string;
  cobros: number;
  ingresos: number;
  participacionPct: number | null;
}

export interface ReporteIngresos {
  resumen: ResumenIngresos;
  porDia: IngresoDia[];
  porServicio: IngresoServicio[];
  porMetodo: IngresoMetodo[];
}

// ---- Auditoría ----
export type OrigenCambio = 'sistema' | 'manual';

export interface CambioCosto {
  momento: string;
  dia: string;
  clave: string;
  servicio: string;
  costoAnterior: number;
  costoNuevo: number;
  diferencia: number;
  variacionPct: number;
  origen: OrigenCambio;
  aplicacion: string | null;
}

export interface ReporteCostos extends Periodo {
  cambios: CambioCosto[];
}

export interface MovimientoCliente {
  momento: string;
  dia: string;
  folio: string;
  nombre: string;
  movimiento: 'alta' | 'baja' | 'reactivacion';
  origen: OrigenCambio;
  aplicacion: string | null;
}

export interface ReporteClientes extends Periodo {
  resumen: { altas: number; bajas: number; reactivaciones: number };
  movimientos: MovimientoCliente[];
}

// ---- Caja ----
export interface CierreCaja {
  dia: string;
  cobros: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  total: number;
  cerradoEn: string;
  origen: OrigenCambio;
  /** Lo que hoy suma la tabla cobro para ese día. */
  totalActual: number;
  /** totalActual − total: distinto de 0 si se agregaron cobros por fuera después del cierre. */
  descuadre: number;
}
