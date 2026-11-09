import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ahoraNegocio, esFechaValida } from '../common/agenda.js';
import { ReglaNegocioException } from '../middleware/validacion.js';
import { FiltroEmpleadosDto, GuardarEmpleadoDto } from '../dto/empleado.dto.js';
import { Empleado, EmpleadosRepository } from '../repositories/empleados.repository.js';

const publico = ({ id: _id, ...resto }: Empleado) => resto;

@Injectable()
export class EmpleadosService {
  constructor(private readonly repo: EmpleadosRepository) {}

  async listar(f: FiltroEmpleadosDto) {
    return (await this.repo.listar(f.texto, f.estado)).map(publico);
  }

  async obtener(folio: string) {
    const e = await this.repo.porFolio(folio);
    if (!e) throw this.noExiste();
    return publico(e);
  }

  async registrar(d: GuardarEmpleadoDto) {
    this.validarFechaIngreso(d.fechaIngreso);
    return publico(await this.repo.crear(d));
  }

  async editar(folio: string, d: GuardarEmpleadoDto) {
    this.validarFechaIngreso(d.fechaIngreso);
    const e = await this.repo.actualizar(folio, d);
    if (!e) throw this.noExiste();
    return publico(e);
  }

  /** Baja lógica: el empleado queda inactivo, sus datos se conservan. */
  darDeBaja(folio: string) {
    return this.cambiarActivo(folio, false);
  }

  reactivar(folio: string) {
    return this.cambiarActivo(folio, true);
  }

  /** Regla que depende de "hoy": un CHECK de PostgreSQL no puede usar current_date. */
  private validarFechaIngreso(fecha: string) {
    if (!esFechaValida(fecha)) throw new ReglaNegocioException('fechaIngreso', 'La fecha de ingreso no es válida.');
    if (fecha > ahoraNegocio().fecha) {
      throw new ReglaNegocioException('fechaIngreso', 'La fecha de ingreso no puede ser futura.');
    }
  }

  private async cambiarActivo(folio: string, activo: boolean) {
    const e = await this.repo.cambiarActivo(folio, activo);
    if (e) return publico(e);
    await this.obtener(folio);
    throw new ConflictException({ statusCode: 409, mensaje: `El empleado ya está ${activo ? 'activo' : 'inactivo'}.` });
  }

  private noExiste() {
    return new NotFoundException({ statusCode: 404, mensaje: 'No existe el empleado.' });
  }
}
