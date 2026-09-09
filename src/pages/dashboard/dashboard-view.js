import { supabase } from '../../supabase-config.js';

// ==========================================
// dashboard-view.js
// ------------------------------------------
// Lógica principal de la página Dashboard:
//   1. Guardián de sesión con Supabase Auth.
//   2. Consulta en tiempo real de la tabla "ejemplares".
//   3. KPIs, distribuciones (estatus/sexo/especie/año),
//      alertas de calidad de datos y últimos movimientos.
//
// Todo se calcula en el navegador a partir de la misma
// consulta "select('*')" -- no se agregan llamadas extra
// a Supabase por cada gráfica.
// ==========================================

const COLOR_ESTATUS = {
    DISPONIBLE: '#4CAF50',
    APARTADO: '#EE6C29',
    VENDIDO: '#EF5350',
    HOLDBACK: '#7AA6B3',
};

const LABEL_ESTATUS = {
    DISPONIBLE: 'Disponible',
    APARTADO: 'Apartado',
    VENDIDO: 'Vendido',
    HOLDBACK: 'Holdback',
};

document.addEventListener('DOMContentLoaded', () => {
    initAuthGuard();
});

async function initAuthGuard() {
    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = '/src/pages/admin/admin.html';
        return;
    }

    renderAuthHeaderAction();

    supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession) {
            window.location.href = '/src/pages/admin/admin.html';
        }
    });

    await renderResumenGeneral();
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

async function renderResumenGeneral() {
    try {
        const { data: ejemplares, error } = await supabase
            .from('ejemplares')
            .select('*');

        if (error) {
            console.error('Error al consultar ejemplares:', error);
            mostrarErrorEnKpis();
            return;
        }

        if (!ejemplares || ejemplares.length === 0) {
            mostrarKpisVacios();
            renderBarList('status-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderBarList('sexo-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderBarList('especies-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderYearChart([]);
            renderInsights([]);
            renderRecentTable([]);
            return;
        }

        // -------- Acumuladores --------
        let valorInventario = 0;
        let valorApartado = 0;
        let ventasTotales = 0;
        let disponiblesCount = 0;
        let apartadosCount = 0;
        let vendidosCount = 0;
        let holdbackCount = 0;

        const conteoEspecies = {};
        const conteoSexo = {};
        const conteoEstatus = { DISPONIBLE: 0, APARTADO: 0, VENDIDO: 0, HOLDBACK: 0 };
        const sinImagenDisponibles = [];
        const sinPrecio = [];

        ejemplares.forEach(item => {
            const estatus = (item.estatus || '').trim().toUpperCase();
            const precio = parseFloat(item.precio) || 0;

            if (estatus === 'DISPONIBLE') {
                valorInventario += precio;
                disponiblesCount++;
            } else if (estatus === 'APARTADO') {
                valorApartado += precio;
                apartadosCount++;
            } else if (estatus === 'VENDIDO') {
                ventasTotales += precio;
                vendidosCount++;
            } else if (estatus === 'HOLDBACK') {
                holdbackCount++;
            }

            if (conteoEstatus.hasOwnProperty(estatus)) {
                conteoEstatus[estatus]++;
            }

            if (item.especie) {
                const especieClean = item.especie.trim();
                conteoEspecies[especieClean] = (conteoEspecies[especieClean] || 0) + 1;
            }

            const sexoClean = (item.sexo || 'No especificado').trim();
            conteoSexo[sexoClean] = (conteoSexo[sexoClean] || 0) + 1;

            if (estatus === 'DISPONIBLE' && !item.imagen_url) {
                sinImagenDisponibles.push(item);
            }

            if (!item.precio || parseFloat(item.precio) <= 0) {
                sinPrecio.push(item);
            }
        });

        const especiesOrdenadas = Object.entries(conteoEspecies).sort((a, b) => b[1] - a[1]);
        const topEspecie = especiesOrdenadas.length > 0 ? especiesOrdenadas[0] : ['Sin registro', 0];

        const formatoMoneda = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        });

        // -------- KPIs --------
        actualizarTexto('kpi-valor-inventario', formatoMoneda.format(valorInventario));
        actualizarTexto('kpi-valor-sub', `${disponiblesCount} ejemplares en venta`);

        actualizarTexto('kpi-valor-apartado', formatoMoneda.format(valorApartado));
        actualizarTexto('kpi-apartado-sub', `${apartadosCount} ejemplares apartados`);

        actualizarTexto('kpi-ventas-totales', formatoMoneda.format(ventasTotales));
        actualizarTexto('kpi-ventas-sub', `${vendidosCount} ejemplares vendidos`);

        const ticketPromedio = vendidosCount > 0 ? ventasTotales / vendidosCount : 0;
        actualizarTexto('kpi-ticket-promedio', formatoMoneda.format(ticketPromedio));
        actualizarTexto('kpi-ticket-sub', vendidosCount > 0 ? 'Por ejemplar vendido' : 'Sin ventas registradas');

        actualizarTexto('kpi-total-ejemplares', ejemplares.length.toString());
        actualizarTexto('kpi-disponibles-sub', `${disponiblesCount} disponibles actualmente`);

        actualizarTexto('kpi-top-especie', topEspecie[0]);
        actualizarTexto('kpi-top-especie-count', `${topEspecie[1]} ejemplares registrados`);

        // -------- Estatus del inventario --------
        const statusItems = Object.entries(conteoEstatus)
            .filter(([, count]) => count > 0)
            .map(([key, count]) => ({
                label: LABEL_ESTATUS[key] || key,
                value: count,
                color: COLOR_ESTATUS[key] || '#7AA6B3',
            }));
        renderBarList('status-bar-list', statusItems);

        // -------- Distribución por sexo --------
        const sexoItems = Object.entries(conteoSexo)
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => ({ label, value, color: '#7AA6B3' }));
        renderBarList('sexo-bar-list', sexoItems);

        // -------- Especies con mayor presencia (top 6) --------
        const especiesItems = especiesOrdenadas
            .slice(0, 6)
            .map(([label, value]) => ({ label, value, color: '#EE6C29' }));
        renderBarList('especies-bar-list', especiesItems);

        // -------- Ejemplares por año de nacimiento --------
        renderYearChart(ejemplares);

        // -------- Alertas y sugerencias --------
        const insights = construirInsights({
            total: ejemplares.length,
            topEspecie,
            sinImagenDisponibles,
            sinPrecio,
            holdbackCount,
            apartadosCount,
        });
        renderInsights(insights);

        // -------- Últimos ejemplares agregados --------
        const recientes = [...ejemplares]
            .filter(item => item.created_at)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);
        renderRecentTable(recientes, formatoMoneda);

    } catch (err) {
        console.error('Excepción al procesar estadísticas:', err);
        mostrarErrorEnKpis();
    }
}

// ==========================================
// RENDERIZADO DE COMPONENTES
// ==========================================

function renderBarList(containerId, items, emptyMessage = 'Sin datos suficientes todavía.') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `<p class="dash-loading">${emptyMessage}</p>`;
        return;
    }

    const total = items.reduce((sum, item) => sum + item.value, 0) || 1;

    container.innerHTML = items.map(item => {
        const pct = Math.round((item.value / total) * 100);
        return `
            <div class="bar-row">
                <div class="bar-row-meta">
                    <span class="bar-row-label">${escapeHtml(item.label)}</span>
                    <span class="bar-row-value">${item.value} · ${pct}%</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${pct}%; background-color: ${item.color};"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderYearChart(ejemplares) {
    const container = document.getElementById('year-chart');
    if (!container) return;

    const conteoAnios = {};

    ejemplares.forEach(item => {
        const year = extraerAnio(item.nacimiento);
        if (year) {
            conteoAnios[year] = (conteoAnios[year] || 0) + 1;
        }
    });

    const anios = Object.keys(conteoAnios).map(Number).sort((a, b) => a - b);

    if (anios.length === 0) {
        container.innerHTML = '<p class="dash-loading">No hay años de nacimiento registrados todavía.</p>';
        return;
    }

    const maxCount = Math.max(...anios.map(y => conteoAnios[y]));

    container.innerHTML = anios.map(year => {
        const count = conteoAnios[year];
        const heightPct = Math.max(Math.round((count / maxCount) * 100), 6);
        return `
            <div class="year-bar-col">
                <span class="year-bar-value">${count}</span>
                <div class="year-bar" style="height: ${heightPct}%;"></div>
                <span class="year-bar-label">${year}</span>
            </div>
        `;
    }).join('');
}

function construirInsights({ total, topEspecie, sinImagenDisponibles, sinPrecio, holdbackCount, apartadosCount }) {
    const insights = [];

    if (sinImagenDisponibles.length > 0) {
        insights.push({
            tipo: 'warning',
            icono: '⚠️',
            texto: `${sinImagenDisponibles.length} ejemplar(es) disponible(s) no tienen imagen principal. Sin foto, es muy probable que el catálogo público no los muestre bien — considera completarlos desde Control.`,
        });
    }

    if (sinPrecio.length > 0) {
        insights.push({
            tipo: 'warning',
            icono: '⚠️',
            texto: `${sinPrecio.length} ejemplar(es) no tienen un precio válido registrado. Revísalos en Control para que no aparezcan en $0 en el catálogo.`,
        });
    }

    if (total >= 4 && topEspecie[1] / total > 0.5) {
        const pct = Math.round((topEspecie[1] / total) * 100);
        insights.push({
            tipo: 'info',
            icono: 'ℹ️',
            texto: `${topEspecie[0]} representa el ${pct}% de tu inventario total. Puede ser una buena oportunidad para diversificar especies u ofertas si buscas ampliar tu mercado.`,
        });
    }

    if (apartadosCount > 0) {
        insights.push({
            tipo: 'info',
            icono: 'ℹ️',
            texto: `Tienes ${apartadosCount} ejemplar(es) en estatus "Apartado". Dar seguimiento oportuno a estos apartados ayuda a confirmar la venta antes de que el cliente pierda interés.`,
        });
    }

    if (holdbackCount > 0) {
        insights.push({
            tipo: 'info',
            icono: 'ℹ️',
            texto: `${holdbackCount} ejemplar(es) están marcados como "Holdback" y no se muestran en el catálogo público.`,
        });
    }

    if (insights.length === 0) {
        insights.push({
            tipo: 'success',
            icono: '✅',
            texto: 'Tu inventario luce en orden: no se detectaron datos faltantes ni alertas en este momento.',
        });
    }

    return insights;
}

function renderInsights(insights) {
    const container = document.getElementById('insight-list');
    if (!container) return;

    if (!insights || insights.length === 0) {
        container.innerHTML = '<p class="dash-loading">Sin alertas por el momento.</p>';
        return;
    }

    container.innerHTML = insights.map(insight => `
        <div class="insight-item insight-item--${insight.tipo}">
            <span class="insight-icon">${insight.icono}</span>
            <span>${escapeHtml(insight.texto)}</span>
        </div>
    `).join('');
}

function renderRecentTable(items, formatoMoneda) {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Aún no hay ejemplares registrados.</td></tr>';
        return;
    }

    const formatter = formatoMoneda || new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    });

    tbody.innerHTML = items.map(item => {
        const estatus = (item.estatus || '').trim().toUpperCase();
        const statusClass = `status-${estatus.toLowerCase()}`;
        const fecha = item.created_at
            ? new Date(item.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';
        const precio = item.precio ? formatter.format(parseFloat(item.precio)) : '—';

        return `
            <tr>
                <td>${escapeHtml(item.id ?? '—')}</td>
                <td>${escapeHtml(item.especie ?? '—')}</td>
                <td>${escapeHtml(item.genetica ?? '—')}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(item.estatus ?? '—')}</span></td>
                <td>${precio}</td>
                <td>${fecha}</td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// UTILIDADES
// ==========================================

function actualizarTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function extraerAnio(valor) {
    if (!valor) return null;

    if (typeof valor === 'number' && valor > 1900 && valor < 2100) {
        return valor;
    }

    if (typeof valor === 'string') {
        const cleanVal = valor.trim();
        if (/^\d{4}$/.test(cleanVal)) {
            return parseInt(cleanVal, 10);
        }
        const parsedDate = new Date(cleanVal);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate.getUTCFullYear();
        }
    }

    return null;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function mostrarKpisVacios() {
    actualizarTexto('kpi-valor-inventario', '$0.00');
    actualizarTexto('kpi-valor-sub', 'Sin ejemplares disponibles');
    actualizarTexto('kpi-valor-apartado', '$0.00');
    actualizarTexto('kpi-apartado-sub', 'Sin ejemplares apartados');
    actualizarTexto('kpi-ventas-totales', '$0.00');
    actualizarTexto('kpi-ventas-sub', 'Sin ventas registradas');
    actualizarTexto('kpi-ticket-promedio', '$0.00');
    actualizarTexto('kpi-ticket-sub', 'Sin ventas registradas');
    actualizarTexto('kpi-total-ejemplares', '0');
    actualizarTexto('kpi-disponibles-sub', '0 disponibles');
    actualizarTexto('kpi-top-especie', 'N/A');
    actualizarTexto('kpi-top-especie-count', '0 ejemplares');
}

function mostrarErrorEnKpis() {
    actualizarTexto('kpi-valor-inventario', 'Error');
    actualizarTexto('kpi-valor-apartado', 'Error');
    actualizarTexto('kpi-ventas-totales', 'Error');
    actualizarTexto('kpi-ticket-promedio', 'Error');
    actualizarTexto('kpi-total-ejemplares', 'Error');
    actualizarTexto('kpi-top-especie', 'Error');
}
