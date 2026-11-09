/** Métodos de pago que acepta la base (tipo enumerado `metodo_pago`). */
export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export const METODOS_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta (terminal)',
  transferencia: 'Transferencia',
};

/**
 * Datos para `POST /api/cobros`.
 * - Con `citaFolio`: el servidor cobra la cita con su PRECIO CONGELADO y toma cliente y servicio de ella.
 * - Sin folio: venta directa; `telefono` de un cliente registrado suma el cobro a su historial.
 */
export interface NuevoCobro {
  citaFolio?: string;
  telefono?: string;
  cliente?: string;
  servicio?: string;
  metodo: MetodoPago;
  pagado?: number;
  referencia?: string;
}

/** Cobro registrado, tal como lo devuelve la API (comprobante). */
export interface Cobro {
  folio: string;
  citaFolio: string | null;
  /** null = cliente de paso. */
  clienteFolio: string | null;
  cliente: string;
  servicio: string;
  total: number;
  metodo: MetodoPago;
  pagado: number;
  /** Lo calcula la base (columna generada `pagado - total`). */
  cambio: number;
  referencia: string | null;
  fechaHora: string;
}
