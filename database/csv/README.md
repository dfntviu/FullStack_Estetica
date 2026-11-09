# Datos de prueba en CSV

| Archivo | Filas | Columnas |
|---|---|---|
| `servicios.csv` | 35 | `clave, nombre, costo, imagen, activo` (2 inactivos) |
| `clientes.csv` | 130 | `nombre, telefono, cumpleanos (DD/MM), observaciones, fecha_registro, activo` |
| `empleados.csv` | 40 | `nombre, telefono, fecha_ingreso, activo` |
| `citas.csv` | 125 | `ref, telefono_cliente, clave_servicio, telefono_empleado, fecha, hora, precio, estado` |
| `cobros.csv` | 125 | `ref_cita, telefono_cliente, nombre_cliente, clave_servicio, total, metodo, pagado, referencia, fecha_hora` |
| `importar-csv.sql` | — | Carga los 5 CSV en una sola transacción |

## Cómo se relacionan

Los `id` y folios los genera PostgreSQL (`GENERATED ALWAYS`), así que los CSV no los traen. Se relacionan por **llaves naturales**, que `importar-csv.sql` traduce a ids:

- **Cita → cliente / servicio / empleado:** por `telefono_cliente`, `clave_servicio` y `telefono_empleado` (vacío = sin empleado).
- **Cobro → cita:** por `ref_cita`, que corresponde a la columna `ref` de `citas.csv` (R001…R125).

| Citas | Cuántas | Fechas |
|---|---|---|
| terminadas | 100 | mayo – noviembre 2026, cada una con su cobro |
| pendientes | 10 | diciembre 2026 – enero 2027 |
| confirmadas | 7 | diciembre 2026 |
| canceladas | 8 | junio 2026 – enero 2027 |

| Cobros | Cuántos |
|---|---|
| ligados a una cita terminada | 100 |
| venta directa con cliente registrado | 15 |
| cliente de paso | 10 |

**Reglas que respetan los datos:**
- todas las restricciones del esquema: turnos de 30 minutos, sin domingos, sábado hasta las 14:00, efectivo con cambio, tarjeta y transferencia exactas, y la transferencia con referencia;
- el cobro de una cita tiene el mismo cliente, servicio y precio que la cita, y es posterior a ella;
- ninguna cita es anterior al registro de su cliente ni a la contratación de su empleado;
- las citas futuras usan servicios y clientes activos.

Teléfonos exclusivos: clientes `7241…`, empleados `7242…`. Así no chocan con `seed.sql` (`7220…`, `7221…`) ni con `seed-historico.sql` (`7231…`).

## Importar

Desde la carpeta `database/`:

```powershell
$env:PGCLIENTENCODING = "UTF8"
psql -U postgres -d estetica -f csv/importar-csv.sql
```

- **Base nueva** (recomendado): `schema.sql` → `seed.sql` → `auditoria-reportes.sql` → **`csv/importar-csv.sql`** → `seed-historico.sql`. Así las 130 altas quedan en la auditoría, y los cierres de caja de `seed-historico` ya incluyen los cobros importados (sin descuadres).
- **Base que ya tiene `seed-historico.sql`:** se importa igual, pero los cobros que caen en días ya cerrados aparecen como **descuadre** en `v_cierre_caja`. El script lo avisa. Es justo lo que esa vista debe detectar.
- **Una cita pendiente que choca** con un turno ocupado en tu base se omite (`ON CONFLICT DO NOTHING`), y el resumen dice cuántas fueron.
- **No se importa dos veces:** si ya hay clientes `7241…`, el script se detiene sin cambiar nada.
