/**
 * src/components/common/card/card.js
 * ---------------------------------------------------------------------
 * CAMBIO DE SEGURIDAD (ver src/utils/security.js para el detalle):
 * Antes, `especie`, `genetica`, `sexo`, `estatus` e `imagen_url` se
 * insertaban en `innerHTML` sin escapar. Cualquier registro con esos
 * campos manipulados (ej. `especie = "<img src=x onerror=alert(1)>"`)
 * habria ejecutado codigo arbitrario en el navegador de cada visitante
 * del catalogo publico. Ahora todo pasa por `escapeHTML` /
 * `safeImageUrl` antes de insertarse.
 */
import { escapeHTML, safeImageUrl } from '../../../utils/security.js';

export function createCardElement(ejemplar) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = ejemplar.id;

    const precioFormat = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(ejemplar.precio || 0);

    const anio = ejemplar.nacimiento ? String(ejemplar.nacimiento).substring(0, 4) : 'N/A';
    const estatus = ejemplar.estatus || 'Disponible';
    const statusClass = `status-${estatus.toLowerCase().replace(/\s+/g, '-')}`;

    const especie = escapeHTML(ejemplar.especie || 'Crotalus');
    const genetica = escapeHTML(ejemplar.genetica || 'Nominal');
    const sexo = escapeHTML(ejemplar.sexo || 'Sin sexar');
    const imagenUrl = safeImageUrl(ejemplar.imagen_url);

    card.innerHTML = `
        <div class="card-image-wrapper">
            <span class="status-badge ${escapeHTML(statusClass)}">${escapeHTML(estatus)}</span>
            <img src="${imagenUrl}" alt="${especie}" class="card-image" loading="lazy" />
        </div>
        <div class="card-content">
            <span class="card-species">${especie}</span>
            <h3 class="card-genetics">${genetica}</h3>
            <p class="card-details">${sexo} • ${escapeHTML(anio)}</p>
            <p class="card-price">${precioFormat}</p>
        </div>
    `;

    return card;
}
