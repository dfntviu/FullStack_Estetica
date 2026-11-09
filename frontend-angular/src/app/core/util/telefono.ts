import { AbstractControl, ValidationErrors } from '@angular/forms';

const RE_TELEFONO = /^\d{10}$/;

/** Deja solo los dígitos de un teléfono escrito con espacios, guiones o paréntesis. */
export const limpiarTelefono = (telefono: unknown): string => String(telefono ?? '').replace(/[\s()-]/g, '');

export const esTelefonoValido = (telefono: unknown): boolean => RE_TELEFONO.test(limpiarTelefono(telefono));

/** Validador de Reactive Forms con la misma regla (10 dígitos). */
export function telefonoValido(control: AbstractControl): ValidationErrors | null {
  if (control.value === null || control.value === '') return null; // de lo vacío se encarga `required`
  return esTelefonoValido(control.value) ? null : { telefono: 'El teléfono debe tener 10 dígitos.' };
}
