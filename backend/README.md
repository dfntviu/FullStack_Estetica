# API — Citas Estética Miss Name (Node.js + PostgreSQL 18)

Backend del sistema: **Angular (`../frontend-angular`, puerto 4200) → esta API (Node.js, puerto 3000) → PostgreSQL 18** (`../database`).
Corre sobre Node.js con el framework NestJS (controladores, inyección de dependencias y validación).
El acceso a datos usa **SQL escrito a mano con `pg`**, sin ORM. Así se aprovechan directamente las reglas de `../database/schema.sql`: restricciones `CHECK`, índice único parcial y vistas.

## Requisitos

- Node.js 22.12 o superior.
- PostgreSQL 18 con la base instalada (ver `../database/README.md`).

## Puesta en marcha

```powershell
cd backend
npm install
copy .env.example .env        # y escribe tu contraseña en PGPASSWORD
npm run start:dev             # http://localhost:3000/api
```

`.npmrc` incluye `legacy-peer-deps=true`. Con un `npm install` normal, npm 10 falla con *"Cannot read properties of null (reading 'edgesOut')"* por un conflicto de dependencias entre las herramientas del proyecto generado por NestJS 12.

Prueba rápida en el navegador: `http://localhost:3000/api/servicios`

**CORS:** `CORS_ORIGIN` en `.env` debe incluir la dirección exacta del front, **con puerto**. Por defecto es `http://localhost:4200` (Angular). Si falta, la página dice "No hay conexión con el servidor" aunque la API funcione, y la terminal de la API muestra `WARN [CORS] Origen bloqueado: …` con el origen que hay que agregar.

## Pruebas

```powershell
npm test            # 5 pruebas unitarias (reglas de agenda y zona horaria)
npm run test:e2e    # 50 pruebas de la API completa contra PostgreSQL (26 generales + 16 de auditoría, reportes y caja + 8 de consultas)
```

Las pruebas e2e **no usan tu base**. Levantan un PostgreSQL embebido (PGlite) con los archivos de `../database/`, y `pg` se conecta a él por el protocolo normal de PostgreSQL. Se pueden ejecutar en cualquier equipo y no tocan tus datos.

## Arquitectura

El código se organiza **por capa**. En la raíz de `src/` solo quedan los dos puntos de entrada:

```
src/
├─ main.ts                  arranca Node.js en el puerto 3000
├─ app.module.ts            registra los módulos
├─ config/                  configurar-app.ts (prefijo /api, validación, filtro de errores, CORS)
│                           database.service.ts / database.module.ts (pool de pg + transaccion())
├─ controllers/             rutas HTTP (servicios, clientes, empleados, citas, cobros,
│                           reportes, caja, consultas, salud)
├─ services/                reglas que dependen de "hoy", coordinación y transacciones
├─ repositories/            el SQL (parametrizado, sin ORM)
├─ dto/                     validación de entrada con class-validator
├─ modules/                 un módulo por recurso: une su controller, service y repository
├─ middleware/              errores-pg.filter.ts (restricción de PostgreSQL → HTTP + campo), validacion.ts
└─ common/                  agenda ("hoy" en America/Mexico_City), periodo, transformaciones
```

Flujo de una petición: **controller → service → repository → PostgreSQL**. Hexagonal no se justifica: hay un solo adaptador de datos y las reglas viven sobre todo en la base. Servicios, caja y consultas no tienen service: el controller llama directo a su repository porque no hay reglas que coordinar.

### Decisiones relevantes

1. **Los errores se traducen por nombre de restricción, no por texto.** El filtro usa `error.code` y `error.constraint`, por ejemplo `cita_turno_activo_unico` → 409 *"Ese horario ya está ocupado"*. No depende del idioma ni de la codificación del servidor, así que no le afecta el `restricciÃ³n` que viste en Windows.
2. **Las respuestas de error tienen una sola forma:** `{ mensaje, errores: { campo: texto } }`. Angular (`ErroresServidor`) marca cada campo sin conocer las reglas.
3. **Transacciones donde hay más de una escritura:**
   - **Agendar:** busca o registra al cliente por teléfono y crea la cita. Si la base rechaza la cita, el `ROLLBACK` deshace también el alta del cliente, así que no quedan clientes sin cita.
   - **Cobrar una cita:** `SELECT … FOR UPDATE` bloquea la cita para que dos cajas no la cobren a la vez. Se toma el **precio congelado** de la cita, se inserta el cobro y la cita pasa a `terminada`.
4. **Reglas que dependen de la fecha actual en la API:** no agendar en el pasado ni en un horario de hoy que ya pasó, y no registrar una fecha de ingreso futura. Un `CHECK` de PostgreSQL no puede usar `current_date`. "Hoy" se calcula en `America/Mexico_City`, no en la zona del servidor.
5. **Hacia afuera, los registros se identifican por folio** (C001, E001, A001, V0001). Los ids internos nunca salen de la API.
6. **Reconocer a un cliente al agendar no gasta folios.** Primero se hace `UPDATE … WHERE telefono` y solo se inserta si el cliente no existe. Un `INSERT … ON CONFLICT` habría consumido un número de folio en cada cita de un cliente recurrente.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/servicios` | Catálogo activo |
| GET | `/api/clientes?texto=&incluirInactivos=true` | Listar y buscar (nombre sin acentos o teléfono) |
| GET | `/api/clientes/telefono/:telefono` | Reconocer al cliente al agendar (404 si no existe) |
| GET | `/api/clientes/:folio` | Detalle |
| GET | `/api/clientes/:folio/historial` | Total de citas, total gastado, última visita, próxima cita, servicio frecuente y lista de citas |
| POST | `/api/clientes` | Registrar `{ nombre, telefono, cumpleanos?, observaciones? }` |
| PUT | `/api/clientes/:folio` | Editar |
| PATCH | `/api/clientes/:folio/baja` · `/reactivar` | Baja lógica y reactivación |
| GET | `/api/empleados?texto=&estado=activos\|inactivos\|todos` | Listar y buscar |
| GET · POST · PUT | `/api/empleados[/:folio]` | Detalle, registrar `{ nombre, telefono, fechaIngreso }` y editar |
| PATCH | `/api/empleados/:folio/baja` · `/reactivar` | Baja lógica y reactivación |
| GET | `/api/citas?buscar=` | Buscar por folio, nombre o teléfono |
| GET | `/api/citas/disponibilidad?fecha=AAAA-MM-DD` | `{ horarios, motivo }` |
| GET | `/api/citas/:folio` | Detalle |
| POST | `/api/citas` | Agendar `{ telefono, cliente?, servicio, fecha, hora, empleado? }` → `{ cita, clienteNuevo }`. `cliente` (nombre) solo es obligatorio si el teléfono no está registrado |
| PATCH | `/api/citas/:folio/confirmar` · `/cancelar` | Cambios de estado válidos (409 si no aplica) |
| POST | `/api/cobros` | Con `citaFolio`: cobra la cita. Sin él: cliente de paso (`cliente` o `telefono`, más `servicio`). Además `{ metodo, pagado, referencia? }` |
| GET | `/api/cobros?dia=` | Cobros del día (por defecto, hoy) |
| GET | `/api/cobros/corte?dia=` | Corte de caja por método de pago |
| PATCH | `/api/servicios/:clave/costo` | Cambiar el precio `{ costo }`. Los cobros pasados conservan su precio; el cambio queda en la auditoría |
| GET | `/api/reportes/ingresos?desde=&hasta=` | `{ resumen, porDia, porServicio, porMetodo }`. El resumen se compara con el periodo anterior de la misma duración |
| GET | `/api/reportes/costos?desde=&hasta=` | Cambios de precio, con variación y origen (`sistema` o `manual`) |
| GET | `/api/reportes/clientes?desde=&hasta=` | `{ resumen: { altas, bajas, reactivaciones }, movimientos }` |
| POST | `/api/caja/cierres` | Cerrar la caja de un día `{ dia }`. Después, la API rechaza cobros de ese día (409) |
| GET | `/api/caja/cierres?desde=&hasta=` | Cierres, con `descuadre` si se agregaron cobros por fuera después del cierre |

Los reportes aceptan periodos de hasta 366 días (`desde` y `hasta` incluidos).

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/consultas` | Las 7 consultas disponibles |
| GET | `/api/consultas/:id?desde=&hasta=` | Filas de una consulta: `diagnostico`, `agenda`, `pagos`, `carga-empleados`, `vencidas`, `clientes-sin-compras`, `servicios-sin-movimiento`. El periodo es opcional (sin `hasta` incluye las citas programadas) |
| GET | `/api/consultas/:id/sql` | El SQL instalado que produce esa consulta (`pg_get_functiondef`) |

Cada id corresponde a una función de `../database/schemas/consultas.sql` por medio de una lista blanca: nada de la URL llega al SQL.

### Ejemplo de error

```http
POST /api/citas  { "telefono": "7220000002", "cliente": "Carlos", "servicio": "corte-normal", "fecha": "2026-11-10", "hora": "10:00" }
409 { "mensaje": "Ese horario ya está ocupado. Elige otro.",
      "errores": { "hora": "Ese horario ya está ocupado. Elige otro." },
      "restriccion": "cita_turno_activo_unico" }
```

## Limitaciones conscientes

- **Sin autenticación ni roles.** Es un punto de venta con un solo operador. Las credenciales de la base viven solo en `.env`.
- **Los folios pueden tener huecos.** Si un `INSERT` falla (domingo, turno ocupado…), PostgreSQL ya consumió el número. Ver `../database/README.md`.
