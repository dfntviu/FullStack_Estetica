// Pruebas e2e de auditoría, reportes de ingresos y cierre de caja (database/schemas/auditoria-reportes.sql).
// Base: schema + seed + auditoria-reportes + seed-historico (~8 meses de cobros simulados) + consultas.
//
// PGlite atiende todas las conexiones con UNA sola sesión e ignora los parámetros de arranque,
// así que el application_name que manda la API (DatabaseService) no llega. Se fija aquí en la
// sesión compartida, y los cambios "hechos a mano en psql" se simulan con manual(), que cambia
// el nombre solo durante esa escritura. En PostgreSQL real cada conexión tiene el suyo.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { ahoraNegocio } from '../src/common/agenda.js';

const PUERTO_PG = 54330; // distinto de api.e2e-spec.ts: los archivos corren en paralelo
let db: PGlite;
let servidorPg: PGLiteSocketServer;
let app: INestApplication<App>;
let http: ReturnType<typeof request>;

const HOY = ahoraNegocio().fecha;
/** HOY menos n días, AAAA-MM-DD */
const haceDias = (n: number) => {
  const [a, m, d] = HOY.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
};
/** Lectura directa a la base, para comprobar lo que la API dejó escrito. */
const sql = async <T = Record<string, unknown>>(
  texto: string,
  params: unknown[] = [],
) => (await db.query<T>(texto, params)).rows;
/** Escritura "a mano", como desde psql: sin pasar por la API. */
async function manual(texto: string): Promise<void> {
  await db.exec(
    `SET application_name = 'psql'; ${texto}; SET application_name = 'estetica-api';`,
  );
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const archivo of [
    'schema.sql',
    'seed.sql',
    'schemas/auditoria-reportes.sql',
    'seed-historico.sql',
    'schemas/consultas.sql',
  ]) {
    await db.exec(readFileSync(resolve('../database', archivo), 'utf8'));
  }
  await db.exec(
    `SET search_path TO estetica; SET application_name = 'estetica-api';`,
  );
  servidorPg = new PGLiteSocketServer({
    db,
    port: PUERTO_PG,
    host: '127.0.0.1',
  });
  await servidorPg.start();

  Object.assign(process.env, {
    PGHOST: '127.0.0.1',
    PGPORT: String(PUERTO_PG),
    PGUSER: 'postgres',
    PGDATABASE: 'postgres',
    PG_POOL_MAX: '1',
  });
  const { AppModule } = await import('../src/app.module.js');
  const { configurarApp } = await import('../src/config/configurar-app.js');
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = modulo.createNestApplication();
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await servidorPg?.stop();
  await db?.close();
});

describe('Precio de servicios + auditoría (trigger trg_servicio_costo)', () => {
  it('PATCH cambia el precio; el trigger lo registra como "sistema" (application_name de la API)', async () => {
    const r = await http
      .patch('/api/servicios/tinte-normal/costo')
      .send({ costo: 365.5 })
      .expect(200);
    expect(r.body).toMatchObject({ clave: 'tinte-normal', costo: 365.5 });

    const [a] = await sql<{
      origen: string;
      aplicacion: string;
      antes: { costo: number };
      despues: { costo: number };
    }>(
      `SELECT origen, aplicacion, antes, despues FROM auditoria WHERE tabla = 'servicio' ORDER BY id DESC LIMIT 1`,
    );
    expect(a.origen).toBe('sistema');
    expect(a.aplicacion).toBe('estetica-api');
    expect([a.antes.costo, a.despues.costo]).toEqual([350, 365.5]); // la fila completa, antes y después
  });

  it('mismo precio: el WHEN del trigger evita una fila de auditoría inútil', async () => {
    const antes = (
      await sql<{ n: number }>(
        `SELECT count(*)::int n FROM auditoria WHERE tabla = 'servicio'`,
      )
    )[0].n;
    await http
      .patch('/api/servicios/tinte-normal/costo')
      .send({ costo: 365.5 })
      .expect(200);
    const despues = (
      await sql<{ n: number }>(
        `SELECT count(*)::int n FROM auditoria WHERE tabla = 'servicio'`,
      )
    )[0].n;
    expect(despues).toBe(antes);
  });

  it('el precio congelado no cambia: las citas y cobros pasados conservan su total', async () => {
    const [r] = await sql<{ n: number }>(
      `SELECT count(*)::int n FROM cobro c JOIN servicio s ON s.id = c.servicio_id
        WHERE s.clave = 'tinte-normal' AND c.total <> 350`,
    );
    expect(r.n).toBe(0);
  });

  it('cambio hecho a mano (psql, sin la API) queda como "manual"', async () => {
    await manual(
      `UPDATE servicio SET costo = 280 WHERE clave = 'barba-normal'`,
    );
    const [a] = await sql<{ origen: string }>(
      `SELECT origen FROM auditoria WHERE tabla = 'servicio' ORDER BY id DESC LIMIT 1`,
    );
    expect(a.origen).toBe('manual');
  });

  it('validaciones: precio 0, texto, 3 decimales y clave inexistente', async () => {
    for (const costo of [0, 'abc', 10.555]) {
      const r = await http
        .patch('/api/servicios/corte-normal/costo')
        .send({ costo })
        .expect(400);
      expect(r.body.errores).toHaveProperty('costo');
    }
    await http
      .patch('/api/servicios/no-existe/costo')
      .send({ costo: 10 })
      .expect(404);
  });

  it('GET /reportes/costos: cuatrimestre con los 4 históricos + los 2 de hoy; bimestre con 2 + 2', async () => {
    const cuatri = await http
      .get('/api/reportes/costos')
      .query({ desde: haceDias(119), hasta: HOY })
      .expect(200);
    expect(cuatri.body.cambios).toHaveLength(6);
    expect(cuatri.body.cambios[0]).toMatchObject({
      clave: 'barba-normal',
      costoAnterior: 270,
      costoNuevo: 280,
      origen: 'manual',
    });
    expect(cuatri.body.cambios.at(-1)).toMatchObject({
      clave: 'tinte-permanente',
      costoAnterior: 400,
      costoNuevo: 430,
      variacionPct: 7.5,
    });

    const bim = await http
      .get('/api/reportes/costos')
      .query({ desde: haceDias(59), hasta: HOY })
      .expect(200);
    expect(bim.body.cambios.map((c: { clave: string }) => c.clave)).toEqual([
      'barba-normal',
      'tinte-normal',
      'ondulado-sedoso',
      'barba-hipster',
    ]);
  });
});

describe('Movimientos de clientes (trigger trg_cliente_estado, filtrado con TG_ARGV)', () => {
  let folio: string;

  it('alta por la API → "alta" de origen sistema', async () => {
    const r = await http
      .post('/api/clientes')
      .send({ nombre: 'Valeria Auditada', telefono: '7239990001' })
      .expect(201);
    folio = r.body.folio;
    const [m] = await sql<{ movimiento: string; origen: string }>(
      `SELECT movimiento, origen FROM v_movimiento_clientes WHERE folio = $1`,
      [folio],
    );
    expect(m).toEqual({ movimiento: 'alta', origen: 'sistema' });
  });

  it('editar datos NO es un movimiento (solo cuenta la columna activo); baja y reactivación sí', async () => {
    await http
      .put(`/api/clientes/${folio}`)
      .send({ nombre: 'Valeria A. Auditada', telefono: '7239990001' })
      .expect(200);
    await http.patch(`/api/clientes/${folio}/baja`).expect(200);
    await http.patch(`/api/clientes/${folio}/reactivar`).expect(200);
    const movs = await sql<{ movimiento: string }>(
      `SELECT movimiento FROM v_movimiento_clientes WHERE folio = $1 ORDER BY id`,
      [folio],
    );
    expect(movs.map((m) => m.movimiento)).toEqual([
      'alta',
      'baja',
      'reactivacion',
    ]);
  });

  it('GET /reportes/clientes: resumen con FILTER y lista del bimestre', async () => {
    const r = await http
      .get('/api/reportes/clientes')
      .query({ desde: haceDias(59), hasta: HOY })
      .expect(200);
    // seed-historico: altas semanales (hace 4…53 días = 8), baja hace 28 y 52, reactivación hace 9; + las 3 de hoy
    expect(r.body.resumen).toEqual({ altas: 9, bajas: 3, reactivaciones: 2 });
    expect(r.body.movimientos[0]).toMatchObject({
      folio,
      movimiento: 'reactivacion',
      origen: 'sistema',
    });
  });
});

describe('Reporte de ingresos (funciones con ventanas, generate_series y ROLLUP)', () => {
  const periodo = { desde: haceDias(89), hasta: HOY };

  it('resumen comparado con el trimestre anterior, y serie diaria con un día por fecha', async () => {
    const r = await http
      .get('/api/reportes/ingresos')
      .query(periodo)
      .expect(200);
    const { resumen, porDia, porServicio, porMetodo } = r.body;

    expect(resumen).toMatchObject({
      desde: periodo.desde,
      hasta: HOY,
      dias: 90,
    });
    expect(resumen.cobros).toBeGreaterThan(200);
    expect(resumen.ingresosPeriodoAnterior).toBeGreaterThan(0);
    expect(resumen.variacionPct).toBeCloseTo(
      (100 * resumen.ingresos) / resumen.ingresosPeriodoAnterior - 100,
      0,
    );

    // generate_series: 90 días aunque haya domingos sin ventas
    expect(porDia).toHaveLength(90);
    expect(porDia.some((d: { cobros: number }) => d.cobros === 0)).toBe(true);
    // acumulado (SUM OVER) termina en el total del periodo
    expect(porDia.at(-1).acumulado).toBe(resumen.ingresos);

    // ranking y participación (RANK y SUM() OVER ())
    expect(porServicio[0].ranking).toBe(1);
    const suma = porServicio.reduce(
      (t: number, s: { participacionPct: number }) => t + s.participacionPct,
      0,
    );
    expect(suma).toBeCloseTo(100, 0);

    // ROLLUP: la fila total suma a los métodos y es el 100 %
    const total = porMetodo.find(
      (m: { metodo: string }) => m.metodo === 'total',
    );
    expect(total).toMatchObject({
      ingresos: resumen.ingresos,
      cobros: resumen.cobros,
      participacionPct: 100,
    });
  });

  it('validaciones del periodo: orden, tamaño y fechas reales', async () => {
    let r = await http
      .get('/api/reportes/ingresos')
      .query({ desde: HOY, hasta: haceDias(1) })
      .expect(400);
    expect(r.body.errores).toHaveProperty('hasta');
    r = await http
      .get('/api/reportes/ingresos')
      .query({ desde: haceDias(400), hasta: HOY })
      .expect(400);
    expect(r.body.errores.hasta).toMatch(/366/);
    r = await http
      .get('/api/reportes/ingresos')
      .query({ desde: '2026-02-30', hasta: HOY })
      .expect(400);
    expect(r.body.errores).toHaveProperty('desde');
    await http
      .get('/api/reportes/ingresos')
      .query({ desde: 'ayer' })
      .expect(400);
  });
});

describe('Cierre de caja (PROCEDURE sp_cerrar_caja)', () => {
  it('el historial trae cierres sin descuadre hasta hace 3 días; los últimos días siguen abiertos', async () => {
    const r = await http
      .get('/api/caja/cierres')
      .query({ desde: haceDias(10), hasta: HOY })
      .expect(200);
    expect(r.body.length).toBeGreaterThan(5);
    expect(
      r.body.every(
        (c: { dia: string; descuadre: number }) =>
          c.dia <= haceDias(3) && c.descuadre === 0,
      ),
    ).toBe(true);
  });

  it('cerrar hoy congela los totales por método; la suma cuadra', async () => {
    await http
      .post('/api/cobros')
      .send({
        cliente: 'Cliente de paso',
        servicio: 'corte-normal',
        metodo: 'efectivo',
        pagado: 50,
      })
      .expect(201);
    await http
      .post('/api/cobros')
      .send({
        cliente: 'Otra Persona',
        servicio: 'tinte-normal',
        metodo: 'tarjeta',
        pagado: 365.5,
      })
      .expect(201);

    const r = await http
      .post('/api/caja/cierres')
      .send({ dia: HOY })
      .expect(201);
    expect(r.body).toMatchObject({
      dia: HOY,
      cobros: 2,
      efectivo: 45,
      tarjeta: 365.5,
      transferencia: 0,
      total: 410.5,
      descuadre: 0,
      origen: 'sistema',
    });
  });

  it('con la caja de hoy cerrada, la API rechaza cobros y no queda nada a medias (ROLLBACK)', async () => {
    const r = await http
      .post('/api/cobros')
      .send({
        cliente: 'Tarde',
        servicio: 'corte-normal',
        metodo: 'efectivo',
        pagado: 50,
      })
      .expect(409);
    expect(r.body.mensaje).toMatch(/caja de hoy ya está cerrada/);
    const [n] = await sql<{ n: number }>(
      `SELECT count(*)::int n FROM cobro WHERE nombre_cliente = 'Tarde'`,
    );
    expect(n.n).toBe(0);
  });

  it('cerrar dos veces → 409 (llave primaria); día futuro → 400 (RAISE con CONSTRAINT)', async () => {
    let r = await http.post('/api/caja/cierres').send({ dia: HOY }).expect(409);
    expect(r.body.errores).toHaveProperty('dia');
    r = await http
      .post('/api/caja/cierres')
      .send({ dia: '2099-01-01' })
      .expect(400);
    expect(r.body.restriccion).toBe('cierre_dia_futuro');
    await http
      .post('/api/caja/cierres')
      .send({ dia: '2026-02-30' })
      .expect(400);
  });

  it('un cobro insertado a mano después del cierre aparece como descuadre', async () => {
    await manual(
      `INSERT INTO cobro (nombre_cliente, servicio_id, total, metodo, pagado)
       VALUES ('Por fuera', (SELECT id FROM servicio WHERE clave = 'corte-normal'), 45, 'efectivo', 45)`,
    );
    const r = await http
      .get('/api/caja/cierres')
      .query({ desde: HOY, hasta: HOY })
      .expect(200);
    expect(r.body[0]).toMatchObject({
      total: 410.5,
      totalActual: 455.5,
      descuadre: 45,
    });
  });
});

describe('Consultas del administrador (database/schemas/consultas.sql)', () => {
  const IDS = [
    'diagnostico',
    'agenda',
    'pagos',
    'carga-empleados',
    'vencidas',
    'clientes-sin-compras',
    'servicios-sin-movimiento',
  ];
  const total = async (tabla: string) =>
    (await sql<{ n: number }>(`SELECT count(*)::int n FROM ${tabla}`))[0].n;
  const consulta = async (id: string, query: Record<string, string> = {}) =>
    (await http.get(`/api/consultas/${id}`).query(query).expect(200))
      .body as Record<string, unknown>[];

  it('lista las 7 consultas', async () => {
    const r = await http.get('/api/consultas').expect(200);
    expect(r.body).toEqual(IDS);
  });

  it('ninguna consulta expone ids internos: solo folios, claves y nombres', async () => {
    for (const id of IDS) {
      const filas = await consulta(id);
      const columnas = Object.keys(filas[0] ?? {});
      expect(
        columnas.filter((c) => c === 'id' || /Id$/.test(c)),
        id,
      ).toEqual([]);
    }
  });

  it('maestra: cada cita cuenta una vez, con nombres legibles y "Sin asignar" para las citas sin empleado', async () => {
    await sql(`UPDATE cita SET empleado_id = NULL WHERE folio = 'A002'`);
    const filas = await consulta('diagnostico');
    const suma = (k: string) => filas.reduce((t, f) => t + (f[k] as number), 0);
    expect(suma('citas')).toBe(await total('cita'));
    expect(
      suma('cobradas') +
        suma('vencidasSinCobro') +
        suma('programadas') +
        suma('canceladas'),
    ).toBe(await total('cita'));
    expect(
      filas.some(
        (f) => f.empleado === 'Sin asignar' && f.empleadoFolio === null,
      ),
    ).toBe(true);
    expect(filas[0]).toHaveProperty('servicio');
    expect(filas[0]).toHaveProperty('servicioClave');
  });

  it('pagos: todos los cobros, incluidas las ventas directas', async () => {
    const filas = await consulta('pagos');
    expect(filas).toHaveLength(await total('cobro'));
    expect(
      filas.some((f) => f.tipo === 'Venta directa' && f.citaFolio === null),
    ).toBe(true);
  });

  it('vencidas: solo citas pasadas sin cobro, con teléfono y días de vencida', async () => {
    const filas = await consulta('vencidas');
    expect(filas.length).toBeGreaterThan(0);
    expect(
      filas.every(
        (f) =>
          (f.fecha as string) < HOY &&
          (f.diasVencida as number) > 0 &&
          /^\d{10}$/.test(f.telefono as string),
      ),
    ).toBe(true);
  });

  it('el periodo filtra; desde > hasta es 400 en "hasta"', async () => {
    const todo = await consulta('agenda');
    const parte = await consulta('agenda', {
      desde: '2025-06-01',
      hasta: '2025-06-30',
    });
    expect(parte.length).toBeGreaterThan(0);
    expect(parte.length).toBeLessThan(todo.length);
    expect(parte.every((f) => (f.fecha as string).startsWith('2025-06'))).toBe(
      true,
    );
    const r = await http
      .get('/api/consultas/agenda')
      .query({ desde: '2025-07-01', hasta: '2025-06-01' })
      .expect(400);
    expect(r.body.errores).toHaveProperty('hasta');
  });

  it('GET :id/sql devuelve el SQL instalado (la maestra incluye sus 3 etapas y situacion_cita)', async () => {
    const r = await http.get('/api/consultas/diagnostico/sql').expect(200);
    expect(r.body.sql).toMatch(/cobros_por_cita/);
    expect(r.body.sql).toMatch(/detalle_operativo/);
    expect(r.body.sql).toMatch(/FUNCTION estetica\.situacion_cita/);
  });

  it('id desconocido → 404; nada de la URL llega al SQL', async () => {
    await http.get('/api/consultas/no-existe').expect(404);
    await http
      .get(
        `/api/consultas/${encodeURIComponent('diagnostico(); DROP TABLE cita; --')}`,
      )
      .expect(404);
    expect(await total('cita')).toBeGreaterThan(0);
  });
});
