import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLAVE_TEMA, Tema, TEMA_PREDETERMINADO } from './tema';

describe('Tema', () => {
  const raiz = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    delete raiz.dataset['tema'];
    raiz.classList.remove('cambiando-tema');
  });
  afterEach(() => localStorage.clear());

  it('sin elección guardada usa el predeterminado y lo aplica en <html data-tema>', () => {
    const tema = TestBed.inject(Tema);
    expect(tema.actual()).toBe(TEMA_PREDETERMINADO);
    expect(raiz.dataset['tema']).toBe('platicador');
  });

  it('recupera la elección guardada', () => {
    localStorage.setItem(CLAVE_TEMA, 'flexible');
    expect(TestBed.inject(Tema).actual()).toBe('flexible');
    expect(raiz.dataset['tema']).toBe('flexible');
  });

  it('ignora un valor guardado que no es un tema', () => {
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    expect(TestBed.inject(Tema).actual()).toBe(TEMA_PREDETERMINADO);
  });

  it('elegir aplica, guarda y activa la transición solo durante el cambio', () => {
    const tema = TestBed.inject(Tema);
    tema.elegir('comico');
    expect(raiz.dataset['tema']).toBe('comico');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('comico');
    expect(raiz.classList.contains('cambiando-tema')).toBe(true);
  });
});
