-- ============================================================
-- Migración: recortar reproducción y linaje de la plantilla
-- ------------------------------------------------------------
-- Corre esto UNA VEZ en el SQL Editor de tu proyecto de Supabase
-- (el que ya tiene las 3 tablas: ejemplares, especies,
-- eventos_reproductivos). Es irreversible: revisa el punto 0
-- antes de correr el resto.
-- ============================================================

-- 0) RESPALDO (opcional pero recomendado si ya tienes eventos
--    reproductivos cargados y quieres conservarlos como archivo,
--    aunque el sitio ya no los vaya a usar). Corre esto ANTES del
--    resto si quieres exportar los datos:
--
--    select * from eventos_reproductivos;
--
--    (cópialos a un CSV desde el propio SQL Editor de Supabase,
--    con el botón "Export" del resultado, antes de continuar)


-- 1) Elimina por completo el módulo de reproducción.
--    Esto también libera automáticamente las llaves foráneas que
--    apuntaban a ejemplares(id) desde hembra_id / macho_id -- no
--    hace falta tocar la tabla ejemplares para eso.
drop table if exists public.eventos_reproductivos;


-- 2) Quita el linaje (padre/madre) de ejemplares.
--    DROP COLUMN se lleva entre manos, automáticamente, la llave
--    foránea que cada columna tenía hacia ejemplares(id) -- no
--    hace falta un DROP CONSTRAINT aparte.
alter table public.ejemplares drop column if exists id_padre;
alter table public.ejemplares drop column if exists id_madre;


-- 3) Quita el campo que solo existía para alimentar el módulo de
--    reproducción (ovípara vs. ovovivípara). DROP COLUMN también
--    se lleva entre manos el CHECK constraint asociado.
alter table public.especies drop column if exists tipo_reproduccion;


-- 4) Verificación rápida: confirma que las tablas quedaron como
--    se espera antes de seguir usando el sitio.
--    (esto solo consulta, no modifica nada)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'ejemplares'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'especies'
order by ordinal_position;
