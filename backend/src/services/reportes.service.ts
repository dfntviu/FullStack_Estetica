import { Injectable } from '@nestjs/common';
import { PeriodoDto, validarPeriodo } from '../common/periodo.js';
import { ReportesRepository } from '../repositories/reportes.repository.js';

@Injectable()
export class ReportesService {
  constructor(private readonly reportes: ReportesRepository) {}

  /** Reporte de ingresos del periodo: resumen (vs. periodo anterior), serie diaria, servicios y métodos. */
  async ingresos(periodo: PeriodoDto) {
    validarPeriodo(periodo);
    const { desde, hasta } = periodo;
    const [resumen, porDia, porServicio, porMetodo] = await Promise.all([
      this.reportes.resumen(desde, hasta),
      this.reportes.porDia(desde, hasta),
      this.reportes.porServicio(desde, hasta),
      this.reportes.porMetodo(desde, hasta),
    ]);
    return { resumen, porDia, porServicio, porMetodo };
  }

  async costos(periodo: PeriodoDto) {
    validarPeriodo(periodo);
    return {
      desde: periodo.desde,
      hasta: periodo.hasta,
      cambios: await this.reportes.historialCostos(
        periodo.desde,
        periodo.hasta,
      ),
    };
  }

  async clientes(periodo: PeriodoDto) {
    validarPeriodo(periodo);
    const [resumen, movimientos] = await Promise.all([
      this.reportes.resumenClientes(periodo.desde, periodo.hasta),
      this.reportes.movimientosClientes(periodo.desde, periodo.hasta),
    ]);
    return { desde: periodo.desde, hasta: periodo.hasta, resumen, movimientos };
  }
}
