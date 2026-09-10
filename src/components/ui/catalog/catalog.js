import { createCardElement } from '../../common/card/card.js';
import { getEjemplares } from '../../../supabase-config.js';
import { openModal } from '../modal/modal.js';

const PAGE_SIZE = 8;

// catalogData ACUMULA todos los ejemplares cargados hasta ahora (todas
// las páginas ya traídas), porque el modal navega "siguiente/anterior"
// contra este arreglo por índice -- no solo contra la última página.
let catalogData = [];

let currentFilters = {};
let currentPage = 1;
let hasMorePages = true;
let isLoadingMore = false;

let containerElement = null;
let gridElement = null;

export async function renderCatalog(containerId, filters = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Toda llamada a renderCatalog() desde afuera (carga inicial o un
    // cambio de filtros) es un catálogo nuevo: se reinicia la
    // paginación desde cero, no se acumula sobre la búsqueda anterior.
    containerElement = container;
    currentFilters = filters;
    currentPage = 1;
    hasMorePages = true;
    isLoadingMore = false;
    catalogData = [];

    container.innerHTML = `
        <div class="catalog-loading">
            <p>Cargando ejemplares...</p>
        </div>
    `;

    try {
        const primeraPagina = await getEjemplares({
            ...currentFilters,
            page: currentPage,
            limit: PAGE_SIZE
        }) || [];

        if (primeraPagina.length === 0) {
            container.innerHTML = `
                <div class="empty-catalog">
                    <h3>Estos ejemplares se movieron de terrario</h3>
                    <p>Prueba con otras características</p>
                    <button type="button" class="btn-clear-filters" id="btn-empty-clear">
                        Limpiar filtros
                    </button>
                </div>
            `;

            const clearBtn = container.querySelector('#btn-empty-clear');
            clearBtn?.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('clearFiltersTrigger'));
            });
            return;
        }

        catalogData = primeraPagina;
        hasMorePages = primeraPagina.length === PAGE_SIZE;

        container.innerHTML = '';

        gridElement = document.createElement('div');
        gridElement.className = 'catalog-grid';
        gridElement.addEventListener('click', handleGridClick);
        container.appendChild(gridElement);

        appendCards(primeraPagina, 0);
        renderLoadMoreButton();

    } catch (error) {
        console.error('Error al renderizar catálogo:', error);
        container.innerHTML = `
            <div class="catalog-error">
                <p>⚠️ Ocurrió un error al cargar la información.</p>
            </div>
        `;
    }
}

function appendCards(ejemplares, startIndex) {
    ejemplares.forEach((ejemplar, i) => {
        const card = createCardElement(ejemplar);
        card.dataset.index = startIndex + i;
        gridElement.appendChild(card);
    });
}

function handleGridClick(event) {
    const card = event.target.closest('.card');
    if (!card) return;

    const index = parseInt(card.dataset.index, 10);
    if (!isNaN(index) && catalogData[index]) {
        // NOTA: el modal navega "siguiente/anterior" sobre catalogData,
        // que solo tiene lo ya cargado. Si el criador tiene, por ejemplo,
        // 20 ejemplares visibles y el visitante todavía no le da
        // "Cargar más", el modal solo podrá recorrer los primeros 8 --
        // no salta a páginas que el navegador nunca pidió. En cuanto se
        // hace clic en "Cargar más" una vez, esos ejemplares ya quedan
        // disponibles para navegar dentro del modal también.
        openModal(catalogData[index], catalogData, index);
    }
}

function renderLoadMoreButton() {
    if (!hasMorePages || !containerElement) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'catalog-load-more-wrapper';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-clear-filters btn-load-more';
    button.textContent = 'Cargar más';
    button.addEventListener('click', handleLoadMoreClick);

    wrapper.appendChild(button);
    containerElement.appendChild(wrapper);
}

async function handleLoadMoreClick(event) {
    if (isLoadingMore) return;

    const button = event.currentTarget;
    const wrapper = button.parentElement;
    const pageToFetch = currentPage + 1;

    isLoadingMore = true;
    button.disabled = true;
    button.textContent = 'Cargando...';

    try {
        const siguientePagina = await getEjemplares({
            ...currentFilters,
            page: pageToFetch,
            limit: PAGE_SIZE
        }) || [];

        currentPage = pageToFetch;
        hasMorePages = siguientePagina.length === PAGE_SIZE;

        if (siguientePagina.length > 0) {
            const startIndex = catalogData.length;
            catalogData = catalogData.concat(siguientePagina);
            appendCards(siguientePagina, startIndex);
        }

        if (hasMorePages) {
            isLoadingMore = false;
            button.disabled = false;
            button.textContent = 'Cargar más';
        } else {
            // Ya no hay más resultados: se quita el botón por completo
            // en vez de dejarlo deshabilitado con texto raro.
            wrapper.remove();
        }

    } catch (error) {
        console.error('Error al cargar más ejemplares:', error);
        isLoadingMore = false;
        button.disabled = false;
        button.textContent = 'Reintentar';
    }
}
