import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectorTema } from './selector-tema/selector-tema';

interface Modulo {
  ruta: string;
  icono: string;
  titulo: string;
  descripcion: string;
}

/** Inicio: 9 tarjetas de acceso, una por vista (antes `Layouts/dashboard.html`, F-02). */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink,SelectorTema],
  host: { class: 'pagina' },
  templateUrl: './inicio.html',
})
export class Inicio {
  protected readonly modulos: readonly Modulo[] = [
    { ruta: '/servicios', icono: 'fa-spa', titulo: 'Servicios', descripcion: 'Catálogo y precios' },
    { ruta: '/horarios', icono: 'fa-clock', titulo: 'Horarios', descripcion: 'Consulta la disponibilidad de un día' },
    { ruta: '/agendar', icono: 'fa-calendar-plus', titulo: 'Agendar cita', descripcion: 'Registra una cita y obtén su folio' },
    { ruta: '/verificar', icono: 'fa-circle-check', titulo: 'Verificar cita', descripcion: 'Confirma o cancela por folio o nombre' },
    { ruta: '/cobrar', icono: 'fa-cash-register', titulo: 'Cobrar servicio', descripcion: 'Cobra y calcula el cambio' },
    { ruta: '/clientes', icono: 'fa-address-book', titulo: 'Clientes', descripcion: 'Datos, observaciones e historial de servicios' },
    { ruta: '/empleados', icono: 'fa-user-tie', titulo: 'Empleados', descripcion: 'Personal activo e inactivo de la estética' },
    { ruta: '/reportes', icono: 'fa-chart-line', titulo: 'Reportes', descripcion: 'Ingresos, auditoría de cambios y cierres de caja' },
    { ruta: '/consultas', icono: 'fa-magnifying-glass-chart', titulo: 'Consultas', descripcion: 'Diagnóstico del negocio y consultas de detalle' },
  ];
}
