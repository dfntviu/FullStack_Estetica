import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../config/api-config';
import { Cobro, NuevoCobro } from '../modelos/cobro';

/** Quita vacíos: la API rechaza propiedades desconocidas y trata '' distinto de "no enviado". */
const sinVacios = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;

/**
 * Antes `CobrosApiModel.js`. Las reglas del cobro (precio congelado, pago exacto con tarjeta o
 * transferencia, referencia obligatoria, caja cerrada) las aplican la API y la base.
 */
@Injectable({ providedIn: 'root' })
export class CobrosApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_URL)}/cobros`;

  /** Con cita, cliente y servicio no se envían: el servidor los toma de la cita. */
  registrar(datos: NuevoCobro): Observable<Cobro> {
    const conCita = Boolean(datos.citaFolio?.trim());
    return this.http.post<Cobro>(
      this.url,
      sinVacios({
        citaFolio: datos.citaFolio?.trim(),
        telefono: conCita ? undefined : datos.telefono,
        cliente: conCita ? undefined : datos.cliente,
        servicio: conCita ? undefined : datos.servicio,
        metodo: datos.metodo,
        pagado: datos.pagado,
        referencia: datos.referencia?.trim(),
      }),
    );
  }
}
