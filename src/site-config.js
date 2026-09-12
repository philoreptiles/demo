/**
 * src/site-config.js
 * ---------------------------------------------------------------------
 * PUNTO ÚNICO DE PERSONALIZACIÓN PARA CADA CRIADOR.
 *
 * Antes de este archivo, el nombre de marca ("Escama y Colmillo"), el
 * folio SEMARNAT-PIMVS, el número de WhatsApp y el texto del footer
 * estaban repetidos y hardcodeados en varios archivos distintos
 * (header.js, footer.js, modal.js, admin.html, index.html...). Además
 * había un bug real por esa duplicación: header.js usaba un número de
 * WhatsApp de ejemplo y modal.js usaba OTRO número distinto.
 *
 * Para adaptar este proyecto a un nuevo criador, en la mayoría de los
 * casos basta con:
 *   1. Editar los valores de este archivo (incluidos colors y fonts).
 *   2. Configurar su propio proyecto de Supabase (ver .env.example).
 *
 * Los componentes (header.js, footer.js, modal.js) importan estos
 * valores en vez de tenerlos escritos directamente. Los colores y
 * fuentes se inyectan como variables CSS en tiempo de carga (ver
 * applySiteTheme() más abajo, invocada desde main.js) -- así que
 * NO hace falta tocar ningún archivo .css para cambiar la paleta
 * o la tipografía de un cliente nuevo.
 */

export const siteConfig = {
    brandName: 'Escama y Colmillo',
    // Título de la pestaña del navegador. Si lo dejas vacío (''), se
    // usa automáticamente brandName.
    pageTitle: 'Escama y Colmillo - PIMVS Crotalus',
    // Folio de la Unidad de Manejo para la Conservación de Vida Silvestre
    // (UMA) o registro PIMVS del criador. Déjalo en cadena vacía '' si no
    // aplica y el header simplemente no mostrará esa línea.
    semarnatFolio: 'SEMARNAT-PIMVS-IN-0000-JAL',
    // Número de WhatsApp en formato internacional SIN "+" ni espacios,
    // ej. 521XXXXXXXXXX para México.
    whatsappNumber: '5210000000000',
    location: 'Guadalajara, Jalisco, México',
    footerCopyrightYear: new Date().getFullYear(),

    // Paleta semántica del cliente. Los tonos hover/oscuros derivados
    // (botones al pasar el mouse, etc.) se calculan solos a partir de
    // estos 3 colores con color-mix() en CSS -- no hace falta darlos
    // a mano.
    colors: {
        primary: '#EE6C29',
        secondary: '#7AA6B3',
        background: '#1E2020',
    },

    // Siempre 2 fuentes: encabezados (h1-h6) y cuerpo de texto.
    // Acepta cualquier valor válido de font-family en CSS, con sus
    // fallbacks incluidos.
    fonts: {
        heading: "'Apoc Revelations It', 'Georgia', serif",
        body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    },
};

/**
 * Inyecta colors y fonts de siteConfig como variables CSS en :root.
 * Se llama una sola vez al arrancar cada página (ver main.js,
 * admin-view.js, dashboard-view.js y nosotros.js), antes de que se
 * pinte cualquier componente. NO toca document.title -- cada página
 * define el suyo, porque el título varía según la sección
 * (catálogo / admin / dashboard / nosotros).
 */
export function applySiteTheme(config = siteConfig) {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', config.colors.primary);
    root.style.setProperty('--moonstone-color', config.colors.secondary);
    root.style.setProperty('--bg-color', config.colors.background);
    root.style.setProperty('--jet-dark', config.colors.background);
    root.style.setProperty('--font-primary', config.fonts.heading);
    root.style.setProperty('--font-secondary', config.fonts.body);
}
