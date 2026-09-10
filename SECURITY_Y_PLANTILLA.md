# Seguridad y guía de plantilla — Escama y Colmillo

Este documento resume qué se corrigió en esta revisión, qué debes
configurar tú mismo en Supabase (no se puede hacer desde el código), y
cómo reutilizar este proyecto como plantilla para otros criadores.

---

## 1. Qué se corrigió en el código

| Archivo | Problema | Corrección |
|---|---|---|
| `src/components/common/card/card.js` | XSS almacenado: campos de la BD insertados en `innerHTML` sin escapar | Ahora usa `escapeHTML`/`safeImageUrl` de `src/utils/security.js` |
| `src/components/ui/modal/modal.js` | Mismo problema, más grave por mostrar más campos y construir atributos (`data-src`, `class`) | Igual, todos los campos pasan por `escapeHTML`/`safeImageUrl` |
| `src/pages/admin/admin-view.js` | `uploadImage()` subía el archivo original sin comprimir ni validar tipo/tamaño | Ahora valida tipo/tamaño y comprime con `compressImage()` (1280px, calidad 0.78) antes de subir |
| `src/supabase-config.js` | Tenía tu URL y llave real de Supabase como "respaldo" si faltaban las variables de entorno | Ahora falla con un error claro si faltan `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — evita que un criador use tu proyecto por error |
| `src/pages/login/*`, `src/auth-guard.js` | Login "falso": aceptaba cualquier usuario/contraseña y solo ponía una bandera en `sessionStorage` (bypasseable desde la consola del navegador) | **Eliminados.** El login real ya vive en `admin.html`/`admin-view.js` usando Supabase Auth de verdad |
| `src/utils/helpers.js` | Código muerto (no se usaba en ningún lado) con un error de sintaxis real | Eliminado |
| `src/components/common/footer/footer.js` | Enlazaba públicamente a la URL exacta del panel admin | Se quitó el enlace |
| `src/components/common/header/header.js` + `modal.js` | Número de WhatsApp hardcodeado y **distinto** en cada archivo (bug real) | Centralizado en `src/site-config.js` |
| `src/styles/pages/admin.css` | Header, estadísticas y filtros se apretaban/desbordaban en pantallas de celular | Se agregaron reglas `@media` específicas para el panel admin |

---

## 2. Lo que TÚ debes verificar en Supabase (crítico)

El login ya es real, pero eso solo protege la interfaz. La protección de
fondo depende de que la base de datos rechace escrituras de cualquiera
que no haya iniciado sesión — eso se llama **Row Level Security (RLS)**
y se configura del lado de Supabase, no en este repositorio.

Entra al **SQL Editor** de tu proyecto de Supabase y corre esto (ajusta
el nombre de la tabla si es distinto a `ejemplares`):

```sql
-- 1. Activa RLS en la tabla (si no está activo ya)
alter table ejemplares enable row level security;

-- 2. Cualquiera puede LEER el catálogo (necesario para el sitio público)
create policy "Lectura pública de ejemplares"
on ejemplares for select
to anon, authenticated
using (true);

-- 3. Solo un usuario autenticado (el criador con su login) puede
--    agregar, editar o borrar ejemplares
create policy "Solo autenticados pueden insertar"
on ejemplares for insert
to authenticated
with check (true);

create policy "Solo autenticados pueden actualizar"
on ejemplares for update
to authenticated
using (true)
with check (true);

create policy "Solo autenticados pueden borrar"
on ejemplares for delete
to authenticated
using (true);
```

Y para el bucket de Storage donde se guardan las fotos (`ejemplares`),
en **Storage > Policies**:

```sql
-- Lectura pública de las imágenes (para que el catálogo las muestre)
create policy "Lectura pública de fotos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'ejemplares');

-- Solo autenticados pueden subir/editar/borrar fotos
create policy "Solo autenticados suben fotos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'ejemplares');

create policy "Solo autenticados actualizan fotos"
on storage.objects for update
to authenticated
using (bucket_id = 'ejemplares');

create policy "Solo autenticados borran fotos"
on storage.objects for delete
to authenticated
using (bucket_id = 'ejemplares');
```

**Cómo confirmar que quedó bien:** abre el sitio público en modo
incógnito (sin haber iniciado sesión en `/admin`), abre la consola del
navegador (F12) y corre:

```js
const { data, error } = await window.supabase
  .from('ejemplares')
  .insert({ especie: 'prueba-hacker', precio: 1 });
console.log(error); // Debe mostrar un error de "row-level security policy"
```

Si eso NO da error y realmente inserta un registro, las políticas RLS
no están bien configuradas todavía.

*(Nota: esa prueba requiere exponer `supabase` en `window` temporalmente
o probarlo con `fetch` directo a la REST API de Supabase usando tu llave
anon — si quieres, en el siguiente mensaje te doy el `curl` exacto para
probarlo sin tocar el código del sitio.)*

---

## 2.1 Módulo de Reproducción (nuevo)

Este módulo agrega una tabla nueva, `eventos_reproductivos`, que **no
existe todavía en tu base de datos** ni en la de ningún criador ya
desplegado. Antes de subir este cambio a producción:

1. Abre el **SQL Editor** de cada proyecto de Supabase (el tuyo y el de
   cualquier criador que ya tengas activo) y corre completo el archivo
   `sql/eventos_reproductivos.sql` incluido en este repo. Crea la tabla,
   su índice y sus políticas RLS en un solo paso.
2. No necesitas tocar la tabla `especies` ni `ejemplares` — el módulo
   reutiliza la columna `tipo_reproduccion` de `especies` que ya
   existía (hasta ahora solo se mostraba como texto en Control, sin
   usarse para nada más).
3. A diferencia de `ejemplares`, esta tabla **no tiene lectura
   pública**: solo un usuario autenticado puede leer o escribir en
   ella. Es información interna de manejo, no del catálogo de venta.

## 3. Usar este proyecto como plantilla para otro criador

Pasos, en orden:

1. **Crea un proyecto de Supabase nuevo y separado para ese criador**
   (nunca reutilices el mismo proyecto entre clientes distintos — es la
   única forma real de mantener sus datos aislados). Aplica las
   políticas RLS de la sección 2 en ese proyecto nuevo.
2. Copia `.env.example` a `.env` y llena `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` con las del proyecto nuevo.
3. Edita `src/site-config.js`: nombre de marca, folio SEMARNAT/PIMVS,
   número de WhatsApp, ubicación.
4. Edita la paleta de colores y tipografías en `src/styles/main.css`
   (bloque `:root`) — todo el sitio ya usa esas variables, así que
   cambiarlas ahí se propaga a todo el catálogo, el admin y las tarjetas.
5. Crea el bucket de Storage llamado `ejemplares` en el proyecto nuevo
   de Supabase (Storage > New bucket, público para lectura).
6. Crea al criador como usuario en Supabase Auth (Authentication > Users
   > Add user) para que pueda iniciar sesión en su panel admin.
7. Despliega en Cloudflare Pages configurando las mismas variables de
   entorno del paso 2 en la configuración del proyecto.

Con esto, cada criador queda en su propio proyecto de Supabase, con sus
propios datos, su propio login y sin ningún dato compartido entre
clientes.
