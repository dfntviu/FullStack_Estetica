import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { FiltroEmpleadosDto, GuardarEmpleadoDto } from '../dto/empleado.dto.js';
import { EmpleadosService } from '../services/empleados.service.js';

@Controller('empleados')
export class EmpleadosController {
  constructor(private readonly empleados: EmpleadosService) {}

  /** GET /api/empleados?texto=&estado=activos|inactivos|todos */
  @Get()
  listar(@Query() filtro: FiltroEmpleadosDto) {
    return this.empleados.listar(filtro);
  }

  @Get(':folio')
  obtener(@Param('folio') folio: string) {
    return this.empleados.obtener(folio);
  }

  @Post()
  registrar(@Body() datos: GuardarEmpleadoDto) {
    return this.empleados.registrar(datos);
  }

  @Put(':folio')
  editar(@Param('folio') folio: string, @Body() datos: GuardarEmpleadoDto) {
    return this.empleados.editar(folio, datos);
  }

  @Patch(':folio/baja')
  darDeBaja(@Param('folio') folio: string) {
    return this.empleados.darDeBaja(folio);
  }

  @Patch(':folio/reactivar')
  reactivar(@Param('folio') folio: string) {
    return this.empleados.reactivar(folio);
  }
}
