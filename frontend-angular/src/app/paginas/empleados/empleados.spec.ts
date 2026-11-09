import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../../core/config/api-config';
import { apiInterceptor } from '../../core/interceptors/api.interceptor';
import { Confirmacion } from '../../core/servicios/confirmacion';
import { RELOJ } from '../../core/servicios/reloj';
import { antiguedad } from '../../core/util/antiguedad';
import { Empleados } from './empleados';

const BASE = 'http://api.prueba/api';
const empleado = (folio: string, nombre: string, fechaIngreso: string, activo = true) => ({ folio, nombre, telefono: '7221110001', fechaIngreso, activo });

describe('antiguedad()', () => {
  const hoy = new Date(2026, 10, 10);
  it('años y meses', () => expect(antiguedad('2024-08-01', hoy)).toBe('2 años, 3 meses'));
  it('menos de un mes', () => expect(antiguedad('2026-10-20', hoy)).toBe('Menos de un mes'));
  it('fecha inválida', () => expect(antiguedad('2026-02-30', hoy)).toBe(''));
});

describe('Empleados (F-35 a F-38)', () => {
  let fixture: ComponentFixture<Empleados>;
  let backend: HttpTestingController;
  let raiz: HTMLElement;
  const preguntar = vi.fn(() => true);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Empleados],
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: BASE },
        { provide: Confirmacion, useValue: { preguntar } },
        { provide: RELOJ, useValue: () => new Date(2026, 10, 10) },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Empleados);
    raiz = fixture.nativeElement;
    fixture.autoDetectChanges();
  });

  afterEach(() => backend.verify());

  const $ = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
  const lista = (estado: string): TestRequest => {
    TestBed.tick();
    return backend.expectOne((r) => r.url === `${BASE}/empleados` && r.params.get('estado') === estado);
  };

  it('pide los activos, muestra la antigüedad calculada y limita la fecha de ingreso a hoy', async () => {
    lista('activos').flush([empleado('E001', 'Héctor Ruiz', '2024-08-01')]);
    await fixture.whenStable();
    expect($('tr[data-empleado=E001]').textContent).toContain('2 años, 3 meses');
    expect($<HTMLInputElement>('#fechaIngreso').max).toBe('2026-11-10');
  });

  it('el filtro de estado consulta de inmediato', async () => {
    lista('activos').flush([]);
    await fixture.whenStable();
    const sel = $<HTMLSelectElement>('#filtroEstado');
    sel.value = 'inactivos';
    sel.dispatchEvent(new Event('change'));
    lista('inactivos').flush([empleado('E009', 'Karla Núñez', '2025-01-01', false)]);
    await fixture.whenStable();
    expect($('tr[data-empleado=E009]').textContent).toContain('inactivo');
  });

  it('editar carga los datos y el botón cambia a "Guardar cambios"', async () => {
    lista('activos').flush([empleado('E001', 'Héctor Ruiz', '2024-08-01')]);
    await fixture.whenStable();
    [...$('tr[data-empleado=E001]').querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Editar')!.click();
    backend.expectOne(`${BASE}/empleados/E001`).flush(empleado('E001', 'Héctor Ruiz', '2024-08-01'));
    await fixture.whenStable();
    expect($<HTMLInputElement>('#empNombre').value).toBe('Héctor Ruiz');
    expect($('#btnGuardarEmpleado').textContent!.trim()).toBe('Guardar cambios');
    expect($('#tituloFormEmpleado').textContent).toContain('Editar empleado E001');
  });
});
