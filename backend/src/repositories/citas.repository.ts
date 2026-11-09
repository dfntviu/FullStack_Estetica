import { Injectable } from '@nestjs/common';
import { DatabaseService, Ejecutor } from '../config/database.service.js';
import { SQL_SIN_ACENTOS, sinAcentos } from '../common/transformaciones.js';

export type EstadoCita = 'pendiente' | 'confirmada' | 'cancelada' | 'terminada';

export interface Cita {
  id: number;
  folio: string;
  clienteId: number;
  clienteFolio: string;
  nombre: string;
  telefono: string;
  servicioId: number;
  servicioClave: string;
  servicio: string;
  empleadoFolio: string | null;
  fecha: string;
  hora: string;
  precio: number;
  estado: EstadoCita;
}

// Detalle de una cita con su cliente (nombre ACTUAL), servicio y empleado
const SELECT_CITA = `
  SELECT ci.id, ci.folio, cl.id AS "clienteId", cl.folio AS "clienteFolio", cl.nombre, cl.telefono,
         s.id AS "servicioId", s.clave AS "servicioClave", s.nombre AS servicio,
         e.folio AS "empleadoFolio", ci.fecha, to_char(ci.hora, 'HH24:MI') AS hora, ci.precio, ci.estado
    FROM cita ci
    JOIN cliente  cl ON cl.id = ci.cliente_id
    JOIN servicio s  ON s.id  = ci.servicio_id
    LEFT JOIN empleado e ON e.id = ci.empleado_id`;

@Injectable()
export class CitasRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Folio exacto, nombre parcial sin acentos o teléfono (4+ dígitos). */
  buscar(texto: string): Promise<Cita[]> {
    const digitos = texto.replace(/[\s()-]/g, '');
    return this.db.query<Cita>(
      `${SELECT_CITA}
        WHERE ci.folio = upper($1)
           OR ${SQL_SIN_ACENTOS('cl.nombre')} LIKE '%' || $2 || '%'
           OR ($3 ~ '^[0-9]{4,}$' AND cl.telefono LIKE '%' || $3 || '%')
        ORDER BY ci.fecha DESC, ci.hora DESC`,
      [texto, sinAcentos(texto), digitos],
    );
  }

  /** `bloquear` toma un candado de fila (FOR UPDATE) dentro de una transacción. */
  async porFolio(folio: string, ex: Ejecutor = this.db, bloquear = false): Promise<Cita | null> {
    const [c] = await ex.query<Cita>(
      `${SELECT_CITA} WHERE ci.folio = upper($1) ${bloquear ? 'FOR UPDATE OF ci' : ''}`,
      [folio],
    );
    return c ?? null;
  }

  async horasOcupadas(fecha: string): Promise<string[]> {
    const filas = await this.db.query<{ hora: string }>(
      `SELECT to_char(hora, 'HH24:MI') AS hora FROM cita
        WHERE fecha = $1 AND estado IN ('pendiente', 'confirmada')`,
      [fecha],
    );
    return filas.map((f) => f.hora);
  }

  async insertar(
    d: { clienteId: number; servicioId: number; empleadoId: number | null; fecha: string; hora: string; precio: number },
    ex: Ejecutor,
  ): Promise<Cita> {
    const [{ folio }] = await ex.query<{ folio: string }>(
      `INSERT INTO cita (cliente_id, servicio_id, empleado_id, fecha, hora, precio)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING folio`,
      [d.clienteId, d.servicioId, d.empleadoId, d.fecha, d.hora, d.precio],
    );
    return (await this.porFolio(folio, ex))!;
  }

  /** Cambia el estado solo si el actual está en `desde`. Devuelve null si no aplicó. */
  async cambiarEstado(folio: string, desde: EstadoCita[], hacia: EstadoCita, ex: Ejecutor = this.db): Promise<boolean> {
    const filas = await ex.query(
      `UPDATE cita SET estado = $3 WHERE folio = upper($1) AND estado = ANY($2::estado_cita[]) RETURNING id`,
      [folio, desde, hacia],
    );
    return filas.length > 0;
  }
}
