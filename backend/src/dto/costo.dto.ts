import { Type } from 'class-transformer';
import { IsNumber, IsPositive, Max } from 'class-validator';

/** PATCH /api/servicios/:clave/costo */
export class CambiarCostoDto {
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Escribe el precio con máximo 2 decimales.' },
  )
  @IsPositive({ message: 'El precio debe ser mayor a cero.' })
  @Max(100000, { message: 'El precio no puede pasar de $100,000.' })
  costo!: number;
}
