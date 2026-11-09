/**
 * Catálogo de consultas en lenguaje del negocio. El administrador no ve SQL ni ids:
 * cada columna tiene un título legible y, cuando ayuda, un dato secundario (folio o clave).
 */
export type TipoColumna =
  'texto' | 'numero' | 'moneda' | 'fecha' | 'estado' | 'situacion' | 'si-no';

export interface Columna {
  clave: string;
  titulo: string;
  tipo?: TipoColumna;
  /** Dato pequeño debajo del principal (folio del cliente, clave del servicio…). */
  secundaria?: string;
  /** Texto cuando el valor es null ("De paso", "Nunca"…). */
  siVacio?: string;
}

export interface DefinicionConsulta {
  id: string;
  titulo: string;
  descripcion: string;
  /** Mensaje cuando no hay filas, en positivo cuando es una buena noticia. */
  vacio: string;
  columnas: Columna[];
  /** false: la consulta revisa todo el historial (el periodo no aplica). */
  usaPeriodo: boolean;
}

const cliente: Columna = { clave: 'cliente', titulo: 'Cliente', secundaria: 'clienteFolio' };
const servicio: Columna = { clave: 'servicio', titulo: 'Servicio', secundaria: 'servicioClave' };
const empleado: Columna = { clave: 'empleado', titulo: 'Empleado', secundaria: 'empleadoFolio' };

export const CONSULTAS: readonly DefinicionConsulta[] = [
  {
    id: 'agenda',
    titulo: 'Agenda detallada',
    descripcion: 'Todas las citas con su cliente, servicio, empleado y si ya se cobraron.',
    vacio: 'No hay citas en este periodo.',
    usaPeriodo: true,
    columnas: [
      { clave: 'folio', titulo: 'Cita' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', secundaria: 'hora' },
      cliente,
      { clave: 'telefono', titulo: 'Teléfono' },
      servicio,
      { clave: 'precio', titulo: 'Precio', tipo: 'moneda' },
      empleado,
      { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
      { clave: 'situacion', titulo: 'Cobro', tipo: 'situacion', secundaria: 'cobroFolio' },
    ],
  },
  {
    id: 'vencidas',
    titulo: 'Citas vencidas sin cobrar',
    descripcion:
      'Citas que ya pasaron y nadie cobró. Llama al cliente para cobrarlas, o cancélalas.',
    vacio: 'No hay citas vencidas sin cobrar. ✔',
    usaPeriodo: true,
    columnas: [
      { clave: 'folio', titulo: 'Cita' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', secundaria: 'hora' },
      { clave: 'diasVencida', titulo: 'Días vencida', tipo: 'numero' },
      cliente,
      { clave: 'telefono', titulo: 'Teléfono' },
      servicio,
      { clave: 'precio', titulo: 'Por cobrar', tipo: 'moneda' },
      empleado,
      { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
    ],
  },
  {
    id: 'pagos',
    titulo: 'Pagos detallados',
    descripcion: 'Cada cobro registrado: si fue de una cita o venta directa, y cómo se pagó.',
    vacio: 'No hay cobros en este periodo.',
    usaPeriodo: true,
    columnas: [
      { clave: 'folio', titulo: 'Cobro' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', secundaria: 'hora' },
      { clave: 'tipo', titulo: 'Tipo', secundaria: 'citaFolio' },
      { clave: 'cliente', titulo: 'Cliente', secundaria: 'clienteFolio' },
      servicio,
      { clave: 'metodo', titulo: 'Método', secundaria: 'referencia' },
      { clave: 'total', titulo: 'Total', tipo: 'moneda' },
      { clave: 'pagado', titulo: 'Pagó', tipo: 'moneda' },
      { clave: 'cambio', titulo: 'Cambio', tipo: 'moneda' },
    ],
  },
  {
    id: 'carga-empleados',
    titulo: 'Carga por empleado',
    descripcion: 'Cuántas citas tuvo cada empleado, en qué estado, y cuánto dinero generó.',
    vacio: 'No hay citas en este periodo.',
    usaPeriodo: true,
    columnas: [
      empleado,
      { clave: 'activo', titulo: 'Activo', tipo: 'si-no' },
      { clave: 'citas', titulo: 'Citas', tipo: 'numero' },
      { clave: 'pendientes', titulo: 'Pendientes', tipo: 'numero' },
      { clave: 'confirmadas', titulo: 'Confirmadas', tipo: 'numero' },
      { clave: 'terminadas', titulo: 'Terminadas', tipo: 'numero' },
      { clave: 'canceladas', titulo: 'Canceladas', tipo: 'numero' },
      { clave: 'clientes', titulo: 'Clientes', tipo: 'numero' },
      { clave: 'ingresos', titulo: 'Ingresos', tipo: 'moneda' },
      { clave: 'servicioMasFrecuente', titulo: 'Servicio más frecuente', siVacio: '—' },
    ],
  },
  {
    id: 'clientes-sin-compras',
    titulo: 'Clientes sin compras',
    descripcion:
      'Clientes registrados que nunca han pagado un servicio. Buenos candidatos para recontactar.',
    vacio: 'Todos tus clientes han comprado al menos una vez. ✔',
    usaPeriodo: false,
    columnas: [
      { clave: 'nombre', titulo: 'Cliente', secundaria: 'folio' },
      { clave: 'telefono', titulo: 'Teléfono' },
      { clave: 'fechaRegistro', titulo: 'Registrado', tipo: 'fecha' },
      { clave: 'diasRegistrado', titulo: 'Días como cliente', tipo: 'numero' },
      { clave: 'activo', titulo: 'Activo', tipo: 'si-no' },
      { clave: 'citas', titulo: 'Citas', tipo: 'numero' },
      { clave: 'ultimaCita', titulo: 'Última cita', tipo: 'fecha', siVacio: 'Sin citas' },
      { clave: 'estadoUltimaCita', titulo: 'Estado', tipo: 'estado', siVacio: '—' },
    ],
  },
  {
    id: 'servicios-sin-movimiento',
    titulo: 'Servicios sin movimiento',
    descripcion:
      'Servicios del catálogo que nadie agendó ni compró en el periodo. Revisa si conviene darlos de baja.',
    vacio: 'Todos los servicios tuvieron movimiento en este periodo. ✔',
    usaPeriodo: true,
    columnas: [
      { clave: 'nombre', titulo: 'Servicio', secundaria: 'clave' },
      { clave: 'costo', titulo: 'Precio actual', tipo: 'moneda' },
      { clave: 'ultimaVenta', titulo: 'Última venta', tipo: 'fecha', siVacio: 'Nunca' },
      { clave: 'diasSinVenta', titulo: 'Días sin venta', tipo: 'numero', siVacio: '—' },
    ],
  },
];

export const definicion = (id: string) => CONSULTAS.find((c) => c.id === id)!;
