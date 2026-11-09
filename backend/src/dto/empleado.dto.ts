import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Recortar, SoloDigitos } from '../common/transformaciones.js';

export class GuardarEmpleadoDto {
  @Recortar()
  @IsString({ message: 'Escribe el nombre completo.' })
  @Length(3, 120, { message: 'Escribe el nombre completo (mínimo 3 letras).' })
  nombre: string;

  @SoloDigitos()
  @Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos.' })
  telefono: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Selecciona la fecha de ingreso (AAAA-MM-DD).' })
  fechaIngreso: string;
}

export class FiltroEmpleadosDto {
  @Recortar()
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsIn(['activos', 'inactivos', 'todos'], { message: 'estado debe ser activos, inactivos o todos.' })
  estado?: 'activos' | 'inactivos' | 'todos';
}
