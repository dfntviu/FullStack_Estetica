import { httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { API_URL } from '../config/api-config';
import { FilaConsulta, FilaDiagnostico, PeriodoAbierto } from '../modelos/consulta';

/**
 * Consultas del administrador. Cada una es una función de PostgreSQL (db/consultas.sql) que la
 * API expone por un id de una lista blanca: /api/consultas/:id?desde=&hasta=
 */
@Injectable({ providedIn: 'root' })
export class ConsultasApi {
  private readonly url = `${inject(API_URL)}/consultas`;

  diagnostico(periodo: Signal<PeriodoAbierto>): HttpResourceRef<FilaDiagnostico[] | undefined> {
    return httpResource<FilaDiagnostico[]>(() => ({
      url: `${this.url}/diagnostico`,
      params: { ...limpio(periodo()) },
    }));
  }

  resultado(
    id: Signal<string>,
    periodo: Signal<PeriodoAbierto>,
  ): HttpResourceRef<FilaConsulta[] | undefined> {
    return httpResource<FilaConsulta[]>(() => ({
      url: `${this.url}/${id()}`,
      params: { ...limpio(periodo()) },
    }));
  }

  /** El SQL instalado en la base. Solo se pide cuando `visible` es true ("Ver SQL"). */
  sql(
    id: Signal<string>,
    visible: Signal<boolean>,
  ): HttpResourceRef<{ consulta: string; sql: string } | undefined> {
    return httpResource<{ consulta: string; sql: string }>(() =>
      visible() ? `${this.url}/${id()}/sql` : undefined,
    );
  }
}

/** Sin claves vacías: HttpParams enviaría "desde=" y la API lo leería como fecha inválida. */
function limpio(p: PeriodoAbierto): Record<string, string> {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Record<string, string>;
}
