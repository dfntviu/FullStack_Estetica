import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../config/api-config';
import { CierreCaja, Periodo, ReporteClientes, ReporteCostos, ReporteIngresos } from '../modelos/reporte';

/**
 * Reportes para el administrador. Los cálculos viven en PostgreSQL (funciones con ventanas,
 * vistas de auditoría y el procedimiento de cierre); aquí solo se piden.
 * Cada lectura es un recurso que se vuelve a pedir cuando cambia el periodo. Con periodo
 * `undefined` el recurso queda inactivo (sin petición): la página solo pide la pestaña abierta.
 */
@Injectable({ providedIn: 'root' })
export class ReportesApi {
  private readonly http = inject(HttpClient);
  private readonly api  = inject(API_URL);

  ingresos(periodo: Signal<Periodo | undefined>): HttpResourceRef<ReporteIngresos | undefined> {
    return httpResource<ReporteIngresos>(() => this.peticion('reportes/ingresos', periodo()));
  }

  costos(periodo: Signal<Periodo | undefined>): HttpResourceRef<ReporteCostos | undefined> {
    return httpResource<ReporteCostos>(() => this.peticion('reportes/costos', periodo()));
  }

  clientes(periodo: Signal<Periodo | undefined>): HttpResourceRef<ReporteClientes | undefined> {
    return httpResource<ReporteClientes>(() => this.peticion('reportes/clientes', periodo()));
  }

  cierres(periodo: Signal<Periodo | undefined>): HttpResourceRef<CierreCaja[] | undefined> {
    return httpResource<CierreCaja[]>(() => this.peticion('caja/cierres', periodo()));
  }

  private peticion(ruta: string, periodo: Periodo | undefined) {
    return periodo ? { url: `${this.api}/${ruta}`, params: { desde: periodo.desde, hasta: periodo.hasta } } : undefined;
  }

  /** Ejecuta el procedimiento sp_cerrar_caja. 409 si ya estaba cerrado; 400 si es un día futuro. */
  cerrarCaja(dia: string): Observable<CierreCaja> {
    return this.http.post<CierreCaja>(`${this.api}/caja/cierres`, { dia });
  }
}
