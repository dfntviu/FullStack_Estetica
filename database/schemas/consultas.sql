-- =============================================================================
--  Citas Estética Miss Name — consultas para el administrador (vista "Consultas")
-- -----------------------------------------------------------------------------
--  Requiere auditoria-reportes.sql (usa dia_negocio() e inicio_dia_negocio()).
--      psql -d estetica -f schemas/consultas.sql
--  Solo crea funciones: no toca datos y se puede volver a ejecutar.
--
--  Reglas comunes a todas:
--   · Nunca se muestra un id interno: folios (C001, A001, V0001, E001), nombres, claves.
--   · Periodo opcional [p_desde, p_hasta] (ambos incluidos); NULL = sin límite. Para las
--     citas futuras (programadas) basta con dejar p_hasta en NULL.
--   · Si una columna de unión puede ser NULL (cita.empleado_id, cobro.cita_id,
--     cobro.cliente_id), se une con LEFT JOIN: un INNER JOIN descartaría filas en silencio.
--
--   0. situacion_cita()                clasificación única de una cita
--   1. fn_diagnostico_negocio          CONSULTA MAESTRA: empleado × servicio (3 etapas con CTE)
--   2. fn_agenda_detallada             todas las citas, legibles
--   3. fn_pagos_detallados             todos los cobros: por cita o venta directa
--   4. fn_carga_empleados              citas e ingresos por empleado (incluye "sin asignar" y sin citas)
--   5. fn_citas_vencidas               citas que ya pasaron y nadie cobró
--   6. fn_clientes_sin_compras         EXCEPT: clientes sin ningún cobro
--   7. fn_servicios_sin_movimiento     NOT EXISTS: servicios que nadie pidió en el periodo
-- =============================================================================

SET search_path TO estetica;

-- =============================================================================
-- 0. ¿En qué situación está una cita? Una sola definición para todas las consultas.
--      cobrada            tiene cobro
--      cancelada          se canceló: no se debe cobrar
--      vencida sin cobro  ya pasó (o se marcó terminada) y no tiene cobro  ← dinero pendiente
--      programada         es de hoy o futura: todavía no toca cobrarla
-- =============================================================================
CREATE OR REPLACE FUNCTION situacion_cita(p_estado estado_cita, p_fecha date, p_cobrada boolean)
RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p_cobrada                                               THEN 'cobrada'
        WHEN p_estado = 'cancelada'                                  THEN 'cancelada'
        WHEN p_estado = 'terminada' OR p_fecha < dia_negocio(now())  THEN 'vencida sin cobro'
        ELSE                                                              'programada'
    END
$$;


-- =============================================================================
-- 1. CONSULTA MAESTRA — diagnóstico de actividad por empleado y servicio
-- -----------------------------------------------------------------------------
--  Tres etapas (CTE), como se diseñó:
--   1) cobros_por_cita    concentrar el cobro de cada cita. cobro.cita_id es UNIQUE: cada
--                         cita tiene 0 o 1 cobro, así que se toma su total (no un conteo).
--   2) detalle_operativo  integrar cita + cliente + empleado + servicio + cobro.
--                         LEFT JOIN empleado: las citas sin empleado cuentan como "Sin asignar".
--   3) diagnóstico        agregar por empleado × servicio con FILTER por situación.
--  El % de cobro se calcula solo sobre las citas que YA debían cobrarse (cobradas + vencidas):
--  una cita futura o cancelada no es una venta perdida.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_diagnostico_negocio(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
    empleado_folio text, empleado text, servicio_clave text, servicio text,
    citas integer, clientes integer, cobradas integer, vencidas_sin_cobro integer, programadas integer,
    canceladas integer, ingresos numeric, tasa_cobro_pct numeric, ultima_cita date
)
LANGUAGE sql STABLE AS $$
    WITH cobros_por_cita AS (
        -- Primera etapa: el cobro de cada cita (las ventas directas no tienen cita y no entran)
        SELECT cita_id, total
          FROM cobro
         WHERE cita_id IS NOT NULL
    ),
    detalle_operativo AS (
        -- Segunda etapa: integrar cliente, empleado, servicio y cobro
        SELECT ci.cliente_id,
               e.folio                                   AS empleado_folio,
               coalesce(e.nombre, 'Sin asignar')         AS empleado,
               s.clave                                   AS servicio_clave,
               s.nombre                                  AS servicio,
               ci.fecha,
               co.total,
               situacion_cita(ci.estado, ci.fecha, co.cita_id IS NOT NULL) AS situacion
          FROM cita ci
          JOIN cliente  c  ON c.id = ci.cliente_id
          JOIN servicio s  ON s.id = ci.servicio_id
          LEFT JOIN empleado e        ON e.id = ci.empleado_id
          LEFT JOIN cobros_por_cita co ON co.cita_id = ci.id
         WHERE (p_desde IS NULL OR ci.fecha >= p_desde)
           AND (p_hasta IS NULL OR ci.fecha <= p_hasta)
    )
    -- Tercera etapa: diagnóstico de actividad del negocio
    SELECT empleado_folio::text,
           empleado::text,
           servicio_clave::text,
           servicio::text,
           count(*)::int                                                AS citas,
           count(DISTINCT cliente_id)::int                              AS clientes,
           count(*) FILTER (WHERE situacion = 'cobrada')::int           AS cobradas,
           count(*) FILTER (WHERE situacion = 'vencida sin cobro')::int AS vencidas_sin_cobro,
           count(*) FILTER (WHERE situacion = 'programada')::int        AS programadas,
           count(*) FILTER (WHERE situacion = 'cancelada')::int         AS canceladas,
           coalesce(sum(total), 0)::numeric(12,2)                       AS ingresos,
           round(100.0 * count(*) FILTER (WHERE situacion = 'cobrada')
                 / nullif(count(*) FILTER (WHERE situacion IN ('cobrada', 'vencida sin cobro')), 0), 1),
           max(fecha)
      FROM detalle_operativo
     GROUP BY empleado_folio, empleado, servicio_clave, servicio
     ORDER BY citas DESC, vencidas_sin_cobro DESC, empleado, servicio
$$;


-- =============================================================================
-- 2. Agenda detallada: cada cita con todo lo que la explica
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_agenda_detallada(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
    folio text, fecha date, hora text, cliente_folio text, cliente text, telefono text,
    servicio_clave text, servicio text, precio numeric, empleado_folio text, empleado text,
    estado text, situacion text, cobro_folio text, metodo text
)
LANGUAGE sql STABLE AS $$
    SELECT ci.folio::text, ci.fecha, to_char(ci.hora, 'HH24:MI'),
           c.folio::text, c.nombre::text, c.telefono::text,
           s.clave::text, s.nombre::text, ci.precio,
           e.folio::text, coalesce(e.nombre, 'Sin asignar')::text,
           ci.estado::text,
           situacion_cita(ci.estado, ci.fecha, co.id IS NOT NULL),
           co.folio::text, co.metodo::text
      FROM cita ci
      JOIN cliente  c ON c.id = ci.cliente_id
      JOIN servicio s ON s.id = ci.servicio_id
      LEFT JOIN empleado e ON e.id = ci.empleado_id      -- empleado opcional
      LEFT JOIN cobro   co ON co.cita_id = ci.id         -- 0 o 1 cobro
     WHERE (p_desde IS NULL OR ci.fecha >= p_desde)
       AND (p_hasta IS NULL OR ci.fecha <= p_hasta)
     ORDER BY ci.fecha DESC, ci.hora DESC
$$;


-- =============================================================================
-- 3. Pagos detallados: TODOS los cobros. Se parte de cobro y se une la cita con LEFT JOIN:
--    las ventas directas no tienen cita, y un INNER JOIN las descartaría.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_pagos_detallados(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
    folio text, fecha date, hora text, tipo text, cita_folio text, cliente_folio text, cliente text,
    servicio_clave text, servicio text, metodo text, total numeric, pagado numeric, cambio numeric, referencia text
)
LANGUAGE sql STABLE AS $$
    SELECT co.folio::text,
           dia_negocio(co.fecha_hora),
           to_char(co.fecha_hora AT TIME ZONE 'America/Mexico_City', 'HH24:MI'),
           CASE WHEN co.cita_id IS NULL THEN 'Venta directa' ELSE 'Por cita' END,
           ci.folio::text,
           c.folio::text,                                     -- NULL = cliente de paso
           co.nombre_cliente::text,
           s.clave::text, s.nombre::text,
           co.metodo::text, co.total, co.pagado, co.cambio, co.referencia::text
      FROM cobro co
      JOIN servicio s      ON s.id = co.servicio_id
      LEFT JOIN cita ci    ON ci.id = co.cita_id
      LEFT JOIN cliente c  ON c.id = co.cliente_id
     WHERE (p_desde IS NULL OR co.fecha_hora >= inicio_dia_negocio(p_desde))
       AND (p_hasta IS NULL OR co.fecha_hora <  inicio_dia_negocio(p_hasta + 1))
     ORDER BY co.fecha_hora DESC
$$;


-- =============================================================================
-- 4. Carga por empleado: citas por estado, clientes, ingresos y su servicio más frecuente.
--    Incluye la fila "Sin asignar" y a los empleados activos SIN citas en el periodo
--    (también es información: alguien sin agenda).
--    mode() WITHIN GROUP: el valor que más se repite (agregado de conjunto ordenado).
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_carga_empleados(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
    empleado_folio text, empleado text, activo boolean, citas integer, pendientes integer, confirmadas integer,
    terminadas integer, canceladas integer, clientes integer, ingresos numeric, servicio_mas_frecuente text
)
LANGUAGE sql STABLE AS $$
    WITH citas AS (
        SELECT ci.empleado_id, ci.cliente_id, ci.estado, s.nombre AS servicio, co.total
          FROM cita ci
          JOIN servicio s   ON s.id = ci.servicio_id
          LEFT JOIN cobro co ON co.cita_id = ci.id
         WHERE (p_desde IS NULL OR ci.fecha >= p_desde)
           AND (p_hasta IS NULL OR ci.fecha <= p_hasta)
    ),
    por_empleado AS (
        SELECT empleado_id,
               count(*)::int                                          AS citas,
               count(*) FILTER (WHERE estado = 'pendiente')::int      AS pendientes,
               count(*) FILTER (WHERE estado = 'confirmada')::int     AS confirmadas,
               count(*) FILTER (WHERE estado = 'terminada')::int      AS terminadas,
               count(*) FILTER (WHERE estado = 'cancelada')::int      AS canceladas,
               count(DISTINCT cliente_id)::int                        AS clientes,
               coalesce(sum(total), 0)::numeric(12,2)                 AS ingresos,
               mode() WITHIN GROUP (ORDER BY servicio)                AS servicio_mas_frecuente
          FROM citas
         GROUP BY empleado_id
    )
    SELECT e.folio::text, coalesce(e.nombre, 'Sin asignar')::text, coalesce(e.activo, true),
           p.citas, p.pendientes, p.confirmadas, p.terminadas, p.canceladas, p.clientes, p.ingresos,
           p.servicio_mas_frecuente::text
      FROM por_empleado p
      LEFT JOIN empleado e ON e.id = p.empleado_id
    UNION ALL
    SELECT e.folio::text, e.nombre::text, e.activo, 0, 0, 0, 0, 0, 0, 0, NULL
      FROM empleado e
     WHERE e.activo
       AND NOT EXISTS (SELECT 1 FROM por_empleado p WHERE p.empleado_id = e.id)
     ORDER BY 4 DESC, 2
$$;


-- =============================================================================
-- 5. Citas vencidas sin cobrar: ya pasaron, no se cancelaron y no tienen cobro.
--    Con teléfono para llamar al cliente y los días que lleva vencida.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_citas_vencidas(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
    folio text, fecha date, hora text, dias_vencida integer, cliente_folio text, cliente text, telefono text,
    servicio_clave text, servicio text, precio numeric, empleado_folio text, empleado text, estado text
)
LANGUAGE sql STABLE AS $$
    SELECT ci.folio::text, ci.fecha, to_char(ci.hora, 'HH24:MI'),
           (dia_negocio(now()) - ci.fecha)::int,
           c.folio::text, c.nombre::text, c.telefono::text,
           s.clave::text, s.nombre::text, ci.precio,
           e.folio::text, coalesce(e.nombre, 'Sin asignar')::text,
           ci.estado::text
      FROM cita ci
      JOIN cliente  c ON c.id = ci.cliente_id
      JOIN servicio s ON s.id = ci.servicio_id
      LEFT JOIN empleado e ON e.id = ci.empleado_id
      LEFT JOIN cobro   co ON co.cita_id = ci.id
     WHERE co.id IS NULL                                                   -- sin cobro
       AND situacion_cita(ci.estado, ci.fecha, false) = 'vencida sin cobro'
       AND (p_desde IS NULL OR ci.fecha >= p_desde)
       AND (p_hasta IS NULL OR ci.fecha <= p_hasta)
     ORDER BY ci.fecha, ci.hora                                            -- la más antigua primero
$$;


-- =============================================================================
-- 6. Clientes sin compras: EXCEPT (conjunto de clientes menos conjunto de quienes pagaron).
--    EXCEPT y no NOT IN: cobro.cliente_id es NULL en las ventas a clientes de paso, y
--    "id NOT IN (…, NULL)" nunca es verdadero → devolvería 0 filas sin dar error.
--    No depende del periodo: "nunca ha comprado" es sobre todo el historial.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_clientes_sin_compras(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (
    folio text, nombre text, telefono text, fecha_registro date, dias_registrado integer, activo boolean,
    citas integer, ultima_cita date, estado_ultima_cita text
)
LANGUAGE sql STABLE AS $$
    WITH sin_compra AS (
        SELECT id FROM cliente
        EXCEPT
        SELECT cliente_id FROM cobro
    )
    SELECT c.folio::text, c.nombre::text, c.telefono::text, c.fecha_registro,
           (dia_negocio(now()) - c.fecha_registro)::int,
           c.activo,
           (SELECT count(*)::int FROM cita x WHERE x.cliente_id = c.id),
           u.fecha, u.estado::text
      FROM sin_compra sc
      JOIN cliente c ON c.id = sc.id
      LEFT JOIN LATERAL (
            SELECT x.fecha, x.estado FROM cita x WHERE x.cliente_id = c.id ORDER BY x.fecha DESC, x.hora DESC LIMIT 1
      ) u ON true
     ORDER BY c.activo DESC, c.fecha_registro
$$;


-- =============================================================================
-- 7. Servicios sin movimiento: activos que nadie agendó ni compró en el periodo (NOT EXISTS),
--    con su última venta histórica para saber si es algo reciente o crónico.
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_servicios_sin_movimiento(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS TABLE (clave text, nombre text, costo numeric, ultima_venta date, dias_sin_venta integer)
LANGUAGE sql STABLE AS $$
    SELECT s.clave::text, s.nombre::text, s.costo,
           v.ultima,
           (dia_negocio(now()) - v.ultima)::int
      FROM servicio s
      LEFT JOIN LATERAL (SELECT max(dia_negocio(co.fecha_hora)) AS ultima FROM cobro co WHERE co.servicio_id = s.id) v ON true
     WHERE s.activo
       AND NOT EXISTS (
            SELECT 1 FROM cita ci
             WHERE ci.servicio_id = s.id
               AND (p_desde IS NULL OR ci.fecha >= p_desde)
               AND (p_hasta IS NULL OR ci.fecha <= p_hasta))
       AND NOT EXISTS (
            SELECT 1 FROM cobro co
             WHERE co.servicio_id = s.id
               AND (p_desde IS NULL OR co.fecha_hora >= inicio_dia_negocio(p_desde))
               AND (p_hasta IS NULL OR co.fecha_hora <  inicio_dia_negocio(p_hasta + 1)))
     ORDER BY v.ultima NULLS FIRST, s.nombre
$$;
