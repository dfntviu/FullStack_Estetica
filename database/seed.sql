-- =============================================================================
--  Datos de ejemplo (los mismos de Layouts/data/*.js). Ejecutar después de schema.sql.
--  Los ids se generan en orden, así que los folios coinciden con el front:
--  C001…C008, E001–E002, A001…A009.
-- =============================================================================
SET search_path TO estetica;

INSERT INTO servicio (clave, nombre, costo, imagen) VALUES
    ('corte-normal',        'Corte Normal',               45, '../assets/img/Img.vect-01.jpg'),
    ('corte-personalizado', 'Corte Personalizado',        60, '../assets/img/Img.vect-02.jpg'),
    ('tinte-normal',        'Tinte Normal',              350, '../assets/img/Img.vect-03.jpg'),
    ('tinte-permanente',    'Tinte Permanente',          430, '../assets/img/Img.vect-05.jpg'),
    ('alaciado-definido',   'Alaciado Definido',         390, '../assets/templates/character.two.jpg'),
    ('barba-normal',        'Barba Estilo Normal',       270, '../assets/img/Img.vect-04.jpg'),
    ('barba-hipster',       'Barba Estilo Hipster',      380, '../assets/img/Img.vect-07.jpg'),
    ('ondulado-suave',      'Ondulado Suave',            470, '../assets/img/Img.vect-06.jpg'),
    ('ondulado-sedoso',     'Ondulado Sedoso',           530, '../assets/img/Img.vect-10.jpg'),
    ('corte-moderno',       'Corte Moderno con retoque', 650, '../assets/img/Img.vect-09.jpg');

INSERT INTO cliente (nombre, telefono, cumpleanos, observaciones, fecha_registro) VALUES
    ('María Gómez',      '7220000001', '14/02', 'Tinte 6.1 con oxidante 20 vol.',        '2025-03-01'),
    ('Carlos Pérez',     '7220000002', NULL,    NULL,                                     '2025-03-02'),
    ('Juan Rosas',       '7220000003', NULL,    NULL,                                     '2025-03-05'),
    ('Marisol Pérez',    '7220000004', '30/09', NULL,                                     '2025-03-06'),
    ('Marcela Gómez',    '7220000005', NULL,    'Cabello fino: evitar alaciado químico.', '2025-03-10'),
    ('Roberto Pérez',    '7220000006', NULL,    NULL,                                     '2025-03-12'),
    ('Luis Garza',       '7220000007', NULL,    NULL,                                     '2025-03-15'),
    ('Salomon Grijalbo', '7220000008', NULL,    NULL,                                     '2025-03-20');

INSERT INTO empleado (nombre, telefono, fecha_ingreso) VALUES
    ('Daniela Ortiz',  '7221110001', '2023-02-15'),
    ('Héctor Salinas', '7221110002', '2024-08-01');

-- Citas: precio congelado tomado del catálogo al momento de insertar.
-- `n` fija el orden de inserción para que los folios queden A001…A009.
INSERT INTO cita (cliente_id, servicio_id, fecha, hora, precio, estado)
SELECT cl.id, s.id, v.fecha::date, v.hora::time, s.costo, v.estado::estado_cita
FROM (VALUES
    (1, '7220000001', 'tinte-permanente', '2025-04-10', '15:30', 'pendiente'),   -- A001
    (2, '7220000002', 'corte-moderno',    '2025-04-11', '10:00', 'pendiente'),   -- A002
    (3, '7220000003', 'tinte-permanente', '2025-04-10', '16:00', 'confirmada'),  -- A003
    (4, '7220000004', 'corte-moderno',    '2025-04-12', '10:00', 'pendiente'),   -- A004
    (5, '7220000005', 'tinte-permanente', '2025-04-12', '12:30', 'pendiente'),   -- A005
    (6, '7220000006', 'corte-moderno',    '2025-04-11', '11:00', 'confirmada'),  -- A006
    (7, '7220000001', 'tinte-permanente', '2025-06-10', '15:30', 'pendiente'),   -- A007
    (8, '7220000007', 'corte-moderno',    '2025-04-11', '12:00', 'pendiente'),   -- A008
    (9, '7220000008', 'corte-moderno',    '2025-04-15', '10:00', 'terminada')    -- A009
) AS v(n, telefono, clave, fecha, hora, estado)
JOIN cliente  cl ON cl.telefono = v.telefono
JOIN servicio s  ON s.clave     = v.clave
ORDER BY v.n;
