import { Pipe, PipeTransform } from '@angular/core';

const FORMATO = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 45 → "$45.00 MXN"; 126745 → "$126,745.00 MXN".
 * La versión nativa no separaba miles; con los reportes (totales de seis cifras) se agregó el
 * separador. Cambio visual registrado en docs/05.
 */
@Pipe({ name: 'moneda' })
export class MonedaPipe implements PipeTransform {
  transform(valor: number | string | null | undefined): string {
    return `$${FORMATO.format(Number(valor ?? 0))} MXN`;
  }
}
