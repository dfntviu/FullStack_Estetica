import { Component, inject } from '@angular/core';
import { NombreTema, Tema, TEMAS } from '../../../core/servicios/tema';

/**
 * Selector de personalidad del tema (en Inicio). Son radios nativos con apariencia de tarjeta:
 * se navegan con las flechas del teclado y el lector de pantalla anuncia cuál está elegido.
 */
@Component({
  selector: 'app-selector-tema',
  templateUrl: './selector-tema.html',
  styleUrl: './selector-tema.css',
})
export class SelectorTema {
  protected readonly tema = inject(Tema);
  protected readonly temas = TEMAS;

  protected elegir(id: NombreTema): void {
    this.tema.elegir(id);
  }
}
