import { Injectable } from '@nestjs/common';
import { DatabaseService, Ejecutor } from '../config/database.service.js';
import { SQL_SIN_ACENTOS, sinAcentos } from '../common/transformaciones.js';
import { GuardarEmpleadoDto } from '../dto/empleado.dto.js';

export interface Empleado {
  id: number;
  folio: string;
  nombre: string;
  telefono: string;
  fechaIngreso: string;
  activo: boolean;
}

const COLUMNAS = `id, folio, nombre, telefono, fecha_ingreso AS "fechaIngreso", activo`;

@Injectable()
export class EmpleadosRepository {
  constructor(private readonly db: DatabaseService) {}

  listar(texto = '', estado: 'activos' | 'inactivos' | 'todos' = 'activos'): Promise<Empleado[]> {
    return this.db.query<Empleado>(
      `SELECT ${COLUMNAS} FROM empleado
        WHERE ($1 = 'todos' OR activo = ($1 = 'activos'))
          AND ($2 = '' OR ${SQL_SIN_ACENTOS('nombre')} LIKE '%' || $2 || '%' OR ($3 <> '' AND telefono LIKE '%' || $3 || '%'))
        ORDER BY nombre`,
      [estado, sinAcentos(texto), texto.replace(/\D/g, '')],
    );
  }

  async porFolio(folio: string, ex: Ejecutor = this.db): Promise<Empleado | null> {
    const [e] = await ex.query<Empleado>(`SELECT ${COLUMNAS} FROM empleado WHERE folio = upper($1)`, [folio]);
    return e ?? null;
  }

  async crear(d: GuardarEmpleadoDto): Promise<Empleado> {
    const [e] = await this.db.query<Empleado>(
      `INSERT INTO empleado (nombre, telefono, fecha_ingreso) VALUES ($1, $2, $3) RETURNING ${COLUMNAS}`,
      [d.nombre, d.telefono, d.fechaIngreso],
    );
    return e;
  }

  async actualizar(folio: string, d: GuardarEmpleadoDto): Promise<Empleado | null> {
    const [e] = await this.db.query<Empleado>(
      `UPDATE empleado SET nombre = $2, telefono = $3, fecha_ingreso = $4 WHERE folio = upper($1) RETURNING ${COLUMNAS}`,
      [folio, d.nombre, d.telefono, d.fechaIngreso],
    );
    return e ?? null;
  }

  async cambiarActivo(folio: string, activo: boolean): Promise<Empleado | null> {
    const [e] = await this.db.query<Empleado>(
      `UPDATE empleado SET activo = $2 WHERE folio = upper($1) AND activo <> $2 RETURNING ${COLUMNAS}`,
      [folio, activo],
    );
    return e ?? null;
  }
}
