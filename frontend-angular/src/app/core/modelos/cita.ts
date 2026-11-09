/** Respuesta de `GET /api/citas/disponibilidad?fecha=AAAA-MM-DD`. */
export interface Disponibilidad {
  fecha: string;
  /** Turnos libres 'HH:MM'. */
  horarios: string[];
  /** Por qué no hay turnos (domingo, fecha pasada, día lleno); null si hay. */
  motivo: string | null;
}

export type EstadoCita = 'pendiente' | 'confirmada' | 'cancelada' | 'terminada';

/** Cita tal como la envía la API. */
export interface CitaApi {
  folio: string;
  clienteFolio: string;
  nombre: string;
  telefono: string;
  servicioClave: string;
  servicio: string;
  empleadoFolio: string | null;
  fecha: string;
  hora: string;
  /** Precio congelado al agendar. */
  precio: number;
  estado: EstadoCita;
}

/** Cita como la usan las páginas: `id` = folio (A001…), igual que la versión nativa. */
export type Cita = Omit<CitaApi, 'folio'> & { id: string };

/** Datos para `POST /api/citas`. El servidor identifica (o registra) al cliente por teléfono. */
export interface NuevaCita {
  telefono: string;
  cliente: string;
  servicio: string;
  fecha: string;
  hora: string;
}

export interface CitaAgendada {
  cita: Cita;
  clienteNuevo: boolean;
}

export const aCita = ({ folio, ...resto }: CitaApi): Cita => ({ id: folio, ...resto });
