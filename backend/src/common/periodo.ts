// Periodo [desde, hasta] (ambos incluidos) que reciben los reportes: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
import { Matches } from 'class-validator';
import { esFechaValida } from './agenda.js';
import { ReglaNegocioException } from '../middleware/validacion.js';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DIAS_PERIODO = 366;

export class PeriodoDto {
  @Matches(RE_FECHA, { message: 'Indica la fecha inicial como AAAA-MM-DD.' })
  desde!: string;

  @Matches(RE_FECHA, { message: 'Indica la fecha final como AAAA-MM-DD.' })
  hasta!: string;
}

/** Reglas que el DTO no puede expresar solo: fechas reales, orden y tamaño máximo. */
export function validarPeriodo({ desde, hasta }: PeriodoDto): void {
  if (!esFechaValida(desde))
    throw new ReglaNegocioException('desde', 'La fecha inicial no existe.');
  if (!esFechaValida(hasta))
    throw new ReglaNegocioException('hasta', 'La fecha final no existe.');
  if (desde > hasta)
    throw new ReglaNegocioException(
      'hasta',
      'La fecha final no puede ser anterior a la inicial.',
    );
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1;
  if (dias > MAX_DIAS_PERIODO) {
    throw new ReglaNegocioException(
      'hasta',
      `El periodo no puede pasar de ${MAX_DIAS_PERIODO} días.`,
    );
  }
}
