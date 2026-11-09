/** Servicio del catálogo tal como lo usan las páginas (`id` = clave de la base). */
export interface Servicio {
  id: string;
  nombre: string;
  costo: number;
  imagen: string;
}

/** Forma en que lo envía la API (`GET /api/servicios`). */
export interface ServicioApi {
  clave: string;
  nombre: string;
  costo: number;
  imagen: string;
}
