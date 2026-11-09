-- =============================================================================
--  Citas Estética Miss Name — validación de las reglas de la base (PostgreSQL 18)
-- -----------------------------------------------------------------------------
--  Instala TODO el esquema en una base de PRUEBA, intenta violar cada regla y comprueba
--  que PostgreSQL la acepte o la rechace con la restricción exacta. Al final hace ROLLBACK:
--  la base de prueba queda vacía otra vez.
--
--  Desde la carpeta database/:
--      $env:PGCLIENTENCODING = "UTF8"
--      createdb -U postgres estetica_prueba            (solo la primera vez)
--      psql -U postgres -d estetica_prueba -f validar-esquema.sql
--
--  Resultado: una tabla con 46 filas PASS/FAIL. Si alguna falla, psql termina con error.
--  Los errores se identifican por SQLSTATE y nombre de restricción, no por el texto del
--  mensaje: funciona igual con un servidor en español o en inglés.
-- =============================================================================

\set ON_ERROR_STOP on
\encoding UTF8
\pset footer off

-- No ejecutar sobre la base real (aunque todo termina en ROLLBACK, bloquearía las tablas)
SELECT current_database() = 'estetica' AS es_base_real \gset
\if :es_base_real
    \echo 'Este script se ejecuta sobre una base de PRUEBA (p. ej. estetica_prueba), no sobre "estetica".'
    \quit
\endif

SET client_min_messages = warning;
BEGIN;

-- -----------------------------------------------------------------------------
-- Utilidades temporales (pg_temp: desaparecen al terminar la sesión)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE resultado (n serial, estado text, prueba text);

CREATE FUNCTION pg_temp.ok(p_prueba text, p_cumple boolean) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO pg_temp.resultado (estado, prueba)
    VALUES (CASE WHEN coalesce(p_cumple, false) THEN 'PASS' ELSE 'FAIL' END, p_prueba)
$$;

-- Ejecuta una sentencia: NULL si la base la acepta; si la rechaza, "SQLSTATE restricción mensaje"
CREATE FUNCTION pg_temp.falla(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_restriccion text;
BEGIN
    EXECUTE p_sql;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
    RETURN SQLSTATE || ' ' || coalesce(v_restriccion, '') || ' ' || SQLERRM;
END
$$;

-- =============================================================================
-- 1. schema.sql + seed.sql (dos veces: deben ser re-ejecutables)
-- =============================================================================
\ir schema.sql
\ir seed.sql
\ir schema.sql
\ir seed.sql
SET search_path TO estetica;

SELECT pg_temp.ok('schema + seed re-ejecutables', true) \gset
SELECT pg_temp.ok('folios de citas A001…A009',
    (SELECT string_agg(folio, ',' ORDER BY id) FROM cita) = 'A001,A002,A003,A004,A005,A006,A007,A008,A009') \gset
SELECT pg_temp.ok('folios de clientes y empleados',
    (SELECT folio FROM cliente WHERE id = 1) = 'C001' AND (SELECT folio FROM empleado WHERE id = 2) = 'E002') \gset
SELECT pg_temp.ok('María Gómez (C001) tiene A001 y A007',
    (SELECT string_agg(folio, ',' ORDER BY id) FROM cita WHERE cliente_id = 1) = 'A001,A007') \gset

-- Reglas de agenda (2026-11-07 es sábado; 2026-11-08, domingo)
SELECT pg_temp.ok('rechaza domingo', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-08', '10:00', 45)$$) LIKE '%cita_no_domingo%') \gset
SELECT pg_temp.ok('rechaza sábado 15:00', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-07', '15:00', 45)$$) LIKE '%cita_sabado_temprano%') \gset
SELECT pg_temp.ok('acepta sábado 14:00', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-07', '14:00', 45)$$) IS NULL) \gset
SELECT pg_temp.ok('rechaza 10:15', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-03', '10:15', 45)$$) LIKE '%cita_turno_media_hora%') \gset
SELECT pg_temp.ok('rechaza 19:00', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-03', '19:00', 45)$$) LIKE '%cita_horario_laboral%') \gset
SELECT pg_temp.ok('acepta martes 10:00', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-03', '10:00', 45)$$) IS NULL) \gset
SELECT pg_temp.ok('rechaza el mismo turno activo (índice parcial)', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-03', '10:00', 45)$$) LIKE '%cita_turno_activo_unico%') \gset
UPDATE cita SET estado = 'cancelada' WHERE fecha = '2026-11-03' AND hora = '10:00';
SELECT pg_temp.ok('una cancelada libera el turno', pg_temp.falla(
    $$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-03', '10:00', 45)$$) IS NULL) \gset
SELECT pg_temp.ok('dos peticiones al mismo turno: solo una entra',
    pg_temp.falla($$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-04', '11:00', 45)$$) IS NULL
    AND pg_temp.falla($$INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio) VALUES (2, 1, '2026-11-04', '11:00', 45)$$) LIKE '%cita_turno_activo_unico%') \gset

-- Cliente
SELECT pg_temp.ok('teléfono único', pg_temp.falla(
    $$INSERT INTO cliente (nombre, telefono) VALUES ('Otra', '7220000001')$$) LIKE '%cliente_telefono_key%') \gset
SELECT pg_temp.ok('cumpleaños inválido', pg_temp.falla(
    $$INSERT INTO cliente (nombre, telefono, cumpleanos) VALUES ('Ana López', '7221234567', '31-02')$$) LIKE '23514 %cumpleanos%') \gset
SELECT pg_temp.ok('teléfono con letras', pg_temp.falla(
    $$INSERT INTO cliente (nombre, telefono) VALUES ('Ana López', '72212345ab')$$) LIKE '23514 %telefono%') \gset

-- Sin cascada (23001 = restrict_violation)
SELECT pg_temp.ok('no se puede borrar un cliente con citas', pg_temp.falla('DELETE FROM cliente WHERE id = 1') LIKE '23001 %') \gset
SELECT pg_temp.ok('no se puede borrar un servicio usado', pg_temp.falla('DELETE FROM servicio WHERE id = 4') LIKE '23001 %') \gset

-- Precio congelado
UPDATE servicio SET costo = 999 WHERE clave = 'tinte-permanente';
SELECT pg_temp.ok('cambiar el precio no altera citas pasadas', (SELECT precio FROM cita WHERE folio = 'A001') = 430.00) \gset

-- Cobros
SELECT pg_temp.ok('efectivo insuficiente rechazado', pg_temp.falla(
    $$INSERT INTO cobro (cita_id, cliente_id, nombre_cliente, servicio_id, total, metodo, pagado) VALUES (1, 1, 'María Gómez', 4, 430, 'efectivo', 400)$$) LIKE '%cobro_monto_valido%') \gset
SELECT pg_temp.ok('tarjeta debe ser exacto', pg_temp.falla(
    $$INSERT INTO cobro (cliente_id, nombre_cliente, servicio_id, total, metodo, pagado) VALUES (1, 'María Gómez', 4, 430, 'tarjeta', 500)$$) LIKE '%cobro_monto_valido%') \gset
SELECT pg_temp.ok('transferencia exige referencia', pg_temp.falla(
    $$INSERT INTO cobro (cliente_id, nombre_cliente, servicio_id, total, metodo, pagado) VALUES (1, 'María Gómez', 4, 430, 'transferencia', 430)$$) LIKE '%cobro_referencia_transferencia%') \gset
SELECT pg_temp.ok('cobro de cita sin cliente rechazado', pg_temp.falla(
    $$INSERT INTO cobro (cita_id, nombre_cliente, servicio_id, total, pagado) VALUES (1, 'X', 4, 430, 500)$$) LIKE '%cobro_cita_con_cliente%') \gset
INSERT INTO cobro (cita_id, cliente_id, nombre_cliente, servicio_id, total, metodo, pagado)
VALUES (1, 1, 'María Gómez', 4, 430, 'efectivo', 500);
SELECT pg_temp.ok('cobro V#### con cambio calculado 70.00 (folio con huecos por intentos fallidos)',
    (SELECT folio ~ '^V[0-9]{4}$' AND cambio = 70.00 FROM cobro WHERE cita_id = 1)) \gset
SELECT pg_temp.ok('una cita no se cobra dos veces', pg_temp.falla(
    $$INSERT INTO cobro (cita_id, cliente_id, nombre_cliente, servicio_id, total, pagado) VALUES (1, 1, 'María Gómez', 4, 430, 500)$$) LIKE '%cobro_cita_id_key%') \gset
INSERT INTO cobro (nombre_cliente, servicio_id, total, metodo, pagado, referencia)
VALUES ('Cliente de paso', 7, 380, 'transferencia', 380, 'SPEI-123');
SELECT pg_temp.ok('cliente de paso (sin cliente_id) con transferencia', (SELECT count(*) FROM cobro) = 2) \gset

-- Vistas del esquema base
SELECT pg_temp.ok('v_resumen_cliente: 2 citas, $430 gastado, Tinte Permanente',
    (SELECT total_citas = 2 AND total_gastado = 430.00 AND servicio_frecuente = 'Tinte Permanente'
       FROM v_resumen_cliente WHERE folio = 'C001')) \gset
SELECT pg_temp.ok('v_corte_caja por método',
    (SELECT count(*) FROM v_corte_caja) = 2
    AND EXISTS (SELECT 1 FROM v_corte_caja WHERE metodo = 'efectivo' AND total = 430.00)) \gset

-- =============================================================================
-- 2. auditoria-reportes.sql (después de seed.sql, dos veces) y seed-historico.sql
-- =============================================================================
\ir schemas/auditoria-reportes.sql
\ir schemas/auditoria-reportes.sql
SET search_path TO estetica;

SELECT pg_temp.ok('auditoria-reportes re-ejecutable y sin auditar los datos previos', (SELECT count(*) FROM auditoria) = 0) \gset
UPDATE servicio SET costo = 1000 WHERE clave = 'tinte-permanente';
UPDATE servicio SET costo = 1000 WHERE clave = 'tinte-permanente';   -- mismo precio: no cuenta
UPDATE servicio SET nombre = nombre WHERE clave = 'corte-normal';     -- otra columna: no cuenta
SELECT pg_temp.ok('trigger de precio: 1 cambio real (no el mismo precio ni otra columna)',
    (SELECT count(*) FROM auditoria WHERE tabla = 'servicio') = 1
    AND (SELECT costo_anterior = 999.00 AND costo_nuevo = 1000.00 FROM v_historial_costos)) \gset
SELECT pg_temp.ok('cambio hecho fuera de la API → origen manual', (SELECT origen FROM v_historial_costos) = 'manual') \gset
UPDATE cliente SET nombre = 'Juan R. Rosas' WHERE folio = 'C003';
UPDATE cliente SET activo = false WHERE folio = 'C003';
SELECT pg_temp.ok('trigger de cliente: editar no cuenta, la baja sí (TG_ARGV)',
    (SELECT string_agg(movimiento, ',') FROM v_movimiento_clientes) = 'baja') \gset
SELECT pg_temp.ok('auditoria rechaza un INSERT con "antes"', pg_temp.falla(
    $$INSERT INTO auditoria (tabla, operacion, registro_id, antes, despues, origen) VALUES ('x', 'INSERT', 1, '{}', '{}', 'manual')$$)
    LIKE '%auditoria_antes_despues%') \gset

\ir seed-historico.sql
SELECT count(*) AS cobros_historico FROM estetica.cobro \gset
\ir seed-historico.sql
SET search_path TO estetica;
SELECT pg_temp.ok('seed-historico: ' || :cobros_historico || ' cobros y no se duplica al repetirlo',
    :cobros_historico > 800 AND (SELECT count(*) FROM cobro) = :cobros_historico) \gset

SELECT pg_temp.ok('ROLLUP: la fila total suma los métodos',
    (SELECT ingresos FROM fn_ingresos_por_metodo(dia_negocio(now()) - 89, dia_negocio(now())) WHERE metodo = 'total')
    = (SELECT sum(ingresos) FROM fn_ingresos_por_metodo(dia_negocio(now()) - 89, dia_negocio(now())) WHERE metodo <> 'total')) \gset
SELECT pg_temp.ok('generate_series: un día por fecha aunque no haya ventas',
    (SELECT count(*) FROM fn_ingresos_por_dia(dia_negocio(now()) - 29, dia_negocio(now()))) = 30) \gset
SELECT max(dia) AS ultimo_cierre FROM cierre_caja \gset
SELECT pg_temp.ok('cierre de caja: no se cierra dos veces (llave primaria)',
    pg_temp.falla(format('CALL sp_cerrar_caja(%L, NULL, NULL)', :'ultimo_cierre')) LIKE '%cierre_caja_pkey%') \gset
SELECT pg_temp.ok('cierre de caja: no se cierra un día futuro',
    pg_temp.falla('CALL sp_cerrar_caja(dia_negocio(now()) + 1, NULL, NULL)') LIKE '%cierre_dia_futuro%') \gset
SELECT pg_temp.ok('cierres históricos sin descuadre', (SELECT count(*) FROM v_cierre_caja WHERE descuadre <> 0) = 0) \gset

-- =============================================================================
-- 3. consultas.sql (dos veces)
-- =============================================================================
\ir schemas/consultas.sql
\ir schemas/consultas.sql
SET search_path TO estetica;

-- Una cita sin empleado, para comprobar que el LEFT JOIN no la pierde
UPDATE cita SET empleado_id = NULL WHERE id = (SELECT min(id) FROM cita WHERE empleado_id IS NOT NULL);

SELECT pg_temp.ok('maestra: no pierde citas (LEFT JOIN empleado → "Sin asignar")',
    (SELECT sum(citas) FROM fn_diagnostico_negocio()) = (SELECT count(*) FROM cita)
    AND EXISTS (SELECT 1 FROM fn_diagnostico_negocio() WHERE empleado = 'Sin asignar')) \gset
SELECT pg_temp.ok('maestra: cada cita cae en exactamente una situación',
    (SELECT sum(cobradas + vencidas_sin_cobro + programadas + canceladas) FROM fn_diagnostico_negocio()) = (SELECT count(*) FROM cita)) \gset
SELECT pg_temp.ok('pagos: incluye ventas directas (LEFT JOIN cita)',
    (SELECT count(*) FROM fn_pagos_detallados()) = (SELECT count(*) FROM cobro)) \gset
SELECT pg_temp.ok('carga por empleado: suma todas las citas',
    (SELECT sum(citas) FROM fn_carga_empleados()) = (SELECT count(*) FROM cita)) \gset
SELECT pg_temp.ok('vencidas: ninguna tiene cobro ni es futura',
    NOT EXISTS (SELECT 1 FROM fn_citas_vencidas() v JOIN cita c ON c.folio = v.folio JOIN cobro k ON k.cita_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM fn_citas_vencidas() WHERE fecha > dia_negocio(now()))) \gset
-- La trampa de NOT IN: con un NULL en la subconsulta (clientes de paso) devuelve 0 filas
SELECT pg_temp.ok('EXCEPT acierta donde NOT IN falla (cobros sin cliente)',
    EXISTS (SELECT 1 FROM cobro WHERE cliente_id IS NULL)
    AND (SELECT count(*) FROM cliente WHERE id NOT IN (SELECT cliente_id FROM cobro)) = 0
    AND (SELECT count(*) FROM fn_clientes_sin_compras())
      = (SELECT count(*) FROM cliente c WHERE NOT EXISTS (SELECT 1 FROM cobro k WHERE k.cliente_id = c.id))) \gset
SELECT pg_temp.ok('ninguna consulta expone ids internos', NOT EXISTS (
    SELECT 1 FROM information_schema.parameters p
      JOIN information_schema.routines r USING (specific_schema, specific_name)
     WHERE r.routine_schema = 'estetica' AND r.routine_name LIKE 'fn\_%' AND p.parameter_mode = 'OUT'
       AND (p.parameter_name = 'id' OR p.parameter_name LIKE '%\_id'))) \gset

-- =============================================================================
-- Resultado
-- =============================================================================
\echo
SELECT n AS "#", estado, prueba FROM pg_temp.resultado ORDER BY n;
SELECT count(*) FILTER (WHERE estado = 'PASS') AS pasan,
       count(*) AS total,
       count(*) FILTER (WHERE estado = 'FAIL') > 0 AS hay_fallas,
       version() AS servidor
  FROM pg_temp.resultado \gset

ROLLBACK;   -- la base de prueba queda como estaba

\echo 'Resultado:' :pasan 'de' :total 'pruebas en PASS'
\if :hay_fallas
    DO $$ BEGIN RAISE EXCEPTION 'Hay pruebas en FAIL: revisa la tabla de arriba.'; END $$;
\endif
