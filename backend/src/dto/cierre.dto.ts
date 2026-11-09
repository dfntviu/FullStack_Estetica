import { Matches } from 'class-validator';

/** POST /api/caja/cierres */
export class CerrarCajaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Indica el día a cerrar como AAAA-MM-DD.',
  })
  dia!: string;
}
