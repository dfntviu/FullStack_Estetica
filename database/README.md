# Base de datos — PostgreSQL 18

Modelo de datos y reglas del sistema. Lo usan la API (`../backend`) y sus pruebas e2e. Probado en **PostgreSQL 18.6**; compatible desde la 14.

```
database/
├── instalar.sql            instala todo en orden (los 4 archivos de abajo)
├── schema.sql              tipos, tablas, restricciones, índices y vistas
├── seed.sql                datos de ejemplo mínimos (C001…, E001…, A001…A009)
├── seed-historico.sql      opcional: ~8 meses de cobros, precios, altas/bajas y cierres
├── validar-esquema.sql     46 pruebas de las reglas (en una base de PRUEBA, termina en ROLLBACK)
├── schemas/
│   ├── auditoria-reportes.sql   auditoría con triggers, reportes de ingresos y cierre de caja
│   └── consultas.sql            funciones de la vista Consultas (maestra + 6 de detalle)
├── csv/                    130 clientes, 40 empleados, 35 servicios, 125 citas y 125 cobros + importar-csv.sql
└── diagrama-er.png / .mmd  diagrama entidad-relación
```

| Archivo | Contenido |
|---|---|
| `schema.sql` | Tipos, tablas, restricciones, índices y vistas. **Empieza con `DROP SCHEMA estetica CASCADE`**: borra los datos de ese esquema. |
| `seed.sql` | Datos de ejemplo. Los folios coinciden con las pruebas: C001…, E001…, A001…A009. |
| `schemas/auditoria-reportes.sql` | Auditoría (1 tabla genérica jsonb, 1 función de trigger, 2 triggers, 2 vistas), 4 funciones de ingresos y el cierre de caja (tabla, procedimiento y vista). Va **después** de `seed.sql`; no borra datos y se puede volver a ejecutar. |
| `schemas/consultas.sql` | 7 funciones: la **maestra** (diagnóstico por empleado y servicio, en 3 etapas con CTE) y 6 de detalle (agenda, pagos, carga por empleado, citas vencidas, clientes sin compras con `EXCEPT`, servicios sin movimiento con `NOT EXISTS`). Nunca devuelven ids internos. Va después de `auditoria-reportes.sql`. |
| `seed-historico.sql` | Opcional, para desarrollo: historia relativa a hoy. No se repite si ya se aplicó. |
| `csv/` | Datos a escala realista; `importar-csv.sql` los carga con llaves naturales y tablas staging (ver `csv/README.md`). |
| `validar-esquema.sql` | Intenta violar cada regla y comprueba que la base responda con la restricción exacta. Identifica los errores por SQLSTATE y nombre de restricción, así que funciona igual con un servidor en español o en inglés. |

## Cómo instalarla

Todos los comandos se ejecutan **desde esta carpeta** (`database/`), en PowerShell:

```powershell
$env:PGCLIENTENCODING = "UTF8"
chcp 1252                                              # acentos correctos en la consola de Windows
createdb -U postgres estetica
psql -U postgres -d estetica -f instalar.sql           # schema + seed + auditoría/reportes + consultas

# Opcional, según para qué la quieras:
psql -U postgres -d estetica -f csv/importar-csv.sql   # datos realistas (130 clientes…)
psql -U postgres -d estetica -f seed-historico.sql     # ~8 meses de historia para Reportes
```

Comprobación: `psql -U postgres -d estetica -c "\df estetica.fn_*"` lista las funciones de reportes y consultas.

**¿Ya tienes la base con datos?** No ejecutes `instalar.sql` (borraría el esquema). Aplica solo `schemas/auditoria-reportes.sql` y después `schemas/consultas.sql`: no borran nada.

## Validar las reglas

```powershell
createdb -U postgres estetica_prueba                   # solo la primera vez
psql -U postgres -d estetica_prueba -f validar-esquema.sql
```

Muestra una tabla de 46 filas PASS/FAIL y termina con `Resultado: 46 de 46 pruebas en PASS`. Todo ocurre dentro de una transacción que termina en `ROLLBACK`, y el script se niega a correr sobre la base `estetica`.

## Pasar de una versión anterior a PostgreSQL 18

Las versiones 14.x anteriores a 2022 aplican horario de verano a `America/Mexico_City` (México lo eliminó en 2022); PostgreSQL 18 ya trae la regla correcta. Para llevar tu base:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"   -U postgres -p 5432 -Fc -d estetica -f estetica.dump
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe"  -U postgres -p 5433 estetica
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U postgres -p 5433 -d estetica estetica.dump
```

(5432 = la versión anterior, 5433 = la 18; ajusta `PGPORT` en `backend/.env`). Comprobación: `SELECT timestamptz '2026-07-01 18:00Z' AT TIME ZONE 'America/Mexico_City';` debe dar `12:00:00`.

## Auditoría, reportes y cierre de caja (`schemas/auditoria-reportes.sql`)

| Objeto | Tipo | Para qué |
|---|---|---|
| `auditoria` | tabla | Historial **genérico**: una fila por cambio, con la fila completa antes y después en `jsonb`, el origen (`sistema` = la API, `manual` = psql u otra herramienta) y el momento |
| `fn_auditar()` | función de trigger | Una sola función para cualquier tabla (`TG_TABLE_NAME`, `TG_OP`, `OLD`/`NEW`, `TG_ARGV`) |
| `trg_servicio_costo` | trigger | Cambios de precio (`AFTER UPDATE OF costo … WHEN (OLD.costo IS DISTINCT FROM NEW.costo)`) |
| `trg_cliente_estado` | trigger | Altas, bajas y reactivaciones (`AFTER INSERT OR UPDATE OF activo`, filtrado con `TG_ARGV`) |
| `v_historial_costos`, `v_movimiento_clientes` | vistas | Pasan el `jsonb` a columnas legibles |
| `fn_ingresos_por_dia/servicio/metodo`, `fn_resumen_ingresos` | funciones | `generate_series`, `SUM/AVG/RANK/LAG … OVER`, `ROLLUP`, comparación con el periodo anterior |
| `cierre_caja`, `sp_cerrar_caja`, `v_cierre_caja` | tabla, **procedimiento**, vista | Cierre del día: congela totales por método; la vista delata cobros agregados después (descuadre) |

Ejemplos para psql:

```sql
SET search_path TO estetica;
SELECT * FROM v_historial_costos ORDER BY momento DESC;
SELECT * FROM fn_ingresos_por_servicio(current_date - 89, current_date);
CALL sp_cerrar_caja(current_date - 1, NULL, NULL);
SELECT dia, total, total_actual, descuadre FROM v_cierre_caja ORDER BY dia DESC LIMIT 5;
```

Todo vive en el esquema `estetica`.

## Decisiones de diseño

1. **Sin cascadas.** Todas las FK son `ON DELETE RESTRICT`. Un cliente, servicio o empleado con movimientos no se puede borrar: se da de baja con `activo = false`.
2. **Precio congelado.** `cita.precio` y `cobro.total` guardan el precio del momento. Cambiar `servicio.costo` no altera citas ni cobros pasados.
3. **Reglas críticas en la base:**
   - Turnos de 30 minutos entre 09:00 y 18:30.
   - Domingo cerrado y sábado con último turno a las 14:00.
   - **Índice único parcial** `cita_turno_activo_unico (fecha, hora) WHERE estado IN ('pendiente','confirmada')`: dos peticiones simultáneas no pueden tomar el mismo turno. Resuelve la concurrencia en la base, no en el navegador.
4. **Empleado opcional en la cita** (`empleado_id NULL`). Cuando se asignen estilistas, el índice cambia a `(fecha, hora, empleado_id)` para permitir varias citas por turno.
5. **Cobro:**
   - Relación 1:0..1 con la cita (`cita_id UNIQUE`): una cita no se cobra dos veces.
   - `cliente_id NULL` para clientes de paso.
   - `cambio` es una columna calculada.
   - Efectivo admite cambio; tarjeta y transferencia se cobran exactos, y la transferencia exige referencia.
6. **Folios generados por la base:** C001, E001, A001 y **V0001 para cobros**. Antes los cobros usaban C0001, que se confundía con los clientes C001.
7. **Sin roles ni políticas de seguridad.** Es un punto de venta con un solo operador. Las credenciales viven solo en la API, nunca en el navegador.
8. **Vistas de lectura:**
   - `v_resumen_cliente`: el historial de la vista Clientes.
   - `v_corte_caja`: totales por día y método de pago.

## Limitaciones conscientes

- **Los folios pueden saltarse números.** Si un `INSERT` falla (por ejemplo, un turno ocupado), PostgreSQL ya consumió el número de la identidad. Para una demo no importa; un folio fiscal consecutivo requeriría una tabla de contadores.
- **La API valida tres reglas que dependen de la fecha actual:** no agendar en el pasado, una fecha de ingreso no puede ser futura y la próxima cita. Un `CHECK` no puede usar `current_date`.
- **Al cobrar, la API marca la cita como `terminada` en la misma transacción.** No se usa un trigger, para que la regla quede visible en el código del servicio.
