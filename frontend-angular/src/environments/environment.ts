/**
 * Configuración del front. La API (Node.js) corre en el puerto 3000 y Angular en el 4200.
 * Para apuntar a otra API, cambia `apiUrl` (y agrega el origen del front a CORS_ORIGIN en backend/.env).
 */
export const environment = {
  apiUrl: 'http://localhost:3000/api',
  /** Tiempo máximo de espera de cada petición (ms). */
  apiTimeoutMs: 8000,
};
