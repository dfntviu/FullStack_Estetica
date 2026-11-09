import { Injectable } from '@nestjs/common';
import { DatabaseService, Ejecutor } from '../config/database.service.js';

export interface Servicio {
  clave: string;
  nombre: string;
  costo: number;
  imagen: string | null;
}

@Injectable()
export class ServiciosRepository {
  constructor(private readonly db: DatabaseService) {}

  listarActivos(): Promise<Servicio[]> {
    return this.db.query<Servicio>(
      `SELECT clave, nombre, costo, imagen FROM servicio WHERE activo ORDER BY id`,
    );
  }

  /** Cambia el precio de lista. null si la clave no existe o el servicio está dado de baja. */
  async cambiarCosto(clave: string, costo: number): Promise<Servicio | null> {
    const [s] = await this.db.query<Servicio>(
      `UPDATE servicio SET costo = $2 WHERE clave = $1 AND activo RETURNING clave, nombre, costo, imagen`,
      [clave, costo],
    );
    return s ?? null;
  }

  /** Incluye el id interno: lo usan citas y cobros para sus llaves foráneas. */
  async buscarPorClave(clave: string, ex: Ejecutor = this.db): Promise<(Servicio & { id: number }) | null> {
    const [s] = await ex.query<Servicio & { id: number }>(
      `SELECT id, clave, nombre, costo, imagen FROM servicio WHERE clave = $1 AND activo`,
      [clave],
    );
    return s ?? null;
  }
}
