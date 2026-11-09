-- =============================================================================
--  Datos HISTÓRICOS de desarrollo (opcional): ~8 meses de operación simulada
-- -----------------------------------------------------------------------------
--  Para que los reportes de ingresos y de auditoría tengan algo que mostrar.
--  Se ejecuta después de seed.sql:   psql -d estetica -f seed-historico.sql
--  No es re-ejecutable a propósito: si ya se aplicó, avisa y no hace nada.
--
--  Lo que genera (siempre relativo a HOY, para que "el último bimestre" tenga datos):
--   · 18 clientes nuevos registrados en los últimos ~4 meses, 2 bajas y 1 reactivación.
--   · 4 cambios de precio escalonados (20, 50, 75 y 100 días atrás): un bimestre ve 2,
--     un trimestre 3 y un cuatrimestre 4.
--   · Cobros de lunes a sábado durante 245 días, con el precio vigente en cada fecha.
--     (245 ≥ 2 × 120: un cuatrimestre se compara contra un cuatrimestre anterior COMPLETO.)
--   · Cierres de caja de todos los días hábiles hasta hace 3 días (los últimos quedan abiertos).
--
--  HONESTIDAD DE LOS DATOS: la auditoría de estos movimientos se escribe directamente
--  con fechas pasadas (los triggers registran siempre "ahora"). Esas filas quedan marcadas
--  con aplicacion = 'seed-historico' para distinguirlas de cambios reales.
--  setseed() hace que los números aleatorios sean los mismos en cada instalación.
-- =============================================================================

SET search_path TO estetica;

DO $$
DECLARE
    v_hoy     date := dia_negocio(now());
    v_inicio  date := dia_negocio(now()) - 245;
    v_antes   jsonb;
    v_despues jsonb;
    v_cobros  integer;
    v_total   numeric;
    r         record;
BEGIN
    IF EXISTS (SELECT 1 FROM auditoria WHERE aplicacion = 'seed-historico') THEN
        RAISE NOTICE 'seed-historico ya se aplicó en esta base; no se repite.';
        RETURN;
    END IF;
    PERFORM setseed(0.42);

    -- -------------------------------------------------------------------------
    -- 1. Clientes nuevos de los últimos meses. El trigger se apaga para escribir la
    --    auditoría con la fecha simulada de cada alta (y no con la de hoy).
    -- -------------------------------------------------------------------------
    ALTER TABLE cliente DISABLE TRIGGER trg_cliente_estado;

    WITH nuevos AS (
        INSERT INTO cliente (nombre, telefono, fecha_registro)
        SELECT n.nombre,
               '7231' || lpad(n.orden::text, 6, '0'),
               v_hoy - (n.orden * 7 - 3)::int          -- uno por semana: de hace 4 a hace 123 días
          FROM unnest(ARRAY[
                   'Andrea Salinas', 'Bruno Castillo', 'Camila Ortega', 'Diego Navarro', 'Elena Ruiz',
                   'Fernando Ibarra', 'Gabriela Mena', 'Héctor Lozano', 'Irene Campos', 'Jorge Villalobos',
                   'Karla Domínguez', 'Leonardo Fuentes', 'Mónica Esquivel', 'Nicolás Cordero', 'Olivia Pineda',
                   'Pablo Arriaga', 'Regina Montes', 'Sergio Valdez'
               ]) WITH ORDINALITY AS n(nombre, orden)
        RETURNING *
    )
    INSERT INTO auditoria (tabla, operacion, registro_id, antes, despues, origen, aplicacion, momento)
    SELECT 'cliente', 'INSERT', n.id, NULL, to_jsonb(n), 'sistema', 'seed-historico',
           inicio_dia_negocio(n.fecha_registro) + interval '10 hours'
      FROM nuevos n;

    -- Bajas y una reactivación, en orden cronológico (dias_atras de mayor a menor)
    FOR r IN
        SELECT * FROM (VALUES
            ('7231000012', 52, false),   -- Leonardo Fuentes: baja hace 52 días…
            ('7231000009', 28, false),   -- Irene Campos: baja hace 28 días
            ('7231000012', 9,  true)     -- …y Leonardo regresa hace 9 días
        ) AS m(telefono, dias_atras, activo)
        ORDER BY dias_atras DESC
    LOOP
        SELECT to_jsonb(c) INTO v_antes FROM cliente c WHERE c.telefono = r.telefono;
        UPDATE cliente c SET activo = r.activo WHERE c.telefono = r.telefono RETURNING to_jsonb(c) INTO v_despues;
        INSERT INTO auditoria (tabla, operacion, registro_id, antes, despues, origen, aplicacion, momento)
        VALUES ('cliente', 'UPDATE', (v_despues ->> 'id')::int, v_antes, v_despues, 'sistema', 'seed-historico',
                inicio_dia_negocio(v_hoy - r.dias_atras) + interval '12 hours');
    END LOOP;

    ALTER TABLE cliente ENABLE TRIGGER trg_cliente_estado;

    -- -------------------------------------------------------------------------
    -- 2. Historial de precios: el costo actual del catálogo es el NUEVO; antes valía `anterior`.
    -- -------------------------------------------------------------------------
    CREATE TEMP TABLE cambio_precio (clave text, dias_atras int, anterior numeric) ON COMMIT DROP;
    INSERT INTO cambio_precio VALUES
        ('tinte-permanente', 100, 400),
        ('corte-normal',      75,  40),
        ('barba-hipster',     50, 350),
        ('ondulado-sedoso',   20, 490);

    INSERT INTO auditoria (tabla, operacion, registro_id, antes, despues, origen, aplicacion, momento)
    SELECT 'servicio', 'UPDATE', s.id,
           to_jsonb(s) || jsonb_build_object('costo', cp.anterior),   -- la fila con el precio viejo
           to_jsonb(s),                                                -- la fila como está hoy
           'sistema', 'seed-historico',
           inicio_dia_negocio(v_hoy - cp.dias_atras) + interval '9 hours'
      FROM cambio_precio cp
      JOIN servicio s ON s.clave = cp.clave;

    -- -------------------------------------------------------------------------
    -- 3. Cobros (ventas directas, sin cita) de lunes a sábado. Por cada día:
    --    2–6 cobros entre semana, 5–9 en sábado; servicio con pesos (los cortes se venden
    --    más que los ondulados); 30 % clientes de paso; efectivo 55 %, tarjeta 30 %,
    --    transferencia 15 %. El total es el precio VIGENTE ese día (precio congelado).
    -- -------------------------------------------------------------------------
    INSERT INTO cobro (cliente_id, nombre_cliente, servicio_id, total, metodo, pagado, referencia, fecha_hora)
    SELECT cl.id,
           coalesce(cl.nombre, 'Cliente de paso'),
           s.id,
           precio.total,
           pago.metodo::metodo_pago,
           CASE WHEN pago.metodo = 'efectivo' THEN ceil(precio.total / 50) * 50 ELSE precio.total END,
           CASE pago.metodo
               WHEN 'transferencia' THEN 'SPEI-' || lpad((floor(random() * 1e6))::int::text, 6, '0')
               WHEN 'tarjeta'       THEN lpad((floor(random() * 1e4))::int::text, 4, '0')
           END,
           inicio_dia_negocio(d.dia) + make_interval(mins => 540 + 30 * floor(random() * d.turnos)::int)
      FROM (SELECT g::date AS dia,
                   CASE WHEN extract(isodow FROM g) = 6 THEN 11 ELSE 20 END AS turnos,   -- sábado hasta 14:00
                   CASE WHEN extract(isodow FROM g) = 6 THEN 5 + floor(random() * 5)
                        ELSE 2 + floor(random() * 5) END::int AS ventas
              FROM generate_series(v_inicio, v_hoy - 1, interval '1 day') AS g
             WHERE extract(isodow FROM g) < 7) AS d
     CROSS JOIN LATERAL generate_series(1, d.ventas) AS k
     -- servicio con pesos: un arreglo con claves repetidas y una posición al azar
     CROSS JOIN LATERAL (
            SELECT (ARRAY['corte-normal','corte-normal','corte-normal','corte-personalizado','corte-personalizado',
                          'barba-normal','barba-normal','barba-hipster','tinte-normal','tinte-permanente',
                          'alaciado-definido','corte-moderno','ondulado-suave','ondulado-sedoso'])
                   [1 + floor(random() * 14)::int + 0 * k] AS clave
     ) AS elegido
     JOIN servicio s ON s.clave = elegido.clave
     CROSS JOIN LATERAL (
            SELECT CASE WHEN cp.clave IS NOT NULL AND d.dia < v_hoy - cp.dias_atras THEN cp.anterior ELSE s.costo END AS total
              FROM (SELECT 1) AS uno
              LEFT JOIN cambio_precio cp ON cp.clave = s.clave
     ) AS precio
     CROSS JOIN LATERAL (
            SELECT CASE WHEN x < 0.55 THEN 'efectivo' WHEN x < 0.85 THEN 'tarjeta' ELSE 'transferencia' END AS metodo
              FROM (SELECT random() + 0 * k AS x) AS azar
     ) AS pago
     -- 30 % de paso. El volado se tira UNA vez por cobro, aquí afuera: dentro del WHERE del
     -- LATERAL de abajo, random() se evaluaría una vez POR CADA CLIENTE candidato y casi
     -- siempre alguno "ganaría" (con 26 candidatos, la probabilidad de 0 % de paso es ~1).
     CROSS JOIN LATERAL (SELECT random() < 0.30 + 0 * k AS de_paso) AS volado
     -- 70 %: un cliente ya registrado ese día (y activo)
     LEFT JOIN LATERAL (
            SELECT c.id, c.nombre
              FROM cliente c
             WHERE NOT volado.de_paso
               AND c.fecha_registro <= d.dia
               AND c.activo
             ORDER BY random()
             LIMIT 1
     ) AS cl ON true;

    -- -------------------------------------------------------------------------
    -- 4. Cierres de caja de cada día hábil hasta hace 3 días (con el procedimiento real).
    -- -------------------------------------------------------------------------
    FOR r IN
        SELECT g::date AS dia
          FROM generate_series(v_inicio, v_hoy - 3, interval '1 day') AS g
         WHERE extract(isodow FROM g) < 7
    LOOP
        CALL sp_cerrar_caja(r.dia, v_cobros, v_total);
    END LOOP;
    -- Hora simulada de cada cierre: las 19:00 de su día
    UPDATE cierre_caja SET cerrado_en = inicio_dia_negocio(dia) + interval '19 hours' WHERE dia <= v_hoy - 3;

    RAISE NOTICE 'seed-historico: % clientes, % cobros, % cierres, % cambios de precio.',
        (SELECT count(*) FROM cliente WHERE telefono LIKE '7231%'),
        (SELECT count(*) FROM cobro),
        (SELECT count(*) FROM cierre_caja),
        (SELECT count(*) FROM auditoria WHERE tabla = 'servicio');
END
$$;
