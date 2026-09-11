-- Migración: especializar eventos_reproductivos por tipo de reproducción
-- (Boa = Ovovivípara, Python regius = Ovípara)
--
-- Corre esto completo en el SQL Editor de Supabase, en CADA proyecto
-- donde ya exista la tabla eventos_reproductivos (el tuyo y el de
-- cualquier criador ya desplegado con este módulo).

-- 1) Fuera los campos de especulación / genéricos que ya no se usan.
--    Si tenías datos ahí, esta migración los descarta a propósito: no
--    hay forma de repartir una "cantidad esperada" o una "cantidad
--    resultante" genérica entre las columnas nuevas y específicas.
alter table eventos_reproductivos drop column if exists cantidad_esperada;
alter table eventos_reproductivos drop column if exists cantidad_resultante;
alter table eventos_reproductivos drop column if exists fecha_real;

-- 2) Ovovivíparas (Boa): seguimiento antes del parto.
alter table eventos_reproductivos add column if not exists fecha_ovulacion date;

-- 3) Ovovivíparas (Boa): resultado del parto.
alter table eventos_reproductivos add column if not exists fecha_parto date;
alter table eventos_reproductivos add column if not exists crias_vivas integer;
alter table eventos_reproductivos add column if not exists slugs integer;
alter table eventos_reproductivos add column if not exists stillborns integer;

-- 4) Ovíparas (Python regius): resultado de la puesta.
alter table eventos_reproductivos add column if not exists fecha_puesta date;
alter table eventos_reproductivos add column if not exists huevos_fertiles integer;
alter table eventos_reproductivos add column if not exists huevos_no_fertiles integer;

-- 5) Ovíparas (Python regius): resultado de la eclosión (aquí sale la
--    sobrevivencia por huevo: huevos_eclosionados / huevos_fertiles).
alter table eventos_reproductivos add column if not exists fecha_eclosion date;
alter table eventos_reproductivos add column if not exists huevos_eclosionados integer;
alter table eventos_reproductivos add column if not exists huevos_perdidos integer;

-- 6) Nuevo estado intermedio para ovíparas: "puesta ya ocurrió, en
--    espera de eclosión". Si tu tabla tiene un CHECK constraint sobre
--    la columna "estado" (por ejemplo algo como
--    `estado in ('EN_CURSO','COMPLETADO','CANCELADO')`), tienes que
--    quitarlo y volver a crearlo agregando 'PUESTA_REGISTRADA'. Revisa
--    el nombre real del constraint en Supabase (Database > Tables >
--    eventos_reproductivos > pestaña "Constraints") y ajusta este
--    bloque con ese nombre antes de correrlo:
--
-- alter table eventos_reproductivos drop constraint <nombre_del_constraint>;
-- alter table eventos_reproductivos add constraint eventos_reproductivos_estado_check
--     check (estado in ('EN_CURSO', 'PUESTA_REGISTRADA', 'COMPLETADO', 'CANCELADO'));
