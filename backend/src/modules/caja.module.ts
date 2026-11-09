import { Module } from '@nestjs/common';
import { CajaController } from '../controllers/caja.controller.js';
import { CajaRepository } from '../repositories/caja.repository.js';

// Cierre de caja (procedimiento sp_cerrar_caja). Exporta el repositorio: Cobros lo usa para
// rechazar ventas en un día ya cerrado.
@Module({
  controllers: [CajaController],
  providers: [CajaRepository],
  exports: [CajaRepository],
})
export class CajaModule {}
