import { Module } from '@nestjs/common';
import { ClientesModule } from './clientes.module.js';
import { EmpleadosModule } from './empleados.module.js';
import { ServiciosModule } from './servicios.module.js';
import { CitasController } from '../controllers/citas.controller.js';
import { CitasRepository } from '../repositories/citas.repository.js';
import { CitasService } from '../services/citas.service.js';

@Module({
  imports: [ClientesModule, ServiciosModule, EmpleadosModule],
  controllers: [CitasController],
  providers: [CitasService, CitasRepository],
  exports: [CitasRepository],
})
export class CitasModule {}
