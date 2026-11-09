import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './config/database.module.js';
import { ServiciosModule } from './modules/servicios.module.js';
import { ClientesModule } from './modules/clientes.module.js';
import { EmpleadosModule } from './modules/empleados.module.js';
import { CitasModule } from './modules/citas.module.js';
import { CobrosModule } from './modules/cobros.module.js';
import { CajaModule } from './modules/caja.module.js';
import { ReportesModule } from './modules/reportes.module.js';
import { ConsultasModule } from './modules/consultas.module.js';
import { SaludController } from './controllers/salud.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // lee .env
    DatabaseModule,
    ServiciosModule,
    ClientesModule,
    EmpleadosModule,
    CitasModule,
    CobrosModule,
    CajaModule,
    ReportesModule,
    ConsultasModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
