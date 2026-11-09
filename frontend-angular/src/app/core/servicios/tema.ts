import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

export type NombreTema = 'platicador' | 'comico' | 'flexible';

export interface OpcionTema {
  id: NombreTema;
  nombre: string;
  animo: string;
  descripcion: string;
  /** Colores de muestra para el selector (los mismos de tema-estetica.css). */
  muestras: readonly [string, string, string];
}

/** Las tres personalidades. Los colores reales viven en estilos/tema-estetica.css. */
export const TEMAS: readonly OpcionTema[] = [
  {
    id: 'comico',
    nombre: 'Estilista Cómico',
    animo: 'Energía y entusiasmo',
    descripcion: 'Durazno cálido y amarillo mantequilla.',
    muestras: ['#a65a2e', '#ddb866', '#f8cfb2'],
  },
  {
    id: 'platicador',
    nombre: 'Estilista Platicador',
    animo: 'Conexión y empatía',
    descripcion: 'Rosa viejo y terracota suave.',
    muestras: ['#a24f66', '#cf8a6b', '#e8bac6'],
  },
  {
    id: 'flexible',
    nombre: 'Estilista Flexible',
    animo: 'Calma y adaptabilidad',
    descripcion: 'Verde sabio y azul claro sereno.',
    muestras: ['#4a7560', '#7cb1d3', '#b7d4c1'],
  },
];

export const TEMA_PREDETERMINADO: NombreTema = 'platicador';
/** La misma clave la lee el script de index.html para aplicar el tema antes de que arranque Angular. */
export const CLAVE_TEMA = 'estetica.tema';
const DURACION_TRANSICION_MS = 500;

const esTema = (v: unknown): v is NombreTema => TEMAS.some((t) => t.id === v);

/**
 * Tema visual elegido por el dueño. Se aplica como <html data-tema="…"> y se recuerda en este
 * navegador (localStorage). Si el navegador no permite guardar, el tema dura hasta recargar.
 */
@Injectable({ providedIn: 'root' })
export class Tema {
  private readonly doc = inject(DOCUMENT);
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  readonly actual = signal<NombreTema>(this.leerGuardado());

  constructor() {
    this.doc.documentElement.dataset['tema'] = this.actual();
  }

  elegir(tema: NombreTema): void {
    if (!esTema(tema) || tema === this.actual()) return;
    const raiz = this.doc.documentElement;
    // La transición de colores solo dura el cambio (ver html.cambiando-tema en el CSS)
    raiz.classList.add('cambiando-tema');
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => raiz.classList.remove('cambiando-tema'), DURACION_TRANSICION_MS);

    raiz.dataset['tema'] = tema;
    this.actual.set(tema);
    try {
      this.doc.defaultView?.localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      /* almacenamiento no disponible (modo privado, política del navegador): no pasa nada */
    }
  }

  private leerGuardado(): NombreTema {
    try {
      const guardado = this.doc.defaultView?.localStorage.getItem(CLAVE_TEMA);
      return esTema(guardado) ? guardado : TEMA_PREDETERMINADO;
    } catch {
      return TEMA_PREDETERMINADO;
    }
  }
}
