import { Pipe, PipeTransform } from '@angular/core';

/** "7221234567" → "722 123 4567"; vacío → "—" (mismo formato que `formatoTelefono()` de dom.js). */
@Pipe({ name: 'telefono' })
export class TelefonoPipe implements PipeTransform {
  transform(t: string | null | undefined): string {
    if (t?.length === 10) return `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}`;
    return t || '—';
  }
}
