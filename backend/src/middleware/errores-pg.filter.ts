// Traduce los errores de PostgreSQL a respuestas HTTP claras.
// Se basa en el CÓDIGO del error y el NOMBRE de la restricción (definidos en database/schema.sql),
// nunca en el texto del mensaje, que depende del idioma y la codificación del servidor.
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseError } from 'pg';

interface Traduccion {
  status: number;
  mensaje: string;
  campo?: string;
}

const RESTRICCIONES: Record<string, Traduccion> = {
  // 23505 — valor duplicado
  cita_turno_activo_unico: { status: 409, campo: 'hora', mensaje: 'Ese horario ya está ocupado. Elige otro.' },
  cliente_telefono_key: { status: 409, campo: 'telefono', mensaje: 'Ese teléfono ya pertenece a otro cliente.' },
  empleado_telefono_key: { status: 409, campo: 'telefono', mensaje: 'Ese teléfono ya pertenece a otro empleado.' },
  cobro_cita_id_key: { status: 409, campo: 'citaFolio', mensaje: 'Esa cita ya fue cobrada.' },
  // 23514 — regla CHECK
  cita_no_domingo: { status: 400, campo: 'fecha', mensaje: 'La estética no trabaja los domingos.' },
  cita_sabado_temprano: { status: 400, campo: 'hora', mensaje: 'Los sábados el último turno es a las 14:00.' },
  cita_horario_laboral: { status: 400, campo: 'hora', mensaje: 'La hora está fuera del horario de atención (09:00 a 18:30).' },
  cita_turno_media_hora: { status: 400, campo: 'hora', mensaje: 'Los turnos son cada 30 minutos (p. ej. 10:00 o 10:30).' },
  cobro_monto_valido: {
    status: 400,
    campo: 'pagado',
    mensaje: 'En efectivo el pago debe cubrir el total; con tarjeta o transferencia debe ser exacto.',
  },
  cobro_referencia_transferencia: { status: 400, campo: 'referencia', mensaje: 'La transferencia requiere una referencia.' },
  cliente_cumpleanos_check: { status: 400, campo: 'cumpleanos', mensaje: 'Usa el formato DD/MM, p. ej. 14/02.' },
  cliente_telefono_check: { status: 400, campo: 'telefono', mensaje: 'El teléfono debe tener 10 dígitos.' },
  empleado_telefono_check: { status: 400, campo: 'telefono', mensaje: 'El teléfono debe tener 10 dígitos.' },
  cliente_nombre_check: { status: 400, campo: 'nombre', mensaje: 'Escribe el nombre completo (mínimo 3 letras).' },
  empleado_nombre_check: { status: 400, campo: 'nombre', mensaje: 'Escribe el nombre completo (mínimo 3 letras).' },
  servicio_costo_check: { status: 400, campo: 'costo', mensaje: 'El precio debe ser mayor a cero.' },
  // Cierre de caja (database/schemas/auditoria-reportes.sql). Las dos últimas las lanza sp_cerrar_caja con RAISE … CONSTRAINT.
  cierre_caja_pkey: { status: 409, campo: 'dia', mensaje: 'La caja de ese día ya está cerrada.' },
  cierre_dia_futuro: { status: 400, campo: 'dia', mensaje: 'No se puede cerrar la caja de un día futuro.' },
  cierre_dia_requerido: { status: 400, campo: 'dia', mensaje: 'Indica el día a cerrar.' },
};

const POR_CODIGO: Record<string, Traduccion> = {
  '23503': { status: 409, mensaje: 'El registro está relacionado con otros movimientos y no puede modificarse así.' },
  '23505': { status: 409, mensaje: 'El registro ya existe.' },
  '23514': { status: 400, mensaje: 'Un dato no cumple las reglas del sistema.' },
  '22P02': { status: 400, mensaje: 'Un dato tiene un formato inválido.' },
  '22007': { status: 400, mensaje: 'La fecha u hora tiene un formato inválido.' },
  '22008': { status: 400, mensaje: 'La fecha u hora está fuera de rango.' },
};

@Catch(DatabaseError)
export class ErroresPgFilter implements ExceptionFilter {
  private readonly logger = new Logger('PostgreSQL');

  catch(error: DatabaseError, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const t = (error.constraint && RESTRICCIONES[error.constraint]) || (error.code && POR_CODIGO[error.code]);

    if (!t) {
      this.logger.error(`${error.code} ${error.message}`);
      respuesta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, mensaje: 'Error inesperado en la base de datos.' });
      return;
    }
    respuesta.status(t.status).json({
      statusCode: t.status,
      mensaje: t.mensaje,
      ...(t.campo ? { errores: { [t.campo]: t.mensaje } } : {}),
      restriccion: error.constraint ?? null,
    });
  }
}
