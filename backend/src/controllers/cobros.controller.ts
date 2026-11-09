import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CobrosService } from '../services/cobros.service.js';
import { DiaDto, RegistrarCobroDto } from '../dto/cobro.dto.js';

@Controller('cobros')
export class CobrosController {
  constructor(private readonly cobros: CobrosService) {}

  /** POST /api/cobros — con citaFolio cobra la cita; sin él, cliente de paso */
  @Post()
  registrar(@Body() datos: RegistrarCobroDto) {
    return this.cobros.registrar(datos);
  }

  /** GET /api/cobros?dia=2026-11-03 (por defecto, hoy) */
  @Get()
  delDia(@Query() q: DiaDto) {
    return this.cobros.delDia(q.dia);
  }

  /** GET /api/cobros/corte?dia=2026-11-03 — totales por método de pago */
  @Get('corte')
  corte(@Query() q: DiaDto) {
    return this.cobros.corte(q.dia);
  }
}
