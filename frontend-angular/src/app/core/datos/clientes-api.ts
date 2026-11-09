import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { API_URL } from '../config/api-config';
import { ErrorApi } from '../interceptors/error-api';
import {
  aCliente,
  CitaHistorial,
  Cliente,
  ClienteApi,
  DatosCliente,
  FiltroClientes,
  HistorialCliente,
} from '../modelos/cliente';
import { RELOJ } from '../servicios/reloj';
import { fechaISO } from '../util/fechas';

/** Lo que devuelve la API en el historial (las citas con `folio`). */
interface HistorialApi {
  cliente: ClienteApi;
  totalCitas: number;
  totalGastado: number;
  ultimaVisita: string | null;
  servicioFrecuente: string | null;
  citas: (Omit<CitaHistorial, 'id'> & { folio: string })[];
}

const ACTIVAS = new Set(['pendiente', 'confirmada']);

/** Solo los campos que acepta la API (rechaza propiedades desconocidas). */
const cuerpo = ({ nombre, telefono, cumpleanos, observaciones }: DatosCliente): DatosCliente => ({
  nombre,
  telefono,
  cumpleanos,
  observaciones,
});

/**
 * Antes `ClientesApiModel.js`. Las reglas (teléfono único, formatos, baja lógica) las aplica el
 * servidor; los errores llegan como ErrorApi con `errores` por campo.
 */
@Injectable({ providedIn: 'root' })
export class ClientesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_URL)}/clientes`;
  private readonly reloj = inject(RELOJ);

  /**
   * Lista que se vuelve a pedir cada vez que cambia el filtro; la petición anterior se cancela
   * (antes: el contador `secuenciaLista`). Llamar en un contexto de inyección.
   */
  lista(filtro: Signal<FiltroClientes>): HttpResourceRef<Cliente[] | undefined> {
    return httpResource<Cliente[]>(
      () => {
        const { texto, incluirInactivos } = filtro();
        const params: Record<string, string> = {};
        if (texto.trim()) params['texto'] = texto.trim();
        if (incluirInactivos) params['incluirInactivos'] = 'true';
        return { url: this.url, params };
      },
      { parse: (lista) => (lista as ClienteApi[]).map(aCliente) },
    );
  }

  obtener(id: string): Observable<Cliente> {
    return this.http.get<ClienteApi>(this.ruta(id)).pipe(map(aCliente));
  }

  /** Reconoce a un cliente por su teléfono (Agendar). Emite null si no está registrado (404). */
  porTelefono(telefono: string): Observable<Cliente | null> {
    return this.http.get<ClienteApi>(`${this.url}/telefono/${encodeURIComponent(telefono)}`).pipe(
      map(aCliente),
      catchError((e: unknown) => (e instanceof ErrorApi && e.status === 404 ? of(null) : throwError(() => e))),
    );
  }

  registrar(datos: DatosCliente): Observable<Cliente> {
    return this.http.post<ClienteApi>(this.url, cuerpo(datos)).pipe(map(aCliente));
  }

  editar(id: string, datos: DatosCliente): Observable<Cliente> {
    return this.http.put<ClienteApi>(this.ruta(id), cuerpo(datos)).pipe(map(aCliente));
  }

  darDeBaja(id: string): Observable<Cliente> {
    return this.http.patch<ClienteApi>(this.ruta(id, '/baja'), null).pipe(map(aCliente));
  }

  reactivar(id: string): Observable<Cliente> {
    return this.http.patch<ClienteApi>(this.ruta(id, '/reactivar'), null).pipe(map(aCliente));
  }

  /** Historial con métricas, citas (más reciente primero) y la próxima cita activa. */
  historial(id: string): Observable<HistorialCliente> {
    return this.http.get<HistorialApi>(this.ruta(id, '/historial')).pipe(
      map((r) => {
        const citas = r.citas.map(({ folio, ...c }) => ({ id: folio, ...c }));
        const hoy = fechaISO(this.reloj());
        const proximaCita =
          citas
            .filter((c) => ACTIVAS.has(c.estado) && c.fecha >= hoy)
            .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`))[0] ?? null;
        return {
          cliente: aCliente(r.cliente),
          totalCitas: r.totalCitas,
          totalGastado: r.totalGastado,
          ultimaVisita: r.ultimaVisita ?? '',
          servicioFrecuente: r.servicioFrecuente ?? '',
          proximaCita,
          citas,
        };
      }),
    );
  }

  private ruta(id: string, accion = ''): string {
    return `${this.url}/${encodeURIComponent(id)}${accion}`;
  }
}
