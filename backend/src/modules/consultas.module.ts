import { Module } from '@nestjs/common';
import { ConsultasController } from '../controllers/consultas.controller.js';
import { ConsultasRepository } from '../repositories/consultas.repository.js';

// Solo lectura y sin reglas que coordinar: controlador → repositorio. La lógica vive en
// funciones de PostgreSQL (database/schemas/consultas.sql).
@Module({
  controllers: [ConsultasController],
  providers: [ConsultasRepository],
})
export class ConsultasModule {}
