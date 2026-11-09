import { Injectable } from '@nestjs/common';
import { DatabaseService, Ejecutor } from '../config/database.service.js';
import { ZONA_NEGOCIO } from '../common/agenda.js';
import { MetodoPago } from '../dto/cobro.dto.js';

export interface Cobro {
  folio: string;
  citaFolio: string | null;
  clienteFolio: string | null;
  cliente: string;
  servicio: string;
  total: number;
  metodo: MetodoPago;
  pagado: number;
  cambio: number;
  referencia: string | null;
  fechaHora: string;
}

const SELECT_COBRO = `
  SELECT co.folio, ci.folio AS "citaFolio", cl.folio AS "clienteFolio", co.nombre_cliente AS cliente,
         s.nombre AS servicio, co.total, co.metodo, co.pagado, co.cambio, co.referencia, co.fecha_hora AS "fechaHora"
    FROM cobro co
    JOIN servicio s ON s.id = co.servicio_id
    LEFT JOIN cita ci ON ci.id = co.cita_id
    LEFT JOIN cliente cl ON cl.id = co.cliente_id`;

@Injectable()
export class CobrosRepository {
  constructor(private readonly db: DatabaseService) {}

  async insertar(
    d: {
      citaId: number | null;
      clienteId: number | null;
      nombreCliente: string;
      servicioId: number;
      total: number;
      metodo: MetodoPago;
      pagado: number;
      referencia: string | null;
    },
    ex: Ejecutor,
  ): Promise<Cobro> {
    const [{ id }] = await ex.query<{ id: number }>(
      `INSERT INTO cobro (cita_id, cliente_id, nombre_cliente, servicio_id, total, metodo, pagado, referencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [d.citaId, d.clienteId, d.nombreCliente, d.servicioId, d.total, d.metodo, d.pagado, d.referencia],
    );
    const [cobro] = await ex.query<Cobro>(`${SELECT_COBRO} WHERE co.id = $1`, [id]);
    return cobro;
  }

  delDia(dia: string): Promise<Cobro[]> {
    return this.db.query<Cobro>(
      `${SELECT_COBRO} WHERE (co.fecha_hora AT TIME ZONE '${ZONA_NEGOCIO}')::date = $1 ORDER BY co.fecha_hora`,
      [dia],
    );
  }

  /** Vista v_corte_caja: totales por método de pago. */
  corte(dia: string) {
    return this.db.query<{ metodo: MetodoPago; cobros: number; total: number }>(
      `SELECT metodo, cobros::int AS cobros, total FROM v_corte_caja WHERE dia = $1 ORDER BY metodo`,
      [dia],
    );
  }
}
