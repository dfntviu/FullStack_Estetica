import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';

describe('App: marco, rutas y navegación', () => {
  let fixture: ComponentFixture<App>;
  let raiz: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes, withComponentInputBinding())],
    });
    fixture = TestBed.createComponent(App);
    raiz = fixture.nativeElement;
    fixture.autoDetectChanges();
  });

  async function ir(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  it('Inicio: 9 tarjetas de acceso y tema "dashboard" (F-02)', async () => {
    await ir('/');
    expect(document.body.dataset['page']).toBe('dashboard');
    expect(raiz.querySelectorAll('.tarjeta-modulo')).toHaveLength(9);
    expect(document.title).toBe('Inicio - Estética Miss Name');
  });

  it.each([
    ['/servicios', 'servicios'],
    ['/horarios', 'horarios'],
    ['/agendar', 'iniciar-cita'],
    ['/verificar', 'cotejar-cita'],
    ['/cobrar', 'cobrar-servicio'],
    ['/clientes', 'clientes'],
    ['/empleados', 'empleados'],
    ['/reportes', 'reportes'],
    ['/consultas', 'consultas'],
  ])('%s pone <body data-page="%s"> para el tema por área (F-06)', async (url, pagina) => {
    await ir(url);
    expect(document.body.dataset['page']).toBe(pagina);
  });

  it('una ruta desconocida regresa a Inicio', async () => {
    await ir('/no-existe');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(document.body.dataset['page']).toBe('dashboard');
  });

  it('la página provisional recibe su título desde data de la ruta', async () => {
    await ir('/servicios');
    expect(raiz.querySelector('main h1')?.textContent).toBe('Nuestros Servicios');
  });

  it('navegación: 10 enlaces y solo el activo lleva aria-current (F-01)', async () => {
    await ir('/clientes');
    const enlaces = [...raiz.querySelectorAll<HTMLAnchorElement>('#menu-principal .nav-link')];
    expect(enlaces).toHaveLength(10);
    const activos = enlaces.filter((a) => a.getAttribute('aria-current') === 'page');
    expect(activos.map((a) => a.textContent?.trim())).toEqual(['Clientes']);
  });

  it('menú móvil: el botón abre y cierra sin Bootstrap JS (D-3)', async () => {
    await ir('/');
    const boton = raiz.querySelector<HTMLButtonElement>('.navbar-toggler')!;
    const menu = raiz.querySelector('#menu-principal')!;
    expect(menu.classList.contains('show')).toBe(false);

    boton.click();
    await fixture.whenStable();
    expect(menu.classList.contains('show')).toBe(true);
    expect(boton.getAttribute('aria-expanded')).toBe('true');

    raiz.querySelector<HTMLAnchorElement>('#menu-principal a[href="/horarios"]')!.click(); // elegir cierra el menú
    await fixture.whenStable();
    expect(menu.classList.contains('show')).toBe(false);
  });
});
