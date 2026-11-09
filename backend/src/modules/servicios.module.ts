import { Module } from '@nestjs/common';
import { ServiciosController } from '../controllers/servicios.controller.js';
import { ServiciosRepository } from '../repositories/servicios.repository.js';

// Catálogo: lectura y cambio de precio. El controlador usa el repositorio directamente: no hay reglas
// que coordinar (la validación está en el DTO y la auditoría del cambio, en el trigger de la base).
@Module({
  controllers: [ServiciosController],
  providers: [ServiciosRepository],
  exports: [ServiciosRepository],
})
export class ServiciosModule {}
