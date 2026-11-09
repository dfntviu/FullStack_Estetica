-- =============================================================================
--  Citas Estética Miss Name — instalación completa de la base (PostgreSQL 18)
-- -----------------------------------------------------------------------------
--  Desde la carpeta database/:
--      $env:PGCLIENTENCODING = "UTF8"
--      createdb -U postgres estetica
--      psql -U postgres -d estetica -f instalar.sql
--
--  Ejecuta, en este orden (cada uno depende del anterior):
--      1. schema.sql              tipos, tablas, restricciones, índices y vistas
--      2. seed.sql                datos de ejemplo mínimos
--      3. auditoria-reportes.sql  auditoría con triggers, reportes de ingresos, cierre de caja
--      4. consultas.sql           funciones de la vista Consultas
--
--  Opcionales, después de este archivo (uno u otro):
--      psql -U postgres -d estetica -f csv/importar-csv.sql   (130 clientes, 125 citas y cobros…)
--      psql -U postgres -d estetica -f seed-historico.sql     (~8 meses de historia para los reportes)
--
--  ATENCIÓN: schema.sql empieza con DROP SCHEMA estetica CASCADE. Sobre una base con datos
--  reales, NO ejecutes este archivo: aplica solo auditoria-reportes.sql y consultas.sql.
-- =============================================================================

\set ON_ERROR_STOP on
\encoding UTF8

\echo '1/4 schema.sql'
\ir schema.sql
\echo '2/4 seed.sql'
\ir seed.sql
\echo '3/4 schemas/auditoria-reportes.sql'
\ir schemas/auditoria-reportes.sql
\echo '4/4 schemas/consultas.sql'
\ir schemas/consultas.sql

SELECT 'Base instalada: ' || count(*) || ' funciones en el esquema estetica' AS resultado
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'estetica';
