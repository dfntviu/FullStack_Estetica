import { Component, computed, input, signal } from '@angular/core';
import { IngresoDia } from '../../../core/modelos/reporte';
import { MonedaPipe } from '../../../compartido/pipes/moneda.pipe';

const ANCHO = 900;
const ALTO = 260;
const M = { izq: 64, der: 12, arr: 12, aba: 28 };
const PLOT_W = ANCHO - M.izq - M.der;
const PLOT_H = ALTO - M.arr - M.aba;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface Barra {
  i: number;
  d: IngresoDia;
  x: number;
  /** centro de la columna (para la línea y el tooltip) */
  cx: number;
  ruta: string;
}

/**
 * Ingresos por día (barras) + promedio móvil de 7 días (línea), en un solo eje en pesos.
 * SVG sin librerías. Colores validados con el validador de paletas (magenta de la marca +
 * azul): pasan separación para daltonismo y contraste. Componente presentacional: solo input().
 */
@Component({
  selector: 'app-grafica-ingresos',
  imports: [MonedaPipe],
  templateUrl: './grafica-ingresos.html',
  styleUrl: './grafica-ingresos.css',
})
export class GraficaIngresos {
  readonly dias = input.required<IngresoDia[]>();

  protected readonly ancho = ANCHO;
  protected readonly alto = ALTO;
  protected readonly m = M;
  protected readonly plotW = PLOT_W;
  protected readonly baseY = M.arr + PLOT_H;
  /** Día bajo el cursor (o con foco de teclado). */
  protected readonly activo = signal<number | null>(null);

  /** Máximo "redondo" (1, 2 o 5 × 10ⁿ por paso) y 4 líneas de cuadrícula. */
  protected readonly escala = computed(() => {
    const max = Math.max(1, ...this.dias().map((d) => Math.max(d.ingresos, d.promedio7Dias)));
    const crudo = max / 4;
    const potencia = 10 ** Math.floor(Math.log10(crudo));
    const paso = [1, 2, 5, 10].map((f) => f * potencia).find((p) => p >= crudo)!;
    const tope = paso * 4;
    return {
      tope,
      marcas: [0, 1, 2, 3, 4].map((k) => ({ valor: k * paso, y: this.y(k * paso, tope) })),
    };
  });

  protected readonly barras = computed<Barra[]>(() => {
    const dias = this.dias();
    const columna = PLOT_W / Math.max(dias.length, 1);
    const grosor = Math.max(1, Math.min(24, columna - 2)); // ≤ 24px y 2px de aire entre barras
    const { tope } = this.escala();
    return dias.map((d, i) => {
      const x = M.izq + i * columna + (columna - grosor) / 2;
      return { i, d, x, cx: x + grosor / 2, ruta: this.rutaBarra(x, grosor, this.y(d.ingresos, tope)) };
    });
  });

  protected readonly columna = computed(() => PLOT_W / Math.max(this.dias().length, 1));

  protected readonly linea = computed(() => {
    const { tope } = this.escala();
    return this.barras()
      .map((b, k) => `${k ? 'L' : 'M'}${b.cx.toFixed(1)},${this.y(b.d.promedio7Dias, tope).toFixed(1)}`)
      .join(' ');
  });

  /** Etiquetas del eje X: el día 1 de cada mes (o cada 7 días en periodos cortos). */
  protected readonly etiquetasX = computed(() => {
    const barras = this.barras();
    const corto = barras.length <= 35;
    return barras
      .filter((b, k) => (corto ? k % 7 === 0 : b.d.dia.endsWith('-01')))
      .map((b) => ({ x: b.cx, texto: etiquetaDia(b.d.dia, !corto) }));
  });

  protected readonly tooltip = computed(() => {
    const i = this.activo();
    if (i === null) return null;
    const b = this.barras()[i];
    if (!b) return null;
    const izquierdaPct = (b.cx / ANCHO) * 100;
    return { ...b.d, cx: b.cx, texto: etiquetaDia(b.d.dia, false), izquierdaPct, alLado: izquierdaPct > 70 ? 'izq' : 'der' };
  });

  protected abreviar(valor: number): string {
    return valor >= 1000 ? `$${(valor / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k` : `$${valor}`;
  }

  private y(valor: number, tope: number): number {
    return M.arr + PLOT_H - (valor / tope) * PLOT_H;
  }

  /** Barra con la punta (arriba) redondeada 4px y la base recta, apoyada en la línea base. */
  private rutaBarra(x: number, w: number, yTop: number): string {
    const base = M.arr + PLOT_H;
    const h = base - yTop;
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${base} Z`;
  }
}

/** '2026-09-01' → '1 sep' (o '1 sep 2026' con año). */
function etiquetaDia(iso: string, soloMes: boolean): string {
  const [a, m, d] = iso.split('-').map(Number);
  return soloMes ? `${MESES[m - 1]} ${a}` : `${d} ${MESES[m - 1]}`;
}
