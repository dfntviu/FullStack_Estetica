import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Recortar, SoloDigitos } from '../common/transformaciones.js';

export class AgendarCitaDto {
  /** El teléfono identifica al cliente: si existe se reutiliza, si no se registra. */
  @SoloDigitos()
  @Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos.' })
  telefono: string;

  /**
   * Nombre del cliente: solo es OBLIGATORIO si el teléfono no está registrado (lo decide el
   * servicio, que es quien sabe si el cliente existe). Así no falla quien envía antes de que
   * el formulario termine de reconocer al cliente.
   */
  @Recortar()
  @IsOptional()
  @IsString({ message: 'Escribe el nombre del cliente.' })
  @Length(3, 120, { message: 'Escribe el nombre del cliente (mínimo 3 letras).' })
  cliente?: string;

  /** Clave del servicio, p. ej. "corte-normal". */
  @IsString({ message: 'Selecciona un servicio del catálogo.' })
  @Matches(/^[a-z0-9-]+$/, { message: 'Selecciona un servicio del catálogo.' })
  servicio: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Selecciona una fecha.' })
  fecha: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Selecciona una hora.' })
  hora: string;

  /** Folio del empleado que atiende (opcional), p. ej. "E001". */
  @Recortar()
  @IsOptional()
  @Matches(/^E\d{3,}$/i, { message: 'Folio de empleado inválido.' })
  empleado?: string;
}

export class BuscarCitasDto {
  @Recortar()
  @IsOptional()
  @IsString()
  buscar?: string;
}

export class DisponibilidadDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Indica la fecha como AAAA-MM-DD.' })
  fecha: string;
}
