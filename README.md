# Estética Miss Name — Full-Stack

Sistema de citas y punto de venta para una estética o barbería, operado por una sola persona en recepción: catálogo, horarios, agenda, verificación, cobro con método de pago, clientes con historial, empleados, reportes de ingresos con auditoría y cierre de caja, y consultas de diagnóstico del negocio.

```
Navegador ──HTTP/JSON──▶ API Node.js ──SQL (pg)──▶ PostgreSQL 18
Angular 22 (puerto 4200)  (puerto 3000)              esquema `estetica`: reglas, triggers,
frontend-angular/         backend/                   funciones y procedimientos — database/
```

## Estructura

```
estetica_FullStack/
├── frontend-angular/            Angular 22: 10 vistas (ver frontend-angular/README.md)
│   ├── src/app/
│   │   ├── core/                config · interceptors · datos · modelos · servicios · util
│   │   ├── layout/              navegación
│   │   ├── compartido/          aviso, errores por campo, pipes, CSV
│   │   ├── paginas/             inicio, servicios, horarios, agendar, verificar, cobrar,
│   │   │                        clientes, empleados, reportes, consultas
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   ├── src/environments/        URL de la API
│   └── src/estilos/             tema por tokens (paleta → semánticos → por área)
│
├── backend/                     API en Node.js (ver backend/README.md)
│   ├── src/
│   │   ├── main.ts · app.module.ts
│   │   ├── config/  controllers/  services/  repositories/
│   │   ├── dto/  modules/  middleware/  common/
│   ├── test/                    50 pruebas e2e contra PostgreSQL embebido
│   ├── postman/                 colección de referencia
│   └── .env.example
│
├── database/                    PostgreSQL 18 (ver database/README.md)
│   ├── instalar.sql  schema.sql  seed.sql  seed-historico.sql  validar-esquema.sql
│   ├── schemas/                 auditoria-reportes.sql · consultas.sql
│   └── csv/                     datos realistas + importar-csv.sql
│
├── docs/                        bitácoras de cada fase del proyecto
├── iniciar.ps1                  abre la API y Angular en dos ventanas (Windows)
└── README.md
```

## Requisitos

| Herramienta | Versión |
|---|---|
| PostgreSQL | **18** (compatible desde la 14) |
| Node.js | `^22.22.3`, `^24.15.0` o `>=26` (lo exige Angular 22) |
| npm | el que trae Node. No hace falta instalar Angular CLI ni otra herramienta de forma global |

## Instalación (una sola vez)

**1. Base de datos**, desde `database/`:

```powershell
cd database
$env:PGCLIENTENCODING = "UTF8"
chcp 1252
createdb -U postgres estetica
psql -U postgres -d estetica -f instalar.sql
psql -U postgres -d estetica -f csv/importar-csv.sql      # opcional: datos realistas
psql -U postgres -d estetica -f seed-historico.sql        # opcional: ~8 meses para Reportes
```

**2. API**, desde `backend/`:

```powershell
cd ..\backend
npm install
copy .env.example .env      # escribe tu contraseña en PGPASSWORD (y PGPORT si tu PostgreSQL 18 no usa 5432)
```

**3. Angular**, desde `frontend-angular/`:

```powershell
cd ..\frontend-angular
npm install
```

## Ejecución

Dos terminales:

| Terminal | Carpeta | Comando | Dirección |
|---|---|---|---|
| 1 | `backend/` | `npm run start:dev` | `http://localhost:3000/api` |
| 2 | `frontend-angular/` | `npm start` | `http://localhost:4200` |

O, en Windows, desde la raíz: `powershell -ExecutionPolicy Bypass -File .\iniciar.ps1` (abre las dos ventanas).

Para una versión compilada: `npm run build` y `npm run start:prod` en `backend/`; `npm run build` en `frontend-angular/` genera `dist/frontend-angular/browser`, que puede servir cualquier servidor web estático.

**CORS:** si cambias el puerto o el dominio de Angular, agrégalo a `CORS_ORIGIN` en `backend/.env`. Si falta, la página dice "No hay conexión con el servidor" y la terminal de la API muestra `WARN [CORS] Origen bloqueado: …` con el origen exacto.

## Pruebas

| Capa | Dónde | Comando | Resultado |
|---|---|---|---|
| Base de datos | `database/` | `psql -U postgres -d estetica_prueba -f validar-esquema.sql` | 46 reglas |
| API unitarias | `backend/` | `npm test` | 5 |
| API e2e | `backend/` | `npm run test:e2e` | 50 escenarios HTTP contra PostgreSQL embebido |
| Angular | `frontend-angular/` | `npm test` | 101 |
| Colección Postman | `backend/postman/` | Newman o Postman | 36 peticiones, 61 comprobaciones |

Las 10 vistas también se probaron en un navegador real (Playwright) contra la API y PostgreSQL 18.6: 164 comprobaciones. Esos scripts no forman parte del proyecto.

## Decisiones de arquitectura

1. **Las reglas críticas viven en la base:** horario laboral, domingos cerrados, sábado hasta las 14:00 y **un solo turno activo por fecha y hora (índice único parcial)**. Dos personas no pueden agendar el mismo turno aunque lo intenten al mismo tiempo.
2. **Las reglas que dependen de "hoy" viven en la API** (no agendar en el pasado, fecha de ingreso no futura), porque un `CHECK` no puede usar la fecha actual. "Hoy" se calcula en `America/Mexico_City`.
3. **El front no decide reglas: pregunta y muestra.** Los errores llegan como `{ mensaje, errores: { campo } }` y Angular los pinta en su campo.
4. **Sin borrados en cascada y con bajas lógicas** de clientes, empleados y servicios. El historial nunca se pierde.
5. **Precio congelado:** cita y cobro guardan el precio del momento.
6. **Transacciones:** agendar (alta del cliente + cita) y cobrar (cobro + cita terminada, con `FOR UPDATE`).
7. **Sin pasarela de pago ni roles:** punto de venta con un solo operador. El cobro registra el método (efectivo, tarjeta o transferencia).
8. **Arquitectura dimensionada:** MVC en Angular (sin store global); controller → service → repository en la API. Hexagonal no se justifica con un solo adaptador de datos.
9. **La auditoría vive en la base, con triggers:** registra *todos* los cambios, incluidos los hechos a mano en psql (quedan como `manual`). Los triggers **solo auditan**.
10. **Reportes como funciones, cierre como procedimiento:** un reporte lee (`FUNCTION … RETURNS TABLE`); el cierre de caja escribe un registro contable y bloquea la tabla de cobros mientras suma (`PROCEDURE`, con `CALL`). Se reporta **ingresos**, no ganancias.

## Limitaciones conocidas

- **Sin autenticación:** es un sistema de un solo operador. Antes de exponerlo en red, la API necesita autenticación (empezando por el cierre de caja y la edición de precios).
- **Los folios pueden saltarse números** cuando una inserción se rechaza.
- **Todos los servicios duran un turno de 30 minutos** y los empleados aún no se asignan a las citas.
- **La tabla de auditoría no está protegida contra su propio borrado:** requeriría roles de PostgreSQL.
- **El precio se edita por API** (`PATCH /api/servicios/:clave/costo`, auditado); la vista Servicios todavía no tiene el control para hacerlo.

## Historia del proyecto

1. **Recuperación** del front original (HTML, CSS y JS con errores en 5 de 8 archivos y PHP vacío) en MVC nativo — `docs/01`.
2. **Vistas nuevas** Clientes y Empleados y tema visual por tokens — `docs/02`.
3. **Full-stack:** esquema PostgreSQL, API en Node.js y conexión del front a la API — `docs/03`.
4. **Migración a Angular** por fases — `docs/04` (análisis) y `docs/05` (arquitectura).
5. **SQL avanzado:** auditoría por triggers, reportes con funciones de ventana, cierre de caja; vistas Reportes y Consultas.
6. **Versión final:** las 10 vistas en Angular, el front nativo retirado, backend organizado por capas, base en `database/` y PostgreSQL 18.
