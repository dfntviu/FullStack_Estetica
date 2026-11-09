import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { CambiarCostoDto } from '../dto/costo.dto.js';
import { ServiciosRepository } from '../repositories/servicios.repository.js';

@Controller('servicios')
export class ServiciosController {
  constructor(private readonly servicios: ServiciosRepository) {}

  /** GET /api/servicios — catálogo activo */
  @Get()
  listar() {
    return this.servicios.listarActivos();
  }

  /**
   * PATCH /api/servicios/:clave/costo — cambia el precio de lista.
   * - Las citas y cobros ya registrados conservan su precio (precio congelado).
   * - El trigger trg_servicio_costo guarda el cambio en `auditoria` (origen 'sistema');
   *   si el precio es el mismo, no se registra nada.
   */
  @Patch(':clave/costo')
  async cambiarCosto(@Param('clave') clave: string, @Body() { costo }: CambiarCostoDto) {
    const servicio = await this.servicios.cambiarCosto(clave, costo);
    if (!servicio) throw new NotFoundException({ statusCode: 404, mensaje: 'No existe un servicio activo con esa clave.' });
    return servicio;
  }
}
