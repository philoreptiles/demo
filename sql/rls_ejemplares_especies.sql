-- ============================================================
-- Políticas de seguridad (RLS) para ejemplares y especies
-- ------------------------------------------------------------
-- IMPORTANTE: si nunca activaste RLS en estas tablas, ahora mismo
-- cualquiera que abra las herramientas de desarrollador del
-- navegador puede leer tu llave "anon" (es pública, va incluida
-- en el sitio) y usarla para insertar, editar o borrar filas
-- directamente en tu base de datos -- sin pasar por el login del
-- panel de administración. Corre esto en cada proyecto de
-- Supabase antes de dejarlo en producción.
-- ============================================================

-- 1) Activar RLS. En cuanto se activa, TODO acceso queda
--    bloqueado por default hasta que exista una política que lo
--    permita explícitamente (por eso el orden de este archivo
--    importa: activa RLS y crea las políticas en la misma corrida).
alter table public.ejemplares enable row level security;
alter table public.especies enable row level security;


-- 2) ejemplares: el catálogo público (sin sesión) solo puede LEER
--    los ejemplares marcados como visibles. No puede insertar,
--    editar ni borrar nada.
create policy "Publico lee solo ejemplares visibles"
on public.ejemplares for select
to anon
using (visible_publico = true);

--    Control y Dashboard (con sesión iniciada) ven el 100% del
--    inventario, incluido lo oculto/Holdback, y pueden hacer
--    cualquier operación.
create policy "Autenticados leen todo el inventario"
on public.ejemplares for select
to authenticated
using (true);

create policy "Autenticados insertan ejemplares"
on public.ejemplares for insert
to authenticated
with check (true);

create policy "Autenticados actualizan ejemplares"
on public.ejemplares for update
to authenticated
using (true)
with check (true);

create policy "Autenticados borran ejemplares"
on public.ejemplares for delete
to authenticated
using (true);


-- 3) especies: el catálogo público no la consulta directamente
--    (solo Control, para llenar el select de especies), así que
--    ni siquiera necesita lectura pública.
create policy "Autenticados leen especies"
on public.especies for select
to authenticated
using (true);

create policy "Autenticados insertan especies"
on public.especies for insert
to authenticated
with check (true);

create policy "Autenticados actualizan especies"
on public.especies for update
to authenticated
using (true)
with check (true);

create policy "Autenticados borran especies"
on public.especies for delete
to authenticated
using (true);


-- 4) Verificación rápida: debe regresar "t" (true) en rowsecurity
--    para ambas tablas.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('ejemplares', 'especies');
