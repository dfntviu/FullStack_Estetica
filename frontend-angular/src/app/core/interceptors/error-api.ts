/** Errores de campo tal como los envía la API: `{ campo: 'mensaje' }`. */
export type ErroresCampo = Record<string, string>;

/**
 * Forma única de cualquier falla de la API, igual que en la versión nativa:
 * `{ status, mensaje, errores, restriccion }`. `status` 0 = sin conexión o tiempo agotado.
 */
export class ErrorApi extends Error {
  readonly status: number;
  readonly mensaje: string;
  readonly errores: ErroresCampo;
  readonly restriccion: string | null;

  constructor({
    status = 0,
    mensaje = 'Error inesperado.',
    errores = {},
    restriccion = null,
  }: { status?: number; mensaje?: string; errores?: ErroresCampo; restriccion?: string | null } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.mensaje = mensaje;
    this.errores = errores;
    this.restriccion = restriccion;
  }

  get sinConexion(): boolean {
    return this.status === 0;
  }

  get tieneErroresPorCampo(): boolean {
    return Object.keys(this.errores).length > 0;
  }
}

/** Mensaje legible de cualquier error (ErrorApi u otro), con un texto de respaldo. */
export function mensajeDe(error: unknown, respaldo: string): string {
  return error instanceof ErrorApi ? error.mensaje : respaldo;
}
