import { Routes } from '@angular/router';

/**
 * Una ruta por vista. `data.pagina` conserva el valor de `<body data-page>`,
 * del que depende el tema por área de tema-estetica.css. Cada página se carga bajo demanda.
 */
const titulo = (t: string) => `${t} - Estética Miss Name`;

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: titulo('Inicio'),
    data: { pagina: 'dashboard' },
    loadComponent: () => import('./paginas/inicio/inicio').then((m) => m.Inicio),
  },
  {
    path: 'servicios',
    title: titulo('Servicios'),
    data: { pagina: 'servicios' },
    loadComponent: () => import('./paginas/servicios/servicios').then((m) => m.Servicios),
  },
  {
    path: 'horarios',
    title: titulo('Horarios'),
    data: { pagina: 'horarios' },
    loadComponent: () => import('./paginas/horarios/horarios').then((m) => m.Horarios),
  },
  {
    path: 'agendar',
    title: titulo('Agendar cita'),
    data: { pagina: 'iniciar-cita' },
    loadComponent: () => import('./paginas/agendar/agendar').then((m) => m.Agendar),
  },
  {
    path: 'verificar',
    title: titulo('Verificar cita'),
    data: { pagina: 'cotejar-cita' },
    loadComponent: () => import('./paginas/verificar/verificar').then((m) => m.Verificar),
  },
  {
    path: 'cobrar',
    title: titulo('Cobrar servicio'),
    data: { pagina: 'cobrar-servicio' },
    loadComponent: () => import('./paginas/cobrar/cobrar').then((m) => m.Cobrar),
  },
  {
    path: 'clientes',
    title: titulo('Clientes'),
    data: { pagina: 'clientes' },
    loadComponent: () => import('./paginas/clientes/clientes').then((m) => m.Clientes),
  },
  {
    path: 'empleados',
    title: titulo('Empleados'),
    data: { pagina: 'empleados' },
    loadComponent: () => import('./paginas/empleados/empleados').then((m) => m.Empleados),
  },
  {
    path: 'reportes',
    title: titulo('Reportes'),
    data: { pagina: 'reportes' },
    loadComponent: () => import('./paginas/reportes/reportes').then((m) => m.Reportes),
  },
  {
    path: 'consultas',
    title: titulo('Consultas'),
    data: { pagina: 'consultas' },
    loadComponent: () => import('./paginas/consultas/consultas').then((m) => m.Consultas),
  },
  { path: '**', redirectTo: '' },
];
