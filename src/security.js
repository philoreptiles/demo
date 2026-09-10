/**
 * src/utils/security.js
 * ---------------------------------------------------------------------
 * Utilidades de saneamiento para evitar XSS (cross-site scripting).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO:
 * Varias vistas (catálogo público, modal de detalle, tabla del admin)
 * insertan datos que vienen directo de la base de datos usando
 * `innerHTML`. Si esos datos no se escapan antes de insertarse, y
 * alguien logra escribir en la tabla `ejemplares` (por un fallo de
 * RLS, una cuenta comprometida, o un futuro formulario público),
 * podría inyectar HTML/JS que se ejecuta en el navegador de CADA
 * visitante del catálogo — un "stored XSS" clásico.
 *
 * Antes de este archivo, `card.js` y `modal.js` interpolaban
 * `especie`, `genetica`, `sexo`, `estatus`, `imagen_url`, etc.
 * directamente en `innerHTML` sin escapar. `admin-view.js` ya hacía
 * un escapado propio (función local `escapeHTML`); aquí se centraliza
 * para que TODAS las vistas usen exactamente la misma lógica.
 *
 * CÓMO USARLO:
 * - `escapeHTML(valor)`: usar en cualquier texto que vaya dentro de
 *   una plantilla `innerHTML`, ya sea como contenido de una etiqueta
 *   o como valor de un atributo (ej. `alt="${escapeHTML(especie)}"`).
 * - `safeImageUrl(url)`: usar específicamente para valores que van en
 *   `src="${...}"` de una imagen. Además de escapar comillas, verifica
 *   que la URL sea http(s) (o relativa) antes de aceptarla, para
 *   evitar esquemas como `javascript:` en un campo mal validado.
 */

export function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Placeholder para ejemplares sin foto (o mientras la foto real
 * todavía no termina de descargarse).
 *
 * ANTES: apuntaba a "https://via.placeholder.com/400x300?text=Sin+Imagen",
 * un servicio externo. Eso significaba una petición de red extra por
 * cada tarjeta sin imagen (lenta en conexiones móviles, y si el
 * servicio fallaba o tardaba, el usuario veía el ícono de "imagen
 * rota" mientras cargaba — exactamente el parpadeo que se quería evitar).
 *
 * AHORA: es un SVG inline como "data URI". No hace ninguna petición de
 * red, se pinta en el mismo instante en que el navegador lee el
 * atributo src, y pesa una fracción de lo que pesa incluso la
 * respuesta más chica de un servidor de imágenes.
 */
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="#1E2020"/>
    <path d="M 90 195 C 90 150, 165 150, 165 195 C 165 240, 240 240, 240 195 C 240 155, 275 145, 295 122"
          fill="none" stroke="#7AA6B3" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="298" cy="116" r="15" fill="#7AA6B3"/>
    <path d="M 310 108 L 322 100 M 310 108 L 322 112" stroke="#7AA6B3" stroke-width="3" stroke-linecap="round"/>
    <text x="200" y="266" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#7AA6B3" text-anchor="middle" opacity="0.85">Sin imagen</text>
</svg>
`.trim();

const PLACEHOLDER_IMG = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/**
 * Devuelve una URL de imagen segura para usar en `src="${...}"`.
 * Si la URL no es http/https (por ejemplo un esquema `javascript:`
 * inyectado en un campo mal saneado en otro punto del sistema),
 * regresa el placeholder en vez de la URL sospechosa.
 */
export function safeImageUrl(url, fallback = PLACEHOLDER_IMG) {
    if (!url) return fallback;

    try {
        // Permite URLs relativas (mismo origen) y absolutas http(s).
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return escapeHTML(url);
        }
    } catch {
        // URL inválida -> cae al fallback
    }

    return fallback;
}
