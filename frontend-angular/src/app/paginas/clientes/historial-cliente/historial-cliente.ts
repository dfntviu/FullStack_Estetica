import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HistorialCliente } from '../../../core/modelos/cliente';
import { MonedaPipe } from '../../../compartido/pipes/moneda.pipe';
import { TelefonoPipe } from '../../../compartido/pipes/telefono.pipe';

const COLOR_ESTADO: Record<string, string> = {
  pendiente: 'warning',
  confirmada: 'primary',
  cancelada: 'secondary',
  terminada: 'success',
};

/**
 * Panel de historial de un cliente (antes `mostrarHistorial()` de clientes.view.js, F-32 y F-33).
 * Es el único bloque de la vista nativa que ya era independiente: recibe el historial y avisa al cerrar.
 */
@Component({
  selector: 'app-historial-cliente',
  imports: [RouterLink, MonedaPipe, TelefonoPipe],
  templateUrl: './historial-cliente.html',
})
export class HistorialClienteComponent {
  readonly historial = input.required<HistorialCliente>();
  readonly cerrar = output<void>();
  protected readonly colorEstado = COLOR_ESTADO;
}
