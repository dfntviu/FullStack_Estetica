// Pruebas e2e: API completa (HTTP) contra PostgreSQL real con database/schema.sql + seed.sql + auditoria-reportes.sql.
// Usa PGlite (PostgreSQL compilado a WebAssembly) expuesto por socket con el protocolo de
// PostgreSQL, así que `pg` se conecta exactamente igual que a un servidor instalado.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';

const PUERTO_PG = 54329;
let db: PGlite;
let servidorPg: PGLiteSocketServer;
let app: INestApplication<App>;
let http: ReturnType<typeof request>;

/** Próxima fecha (AAAA-MM-DD) con ese día ISO (1 = lunes … 7 = domingo), al menos a 7 días. */
function proximo(isoDow: number, semanasExtra = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 + semanasExtra * 7);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoDow) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const MARTES = proximo(2);
const MIERCOLES = proximo(3);
const JUEVES = proximo(4);
const SABADO = proximo(6);
const DOMINGO = proximo(7);

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync(resolve('../database/schema.sql'), 'utf8'));
  await db.exec(readFileSync(resolve('../database/seed.sql'), 'utf8'));
  await db.exec(readFileSync(resolve('../database/schemas/auditoria-reportes.sql'), 'utf8')); // triggers activos, como en la base real
  servidorPg = new PGLiteSocketServer({ db, port: PUERTO_PG, host: '127.0.0.1' });
  await servidorPg.start();

  Object.assign(process.env, {
    PGHOST: '127.0.0.1',
    PGPORT: String(PUERTO_PG),
    PGUSER: 'postgres',
    PGDATABASE: 'postgres',
    PG_POOL_MAX: '1', // PGlite atiende una conexión a la vez
  });
  const { AppModule } = await import('../src/app.module.js');
  const { configurarApp } = await import('../src/config/configurar-app.js');
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

describe('Servicios', () => {
  it('lista el catálogo activo', async () => {
    const r = await http.get('/api/servicios').expect(200);
    expect(r.body).toHaveLength(10);
    expect(r.body[0]).toEqual({ clave: 'corte-normal', nombre: 'Corte Normal', costo: 45, imagen: '../assets/img/Img.vect-01.jpg' });
  });
});

describe('Clientes', () => {
  it('lista los activos y busca sin acentos o por teléfono', async () => {
    expect((await http.get('/api/clientes').expect(200)).body).toHaveLength(8);
    const gomez = await http.get('/api/clientes').query({ texto: 'GOMEZ' }).expect(200);
    expect(gomez.body.map((c: { folio: string }) => c.folio).sort()).toEqual(['C001', 'C005']);
    const tel = await http.get('/api/clientes').query({ texto: '000 0005' }).expect(200);
    expect(tel.body[0].nombre).toBe('Marcela Gómez');
  });

  it('no expone el id interno, solo el folio', async () => {
    const r = await http.get('/api/clientes/c001').expect(200);
    expect(r.body).not.toHaveProperty('id');
    expect(r.body).toMatchObject({ folio: 'C001', nombre: 'María Gómez', cumpleanos: '14/02', fechaRegistro: '2025-03-01' });
  });

  it('valida los campos y responde errores por campo', async () => {
    const r = await http.post('/api/clientes').send({ nombre: 'A', telefono: '12', cumpleanos: '31-02', extra: 1 }).expect(400);
    expect(Object.keys(r.body.errores).sort()).toEqual(['cumpleanos', 'extra', 'nombre', 'telefono']);
  });

  it('cumpleaños: rechaza días que no existen (31/02, 31/04) y acepta 29/02 y 31/12', async () => {
    for (const malo of ['31/02', '30/02', '31/04', '00/01', '14-02']) {
      const r = await http.post('/api/clientes').send({ nombre: 'Prueba Fecha', telefono: '7228880000', cumpleanos: malo }).expect(400);
      expect(r.body.errores).toHaveProperty('cumpleanos');
    }
    for (const bueno of ['29/02', '31/12', '30/11']) {
      const r = await http.put('/api/clientes/C008').send({ nombre: 'Salomon Grijalbo', telefono: '7220000008', cumpleanos: bueno }).expect(200);
      expect(r.body.cumpleanos).toBe(bueno);
    }
    await http.put('/api/clientes/C008').send({ nombre: 'Salomon Grijalbo', telefono: '7220000008' }).expect(200);
  });

  it('registra, rechaza teléfono duplicado (restricción de la base) y edita', async () => {
    const r = await http.post('/api/clientes').send({ nombre: '  Ana López ', telefono: '722-123-4567', cumpleanos: '05/11', observaciones: '' }).expect(201);
    expect(r.body).toMatchObject({ folio: 'C009', nombre: 'Ana López', telefono: '7221234567', observaciones: null, activo: true });

    const dup = await http.post('/api/clientes').send({ nombre: 'Otra Persona', telefono: '7220000001' }).expect(409);
    expect(dup.body).toMatchObject({ restriccion: 'cliente_telefono_key', errores: { telefono: expect.any(String) } });

    const e = await http.put('/api/clientes/C009').send({ nombre: 'Ana López R.', telefono: '7221234567', observaciones: 'Rubio cenizo 9.1' }).expect(200);
    expect(e.body).toMatchObject({ nombre: 'Ana López R.', observaciones: 'Rubio cenizo 9.1', cumpleanos: null });
  });

  it('baja lógica y reactivación', async () => {
    await http.patch('/api/clientes/C003/baja').expect(200);
    await http.patch('/api/clientes/C003/baja').expect(409);
    expect((await http.get('/api/clientes').expect(200)).body.some((c: { folio: string }) => c.folio === 'C003')).toBe(false);
    expect((await http.get('/api/clientes').query({ incluirInactivos: 'true' })).body.some((c: { folio: string }) => c.folio === 'C003')).toBe(true);
    await http.patch('/api/clientes/C003/reactivar').expect(200);
    await http.patch('/api/clientes/C999/baja').expect(404);
  });

  it('historial de María Gómez: sus dos citas', async () => {
    const r = await http.get('/api/clientes/C001/historial').expect(200);
    expect(r.body.cliente.folio).toBe('C001');
    expect(r.body.citas.map((c: { folio: string }) => c.folio)).toEqual(['A007', 'A001']);
    expect(r.body).toMatchObject({ totalCitas: 2, totalGastado: 0, servicioFrecuente: 'Tinte Permanente' });
  });
});

describe('Empleados', () => {
  it('lista, registra y rechaza fecha de ingreso futura', async () => {
    expect((await http.get('/api/empleados').expect(200)).body).toHaveLength(2);
    const futura = await http.post('/api/empleados').send({ nombre: 'Karla Núñez', telefono: '7221110003', fechaIngreso: '2099-01-01' }).expect(400);
    expect(futura.body.errores.fechaIngreso).toMatch(/futura/);
    const r = await http.post('/api/empleados').send({ nombre: 'Karla Núñez', telefono: '7221110003', fechaIngreso: '2026-10-01' }).expect(201);
    expect(r.body).toMatchObject({ folio: 'E003', fechaIngreso: '2026-10-01', activo: true });
  });

  it('teléfono único, baja lógica y filtros por estado', async () => {
    await http.put('/api/empleados/E002').send({ nombre: 'Héctor Salinas', telefono: '7221110001', fechaIngreso: '2024-08-01' }).expect(409);
    await http.patch('/api/empleados/E002/baja').expect(200);
    expect((await http.get('/api/empleados').query({ estado: 'inactivos' })).body.map((e: { folio: string }) => e.folio)).toEqual(['E002']);
    expect((await http.get('/api/empleados').query({ estado: 'todos' })).body).toHaveLength(3);
    await http.get('/api/empleados').query({ estado: 'otro' }).expect(400);
  });
});

describe('Citas', () => {
  it('disponibilidad: 20 turnos entre semana, sábado hasta 14:00, domingo y pasado con motivo', async () => {
    expect((await http.get('/api/citas/disponibilidad').query({ fecha: MARTES })).body.horarios).toHaveLength(20);
    expect((await http.get('/api/citas/disponibilidad').query({ fecha: SABADO })).body.horarios.at(-1)).toBe('14:00');
    expect((await http.get('/api/citas/disponibilidad').query({ fecha: DOMINGO })).body.motivo).toMatch(/domingos/);
    expect((await http.get('/api/citas/disponibilidad').query({ fecha: '2025-04-10' })).body.motivo).toMatch(/pasadas/);
  });

  it('agendar con teléfono nuevo registra al cliente', async () => {
    const r = await http.post('/api/citas').send({ telefono: '7229998888', cliente: 'Pedro Nuevo', servicio: 'corte-normal', fecha: MARTES, hora: '10:00' }).expect(201);
    expect(r.body.clienteNuevo).toBe(true);
    // C010 lo gastó el registro duplicado rechazado más arriba: los folios pueden tener huecos
    expect(r.body.cita).toMatchObject({ folio: 'A010', clienteFolio: 'C011', nombre: 'Pedro Nuevo', servicio: 'Corte Normal', precio: 45, estado: 'pendiente', hora: '10:00' });
    expect((await http.get('/api/citas/disponibilidad').query({ fecha: MARTES })).body.horarios).not.toContain('10:00');
  });

  it('el mismo turno lo rechaza la base (índice único parcial)', async () => {
    const r = await http.post('/api/citas').send({ telefono: '7220000002', cliente: 'Carlos Pérez', servicio: 'corte-normal', fecha: MARTES, hora: '10:00' }).expect(409);
    expect(r.body).toMatchObject({ restriccion: 'cita_turno_activo_unico', errores: { hora: expect.stringMatching(/ocupado/) } });
  });

  it('dos peticiones simultáneas al mismo turno: solo una entra', async () => {
    const cuerpo = (tel: string) => ({ telefono: tel, cliente: 'Concurrente', servicio: 'corte-normal', fecha: MIERCOLES, hora: '12:00' });
    const [a, b] = await Promise.all([http.post('/api/citas').send(cuerpo('7220000003')), http.post('/api/citas').send(cuerpo('7220000004'))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('teléfono existente reutiliza al cliente con su nombre registrado (sin gastar folios)', async () => {
    const r = await http.post('/api/citas').send({ telefono: '7220000001', cliente: 'Mari', servicio: 'tinte-permanente', fecha: MARTES, hora: '11:00' }).expect(201);
    expect(r.body.clienteNuevo).toBe(false);
    expect(r.body.cita).toMatchObject({ clienteFolio: 'C001', nombre: 'María Gómez', precio: 430 });
    const nuevo = await http.post('/api/clientes').send({ nombre: 'Folio Siguiente', telefono: '7224440000' }).expect(201);
    expect(nuevo.body.folio).toBe('C012'); // reutilizar a C001 no consumió ningún número
  });

  it('reglas de la base: domingo, sábado tarde, 10:15; reglas de la API: fecha pasada', async () => {
    const base = { telefono: '7220000002', cliente: 'Carlos Pérez', servicio: 'corte-normal' };
    expect((await http.post('/api/citas').send({ ...base, fecha: DOMINGO, hora: '10:00' }).expect(400)).body.restriccion).toBe('cita_no_domingo');
    expect((await http.post('/api/citas').send({ ...base, fecha: SABADO, hora: '15:00' }).expect(400)).body.restriccion).toBe('cita_sabado_temprano');
    expect((await http.post('/api/citas').send({ ...base, fecha: MARTES, hora: '10:15' }).expect(400)).body.restriccion).toBe('cita_turno_media_hora');
    expect((await http.post('/api/citas').send({ ...base, fecha: '2025-04-10', hora: '10:00' }).expect(400)).body.errores.fecha).toMatch(/pasadas/);
    await http.post('/api/citas').send({ ...base, servicio: 'no-existe', fecha: MARTES, hora: '12:00' }).expect(400);
  });

  it('el nombre solo es obligatorio si el teléfono no está registrado', async () => {
    const existente = await http.post('/api/citas').send({ telefono: '7220000007', servicio: 'corte-normal', fecha: JUEVES, hora: '12:00' }).expect(201);
    expect(existente.body.cita.nombre).toBe('Luis Garza');
    const nuevo = await http.post('/api/citas').send({ telefono: '7225551111', servicio: 'corte-normal', fecha: JUEVES, hora: '12:30' }).expect(400);
    expect(nuevo.body.errores.cliente).toMatch(/no registrado/);
  });

  it('si la cita falla, no queda un cliente huérfano (ROLLBACK)', async () => {
    await http.post('/api/citas').send({ telefono: '7225550000', cliente: 'Sin Cita', servicio: 'corte-normal', fecha: DOMINGO, hora: '10:00' }).expect(400);
    await http.get('/api/clientes/telefono/7225550000').expect(404);
  });

  it('busca por folio, nombre sin acentos y teléfono', async () => {
    expect((await http.get('/api/citas').query({ buscar: 'a001' })).body.map((c: { folio: string }) => c.folio)).toEqual(['A001']);
    expect((await http.get('/api/citas').query({ buscar: 'maria gomez' })).body.length).toBeGreaterThanOrEqual(3);
    expect((await http.get('/api/citas').query({ buscar: '722 999 8888' })).body[0].folio).toBe('A010');
  });

  it('confirmar y cancelar respetan las transiciones; cancelar libera el turno', async () => {
    expect((await http.patch('/api/citas/A010/confirmar').expect(200)).body.estado).toBe('confirmada');
    await http.patch('/api/citas/A010/confirmar').expect(409);
    await http.patch('/api/citas/A009/cancelar').expect(409); // terminada
    await http.patch('/api/citas/A999/cancelar').expect(404);
    const c = await http.post('/api/citas').send({ telefono: '7220000006', cliente: 'Roberto Pérez', servicio: 'barba-normal', fecha: JUEVES, hora: '09:00' }).expect(201);
    await http.patch(`/api/citas/${c.body.cita.folio}/cancelar`).expect(200);
    expect((await http.get('/api/citas/disponibilidad').query({ fecha: JUEVES })).body.horarios).toContain('09:00');
  });
});

describe('Cobros', () => {
  it('efectivo insuficiente: 400 y la cita sigue sin cobrar (ROLLBACK)', async () => {
    const r = await http.post('/api/cobros').send({ citaFolio: 'A010', metodo: 'efectivo', pagado: 10 }).expect(400);
    expect(r.body).toMatchObject({ restriccion: 'cobro_monto_valido', errores: { pagado: expect.any(String) } });
    expect((await http.get('/api/citas/A010')).body.estado).toBe('confirmada');
  });

  it('tarjeta exacta y transferencia con referencia', async () => {
    await http.post('/api/cobros').send({ citaFolio: 'A010', metodo: 'tarjeta', pagado: 50 }).expect(400);
    const sinRef = await http.post('/api/cobros').send({ citaFolio: 'A010', metodo: 'transferencia', pagado: 45 }).expect(400);
    expect(sinRef.body.restriccion).toBe('cobro_referencia_transferencia');
  });

  it('cobra la cita con su precio congelado y la marca terminada', async () => {
    const r = await http.post('/api/cobros').send({ citaFolio: 'a010', metodo: 'efectivo', pagado: 100 }).expect(201);
    expect(r.body).toMatchObject({ citaFolio: 'A010', clienteFolio: 'C011', cliente: 'Pedro Nuevo', total: 45, pagado: 100, cambio: 55, metodo: 'efectivo' });
    expect(r.body.folio).toMatch(/^V\d{4}$/);
    expect((await http.get('/api/citas/A010')).body.estado).toBe('terminada');
    const otra = await http.post('/api/cobros').send({ citaFolio: 'A010', pagado: 100 }).expect(409);
    expect(otra.body.errores.citaFolio).toMatch(/terminada/);
  });

  it('si el precio del servicio cambia, la cita conserva el suyo', async () => {
    await db.exec(`UPDATE estetica.servicio SET costo = 999 WHERE clave = 'tinte-permanente'`);
    const cita = (await http.get('/api/citas').query({ buscar: 'maria gomez' })).body.find(
      (c: { fecha: string; hora: string }) => c.fecha === MARTES && c.hora === '11:00',
    );
    const r = await http.post('/api/cobros').send({ citaFolio: cita.folio, metodo: 'transferencia', pagado: 430, referencia: 'SPEI-001' }).expect(201);
    expect(r.body.total).toBe(430);
  });

  it('cliente de paso y cliente registrado sin cita', async () => {
    const paso = await http.post('/api/cobros').send({ cliente: 'Cliente de Paso', servicio: 'barba-hipster', metodo: 'efectivo', pagado: 400 }).expect(201);
    expect(paso.body).toMatchObject({ clienteFolio: null, total: 380, cambio: 20 });
    const reg = await http.post('/api/cobros').send({ telefono: '7220000005', servicio: 'corte-personalizado', metodo: 'tarjeta', pagado: 60 }).expect(201);
    expect(reg.body).toMatchObject({ clienteFolio: 'C005', cliente: 'Marcela Gómez' });
    await http.post('/api/cobros').send({ pagado: 100 }).expect(400); // sin cita, sin cliente ni servicio
  });

  it('el historial refleja lo gastado y el corte de caja suma por método', async () => {
    expect((await http.get('/api/clientes/C001/historial')).body.totalGastado).toBe(430);
    const corte = await http.get('/api/cobros/corte').expect(200);
    expect(corte.body).toMatchObject({ cobros: 4, total: 45 + 430 + 380 + 60 });
    expect(corte.body.porMetodo.map((m: { metodo: string }) => m.metodo)).toEqual(['efectivo', 'tarjeta', 'transferencia']);
    expect((await http.get('/api/cobros').expect(200)).body).toHaveLength(4);
  });
});
