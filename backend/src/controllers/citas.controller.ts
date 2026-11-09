import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CitasService } from '../services/citas.service.js';
import { AgendarCitaDto, BuscarCitasDto, DisponibilidadDto } from '../dto/cita.dto.js';

@Controller('citas')
export class CitasController {
  constructor(private readonly citas: CitasService) {}

  /** GET /api/citas?buscar=A001 | maria | 7220000001 */
  @Get()
  buscar(@Query() q: BuscarCitasDto) {
    return this.citas.buscar(q.buscar);
  }

  /** GET /api/citas/disponibilidad?fecha=2026-11-10 */
  @Get('disponibilidad')
  disponibilidad(@Query() q: DisponibilidadDto) {
    return this.citas.disponibilidad(q.fecha);
  }

  @Get(':folio')
  obtener(@Param('folio') folio: string) {
    return this.citas.obtener(folio);
  }

  /** POST /api/citas — responde { cita, clienteNuevo } */
  @Post()
  agendar(@Body() datos: AgendarCitaDto) {
    return this.citas.agendar(datos);
  }

  @Patch(':folio/confirmar')
  confirmar(@Param('folio') folio: string) {
    return this.citas.confirmar(folio);
  }

  @Patch(':folio/cancelar')
  cancelar(@Param('folio') folio: string) {
    return this.citas.cancelar(folio);
  }
}
