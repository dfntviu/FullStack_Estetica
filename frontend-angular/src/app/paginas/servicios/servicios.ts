import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensajeDe } from '../../core/interceptors/error-api';
import { ServiciosApi } from '../../core/datos/servicios-api';
import { Aviso } from '../../compartido/aviso/aviso';
import { MonedaPipe } from '../../compartido/pipes/moneda.pipe';

/**
 * Antes servicios.controller.js + servicios.view.js (F-07, F-08, F-09).
 * El recurso reemplaza el try/catch y los estados escritos a mano:
 * cargando → isLoading(), error → error(), Reintentar → reload().
 */
@Component({
  selector: 'app-servicios',
  imports: [RouterLink, Aviso, MonedaPipe],
  host: { class: 'pagina' },
  templateUrl: './servicios.html',
  styleUrl: './servicios.css',
})
export class Servicios {
  protected readonly catalogo = inject(ServiciosApi).catalogo();

  protected readonly mensajeError = computed(() =>
    mensajeDe(this.catalogo.error(), 'No se pudieron cargar los servicios.'),
  );
}
