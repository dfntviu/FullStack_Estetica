import { Injectable } from '@nestjs/common';
import { DatabaseService, Ejecutor } from '../config/database.service.js';
import { SQL_SIN_ACENTOS, sinAcentos } from '../common/transformaciones.js';
import { GuardarClienteDto } from '../dto/cliente.dto.js';

export interface Cliente {
  id: number;
  folio: string;
  nombre: string;
  telefono: string;
  cumpleanos: string | null;
  observaciones: string | null;
  fechaRegistro: string;
  activo: boolean;
}

const COLUMNAS = `id, folio, nombre, telefono, cumpleanos, observaciones, fecha_registro AS "fechaRegistro", activo`;

@Injectable()
export class ClientesRepository {
  constructor(private readonly db: DatabaseService) {}

  listar(texto = '', incluirInactivos = false): Promise<Cliente[]> {
    const t = sinAcentos(texto);
    const digitos = texto.replace(/\D/g, '');
    return this.db.query<Cliente>(
      `SELECT ${COLUMNAS} FROM cliente
        WHERE ($1 OR activo)
          AND ($2 = '' OR ${SQL_SIN_ACENTOS('nombre')} LIKE '%' || $2 || '%' OR ($3 <> '' AND telefono LIKE '%' || $3 || '%'))
        ORDER BY nombre`,
      [incluirInactivos, t, digitos],
    );
  }

  async porFolio(folio: string, ex: Ejecutor = this.db): Promise<Cliente | null> {
    const [c] = await ex.query<Cliente>(`SELECT ${COLUMNAS} FROM cliente WHERE folio = upper($1)`, [folio]);
    return c ?? null;
  }

  async porTelefono(telefono: string): Promise<Cliente | null> {
    const [c] = await this.db.query<Cliente>(`SELECT ${COLUMNAS} FROM cliente WHERE telefono = $1`, [telefono]);
    return c ?? null;
  }

  async crear(d: GuardarClienteDto): Promise<Cliente> {
    const [c] = await this.db.query<Cliente>(
      `INSERT INTO cliente (nombre, telefono, cumpleanos, observaciones)
       VALUES ($1, $2, $3, $4) RETURNING ${COLUMNAS}`,
      [d.nombre, d.telefono, d.cumpleanos ?? null, d.observaciones ?? null],
    );
    return c;
  }

  async actualizar(folio: string, d: GuardarClienteDto): Promise<Cliente | null> {
    const [c] = await this.db.query<Cliente>(
      `UPDATE cliente SET nombre = $2, telefono = $3, cumpleanos = $4, observaciones = $5
        WHERE folio = upper($1) RETURNING ${COLUMNAS}`,
      [folio, d.nombre, d.telefono, d.cumpleanos ?? null, d.observaciones ?? null],
    );
    return c ?? null;
  }

  async cambiarActivo(folio: string, activo: boolean): Promise<Cliente | null> {
    const [c] = await this.db.query<Cliente>(
      `UPDATE cliente SET activo = $2 WHERE folio = upper($1) AND activo <> $2 RETURNING ${COLUMNAS}`,
      [folio, activo],
    );
    return c ?? null;
  }

  /**
   * Al agendar: si el teléfono existe devuelve ese cliente (y lo reactiva); si no, lo crea.
   * 1) UPDATE primero: el caso común (cliente recurrente) no toca la secuencia de folios.
   *    Un INSERT … ON CONFLICT gastaría un número de folio en cada cita de un cliente existente.
   * 2) Si no existe, INSERT … ON CONFLICT DO NOTHING: si otra petición lo creó al mismo
   *    tiempo, no hay error de duplicado y se vuelve a leer.
   */
  async resolverParaCita(nombre: string | undefined, telefono: string, ex: Ejecutor): Promise<(Cliente & { nuevo: boolean }) | null> {
    const [existente] = await ex.query<Cliente>(
      `UPDATE cliente SET activo = true WHERE telefono = $1 RETURNING ${COLUMNAS}`,
      [telefono],
    );
    if (existente) return { ...existente, nuevo: false };
    if (!nombre) return null; // teléfono nuevo sin nombre: el servicio decide el error

    const [creado] = await ex.query<Cliente>(
      `INSERT INTO cliente (nombre, telefono) VALUES ($1, $2)
       ON CONFLICT (telefono) DO NOTHING RETURNING ${COLUMNAS}`,
      [nombre, telefono],
    );
    if (creado) return { ...creado, nuevo: true };

    const [carrera] = await ex.query<Cliente>(`SELECT ${COLUMNAS} FROM cliente WHERE telefono = $1`, [telefono]);
    return { ...carrera, nuevo: false };
  }

  /** Historial: resumen (vista v_resumen_cliente) + citas del cliente, más reciente primero. */
  async historial(clienteId: number) {
    const [resumen] = await this.db.query(
      `SELECT total_citas::int AS "totalCitas", total_gastado AS "totalGastado",
              ultima_visita AS "ultimaVisita", proxima_cita AS "proximaCita", servicio_frecuente AS "servicioFrecuente"
         FROM v_resumen_cliente WHERE cliente_id = $1`,
      [clienteId],
    );
    const citas = await this.db.query(
      `SELECT ci.folio, ci.fecha, to_char(ci.hora, 'HH24:MI') AS hora, s.nombre AS servicio, ci.precio, ci.estado
         FROM cita ci JOIN servicio s ON s.id = ci.servicio_id
        WHERE ci.cliente_id = $1
        ORDER BY ci.fecha DESC, ci.hora DESC`,
      [clienteId],
    );
    return { ...resumen, citas };
  }
}
