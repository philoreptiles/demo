-- Diagnóstico: confirma si id_padre / id_madre siguen existiendo en
-- ejemplares, y si el constraint que causó el error sigue ahí.

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ejemplares'
  and column_name in ('id_padre', 'id_madre');

select conname as constraint_name, conrelid::regclass as tabla
from pg_constraint
where conname = 'ejemplares_id_padre_fkey'
   or conname = 'ejemplares_id_madre_fkey';
