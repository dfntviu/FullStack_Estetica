-- =============================================================================
--  Citas Estética Miss Name — auditoría, reportes de ingresos y cierre de caja
-- -----------------------------------------------------------------------------
--  Orden en una instalación nueva:
--      psql -d estetica -f schema.sql
--      psql -d estetica -f seed.sql
--      psql -d estetica -f schemas/auditoria-reportes.sql      ← este archivo
--      psql -d estetica -f seed-historico.sql          (opcional: datos de ~8 meses)
--  Va DESPUÉS de seed.sql: los clientes que ya existían son anteriores a la auditoría y no
--  deben aparecer como "altas de hoy". En una base con datos, basta con ejecutar este
--  archivo: no borra nada.
--  Es re-ejecutable (CREATE OR REPLACE / IF NOT EXISTS / DROP TRIGGER IF EXISTS).
--
--  Contenido (en orden de dependencia):
--   1. auditoria            UNA tabla de historial para cualquier tabla (antes/después en jsonb)
--   2. origen_cambio()      ¿el cambio vino de la API o se hizo a mano en psql?
--   3. fn_auditar()         UNA función de trigger genérica (TG_TABLE_NAME, TG_OP, TG_ARGV)
--   4. 2 triggers           precio de servicio · alta/baja/reactivación de cliente
--   5. 2 vistas             convierten el jsonb de auditoria en columnas legibles
--   6. 4 funciones          reporte de ingresos (por día, por servicio, por método, resumen)
--   7. cierre_caja + sp_cerrar_caja + v_cierre_caja   cierre del día (PROCEDURE)
-- =============================================================================

SET search_path TO estetica;

-- Zona del negocio: "qué día es" para un cobro se decide en Ciudad de México, no en UTC.
-- STABLE y no IMMUTABLE: las reglas de zona horaria pueden cambiar (horario de verano).
CREATE OR REPLACE FUNCTION dia_negocio(momento timestamptz) RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT (momento AT TIME ZONE 'America/Mexico_City')::date
$$;

-- Inicio del día del negocio como timestamptz: permite filtrar cobro.fecha_hora por RANGO
-- (fecha_hora >= inicio(desde) AND fecha_hora < inicio(hasta + 1)) y así usar el índice
-- cobro_fecha_hora_idx. Filtrar con dia_negocio(fecha_hora) = x obligaría a recorrer la tabla.
CREATE OR REPLACE FUNCTION inicio_dia_negocio(dia date) RETURNS timestamptz
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT dia::timestamp AT TIME ZONE 'America/Mexico_City'
$$;


-- =============================================================================
-- 1. auditoria — tabla de historial GENÉRICA
-- -----------------------------------------------------------------------------
--  Una fila = un cambio en cualquier tabla auditada. En lugar de una columna por cada
--  dato (costo_anterior, costo_nuevo, activo_anterior…), guarda la FILA COMPLETA antes
--  y después del cambio como jsonb. Así la misma tabla sirve para servicio, cliente o
--  cualquier tabla futura, sin ALTER TABLE.
--
--    tabla='servicio', operacion='UPDATE', registro_id=3,
--    antes  = {"id":3,"clave":"tinte-permanente","costo":430.00,...}
--    despues= {"id":3,"clave":"tinte-permanente","costo":460.00,...}
--
--  Las vistas de la sección 5 extraen lo que interesa con antes->>'costo'.
-- =============================================================================
CREATE TABLE IF NOT EXISTS auditoria (
    id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabla        text        NOT NULL,                 -- nombre de la tabla que cambió (TG_TABLE_NAME)
    operacion    text        NOT NULL,                 -- INSERT | UPDATE | DELETE (TG_OP)
    registro_id  integer     NOT NULL,                 -- id de la fila que cambió
    antes        jsonb,                                -- fila completa ANTES (NULL en INSERT)
    despues      jsonb,                                -- fila completa DESPUÉS (NULL en DELETE)
    origen       text        NOT NULL,                 -- 'sistema' (API) | 'manual' (psql u otra herramienta)
    aplicacion   text,                                 -- application_name de la conexión: 'estetica-api', 'psql'…
    usuario_bd   text        NOT NULL DEFAULT session_user,
    momento      timestamptz NOT NULL DEFAULT now(),   -- now() = inicio de la transacción (igual en todo lo que hizo)

    CONSTRAINT auditoria_operacion_valida CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
    CONSTRAINT auditoria_origen_valido    CHECK (origen IN ('sistema', 'manual')),
    -- Coherencia entre operación y datos: un INSERT no tiene "antes", un DELETE no tiene "después"
    CONSTRAINT auditoria_antes_despues CHECK (
        (operacion = 'INSERT' AND antes IS NULL     AND despues IS NOT NULL) OR
        (operacion = 'UPDATE' AND antes IS NOT NULL AND despues IS NOT NULL) OR
        (operacion = 'DELETE' AND antes IS NOT NULL AND despues IS NULL)
    )
);

-- Los reportes siempre preguntan "cambios de ESTA tabla en ESTE periodo"
CREATE INDEX IF NOT EXISTS auditoria_tabla_momento_idx ON auditoria (tabla, momento);
-- …y a veces "historia de ESTE registro"
CREATE INDEX IF NOT EXISTS auditoria_registro_idx ON auditoria (tabla, registro_id);


-- =============================================================================
-- 2. origen_cambio() — ¿quién hizo el cambio?
-- -----------------------------------------------------------------------------
--  El sistema no tiene usuarios (un solo operador) y la API siempre se conecta con el
--  mismo rol de base de datos, así que current_user no distingue nada. Lo que SÍ aporta
--  valor es saber si el cambio pasó por el sistema o se hizo a mano: la API se identifica
--  con application_name = 'estetica-api' (DatabaseService); psql, pgAdmin, etc. no.
-- =============================================================================
CREATE OR REPLACE FUNCTION origen_cambio() RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN current_setting('application_name', true) = 'estetica-api' THEN 'sistema' ELSE 'manual' END
$$;


-- =============================================================================
-- 3. fn_auditar() — UNA función de trigger para cualquier tabla
-- -----------------------------------------------------------------------------
--  Variables que PostgreSQL entrega a toda función de trigger:
--    TG_TABLE_NAME  nombre de la tabla que disparó el trigger ('servicio', 'cliente'…)
--    TG_OP          'INSERT', 'UPDATE' o 'DELETE'
--    OLD / NEW      la fila antes / después (OLD no existe en INSERT; NEW no existe en DELETE)
--    TG_ARGV[]      argumentos escritos en CREATE TRIGGER … EXECUTE FUNCTION fn_auditar('activo')
--
--  TG_ARGV: columnas que "cuentan". En un UPDATE, si ninguna de ellas cambió de valor,
--  no se audita (p. ej. editar el nombre de un cliente no es una baja ni una reactivación).
--  Sin argumentos, se audita todo UPDATE.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_auditar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_antes   jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    v_despues jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
    v_columna text;
    v_cambio  boolean := (TG_OP <> 'UPDATE' OR TG_NARGS = 0);
BEGIN
    IF NOT v_cambio THEN
        FOREACH v_columna IN ARRAY TG_ARGV LOOP
            IF v_antes -> v_columna IS DISTINCT FROM v_despues -> v_columna THEN
                v_cambio := true;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    IF v_cambio THEN
        INSERT INTO auditoria (tabla, operacion, registro_id, antes, despues, origen, aplicacion)
        VALUES (
            TG_TABLE_NAME,
            TG_OP,
            (coalesce(v_despues, v_antes) ->> 'id')::integer,  -- ->> devuelve texto: cast explícito
            v_antes,
            v_despues,
            origen_cambio(),
            nullif(current_setting('application_name', true), '')
        );
    END IF;

    RETURN NULL;  -- trigger AFTER: el valor de retorno se ignora
END
$$;


-- =============================================================================
-- 4. Los DOS triggers del sistema (ambos AFTER: auditan lo que YA ocurrió)
-- =============================================================================

-- 4.1 Precio de un servicio. "UPDATE OF costo" solo se dispara si el UPDATE menciona la
--     columna costo; el WHEN evita registrar un "cambio" al mismo precio.
DROP TRIGGER IF EXISTS trg_servicio_costo ON servicio;
CREATE TRIGGER trg_servicio_costo
    AFTER UPDATE OF costo ON servicio
    FOR EACH ROW
    WHEN (OLD.costo IS DISTINCT FROM NEW.costo)
    EXECUTE FUNCTION fn_auditar();

-- 4.2 Altas, bajas y reactivaciones de clientes. Aquí no se puede usar WHEN con OLD
--     (en un INSERT no existe OLD), así que el filtro va como argumento: solo cuenta 'activo'.
DROP TRIGGER IF EXISTS trg_cliente_estado ON cliente;
CREATE TRIGGER trg_cliente_estado
    AFTER INSERT OR UPDATE OF activo ON cliente
    FOR EACH ROW
    EXECUTE FUNCTION fn_auditar('activo');


-- =============================================================================
-- 5. Vistas de auditoría: del jsonb a columnas
-- =============================================================================

-- Historial de precios: cada fila es un cambio, con la variación en pesos y en porcentaje
CREATE OR REPLACE VIEW v_historial_costos AS
SELECT
    a.id,
    a.momento,
    a.despues ->> 'clave'                              AS clave,
    a.despues ->> 'nombre'                             AS servicio,
    (a.antes   ->> 'costo')::numeric(10,2)             AS costo_anterior,
    (a.despues ->> 'costo')::numeric(10,2)             AS costo_nuevo,
    ((a.despues ->> 'costo')::numeric - (a.antes ->> 'costo')::numeric)::numeric(10,2) AS diferencia,
    round(100 * ((a.despues ->> 'costo')::numeric / (a.antes ->> 'costo')::numeric - 1), 1) AS variacion_pct,
    a.origen,
    a.aplicacion
FROM auditoria a
WHERE a.tabla = 'servicio' AND a.operacion = 'UPDATE';

-- Movimientos de clientes: alta (INSERT), baja (activo → false) o reactivación (activo → true)
CREATE OR REPLACE VIEW v_movimiento_clientes AS
SELECT
    a.id,
    a.momento,
    a.despues ->> 'folio'  AS folio,
    a.despues ->> 'nombre' AS nombre,
    CASE
        WHEN a.operacion = 'INSERT'                THEN 'alta'
        WHEN (a.despues ->> 'activo')::boolean     THEN 'reactivacion'
        ELSE                                            'baja'
    END                    AS movimiento,
    a.origen,
    a.aplicacion
FROM auditoria a
WHERE a.tabla = 'cliente';


-- =============================================================================
-- 6. Reporte de INGRESOS (no ganancias: el sistema no registra costos de operación)
-- -----------------------------------------------------------------------------
--  Funciones y no procedimientos: un reporte LEE y devuelve filas, y una FUNCTION
--  RETURNS TABLE se consulta como una tabla: SELECT * FROM fn_ingresos_por_dia(...).
--  Todas reciben el mismo periodo [p_desde, p_hasta] (ambos incluidos).
-- =============================================================================

-- 6.1 Serie diaria. generate_series crea TODOS los días del periodo y el LEFT JOIN les
--     pega sus cobros: un día sin ventas aparece en 0 (con un GROUP BY simple, desaparecería).
--     Funciones de ventana sobre la serie ya agrupada:
--       acumulado          SUM() OVER (ORDER BY dia)                         total corrido
--       promedio_7_dias    AVG() OVER (… ROWS BETWEEN 6 PRECEDING …)         tendencia sin picos
CREATE OR REPLACE FUNCTION fn_ingresos_por_dia(p_desde date, p_hasta date)
RETURNS TABLE (dia date, cobros integer, ingresos numeric, acumulado numeric, promedio_7_dias numeric)
LANGUAGE sql STABLE AS $$
    WITH dias AS (
        SELECT d::date AS dia
          FROM generate_series(p_desde, p_hasta, interval '1 day') AS d
    ),
    por_dia AS (
        SELECT dia_negocio(c.fecha_hora) AS dia, count(*)::int AS cobros, sum(c.total) AS ingresos
          FROM cobro c
         WHERE c.fecha_hora >= inicio_dia_negocio(p_desde)
           AND c.fecha_hora <  inicio_dia_negocio(p_hasta + 1)
         GROUP BY 1
    )
    SELECT d.dia,
           coalesce(p.cobros, 0),
           coalesce(p.ingresos, 0)::numeric(10,2),
           sum(coalesce(p.ingresos, 0)) OVER (ORDER BY d.dia)::numeric(12,2),
           round(avg(coalesce(p.ingresos, 0)) OVER (ORDER BY d.dia ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2)
      FROM dias d
      LEFT JOIN por_dia p USING (dia)
     ORDER BY d.dia
$$;

-- 6.2 Por servicio, con ranking y participación sobre el total del periodo.
--       ranking          RANK() OVER (ORDER BY ingresos DESC)      empates comparten lugar
--       participacion    ingresos / SUM(ingresos) OVER ()          OVER () = todo el resultado
CREATE OR REPLACE FUNCTION fn_ingresos_por_servicio(p_desde date, p_hasta date)
RETURNS TABLE (ranking integer, clave text, servicio text, cobros integer, ingresos numeric,
               ticket_promedio numeric, participacion_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH por_servicio AS (
        SELECT s.clave, s.nombre, count(*)::int AS cobros, sum(c.total) AS ingresos
          FROM cobro c
          JOIN servicio s ON s.id = c.servicio_id
         WHERE c.fecha_hora >= inicio_dia_negocio(p_desde)
           AND c.fecha_hora <  inicio_dia_negocio(p_hasta + 1)
         GROUP BY s.clave, s.nombre
    )
    SELECT rank() OVER (ORDER BY ingresos DESC)::int,
           clave::text,
           nombre::text,
           cobros,
           ingresos::numeric(12,2),
           round(ingresos / cobros, 2),
           round(100 * ingresos / sum(ingresos) OVER (), 1)
      FROM por_servicio
     ORDER BY ingresos DESC, nombre
$$;

-- 6.3 Por método de pago con fila de TOTAL. ROLLUP(metodo) agrega una fila extra con
--     metodo = NULL que suma todo; GROUPING(metodo) = 1 la distingue de un NULL real.
CREATE OR REPLACE FUNCTION fn_ingresos_por_metodo(p_desde date, p_hasta date)
RETURNS TABLE (metodo text, cobros integer, ingresos numeric, participacion_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH agrupado AS (
        SELECT CASE WHEN grouping(c.metodo) = 1 THEN 'total' ELSE c.metodo::text END AS metodo,
               grouping(c.metodo) AS es_total,
               count(*)::int AS cobros,
               coalesce(sum(c.total), 0) AS ingresos   -- sin cobros, ROLLUP igual produce la fila total
          FROM cobro c
         WHERE c.fecha_hora >= inicio_dia_negocio(p_desde)
           AND c.fecha_hora <  inicio_dia_negocio(p_hasta + 1)
         GROUP BY ROLLUP (c.metodo)
    )
    SELECT metodo,
           cobros,
           ingresos::numeric(12,2),
           -- el total del periodo es la fila del ROLLUP; max() OVER () la "reparte" a todas las filas
           round(100 * ingresos / nullif(max(ingresos) FILTER (WHERE es_total = 1) OVER (), 0), 1)
      FROM agrupado
     ORDER BY es_total, ingresos DESC
$$;

-- 6.4 Resumen del periodo comparado con el periodo ANTERIOR de la misma duración
--     (p. ej. este trimestre contra el trimestre previo). LAG() toma el valor de la fila
--     anterior: con dos filas ordenadas (anterior, actual), la actual "ve" a la anterior.
CREATE OR REPLACE FUNCTION fn_resumen_ingresos(p_desde date, p_hasta date)
RETURNS TABLE (periodo text, desde date, hasta date, dias integer, cobros integer, ingresos numeric,
               ticket_promedio numeric, promedio_diario numeric, ingresos_periodo_anterior numeric,
               variacion_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH periodos AS (
        SELECT 'anterior' AS periodo, (p_desde - (p_hasta - p_desde + 1)) AS desde, (p_desde - 1) AS hasta, 1 AS orden
        UNION ALL
        SELECT 'actual', p_desde, p_hasta, 2
    ),
    totales AS (
        SELECT p.periodo, p.desde, p.hasta, p.orden,
               (p.hasta - p.desde + 1)::int AS dias,
               count(c.id)::int AS cobros,
               coalesce(sum(c.total), 0) AS ingresos
          FROM periodos p
          LEFT JOIN cobro c
                 ON c.fecha_hora >= inicio_dia_negocio(p.desde)
                AND c.fecha_hora <  inicio_dia_negocio(p.hasta + 1)
         GROUP BY p.periodo, p.desde, p.hasta, p.orden
    ),
    comparados AS (
        SELECT t.*, lag(t.ingresos) OVER (ORDER BY t.orden) AS ingresos_anterior
          FROM totales t
    )
    SELECT periodo, desde, hasta, dias, cobros,
           ingresos::numeric(12,2),
           CASE WHEN cobros > 0 THEN round(ingresos / cobros, 2) ELSE 0 END,
           round(ingresos / dias, 2),
           ingresos_anterior::numeric(12,2),
           CASE WHEN ingresos_anterior > 0 THEN round(100 * (ingresos / ingresos_anterior - 1), 1) END
      FROM comparados
     WHERE periodo = 'actual'
$$;


-- =============================================================================
-- 7. Cierre de caja
-- -----------------------------------------------------------------------------
--  Al terminar el día, el administrador "cierra la caja": se congelan los totales por
--  método de pago. Es el uso legítimo de un PROCEDURE: ESCRIBE un registro contable
--  (no es una consulta), valida reglas y bloquea la tabla de cobros mientras calcula.
--  Después del cierre, la API rechaza nuevos cobros de ese día; si alguien inserta uno
--  a mano en psql, v_cierre_caja lo delata como descuadre.
-- =============================================================================
CREATE TABLE IF NOT EXISTS cierre_caja (
    dia            date          PRIMARY KEY,               -- un solo cierre por día
    cobros         integer       NOT NULL CHECK (cobros >= 0),
    efectivo       numeric(12,2) NOT NULL,
    tarjeta        numeric(12,2) NOT NULL,
    transferencia  numeric(12,2) NOT NULL,
    total          numeric(12,2) NOT NULL,
    cerrado_en     timestamptz   NOT NULL DEFAULT now(),
    origen         text          NOT NULL DEFAULT origen_cambio(),
    CONSTRAINT cierre_caja_total_cuadra CHECK (total = efectivo + tarjeta + transferencia)
);

-- p_dia: día a cerrar. Los parámetros INOUT son la "respuesta" del procedimiento:
--   CALL sp_cerrar_caja('2026-11-05', NULL, NULL);  →  devuelve una fila (cobros, total)
CREATE OR REPLACE PROCEDURE sp_cerrar_caja(
    IN    p_dia    date,
    INOUT p_cobros integer DEFAULT NULL,
    INOUT p_total  numeric DEFAULT NULL
)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_dia IS NULL THEN
        RAISE EXCEPTION 'Indica el día a cerrar.' USING ERRCODE = 'check_violation', CONSTRAINT = 'cierre_dia_requerido';
    END IF;
    IF p_dia > dia_negocio(now()) THEN
        RAISE EXCEPTION 'No se puede cerrar un día futuro (%).', p_dia
              USING ERRCODE = 'check_violation', CONSTRAINT = 'cierre_dia_futuro';
    END IF;

    -- SHARE bloquea INSERT/UPDATE/DELETE en cobro hasta el fin de la transacción:
    -- espera a que terminen los cobros en curso y no deja entrar nuevos mientras suma.
    LOCK TABLE cobro IN SHARE MODE;

    -- Si el día ya estaba cerrado, la llave primaria lo rechaza (cierre_caja_pkey → 409 en la API)
    INSERT INTO cierre_caja (dia, cobros, efectivo, tarjeta, transferencia, total)
    SELECT p_dia,
           count(*),
           coalesce(sum(total) FILTER (WHERE metodo = 'efectivo'), 0),
           coalesce(sum(total) FILTER (WHERE metodo = 'tarjeta'), 0),
           coalesce(sum(total) FILTER (WHERE metodo = 'transferencia'), 0),
           coalesce(sum(total), 0)
      FROM cobro
     WHERE fecha_hora >= inicio_dia_negocio(p_dia)
       AND fecha_hora <  inicio_dia_negocio(p_dia + 1)
    RETURNING cobros, total INTO p_cobros, p_total;
END
$$;

-- Cierres comparados con lo que HOY dice la tabla cobro. descuadre <> 0 significa que
-- alguien agregó o cambió cobros de un día ya cerrado sin pasar por el sistema.
CREATE OR REPLACE VIEW v_cierre_caja AS
SELECT k.dia, k.cobros, k.efectivo, k.tarjeta, k.transferencia, k.total, k.cerrado_en, k.origen,
       coalesce(r.total, 0)::numeric(12,2)                AS total_actual,
       (coalesce(r.total, 0) - k.total)::numeric(12,2)    AS descuadre
  FROM cierre_caja k
  LEFT JOIN LATERAL (
        SELECT sum(c.total) AS total
          FROM cobro c
         WHERE c.fecha_hora >= inicio_dia_negocio(k.dia)
           AND c.fecha_hora <  inicio_dia_negocio(k.dia + 1)
  ) r ON true;
