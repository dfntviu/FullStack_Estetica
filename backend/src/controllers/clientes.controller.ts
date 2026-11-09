import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ClientesService } from '../services/clientes.service.js';
import { FiltroClientesDto, GuardarClienteDto } from '../dto/cliente.dto.js';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  /** GET /api/clientes?texto=gomez&incluirInactivos=true */
  @Get()
  listar(@Query() filtro: FiltroClientesDto) {
    return this.clientes.listar(filtro);
  }

  /** GET /api/clientes/telefono/7220000001 — lo usa Agendar para reconocer al cliente */
  @Get('telefono/:telefono')
  porTelefono(@Param('telefono') telefono: string) {
    return this.clientes.porTelefono(telefono);
  }

  @Get(':folio')
  obtener(@Param('folio') folio: string) {
    return this.clientes.obtener(folio);
  }

  /** GET /api/clientes/C001/historial — métricas + citas */
  @Get(':folio/historial')
  historial(@Param('folio') folio: string) {
    return this.clientes.historial(folio);
  }

  @Post()
  registrar(@Body() datos: GuardarClienteDto) {
    return this.clientes.registrar(datos);
  }

  @Put(':folio')
  editar(@Param('folio') folio: string, @Body() datos: GuardarClienteDto) {
    return this.clientes.editar(folio, datos);
  }

  @Patch(':folio/baja')
  darDeBaja(@Param('folio') folio: string) {
    return this.clientes.darDeBaja(folio);
  }

  @Patch(':folio/reactivar')
  reactivar(@Param('folio') folio: string) {
    return this.clientes.reactivar(folio);
  }
}
