/**
 * src/components/common/header/header.js
 * CAMBIO: el nombre de marca, el folio SEMARNAT y el numero de WhatsApp
 * ahora vienen de src/site-config.js en vez de estar escritos aqui, para
 * que cambiarlos entre criadores no requiera tocar este componente.
 */
import { siteConfig } from '../../../site-config.js';

export async function renderHeader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const folioHTML = siteConfig.semarnatFolio
        ? `<span class="semarnat-tag">${siteConfig.semarnatFolio}</span>`
        : '';

    container.innerHTML = `
        <header class="site-header">
            <div class="header-container">
                <a href="/index.html" class="brand-info">
                    <span class="brand-title">${siteConfig.brandName}</span>
                    ${folioHTML}
                </a>
                <nav class="header-nav">
                    <a href="/index.html" class="nav-btn">Ejemplares</a>
                    <a href="/nosotros.html" class="nav-btn">Nosotros</a>
                    <a href="https://wa.me/${siteConfig.whatsappNumber}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn">
                        <span>WhatsApp</span>
                    </a>
                </nav>
            </div>
        </header>
    `;
}
