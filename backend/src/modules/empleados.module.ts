import { Module } from '@nestjs/common';
import { EmpleadosController } from '../controllers/empleados.controller.js';
import { EmpleadosRepository } from '../repositories/empleados.repository.js';
import { EmpleadosService } from '../services/empleados.service.js';

@Module({
  controllers: [EmpleadosController],
  providers: [EmpleadosService, EmpleadosRepository],
  exports: [EmpleadosRepository],
})
export class EmpleadosModule {}
