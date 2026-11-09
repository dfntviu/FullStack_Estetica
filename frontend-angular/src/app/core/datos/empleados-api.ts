import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_URL } from '../config/api-config';
import { DatosEmpleado, Empleado, EmpleadoApi, FiltroEmpleados } from '../modelos/empleado';
import { RELOJ } from '../servicios/reloj';
import { antiguedad } from '../util/antiguedad';

/** Solo los campos que acepta la API (rechaza propiedades desconocidas). */
const cuerpo = ({ nombre, telefono, fechaIngreso }: DatosEmpleado): DatosEmpleado => ({ nombre, telefono, fechaIngreso });

/**
 * Antes `EmpleadosApiModel.js`. Reglas en el servidor: teléfono único (base), fecha de ingreso
 * no futura (API) y baja lógica. La antigüedad es solo presentación y se calcula aquí.
 */
@Injectable({ providedIn: 'root' })
export class EmpleadosApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_URL)}/empleados`;
  private readonly reloj = inject(RELOJ);

  /** Lista que se vuelve a pedir al cambiar el filtro (cancela la petición anterior). */
  lista(filtro: Signal<FiltroEmpleados>): HttpResourceRef<Empleado[] | undefined> {
    return httpResource<Empleado[]>(
      () => {
        const { texto, estado } = filtro();
        const params: Record<string, string> = { estado };
        if (texto.trim()) params['texto'] = texto.trim();
        return { url: this.url, params };
      },
      { parse: (lista) => (lista as EmpleadoApi[]).map((e) => this.aEmpleado(e)) },
    );
  }

  obtener(id: string): Observable<Empleado> {
    return this.http.get<EmpleadoApi>(this.ruta(id)).pipe(map((e) => this.aEmpleado(e)));
  }

  registrar(datos: DatosEmpleado): Observable<Empleado> {
    return this.http.post<EmpleadoApi>(this.url, cuerpo(datos)).pipe(map((e) => this.aEmpleado(e)));
  }

  editar(id: string, datos: DatosEmpleado): Observable<Empleado> {
    return this.http.put<EmpleadoApi>(this.ruta(id), cuerpo(datos)).pipe(map((e) => this.aEmpleado(e)));
  }

  darDeBaja(id: string): Observable<Empleado> {
    return this.http.patch<EmpleadoApi>(this.ruta(id, '/baja'), null).pipe(map((e) => this.aEmpleado(e)));
  }

  reactivar(id: string): Observable<Empleado> {
    return this.http.patch<EmpleadoApi>(this.ruta(id, '/reactivar'), null).pipe(map((e) => this.aEmpleado(e)));
  }

  private aEmpleado({ folio, ...resto }: EmpleadoApi): Empleado {
    return { id: folio, ...resto, antiguedad: antiguedad(resto.fechaIngreso, this.reloj()) };
  }

  private ruta(id: string, accion = ''): string {
    return `${this.url}/${encodeURIComponent(id)}${accion}`;
  }
}
