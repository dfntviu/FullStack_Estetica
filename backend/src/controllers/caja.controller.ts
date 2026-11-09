import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PeriodoDto, validarPeriodo } from '../common/periodo.js';
import { esFechaValida } from '../common/agenda.js';
import { ReglaNegocioException } from '../middleware/validacion.js';
import { CajaRepository } from '../repositories/caja.repository.js';
import { CerrarCajaDto } from '../dto/cierre.dto.js';

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaRepository) {}

  /**
   * POST /api/caja/cierres { dia } — cierra la caja de un día (hoy o anterior).
   * 409 si ya estaba cerrado (llave primaria) · 400 si es un día futuro (RAISE en el procedimiento).
   */
  @Post('cierres')
  cerrar(@Body() { dia }: CerrarCajaDto) {
    if (!esFechaValida(dia))
      throw new ReglaNegocioException('dia', 'Ese día no existe.');
    return this.caja.cerrar(dia);
  }

  /** GET /api/caja/cierres?desde&hasta — cierres con descuadre (cobros cambiados después del cierre) */
  @Get('cierres')
  listar(@Query() periodo: PeriodoDto) {
    validarPeriodo(periodo);
    return this.caja.listar(periodo.desde, periodo.hasta);
  }
}
