/** Cliente tal como lo envía la API. */
export interface ClienteApi {
  folio: string;
  nombre: string;
  telefono: string;
  cumpleanos: string | null;
  observaciones: string | null;
  fechaRegistro: string;
  activo: boolean;
}

/** Cliente como lo usan las páginas: `id` = folio (C001…) y textos opcionales como ''. */
export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  cumpleanos: string;
  observaciones: string;
  fechaRegistro: string;
  activo: boolean;
}

export const aCliente = ({ folio, cumpleanos, observaciones, ...resto }: ClienteApi): Cliente => ({
  id: folio,
  ...resto,
  cumpleanos: cumpleanos ?? '',
  observaciones: observaciones ?? '',
});

/** Datos para registrar o editar un cliente (`POST` / `PUT /api/clientes`). */
export interface DatosCliente {
  nombre: string;
  telefono: string;
  cumpleanos: string;
  observaciones: string;
}

export interface FiltroClientes {
  texto: string;
  incluirInactivos: boolean;
}

/** Una cita del historial del cliente. */
export interface CitaHistorial {
  id: string;
  fecha: string;
  hora: string;
  servicio: string;
  precio: number;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'terminada';
}

/** Respuesta de `GET /api/clientes/:folio/historial`, lista para pintar. */
export interface HistorialCliente {
  cliente: Cliente;
  totalCitas: number;
  totalGastado: number;
  ultimaVisita: string;
  servicioFrecuente: string;
  /** La siguiente cita activa (pendiente o confirmada) de hoy en adelante. */
  proximaCita: CitaHistorial | null;
  citas: CitaHistorial[];
}
