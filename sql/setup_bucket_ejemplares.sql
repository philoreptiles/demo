-- ============================================================
-- Configuración del bucket de Storage "ejemplares"
-- ------------------------------------------------------------
-- El código (src/pages/admin/admin-view.js) ya asume que existe
-- un bucket público llamado exactamente "ejemplares", donde se
-- suben las fotos de cada ejemplar. Corre esto UNA VEZ por cada
-- proyecto nuevo de Supabase (uno por criador).
--
-- Alternativa sin SQL: Dashboard de Supabase > Storage > New
-- bucket > nombre "ejemplares" > marcar "Public bucket" > Save.
-- Si lo creas así desde el Dashboard, las políticas de abajo
-- (sección 2) sí las tienes que agregar de todos modos.
-- ============================================================

-- 1) Crear el bucket (público: cualquiera puede VER las fotos,
--    sin necesidad de estar autenticado -- es el catálogo público).
insert into storage.buckets (id, name, public)
values ('ejemplares', 'ejemplares', true)
on conflict (id) do nothing;


-- 2) Políticas de acceso (RLS) sobre storage.objects.
--    Lectura: cualquiera (público, sin sesión) puede ver/descargar
--    las imágenes -- necesario para que el catálogo público cargue
--    las fotos.
create policy "Lectura publica de fotos de ejemplares"
on storage.objects for select
to public
using (bucket_id = 'ejemplares');

--    Escritura (subir, actualizar, borrar): SOLO usuarios
--    autenticados (es decir, tú con tu cuenta de admin en
--    Supabase Auth) pueden modificar el contenido del bucket.
--    El catálogo público jamás debe poder escribir aquí.
create policy "Solo autenticados suben fotos de ejemplares"
on storage.objects for insert
to authenticated
with check (bucket_id = 'ejemplares');

create policy "Solo autenticados actualizan fotos de ejemplares"
on storage.objects for update
to authenticated
using (bucket_id = 'ejemplares');

create policy "Solo autenticados borran fotos de ejemplares"
on storage.objects for delete
to authenticated
using (bucket_id = 'ejemplares');


-- 3) Verificación rápida.
select id, name, public from storage.buckets where id = 'ejemplares';
