import { Controller, Get, Query } from '@nestjs/common';
import { PeriodoDto } from '../common/periodo.js';
import { ReportesService } from '../services/reportes.service.js';

/** Reportes para el administrador. Todos reciben ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (máximo 366 días). */
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /** GET /api/reportes/ingresos — resumen vs. periodo anterior, por día, por servicio y por método de pago */
  @Get('ingresos')
  ingresos(@Query() periodo: PeriodoDto) {
    return this.reportes.ingresos(periodo);
  }

  /** GET /api/reportes/costos — cambios de precio registrados por la auditoría */
  @Get('costos')
  costos(@Query() periodo: PeriodoDto) {
    return this.reportes.costos(periodo);
  }

  /** GET /api/reportes/clientes — altas, bajas y reactivaciones registradas por la auditoría */
  @Get('clientes')
  clientes(@Query() periodo: PeriodoDto) {
    return this.reportes.clientes(periodo);
  }
}
