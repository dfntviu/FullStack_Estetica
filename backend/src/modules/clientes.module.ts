import { Module } from '@nestjs/common';
import { ClientesController } from '../controllers/clientes.controller.js';
import { ClientesRepository } from '../repositories/clientes.repository.js';
import { ClientesService } from '../services/clientes.service.js';

@Module({
  controllers: [ClientesController],
  providers: [ClientesService, ClientesRepository],
  exports: [ClientesRepository],
})
export class ClientesModule {}
