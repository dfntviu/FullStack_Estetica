import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Recortar, SoloDigitos } from '../common/transformaciones.js';

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export class RegistrarCobroDto {
  /** Si viene, se cobra esa cita (precio y servicio salen de la cita). */
  @Recortar()
  @IsOptional()
  @Matches(/^A\d{3,}$/i, { message: 'Folio de cita inválido (p. ej. A010).' })
  citaFolio?: string;

  /** Cliente de paso: nombre obligatorio si no hay cita ni teléfono de cliente registrado. */
  @Recortar()
  @ValidateIf((o: RegistrarCobroDto) => !o.citaFolio && !o.telefono)
  @IsString({ message: 'Escribe el nombre del cliente.' })
  @Length(3, 120, { message: 'Escribe el nombre del cliente.' })
  cliente?: string;

  /** Opcional: liga el cobro sin cita a un cliente registrado (para su historial). */
  @SoloDigitos()
  @Recortar()
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos.' })
  telefono?: string;

  /** Clave del servicio; obligatoria si no hay cita. */
  @ValidateIf((o: RegistrarCobroDto) => !o.citaFolio)
  @IsString({ message: 'Selecciona un servicio del catálogo.' })
  servicio?: string;

  @IsOptional()
  @IsIn(['efectivo', 'tarjeta', 'transferencia'], { message: 'Método de pago inválido.' })
  metodo: MetodoPago = 'efectivo';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Escribe el monto que pagó el cliente.' })
  @IsPositive({ message: 'Escribe el monto que pagó el cliente.' })
  pagado: number;

  @Recortar()
  @IsOptional()
  @MaxLength(60)
  referencia?: string;
}

export class DiaDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Indica el día como AAAA-MM-DD.' })
  dia?: string;
}
