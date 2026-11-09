import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { API_URL } from '../config/api-config';
import { ErrorApi } from '../interceptors/error-api';
import { aCita, Cita, CitaAgendada, CitaApi, Disponibilidad, NuevaCita } from '../modelos/cita';

/**
 * Antes `CitasApiModel.js`. Las reglas de agenda (domingo, sábado, horario laboral, turnos
 * ocupados, fechas pasadas) las decide el servidor: aquí solo se pregunta.
 * Lecturas como recursos (httpResource); escrituras como Observable (HttpClient).
 */
@Injectable({ providedIn: 'root' })
export class CitasApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_URL)}/citas`;

  /**
   * Recurso que se vuelve a pedir cada vez que cambia `fecha`. Si llega otra fecha antes
   * de la respuesta, la petición anterior se cancela (antes: el contador `turno`).
   * Con fecha vacía queda inactivo, sin petición. Llamar en un contexto de inyección.
   */
  disponibilidad(fecha: Signal<string>): HttpResourceRef<Disponibilidad | undefined> {
    return httpResource<Disponibilidad>(() =>
      fecha() ? { url: `${this.url}/disponibilidad`, params: { fecha: fecha() } } : undefined,
    );
  }

  /**
   * Agenda en el servidor: identifica (o registra) al cliente por teléfono y crea la cita en una
   * transacción. Si el turno se ocupó mientras se llenaba el formulario, la base lo rechaza
   * (índice único parcial) y llega como ErrorApi con `errores.hora`.
   */
  agendar(datos: NuevaCita): Observable<CitaAgendada> {
    return this.http
      .post<{ cita: CitaApi; clienteNuevo: boolean }>(this.url, datos)
      .pipe(map((r) => ({ cita: aCita(r.cita), clienteNuevo: r.clienteNuevo })));
  }

  /** Una cita por folio (Cobrar). Emite null si no existe (404). */
  obtener(folio: string): Observable<Cita | null> {
    return this.http.get<CitaApi>(`${this.url}/${encodeURIComponent(folio.trim())}`).pipe(
      map(aCita),
      catchError((e: unknown) => (e instanceof ErrorApi && e.status === 404 ? of(null) : throwError(() => e))),
    );
  }

  /** Busca por folio, nombre (sin importar acentos) o teléfono; lo resuelve la API con un JOIN. */
  buscar(texto: string): Observable<Cita[]> {
    return this.http.get<CitaApi[]>(this.url, { params: { buscar: texto.trim() } }).pipe(map((lista) => lista.map(aCita)));
  }

  /**
   * Cambios de estado. El servidor solo los aplica si el estado actual lo permite
   * (pendiente → confirmada; pendiente/confirmada → cancelada); si no, responde 409.
   */
  confirmar(folio: string): Observable<Cita> {
    return this.http.patch<CitaApi>(`${this.url}/${encodeURIComponent(folio)}/confirmar`, null).pipe(map(aCita));
  }

  cancelar(folio: string): Observable<Cita> {
    return this.http.patch<CitaApi>(`${this.url}/${encodeURIComponent(folio)}/cancelar`, null).pipe(map(aCita));
  }
}
