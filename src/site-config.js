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
 *   1. Editar los valores de este archivo.
 *   2. Editar los colores/tipografías en src/styles/main.css (:root).
 *   3. Configurar su propio proyecto de Supabase (ver .env.example).
 *
 * Los componentes (header.js, footer.js, modal.js) importan estos
 * valores en vez de tenerlos escritos directamente.
 */

export const siteConfig = {
    brandName: 'Escama y Colmillo',
    // Folio de la Unidad de Manejo para la Conservación de Vida Silvestre
    // (UMA) o registro PIMVS del criador. Déjalo en cadena vacía '' si no
    // aplica y el header simplemente no mostrará esa línea.
    semarnatFolio: 'SEMARNAT-PIMVS-IN-0000-JAL',
    // Número de WhatsApp en formato internacional SIN "+" ni espacios,
    // ej. 521XXXXXXXXXX para México.
    whatsappNumber: '5210000000000',
    location: 'Guadalajara, Jalisco, México',
    footerCopyrightYear: new Date().getFullYear(),
};
