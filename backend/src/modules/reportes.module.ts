import { Module } from '@nestjs/common';
import { ReportesController } from '../controllers/reportes.controller.js';
import { ReportesRepository } from '../repositories/reportes.repository.js';
import { ReportesService } from '../services/reportes.service.js';

// Solo lectura: los cálculos viven en funciones y vistas de PostgreSQL (database/schemas/auditoria-reportes.sql).
@Module({
  controllers: [ReportesController],
  providers: [ReportesService, ReportesRepository],
})
export class ReportesModule {}
