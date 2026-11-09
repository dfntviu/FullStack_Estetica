import { Controller, Get } from '@nestjs/common';

@Controller()
export class SaludController {
  /**
   * GET /api — comprobación rápida de que la API está viva.
   * Cada ruta indica cómo se consulta: citas y cobros NO devuelven "todo" sin parámetros.
   */
  @Get()
  estado() {
    return {
      estado: 'ok',
      endpoints: {
        '/api/servicios': 'catálogo completo',
        '/api/clientes': 'activos; ?texto= filtra, ?incluirInactivos=true incluye bajas',
        '/api/empleados': 'activos; ?texto= filtra, ?estado=activos|inactivos|todos',
        '/api/citas?buscar=': 'búsqueda por folio, nombre o teléfono; sin ?buscar= devuelve []',
        '/api/citas/disponibilidad?fecha=AAAA-MM-DD': 'horarios libres del día',
        '/api/citas/:folio': 'una cita',
        '/api/cobros?dia=AAAA-MM-DD': 'cobros del día; sin ?dia= usa hoy (vacío si hoy no hay cobros)',
        '/api/cobros/corte?dia=AAAA-MM-DD': 'corte de caja por método de pago',
        'PATCH /api/servicios/:clave/costo': 'cambia el precio de lista (queda en la auditoría)',
        '/api/reportes/ingresos?desde=&hasta=': 'ingresos: resumen vs. periodo anterior, por día, servicio y método',
        '/api/reportes/costos?desde=&hasta=': 'historial de cambios de precio',
        '/api/reportes/clientes?desde=&hasta=': 'altas, bajas y reactivaciones de clientes',
        'POST /api/caja/cierres': 'cierra la caja de un día { dia }',
        '/api/caja/cierres?desde=&hasta=': 'cierres con su descuadre',
        '/api/consultas': 'consultas del administrador (diagnóstico, agenda, pagos, carga, vencidas…)',
        '/api/consultas/:id?desde=&hasta=': 'filas de una consulta; /api/consultas/:id/sql = su SQL',
      },
    };
  }
}
