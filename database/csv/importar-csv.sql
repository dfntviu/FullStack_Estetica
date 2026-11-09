-- =============================================================================
--  Importa los CSV de esta carpeta a la base `estetica`
-- -----------------------------------------------------------------------------
--  Ejecutar DESDE la carpeta database/ (las rutas de \copy son relativas a donde corre psql):
--      $env:PGCLIENTENCODING = "UTF8"
--      psql -U postgres -d estetica -f csv/importar-csv.sql
--
--  Por qué no se copian los CSV directo a las tablas:
--    id y folio son GENERATED ALWAYS: PostgreSQL los asigna y no acepta valores de fuera.
--    Por eso los CSV usan llaves naturales (teléfono del cliente o del empleado, clave del
--    servicio, `ref` de la cita) y este script las traduce a ids:
--      1. \copy de cada CSV a una tabla TEMPORAL (staging) con las mismas columnas;
--      2. INSERT … SELECT con JOIN a las tablas reales para obtener cada id;
--      3. ORDER BY el orden del archivo: los folios nuevos siguen el orden de los CSV.
--
--  Todo ocurre en UNA transacción: si algo falla, no se importa nada.
--  Si la base ya tiene los triggers de auditoría, las 130 altas de clientes quedan
--  registradas como movimientos de origen 'manual' con la fecha de hoy.
-- =============================================================================

\set ON_ERROR_STOP on
\encoding UTF8

BEGIN;
SET search_path TO estetica;

-- No importar dos veces (los teléfonos 7241… son exclusivos de estos CSV)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cliente WHERE telefono LIKE '7241%') THEN
        RAISE EXCEPTION 'Los CSV ya se importaron en esta base (hay clientes con teléfono 7241…). No se repite.';
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1. Staging: una tabla temporal por CSV. `n` (bigserial) guarda el orden del archivo.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE csv_servicio (n bigserial, clave text, nombre text, costo numeric, imagen text, activo boolean) ON COMMIT DROP;
CREATE TEMP TABLE csv_cliente  (n bigserial, nombre text, telefono text, cumpleanos text, observaciones text,
                                fecha_registro date, activo boolean) ON COMMIT DROP;
CREATE TEMP TABLE csv_empleado (n bigserial, nombre text, telefono text, fecha_ingreso date, activo boolean) ON COMMIT DROP;
CREATE TEMP TABLE csv_cita     (n bigserial, ref text, telefono_cliente text, clave_servicio text, telefono_empleado text,
                                fecha date, hora time, precio numeric, estado estado_cita) ON COMMIT DROP;
CREATE TEMP TABLE csv_cobro    (n bigserial, ref_cita text, telefono_cliente text, nombre_cliente text, clave_servicio text,
                                total numeric, metodo metodo_pago, pagado numeric, referencia text,
                                fecha_hora timestamptz) ON COMMIT DROP;

-- Un campo vacío en el CSV llega como NULL (FORMAT csv)
\copy csv_servicio (clave, nombre, costo, imagen, activo) FROM 'csv/servicios.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy csv_cliente (nombre, telefono, cumpleanos, observaciones, fecha_registro, activo) FROM 'csv/clientes.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy csv_empleado (nombre, telefono, fecha_ingreso, activo) FROM 'csv/empleados.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy csv_cita (ref, telefono_cliente, clave_servicio, telefono_empleado, fecha, hora, precio, estado) FROM 'csv/citas.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy csv_cobro (ref_cita, telefono_cliente, nombre_cliente, clave_servicio, total, metodo, pagado, referencia, fecha_hora) FROM 'csv/cobros.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

-- -----------------------------------------------------------------------------
-- 2. Catálogos y personas (sin dependencias). Las restricciones de cada tabla validan cada fila.
-- -----------------------------------------------------------------------------
INSERT INTO servicio (clave, nombre, costo, imagen, activo)
SELECT clave, nombre, costo, imagen, activo FROM csv_servicio ORDER BY n;

INSERT INTO cliente (nombre, telefono, cumpleanos, observaciones, fecha_registro, activo)
SELECT nombre, telefono, cumpleanos, observaciones, fecha_registro, activo FROM csv_cliente ORDER BY n;

INSERT INTO empleado (nombre, telefono, fecha_ingreso, activo)
SELECT nombre, telefono, fecha_ingreso, activo FROM csv_empleado ORDER BY n;

-- -----------------------------------------------------------------------------
-- 3. Citas: teléfono → cliente_id, clave → servicio_id, teléfono → empleado_id (opcional).
--    ON CONFLICT DO NOTHING: si una cita pendiente o confirmada choca con un turno que tu
--    base ya tiene ocupado (índice cita_turno_activo_unico), se omite en lugar de abortar todo.
-- -----------------------------------------------------------------------------
INSERT INTO cita (cliente_id, servicio_id, empleado_id, fecha, hora, precio, estado)
SELECT cl.id, s.id, e.id, c.fecha, c.hora, c.precio, c.estado
  FROM csv_cita c
  JOIN cliente  cl ON cl.telefono = c.telefono_cliente
  JOIN servicio s  ON s.clave     = c.clave_servicio
  LEFT JOIN empleado e ON e.telefono = c.telefono_empleado
 ORDER BY c.n
ON CONFLICT DO NOTHING;

-- ref del CSV → id real de la cita (cliente + fecha + hora la identifican: los teléfonos 7241… son nuevos)
CREATE TEMP TABLE mapa_cita ON COMMIT DROP AS
SELECT c.ref, ci.id AS cita_id
  FROM csv_cita c
  JOIN cliente cl ON cl.telefono = c.telefono_cliente
  JOIN cita ci    ON ci.cliente_id = cl.id AND ci.fecha = c.fecha AND ci.hora = c.hora;

-- -----------------------------------------------------------------------------
-- 4. Cobros: los de cita se ligan por `ref`; los directos pueden traer cliente o ser de paso.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM csv_cobro k WHERE k.ref_cita IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM mapa_cita m WHERE m.ref = k.ref_cita)) THEN
        RAISE EXCEPTION 'Hay cobros que apuntan a una cita que no se importó. Revisa citas.csv.';
    END IF;
END
$$;

INSERT INTO cobro (cita_id, cliente_id, nombre_cliente, servicio_id, total, metodo, pagado, referencia, fecha_hora)
SELECT m.cita_id, cl.id, k.nombre_cliente, s.id, k.total, k.metodo, k.pagado, k.referencia, k.fecha_hora
  FROM csv_cobro k
  JOIN servicio s       ON s.clave = k.clave_servicio
  LEFT JOIN cliente cl  ON cl.telefono = k.telefono_cliente
  LEFT JOIN mapa_cita m ON m.ref = k.ref_cita
 ORDER BY k.n;

-- -----------------------------------------------------------------------------
-- 5. Resumen
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_descuadres integer := 0;
BEGIN
    RAISE NOTICE 'Importados: % servicios, % clientes, % empleados, % de % citas (omitidas por turno ocupado: %), % cobros.',
        (SELECT count(*) FROM csv_servicio), (SELECT count(*) FROM csv_cliente), (SELECT count(*) FROM csv_empleado),
        (SELECT count(*) FROM mapa_cita), (SELECT count(*) FROM csv_cita),
        (SELECT count(*) FROM csv_cita) - (SELECT count(*) FROM mapa_cita),
        (SELECT count(*) FROM csv_cobro);

    -- Con auditoria-reportes.sql aplicado: los cobros importados en días ya cerrados aparecen como descuadre
    IF to_regclass('estetica.v_cierre_caja') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM v_cierre_caja WHERE descuadre <> 0' INTO v_descuadres;
        IF v_descuadres > 0 THEN
            RAISE NOTICE 'Aviso: % cierre(s) de caja quedan con descuadre (cobros importados en días ya cerrados). Ver v_cierre_caja.', v_descuadres;
        END IF;
    END IF;
END
$$;

COMMIT;
