-- =============================================================================
--  Citas Estética Miss Name — esquema PostgreSQL 18 (compatible con ≥ 14)
-- -----------------------------------------------------------------------------
--  Decisiones de diseño:
--   · Sin borrados en cascada: todas las FK son ON DELETE RESTRICT. Clientes,
--     empleados y servicios se dan de baja con `activo = false`, nunca con DELETE.
--   · Precio congelado: cita.precio y cobro.total guardan el precio del momento;
--     cambiar servicio.costo no altera citas ni cobros pasados.
--   · Reglas de negocio críticas en la base (no solo en JavaScript):
--     horario laboral, domingos cerrados, sábado hasta 14:00, turnos de 30 min
--     y UN solo turno activo por fecha/hora (índice único parcial).
--   · Sin políticas de seguridad ni roles: sistema de un solo operador (POS).
--     Las credenciales viven solo en la API (NestJS), nunca en el navegador.
--   · Folios legibles generados por la base: clientes C001, empleados E001,
--     citas A001, cobros V0001 (V de venta, para no chocar con C de cliente).
--   · Script re-ejecutable: borra y recrea el esquema `estetica`.
-- =============================================================================

DROP SCHEMA IF EXISTS estetica CASCADE;  -- solo afecta a este esquema (re-ejecución limpia)
CREATE SCHEMA estetica;
SET search_path TO estetica;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
CREATE TYPE estado_cita AS ENUM ('pendiente', 'confirmada', 'cancelada', 'terminada');
CREATE TYPE metodo_pago AS ENUM ('efectivo', 'tarjeta', 'transferencia');

-- -----------------------------------------------------------------------------
-- servicio: catálogo
-- -----------------------------------------------------------------------------
CREATE TABLE servicio (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clave       varchar(40)   NOT NULL UNIQUE,              -- slug usado por el front: 'corte-normal'
    nombre      varchar(80)   NOT NULL UNIQUE,
    costo       numeric(10,2) NOT NULL CHECK (costo > 0),
    imagen      varchar(200),
    activo      boolean       NOT NULL DEFAULT true,
    CONSTRAINT servicio_clave_formato CHECK (clave ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- -----------------------------------------------------------------------------
-- cliente
-- -----------------------------------------------------------------------------
CREATE TABLE cliente (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio           varchar(10)  GENERATED ALWAYS AS ('C' || lpad(id::text, 3, '0')) STORED UNIQUE,
    nombre          varchar(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 3),
    telefono        char(10)     NOT NULL UNIQUE CHECK (telefono ~ '^[0-9]{10}$'),
    cumpleanos      char(5)      CHECK (cumpleanos ~ '^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])$'),  -- DD/MM
    observaciones   varchar(300),
    fecha_registro  date         NOT NULL DEFAULT current_date,
    activo          boolean      NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- empleado
-- -----------------------------------------------------------------------------
CREATE TABLE empleado (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio          varchar(10)  GENERATED ALWAYS AS ('E' || lpad(id::text, 3, '0')) STORED UNIQUE,
    nombre         varchar(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 3),
    telefono       char(10)     NOT NULL UNIQUE CHECK (telefono ~ '^[0-9]{10}$'),
    fecha_ingreso  date         NOT NULL,        -- "no futura" se valida en la API (CHECK no admite current_date)
    activo         boolean      NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- cita
-- -----------------------------------------------------------------------------
CREATE TABLE cita (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio        varchar(10)   GENERATED ALWAYS AS ('A' || lpad(id::text, 3, '0')) STORED UNIQUE,
    cliente_id   integer       NOT NULL REFERENCES cliente  (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    servicio_id  integer       NOT NULL REFERENCES servicio (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    empleado_id  integer           NULL REFERENCES empleado (id) ON UPDATE RESTRICT ON DELETE RESTRICT,  -- opcional: futuro "estilista"
    fecha        date          NOT NULL,
    hora         time(0)       NOT NULL,
    precio       numeric(10,2) NOT NULL CHECK (precio > 0),   -- precio congelado al agendar
    estado       estado_cita   NOT NULL DEFAULT 'pendiente',
    creada_en    timestamptz   NOT NULL DEFAULT now(),

    -- Turnos de 30 minutos entre 09:00 y 18:30
    CONSTRAINT cita_turno_media_hora CHECK (extract(minute FROM hora) IN (0, 30) AND extract(second FROM hora) = 0),
    CONSTRAINT cita_horario_laboral  CHECK (hora BETWEEN time '09:00' AND time '18:30'),
    -- Domingo cerrado (ISO: lunes = 1 … domingo = 7)
    CONSTRAINT cita_no_domingo       CHECK (extract(isodow FROM fecha) <> 7),
    -- Sábado: último turno 14:00
    CONSTRAINT cita_sabado_temprano  CHECK (extract(isodow FROM fecha) <> 6 OR hora <= time '14:00')
);

-- Un solo turno ACTIVO por fecha y hora. Las canceladas/terminadas liberan el turno.
-- Esto elimina en la base el problema de las dos pestañas (o dos peticiones simultáneas).
-- Cuando las citas se asignen a estilistas, cambiar a (fecha, hora, empleado_id).
CREATE UNIQUE INDEX cita_turno_activo_unico
    ON cita (fecha, hora)
    WHERE estado IN ('pendiente', 'confirmada');

CREATE INDEX cita_cliente_idx  ON cita (cliente_id);
CREATE INDEX cita_fecha_idx    ON cita (fecha);
CREATE INDEX cita_empleado_idx ON cita (empleado_id) WHERE empleado_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- cobro
-- -----------------------------------------------------------------------------
CREATE TABLE cobro (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folio           varchar(10)   GENERATED ALWAYS AS ('V' || lpad(id::text, 4, '0')) STORED UNIQUE,
    cita_id         integer           NULL UNIQUE REFERENCES cita    (id) ON UPDATE RESTRICT ON DELETE RESTRICT,  -- 1:0..1
    cliente_id      integer           NULL        REFERENCES cliente (id) ON UPDATE RESTRICT ON DELETE RESTRICT,  -- NULL = cliente de paso
    nombre_cliente  varchar(120)  NOT NULL,       -- copia del nombre al cobrar (también para clientes de paso)
    servicio_id     integer       NOT NULL        REFERENCES servicio(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    total           numeric(10,2) NOT NULL CHECK (total > 0),   -- precio congelado al cobrar
    metodo          metodo_pago   NOT NULL DEFAULT 'efectivo',
    pagado          numeric(10,2) NOT NULL,
    cambio          numeric(10,2) GENERATED ALWAYS AS (pagado - total) STORED,
    referencia      varchar(60),                  -- folio de transferencia / últimos dígitos de tarjeta
    fecha_hora      timestamptz   NOT NULL DEFAULT now(),

    -- Efectivo admite cambio; tarjeta y transferencia se cobran exactos
    CONSTRAINT cobro_monto_valido CHECK (
        (metodo = 'efectivo' AND pagado >= total) OR
        (metodo <> 'efectivo' AND pagado = total)
    ),
    -- La transferencia exige referencia
    CONSTRAINT cobro_referencia_transferencia CHECK (metodo <> 'transferencia' OR referencia IS NOT NULL),
    -- Un cobro de cita debe estar ligado a un cliente
    CONSTRAINT cobro_cita_con_cliente CHECK (cita_id IS NULL OR cliente_id IS NOT NULL)
);

CREATE INDEX cobro_cliente_idx    ON cobro (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX cobro_fecha_hora_idx ON cobro (fecha_hora);

-- -----------------------------------------------------------------------------
-- Vistas de consulta (lectura): alimentan Clientes y el futuro corte de caja
-- -----------------------------------------------------------------------------

-- Historial resumido por cliente (equivale a CitasModel.historialDeCliente)
CREATE VIEW v_resumen_cliente AS
SELECT
    c.id                                                          AS cliente_id,
    c.folio,
    c.nombre,
    count(ci.id)                                                  AS total_citas,
    coalesce((SELECT sum(co.total) FROM cobro co WHERE co.cliente_id = c.id), 0) AS total_gastado,
    max(ci.fecha) FILTER (WHERE ci.estado = 'terminada')          AS ultima_visita,
    min(ci.fecha) FILTER (WHERE ci.estado IN ('pendiente', 'confirmada') AND ci.fecha >= current_date) AS proxima_cita,
    (SELECT s.nombre
       FROM cita x JOIN servicio s ON s.id = x.servicio_id
      WHERE x.cliente_id = c.id AND x.estado <> 'cancelada'
      GROUP BY s.nombre
      ORDER BY count(*) DESC, s.nombre
      LIMIT 1)                                                    AS servicio_frecuente
FROM cliente c
LEFT JOIN cita ci ON ci.cliente_id = c.id
GROUP BY c.id, c.folio, c.nombre;

-- Corte de caja por día y método de pago
CREATE VIEW v_corte_caja AS
SELECT
    (fecha_hora AT TIME ZONE 'America/Mexico_City')::date AS dia,
    metodo,
    count(*)    AS cobros,
    sum(total)  AS total
FROM cobro
GROUP BY 1, 2;
