import { Module } from '@nestjs/common';
import { CajaModule } from './caja.module.js';
import { CitasModule } from './citas.module.js';
import { ClientesModule } from './clientes.module.js';
import { ServiciosModule } from './servicios.module.js';
import { CobrosController } from '../controllers/cobros.controller.js';
import { CobrosRepository } from '../repositories/cobros.repository.js';
import { CobrosService } from '../services/cobros.service.js';

@Module({
  imports: [CitasModule, ClientesModule, ServiciosModule, CajaModule],
  controllers: [CobrosController],
  providers: [CobrosService, CobrosRepository],
})
export class CobrosModule {}
