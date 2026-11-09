import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientesRepository, Cliente } from '../repositories/clientes.repository.js';
import { FiltroClientesDto, GuardarClienteDto } from '../dto/cliente.dto.js';

/** Quita el id interno: hacia afuera los clientes se identifican por folio. */
const publico = ({ id: _id, ...resto }: Cliente) => resto;

@Injectable()
export class ClientesService {
  constructor(private readonly repo: ClientesRepository) {}

  async listar(f: FiltroClientesDto) {
    return (await this.repo.listar(f.texto, f.incluirInactivos)).map(publico);
  }

  async obtener(folio: string) {
    return publico(await this.existente(folio));
  }

  async porTelefono(telefono: string) {
    const c = await this.repo.porTelefono(telefono.replace(/\D/g, ''));
    if (!c) throw new NotFoundException({ statusCode: 404, mensaje: 'No hay un cliente con ese teléfono.' });
    return publico(c);
  }

  async registrar(d: GuardarClienteDto) {
    return publico(await this.repo.crear(d));
  }

  async editar(folio: string, d: GuardarClienteDto) {
    const c = await this.repo.actualizar(folio, d);
    if (!c) throw this.noExiste();
    return publico(c);
  }

  /** Baja lógica: el historial se conserva. */
  async darDeBaja(folio: string) {
    return this.cambiarActivo(folio, false);
  }

  async reactivar(folio: string) {
    return this.cambiarActivo(folio, true);
  }

  async historial(folio: string) {
    const c = await this.existente(folio);
    return { cliente: publico(c), ...(await this.repo.historial(c.id)) };
  }

  private async cambiarActivo(folio: string, activo: boolean) {
    const c = await this.repo.cambiarActivo(folio, activo);
    if (c) return publico(c);
    await this.existente(folio); // 404 si no existe
    throw new ConflictException({
      statusCode: 409,
      mensaje: `El cliente ya está ${activo ? 'activo' : 'dado de baja'}.`,
    });
  }

  private async existente(folio: string): Promise<Cliente> {
    const c = await this.repo.porFolio(folio);
    if (!c) throw this.noExiste();
    return c;
  }

  private noExiste() {
    return new NotFoundException({ statusCode: 404, mensaje: 'No existe el cliente.' });
  }
}
