import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface Enlace {
  ruta: string;
  icono: string;
  texto: string;
}

/**
 * Antes `navegacion.view.js`. La marca de "página activa" la pone routerLinkActive
 * (clase + aria-current) y el menú de móvil se abre con un signal: ya no hace falta Bootstrap JS.
 */
@Component({
  selector: 'app-navegacion',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navegacion.html',
})
export class Navegacion {
  protected readonly enlaces: readonly Enlace[] = [
    { ruta: '/', icono: 'fa-house', texto: 'Inicio' },
    { ruta: '/servicios', icono: 'fa-spa', texto: 'Servicios' },
    { ruta: '/horarios', icono: 'fa-clock', texto: 'Horarios' },
    { ruta: '/agendar', icono: 'fa-calendar-plus', texto: 'Agendar' },
    { ruta: '/verificar', icono: 'fa-circle-check', texto: 'Verificar' },
    { ruta: '/cobrar', icono: 'fa-cash-register', texto: 'Cobrar' },
    { ruta: '/clientes', icono: 'fa-address-book', texto: 'Clientes' },
    { ruta: '/empleados', icono: 'fa-user-tie', texto: 'Empleados' },
    { ruta: '/reportes', icono: 'fa-chart-line', texto: 'Reportes' },
    { ruta: '/consultas', icono: 'fa-magnifying-glass-chart', texto: 'Consultas' },
  ];

  protected readonly menuAbierto = signal(false);

  protected alternarMenu(): void {
    this.menuAbierto.update((abierto) => !abierto);
  }

  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }
}
