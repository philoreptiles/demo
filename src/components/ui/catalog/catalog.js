import { createCardElement } from '../../common/card/card.js';
import { getEjemplares } from '../../../supabase-config.js';
import { openModal } from '../modal/modal.js';

let catalogData = [];

export async function renderCatalog(containerId, filters = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="catalog-loading">
            <p>Cargando ejemplares...</p>
        </div>
    `;

    try {
        catalogData = await getEjemplares(filters) || [];

        if (catalogData.length === 0) {
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
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    window.dispatchEvent(new CustomEvent('clearFiltersTrigger'));
                });
            }
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'catalog-grid';

        catalogData.forEach((ejemplar, index) => {
            const card = createCardElement(ejemplar);
            card.dataset.index = index;
            grid.appendChild(card);
        });

        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.card');
            if (!card) return;

            const index = parseInt(card.dataset.index, 10);
            if (!isNaN(index) && catalogData[index]) {
                openModal(catalogData[index], catalogData, index);
            }
        });

        container.innerHTML = '';
        container.appendChild(grid);
    } catch (error) {
        console.error('Error al renderizar catálogo:', error);
        container.innerHTML = `
            <div class="catalog-error">
                <p>⚠️ Ocurrió un error al cargar la información.</p>
            </div>
        `;
    }
}