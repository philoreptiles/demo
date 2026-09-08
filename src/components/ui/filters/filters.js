import { getAniosDisponibles } from '/src/supabase-config.js';

// Función auxiliar para evitar peticiones masivas a Supabase mientras se escribe
function debounce(fn, delay = 300) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

export async function renderFilters(containerId, onApplyCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <form class="filters-panel" id="filters-form">
            <div class="filters-grid">
                <div class="filter-group">
                    <label for="filter-genetica">Genética</label>
                    <input type="text" id="filter-genetica" placeholder="Buscar gen..." />
                </div>
                <div class="filter-group">
                    <label for="filter-estatus">Disponibilidad</label>
                    <select id="filter-estatus">
                        <option value="todos">Todos</option>
                        <option value="Disponible">Disponible</option>
                        <option value="Apartado">Apartado</option>
                        <option value="Vendido">Vendido</option>
                        <option value="Holdback">Holdback</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-sexo">Sexo</label>
                    <select id="filter-sexo">
                        <option value="todos">Todos</option>
                        <option value="Macho">Macho</option>
                        <option value="Hembra">Hembra</option>
                        <option value="Sin sexar">Sin sexar</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-anio">Año</label>
                    <select id="filter-anio">
                        <option value="todos">Todos</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-precio">Rango Precio</label>
                    <select id="filter-precio">
                        <option value="todos">Todos</option>
                        <option value="2000-3999">$2,000 - $3,999</option>
                        <option value="4000-8000">$4,000 - $8,000</option>
                        <option value="8000-14999">$8,000 - $14,999</option>
                        <option value="15000+">Más de $15,000</option>
                    </select>
                </div>
                <div class="filters-actions">
                    <button type="submit" class="btn-apply">Aplicar</button>
                    <button type="button" id="btn-clear-filters" class="btn-clear">Limpiar</button>
                </div>
                <button type="button" id="btn-scroll-top" class="btn-scroll-top" title="Volver al inicio">
                    ↑ Volver arriba
                </button>
            </div>
        </form>
    `;

    const form = document.getElementById('filters-form');
    const clearBtn = document.getElementById('btn-clear-filters');
    const scrollTopBtn = document.getElementById('btn-scroll-top');
    const yearSelect = document.getElementById('filter-anio');

    const getFilterValues = () => ({
        genetica: document.getElementById('filter-genetica').value.trim(),
        estatus: document.getElementById('filter-estatus').value,
        sexo: document.getElementById('filter-sexo').value,
        anio: yearSelect.value,
        precioRango: document.getElementById('filter-precio').value
    });

    const refreshAvailableYears = async () => {
        const currentSelectedYear = yearSelect.value;
        const currentFilters = getFilterValues();
        let availableYears = [];

        try {
            availableYears = (await getAniosDisponibles(currentFilters)) || [];
        } catch (error) {
            console.error('Error al obtener años disponibles:', error);
        }

        yearSelect.innerHTML = '';

        if (!availableYears || availableYears.length === 0) {
            const option = document.createElement('option');
            option.value = 'todos';
            option.textContent = 'Sin años disponibles';
            yearSelect.appendChild(option);
        } else {
            const defaultOption = document.createElement('option');
            defaultOption.value = 'todos';
            defaultOption.textContent = 'Todos';
            yearSelect.appendChild(defaultOption);

            availableYears.forEach(y => {
                const option = document.createElement('option');
                option.value = String(y);
                option.textContent = String(y);
                yearSelect.appendChild(option);
            });

            if (currentSelectedYear !== 'todos' && availableYears.includes(Number(currentSelectedYear))) {
                yearSelect.value = currentSelectedYear;
            } else {
                yearSelect.value = 'todos';
            }
        }
    };

    await refreshAvailableYears();

    const debouncedRefresh = debounce(refreshAvailableYears, 350);

    ['filter-genetica', 'filter-estatus', 'filter-sexo', 'filter-precio'].forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.addEventListener('change', refreshAvailableYears);
            if (elem.tagName === 'INPUT') {
                elem.addEventListener('input', debouncedRefresh);
            }
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        onApplyCallback(getFilterValues());
    });

    const resetAndApply = async () => {
        form.reset();
        await refreshAvailableYears();
        onApplyCallback(getFilterValues());
    };

    if (clearBtn) {
        clearBtn.addEventListener('click', resetAndApply);
    }

    window.addEventListener('clearFiltersTrigger', resetAndApply);

    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 200) {
                scrollTopBtn.classList.add('is-visible');
            } else {
                scrollTopBtn.classList.remove('is-visible');
            }
        });

        scrollTopBtn.addEventListener('click', () => {
            const catalogTarget = document.getElementById('catalog-root');
            if (catalogTarget) {
                const filterHeight = container.offsetHeight || 80;
                const elementPosition = catalogTarget.getBoundingClientRect().top + window.scrollY;
                
                window.scrollTo({
                    top: elementPosition - filterHeight - 10,
                    behavior: 'smooth'
                });
            }
        });
    }
}