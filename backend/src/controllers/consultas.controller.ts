import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { esFechaValida } from '../common/agenda.js';
import { ReglaNegocioException } from '../middleware/validacion.js';
import {
  CONSULTAS,
  ConsultasRepository,
  esConsulta,
  IdConsulta,
} from '../repositories/consultas.repository.js';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Periodo OPCIONAL: sin desde/hasta = todo el historial (y, sin hasta, las citas programadas). */
export class PeriodoOpcionalDto {
  @IsOptional()
  @Matches(RE_FECHA, { message: 'Indica la fecha inicial como AAAA-MM-DD.' })
  desde?: string;

  @IsOptional()
  @Matches(RE_FECHA, { message: 'Indica la fecha final como AAAA-MM-DD.' })
  hasta?: string;
}

@Controller('consultas')
export class ConsultasController {
  constructor(private readonly consultas: ConsultasRepository) {}

  /** GET /api/consultas — las consultas disponibles */
  @Get()
  listar() {
    return Object.keys(CONSULTAS);
  }

  /** GET /api/consultas/:id?desde=&hasta= — filas de la consulta (sin ids internos: folios y nombres) */
  @Get(':id')
  ejecutar(
    @Param('id') id: string,
    @Query() { desde, hasta }: PeriodoOpcionalDto,
  ) {
    const consulta = this.validar(id);
    if (desde && !esFechaValida(desde))
      throw new ReglaNegocioException('desde', 'La fecha inicial no existe.');
    if (hasta && !esFechaValida(hasta))
      throw new ReglaNegocioException('hasta', 'La fecha final no existe.');
    if (desde && hasta && desde > hasta) {
      throw new ReglaNegocioException(
        'hasta',
        'La fecha final no puede ser anterior a la inicial.',
      );
    }
    return this.consultas.ejecutar(consulta, desde ?? null, hasta ?? null);
  }

  /** GET /api/consultas/:id/sql — el SQL instalado en la base que produce esa consulta */
  @Get(':id/sql')
  async sql(@Param('id') id: string) {
    const consulta = this.validar(id);
    return { consulta, sql: await this.consultas.sql(consulta) };
  }

  private validar(id: string): IdConsulta {
    if (!esConsulta(id))
      throw new NotFoundException({
        statusCode: 404,
        mensaje: 'No existe esa consulta.',
      });
    return id;
  }
}
