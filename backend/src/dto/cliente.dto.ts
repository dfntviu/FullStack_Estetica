import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Recortar, SoloDigitos } from '../common/transformaciones.js';

export class GuardarClienteDto {
  @Recortar()
  @IsString({ message: 'Escribe el nombre completo.' })
  @Length(3, 120, { message: 'Escribe el nombre completo (mínimo 3 letras).' })
  nombre: string;

  @SoloDigitos()
  @Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos.' })
  telefono: string;

  @Recortar()
  @IsOptional()
  // DD/MM con días válidos por mes (29/02 se acepta: cumpleaños en año bisiesto).
  // La base solo verifica el formato; el calendario se valida aquí.
  @Matches(/^((0[1-9]|1\d|2\d)\/(0[1-9]|1[0-2])|30\/(0[13-9]|1[0-2])|31\/(0[13578]|1[02]))$/, {
    message: 'Fecha inválida: usa DD/MM con un día que exista (p. ej. 14/02).',
  })
  cumpleanos?: string;

  @Recortar()
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres.' })
  observaciones?: string;
}

export class FiltroClientesDto {
  @Recortar()
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  incluirInactivos?: boolean;
}
