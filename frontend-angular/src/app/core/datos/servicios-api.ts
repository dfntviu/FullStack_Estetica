import { httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_URL } from '../config/api-config';
import { Servicio, ServicioApi } from '../modelos/servicio';

/**
 * Antes `ServiciosModel.js`. Traduce la forma de la API a la de las páginas ({ clave } → { id }).
 *
 * `catalogo()` devuelve un recurso (httpResource): carga solo, expone isLoading()/error()/value()
 * y se recarga con reload(). Debe llamarse en un contexto de inyección, p. ej. en un campo del
 * componente; cada página obtiene su propio recurso, igual que la caché por página de la versión nativa.
 */
@Injectable({ providedIn: 'root' })
export class ServiciosApi {
  private readonly url = `${inject(API_URL)}/servicios`;

  catalogo(): HttpResourceRef<Servicio[] | undefined> {
    return httpResource<Servicio[]>(() => this.url, { parse: aServicios });
  }
}

/**
 * La base guarda la imagen como '../assets/img/…' (ruta relativa a las páginas nativas en views/).
 * Se normaliza a 'assets/img/…', relativa a <base href>, para que funcione en cualquier ruta.
 */
export function rutaImagen(imagen: string): string {
  return imagen.replace(/^(\.\.\/|\.\/|\/)+/, '');
}

function aServicios(cuerpo: unknown): Servicio[] {
  return (cuerpo as ServicioApi[]).map(({ clave, nombre, costo, imagen }) => ({
    id: clave,
    nombre,
    costo,
    imagen: rutaImagen(imagen),
  }));
}
