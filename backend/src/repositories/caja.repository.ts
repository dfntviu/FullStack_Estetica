import { Injectable } from '@nestjs/common';
import { DatabaseService, Ejecutor } from '../config/database.service.js';

export interface Cierre {
  dia: string;
  cobros: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  total: number;
  cerradoEn: Date;
  origen: string;
  totalActual: number;
  descuadre: number;
}

const SELECT_CIERRE = `
  SELECT dia, cobros, efectivo, tarjeta, transferencia, total, cerrado_en AS "cerradoEn", origen,
         total_actual AS "totalActual", descuadre
    FROM v_cierre_caja`;

@Injectable()
export class CajaRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Ejecuta el PROCEDIMIENTO sp_cerrar_caja: valida el día, bloquea la tabla cobro mientras
   * suma y guarda el cierre. Los parámetros INOUT llegan como una fila: { p_cobros, p_total }.
   */
  async cerrar(dia: string): Promise<Cierre> {
    await this.db.query(`CALL sp_cerrar_caja($1, NULL, NULL)`, [dia]);
    const [cierre] = await this.db.query<Cierre>(
      `${SELECT_CIERRE} WHERE dia = $1`,
      [dia],
    );
    return cierre;
  }

  /** Cierres del periodo, del más reciente al más antiguo (con su descuadre actual). */
  listar(desde: string, hasta: string): Promise<Cierre[]> {
    return this.db.query<Cierre>(
      `${SELECT_CIERRE} WHERE dia BETWEEN $1 AND $2 ORDER BY dia DESC`,
      [desde, hasta],
    );
  }

  /** ¿Ese día ya se cerró? Se consulta DENTRO de la transacción de un cobro. */
  async estaCerrado(dia: string, ex: Ejecutor = this.db): Promise<boolean> {
    const filas = await ex.query(`SELECT 1 FROM cierre_caja WHERE dia = $1`, [
      dia,
    ]);
    return filas.length > 0;
  }
}
