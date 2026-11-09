import { Component, DOCUMENT, inject, Renderer2 } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Navegacion } from './layout/navegacion/navegacion';

/** Marco común de todas las páginas: navegación, la página activa y el pie. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navegacion],
  template: `
    <app-navegacion />
    <router-outlet />
    <footer>
      <p class="mb-0">&copy; 2025 Estética Miss Name. Todos los derechos reservados.</p>
    </footer>
  `,
})
export class App {
  private readonly router = inject(Router);
  private readonly body = inject(DOCUMENT).body;
  private readonly renderer = inject(Renderer2);

  constructor() {
    // Tema por área: el CSS espera <body data-page="…">, como en la versión nativa.
    // El valor viene de `data.pagina` de la ruta activa.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const pagina = paginaDe(this.router.routerState.snapshot.root);
        if (pagina) this.renderer.setAttribute(this.body, 'data-page', pagina);
        else this.renderer.removeAttribute(this.body, 'data-page');
      });
  }
}

/** `data.pagina` de la ruta más profunda que lo defina. */
function paginaDe(ruta: ActivatedRouteSnapshot): string | null {
  let actual: ActivatedRouteSnapshot | null = ruta;
  let pagina: string | null = null;
  while (actual) {
    pagina = (actual.data['pagina'] as string | undefined) ?? pagina;
    actual = actual.firstChild;
  }
  return pagina;
}
