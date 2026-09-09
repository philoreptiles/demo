# ============================================================
# crear-dashboard.ps1
# ------------------------------------------------------------
# Crea la carpeta y los 3 archivos base de la nueva página
# "Estadísticas" (dashboard.html). Corre este script DESDE LA RAÍZ
# de tu proyecto (la misma carpeta donde están package.json y
# vite.config.js), así:
#
#   .\crear-dashboard.ps1
#
# Si algún archivo ya existe, el script lo avisa y NO lo sobrescribe
# (para no perder trabajo que ya hayas hecho a mano).
# ============================================================

$ErrorActionPreference = 'Stop'

# --- 1. Verificación de que estás en la raíz correcta ---
if (-not (Test-Path 'package.json')) {
    Write-Host "No se encontró package.json en esta carpeta." -ForegroundColor Red
    Write-Host "Corre este script desde la raíz de tu proyecto (junto a package.json y vite.config.js)." -ForegroundColor Yellow
    exit 1
}

# --- 2. Crear carpetas necesarias ---
$carpetaDashboard = 'src\pages\dashboard'
$carpetaEstilos = 'src\styles\pages'

New-Item -ItemType Directory -Force -Path $carpetaDashboard | Out-Null
New-Item -ItemType Directory -Force -Path $carpetaEstilos | Out-Null

# --- 3. Definir rutas finales de los 3 archivos ---
$rutaHtml = Join-Path $carpetaDashboard 'dashboard.html'
$rutaJs   = Join-Path $carpetaDashboard 'dashboard-view.js'
$rutaCss  = Join-Path $carpetaEstilos   'dashboard.css'

# --- 4. Contenido de cada archivo ---
# Se usan here-strings de COMILLA SIMPLE (@' ... '@) para que
# PowerShell no interprete los backticks ni el "$" del código como
# variables propias de PowerShell — se pega el contenido tal cual.

$contenidoHtml = @'
﻿<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Estadísticas - Escama y Colmillo</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <!--
        Se reutiliza admin.css completo (header, ".premium-card",
        ".dashboard-header", botones, etc.) en vez de duplicar esas
        reglas aquí — esta página es visualmente "la misma app" que
        el panel de inventario. dashboard.css solo va a tener las
        reglas nuevas que sean exclusivas de gráficas/estadísticas,
        que admin.css no tiene motivo para conocer.
    -->
    <link rel="stylesheet" href="../../styles/main.css">
    <link rel="stylesheet" href="../../styles/pages/admin.css">
    <link rel="stylesheet" href="../../styles/pages/dashboard.css">
</head>
<body>

    <!--
        Header idéntico al de admin.html a propósito: son la misma
        "app" de administración vista desde dos páginas distintas
        (inventario vs. estadísticas), así que comparten navegación.
        "auth-header-action" lo llena dashboard-view.js con el botón
        "Cerrar sesión" una vez que confirma que hay sesión activa.
    -->
    <header class="header">
        <div class="header-container">
            <a href="/index.html" class="logo-link">
                <span class="brand-title">ESCAMA Y COLMILLO</span>
            </a>
            <nav class="nav-menu">
                <a href="/src/pages/admin/admin.html" class="nav-link">Inventario</a>
                <a href="/src/pages/dashboard/dashboard.html" class="nav-link">Estadísticas</a>
                <div id="auth-header-action"></div>
            </nav>
        </div>
    </header>

    <main class="admin-main">

        <div class="dashboard-header">
            <h1>Estadísticas del Negocio</h1>
            <p>Un vistazo rápido a tu inventario y tus ventas.</p>
        </div>

        <!--
            Placeholder de la Fase 1 (ver conversación previa):
            valor de inventario disponible, ingresos totales, y
            distribución por especie/genética — todo calculable con
            los datos que YA existen en la tabla "ejemplares", sin
            tocar el esquema de la base de datos.
            Los "id" ya están listos para que dashboard-view.js los
            llene; por ahora solo muestran un placeholder.
        -->
        <section class="premium-card">
            <h2 class="card-title">Resumen general</h2>
            <p id="dashboard-placeholder-msg" style="color: var(--color-text-muted);">
                Próximamente: valor del inventario, ingresos totales y
                distribución por especie/genética.
            </p>
        </section>

    </main>

    <script type="module" src="./dashboard-view.js"></script>
</body>
</html>
'@

$contenidoJs = @'
﻿import { supabase } from '../../supabase-config.js';

// ==========================================
// dashboard-view.js
// ------------------------------------------
// Punto de partida de la página de Estadísticas. Por ahora solo:
//   1. Verifica que haya una sesión de Supabase Auth activa.
//   2. Si NO la hay, redirige a admin.html (ahí vive el único
//      formulario de login del sitio; no lo duplicamos aquí).
//   3. Si SÍ la hay, muestra el botón "Cerrar sesión" en el header
//      (igual que en admin-view.js) y deja el lugar listo para que,
//      en el siguiente paso, aquí se agregue el cálculo real de las
//      tarjetas de la Fase 1 (valor de inventario disponible,
//      ingresos totales, distribución por especie/genética).
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initAuthGuard();
});

async function initAuthGuard() {

    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
        // Sin sesión activa: no tiene caso mostrar esta página vacía,
        // mandamos directo al login real (dentro de admin.html).
        window.location.href = '/src/pages/admin/admin.html';
        return;
    }

    renderAuthHeaderAction();

    // Si la sesión se cierra desde OTRA pestaña (o expira), reacciona
    // igual que admin-view.js: no te deja viendo una página de
    // estadísticas con una sesión que ya no es válida.
    supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession) {
            window.location.href = '/src/pages/admin/admin.html';
        }
    });

    // A partir de aquí se llamará, en el siguiente paso de desarrollo,
    // a la función que trae los datos de "ejemplares" y llena las
    // tarjetas de estadísticas (todavía no implementada).
    // renderResumenGeneral();
}

function renderAuthHeaderAction() {

    const authHeaderAction = document.getElementById('auth-header-action');
    if (!authHeaderAction) return;

    authHeaderAction.innerHTML = `
        <button id="btn-logout" class="btn-secondary-premium">
            Cerrar sesión
        </button>
    `;

    document
        .getElementById('btn-logout')
        ?.addEventListener('click', () => supabase.auth.signOut());
}
'@

$contenidoCss = @'
﻿/* ============================================================
   dashboard.css
   ------------------------------------------------------------
   Archivo intencionalmente casi vacío por ahora. dashboard.html
   ya importa admin.css, así que header, ".premium-card",
   ".dashboard-header", botones y el sistema de colores (:root)
   se heredan de ahí sin duplicar nada.

   Aquí solo van a vivir, en los próximos pasos de desarrollo,
   los estilos que sean EXCLUSIVOS de esta página: tarjetas de
   métricas más grandes, contenedores de gráficas, tablas de
   "inventario envejecido", etc.

   Se mantiene la misma metodología Mobile-First que el resto del
   proyecto: todo lo que se agregue fuera de un @media es la
   versión para celular, y un único bloque
   @media (min-width: 768px) al final ajusta tablet/escritorio.
   ============================================================ */
'@

# --- 5. Escribir cada archivo, sin pisar los que ya existan ---
function Crear-ArchivoSiNoExiste($ruta, $contenido) {
    if (Test-Path $ruta) {
        Write-Host "Ya existe, no se toca: $ruta" -ForegroundColor Yellow
    } else {
        # -Encoding utf8 en Windows PowerShell 5.1 agrega BOM, que es
        # el mismo formato que ya usan los demás archivos del proyecto.
        $contenido | Out-File -FilePath $ruta -Encoding utf8 -NoNewline
        Write-Host "Creado: $ruta" -ForegroundColor Green
    }
}

Crear-ArchivoSiNoExiste $rutaHtml $contenidoHtml
Crear-ArchivoSiNoExiste $rutaJs   $contenidoJs
Crear-ArchivoSiNoExiste $rutaCss  $contenidoCss

Write-Host ""
Write-Host "Listo. Falta un paso manual (ver mensaje del chat):" -ForegroundColor Cyan
Write-Host "agregar 'dashboard' a rollupOptions.input en vite.config.js." -ForegroundColor Cyan
