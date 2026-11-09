// Respuestas de error con la MISMA forma que usa el front: { mensaje, errores: { campo: texto } }.
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,              // descarta propiedades que no estén en el DTO
    forbidNonWhitelisted: true,   // …y avisa si llegan
    transform: true,
    exceptionFactory: (errores: ValidationError[]) => {
      const porCampo: Record<string, string> = {};
      for (const e of errores) {
        porCampo[e.property] = Object.values(e.constraints ?? {})[0] ?? 'Dato inválido.';
      }
      return new BadRequestException({ statusCode: 400, mensaje: 'Revisa los datos marcados.', errores: porCampo });
    },
  });
}

/** Error de regla de negocio con el mismo formato que las validaciones. */
export class ReglaNegocioException extends BadRequestException {
  constructor(campo: string, mensaje: string) {
    super({ statusCode: 400, mensaje, errores: { [campo]: mensaje } });
  }
}
