import { supabase } from '../../supabase-config.js';
import { siteConfig, applySiteTheme } from '../../site-config.js';

// ==========================================
// dashboard-view.js
// ==========================================

applySiteTheme();
document.title = `Dashboard - ${siteConfig.brandName}`;

// DISPONIBLE/VENDIDO son semáforo fijo (verde=disponible, rojo=vendido)
// y no dependen del cliente. APARTADO y HOLDBACK sí usan la paleta de
// marca del cliente activo (site-config.js).
const COLOR_ESTATUS = {
    DISPONIBLE: '#4CAF50',
    APARTADO: siteConfig.colors.primary,
    VENDIDO: '#EF5350',
    HOLDBACK: siteConfig.colors.secondary,
};

const LABEL_ESTATUS = {
    DISPONIBLE: 'Disponible',
    APARTADO: 'Apartado',
    VENDIDO: 'Vendido',
    HOLDBACK: 'Holdback',
};

const COLOR_SEXO = {
    Macho: '#5B8FB9',
    Hembra: '#F2A6C6',
};
const COLOR_SEXO_DEFAULT = '#8A8F8F';

const ESTATUS_INVENTARIO_ACTIVO = ['DISPONIBLE', 'APARTADO'];
const DIAS_ALERTA_ANTIGUEDAD = 90;

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

// ============================================================
// Utilidades auxiliares
// ============================================================

function valorDe(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function numeroDe(id) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return null;
    const n = parseInt(el.value, 10);
    return isNaN(n) ? null : n;
}

function setValor(id, valor) {
    const el = document.getElementById(id);
    if (el) el.value = valor;
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
        const [ejemplaresRes, especiesRes] = await Promise.all([
            supabase.from('ejemplares').select('*'),
            supabase.from('especies').select('id, nombre')
        ]);

        const { data: ejemplares, error } = ejemplaresRes;

        if (error) {
            console.error('Error al consultar ejemplares:', error);
            mostrarErrorEnKpis();
            return;
        }

        if (especiesRes.error) {
            console.error('Error al consultar especies:', especiesRes.error);
        }

        const especiesMap = new Map(
            (especiesRes.data || []).map(especie => [especie.id, especie.nombre])
        );

        if (!ejemplares || ejemplares.length === 0) {
            mostrarKpisVacios();
            renderPieChart('status-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderSexoPorEstatus('sexo-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderBarList('especies-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderEtapaPriceList([]);
            renderYearChart([]);
            renderInsights([]);
            return;
        }

        let valorInventario = 0;
        let valorApartado = 0;
        let ventasTotales = 0;
        let disponiblesCount = 0;
        let apartadosCount = 0;
        let vendidosCount = 0;
        let holdbackCount = 0;

        const conteoEspecies = {};
        const sexoPorEstatus = { DISPONIBLE: {}, APARTADO: {}, VENDIDO: {}, HOLDBACK: {} };
        const conteoEstatus = { DISPONIBLE: 0, APARTADO: 0, VENDIDO: 0, HOLDBACK: 0 };
        const sinImagenDisponibles = [];
        const sinPrecio = [];
        const sinEspecieId = [];

        const etapaAcumulado = {};
        const antiguedadesDias = [];

        ejemplares.forEach(item => {
            const estatus = (item.estatus || '').trim().toUpperCase();
            const precio = parseFloat(item.precio) || 0;
            const nombreEspecie = resolverEspecie(item, especiesMap);

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

            conteoEspecies[nombreEspecie] = (conteoEspecies[nombreEspecie] || 0) + 1;

            const sexoClean = (item.sexo || 'No especificado').trim() || 'No especificado';
            if (sexoPorEstatus.hasOwnProperty(estatus)) {
                sexoPorEstatus[estatus][sexoClean] = (sexoPorEstatus[estatus][sexoClean] || 0) + 1;
            }

            if (estatus === 'DISPONIBLE' && !item.imagen_url) {
                sinImagenDisponibles.push(item);
            }

            if (!item.precio || parseFloat(item.precio) <= 0) {
                sinPrecio.push(item);
            }

            if (item.especie_id == null) {
                sinEspecieId.push(item);
            }

            if (precio > 0) {
                const etapaClean = (item.etapa || 'Sin etapa').trim() || 'Sin etapa';
                if (!etapaAcumulado[etapaClean]) {
                    etapaAcumulado[etapaClean] = { suma: 0, cantidad: 0 };
                }
                etapaAcumulado[etapaClean].suma += precio;
                etapaAcumulado[etapaClean].cantidad++;
            }

            if (ESTATUS_INVENTARIO_ACTIVO.includes(estatus) && item.created_at) {
                const dias = diasDesde(item.created_at);
                if (dias !== null) {
                    antiguedadesDias.push({ item, dias, nombreEspecie });
                }
            }
        });

        const especiesOrdenadas = Object.entries(conteoEspecies).sort((a, b) => b[1] - a[1]);
        const topEspecie = especiesOrdenadas.length > 0 ? especiesOrdenadas[0] : ['Sin registro', 0];

        const formatoMoneda = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        });

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

        const antiguedadPromedio = antiguedadesDias.length > 0
            ? Math.round(antiguedadesDias.reduce((suma, a) => suma + a.dias, 0) / antiguedadesDias.length)
            : 0;
        actualizarTexto('kpi-antiguedad-promedio', antiguedadesDias.length > 0 ? `${antiguedadPromedio} días` : 'N/A');
        actualizarTexto(
            'kpi-antiguedad-sub',
            antiguedadesDias.length > 0
                ? 'Promedio de disponibles y apartados'
                : 'Sin inventario activo para medir'
        );

        const statusItems = Object.entries(conteoEstatus)
            .filter(([, count]) => count > 0)
            .map(([key, count]) => ({
                label: LABEL_ESTATUS[key] || key,
                value: count,
                color: COLOR_ESTATUS[key] || siteConfig.colors.secondary,
            }));
        renderPieChart('status-bar-list', statusItems, 'Aún no hay ejemplares registrados.');

        const gruposSexo = Object.entries(sexoPorEstatus)
            .map(([estatusKey, conteo]) => {
                const items = Object.entries(conteo)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, value]) => ({ label, value, color: COLOR_SEXO[label] || COLOR_SEXO_DEFAULT }));
                return {
                    label: LABEL_ESTATUS[estatusKey] || estatusKey,
                    total: items.reduce((suma, i) => suma + i.value, 0),
                    items
                };
            });
        renderSexoPorEstatus('sexo-bar-list', gruposSexo, 'Aún no hay ejemplares registrados.');

        const especiesItems = especiesOrdenadas
            .slice(0, 6)
            .map(([label, value]) => ({ label, value, color: siteConfig.colors.primary }));
        renderBarList('especies-bar-list', especiesItems);

        renderEtapaPriceList(etapaAcumulado, formatoMoneda);
        renderYearChart(ejemplares);

        const insights = construirInsights({
            total: ejemplares.length,
            topEspecie,
            sinImagenDisponibles,
            sinPrecio,
            sinEspecieId,
            holdbackCount,
            apartadosCount,
            antiguedadesDias,
        });
        renderInsights(insights);

    } catch (err) {
        console.error('Excepción al procesar estadísticas:', err);
        mostrarErrorEnKpis();
    }
}

function resolverEspecie(item, especiesMap) {
    if (item.especie_id != null && especiesMap.has(item.especie_id)) {
        return especiesMap.get(item.especie_id);
    }
    const legado = (item.especie || '').trim();
    return legado || 'Sin especie';
}

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

function buildDonutSvg(items, size = 150, strokeWidth = 24) {
    const total = items.reduce((suma, item) => suma + item.value, 0);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    if (total <= 0) {
        return `
            <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
                <circle cx="${center}" cy="${center}" r="${radius}" fill="none"
                    stroke="rgba(255,255,255,0.08)" stroke-width="${strokeWidth}" />
            </svg>
        `;
    }

    let acumulado = 0;
    const segmentos = items.map(item => {
        const fraccion = item.value / total;
        const largo = fraccion * circumference;
        const hueco = circumference - largo;
        const dashoffset = -acumulado;
        acumulado += largo;
        return `<circle cx="${center}" cy="${center}" r="${radius}" fill="none"
                    stroke="${item.color}" stroke-width="${strokeWidth}"
                    stroke-dasharray="${largo} ${hueco}" stroke-dashoffset="${dashoffset}"
                    transform="rotate(-90 ${center} ${center})" />`;
    }).join('');

    return `
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
            ${segmentos}
            <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="central"
                font-size="${Math.round(size * 0.17)}" fill="var(--text-light, #F4F5F5)" font-weight="700">${total}</text>
        </svg>
    `;
}

function buildPieLegend(items, total) {
    return `
        <ul class="pie-legend">
            ${items.map(item => {
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return `
                    <li class="pie-legend-item">
                        <span class="pie-legend-swatch" style="background-color: ${item.color};"></span>
                        <span class="bar-row-label">${escapeHtml(item.label)}</span>
                        <span class="bar-row-value">${item.value} · ${pct}%</span>
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

function renderPieChart(containerId, items, emptyMessage = 'Sin datos suficientes todavía.') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `<p class="dash-loading">${emptyMessage}</p>`;
        return;
    }

    const total = items.reduce((suma, item) => suma + item.value, 0);
    container.innerHTML = `
        <div class="pie-chart-block">
            ${buildDonutSvg(items, 120, 20)}
            ${buildPieLegend(items, total)}
        </div>
    `;
}

function renderSexoPorEstatus(containerId, grupos, emptyMessage = 'Sin datos suficientes todavía.') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const gruposConDatos = (grupos || []).filter(g => g.total > 0);

    if (gruposConDatos.length === 0) {
        container.innerHTML = `<p class="dash-loading">${emptyMessage}</p>`;
        return;
    }

    container.innerHTML = `
        <div class="sexo-status-grid">
            ${gruposConDatos.map(grupo => `
                <div class="sexo-status-block">
                    <span class="sexo-status-title">${escapeHtml(grupo.label)} <span class="bar-row-value">(${grupo.total})</span></span>
                    <div class="pie-chart-block pie-chart-block--sm">
                        ${buildDonutSvg(grupo.items, 110, 18)}
                        ${buildPieLegend(grupo.items, grupo.total)}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderEtapaPriceList(etapaAcumulado, formatoMoneda) {
    const container = document.getElementById('etapa-bar-list');
    if (!container) return;

    const formatter = formatoMoneda || new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    });

    const etapas = Object.entries(etapaAcumulado || {})
        .map(([etapa, { suma, cantidad }]) => ({
            etapa,
            promedio: cantidad > 0 ? suma / cantidad : 0,
            cantidad,
        }))
        .sort((a, b) => b.promedio - a.promedio);

    if (etapas.length === 0) {
        container.innerHTML = '<p class="dash-loading">Aún no hay ejemplares con precio y etapa registrados.</p>';
        return;
    }

    const maxPromedio = Math.max(...etapas.map(e => e.promedio)) || 1;

    container.innerHTML = etapas.map(({ etapa, promedio, cantidad }) => {
        const pct = Math.max(Math.round((promedio / maxPromedio) * 100), 4);
        return `
            <div class="bar-row">
                <div class="bar-row-meta">
                    <span class="bar-row-label">${escapeHtml(etapa)}</span>
                    <span class="bar-row-value">${formatter.format(promedio)} · ${cantidad} ejemplar${cantidad === 1 ? '' : 'es'}</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${pct}%; background-color: ${siteConfig.colors.primary};"></div>
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

function construirInsights({
    total,
    topEspecie,
    sinImagenDisponibles,
    sinPrecio,
    sinEspecieId,
    holdbackCount,
    apartadosCount,
    antiguedadesDias
}) {
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

    if (sinEspecieId && sinEspecieId.length > 0) {
        insights.push({
            tipo: 'warning',
            icono: '⚠️',
            texto: `${sinEspecieId.length} ejemplar(es) todavía usan el campo de texto "especie" en vez de estar vinculados a la tabla de especies. Vincúlalos desde Control para que las estadísticas por especie sean exactas.`,
        });
    }

    if (antiguedadesDias && antiguedadesDias.length > 0) {
        const antiguos = antiguedadesDias.filter(a => a.dias >= DIAS_ALERTA_ANTIGUEDAD);
        if (antiguos.length > 0) {
            insights.push({
                tipo: 'warning',
                icono: '⚠️',
                texto: `${antiguos.length} ejemplar(es) llevan ${DIAS_ALERTA_ANTIGUEDAD} días o más en inventario sin venderse. Puede ser momento de revisar su precio o darles más visibilidad.`,
            });
        }
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
    const badge = document.getElementById('insight-count-badge');

    if (badge) {
        if (insights && insights.length > 0) {
            badge.textContent = insights.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

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

function diasDesde(fechaISO) {
    const fecha = new Date(fechaISO);
    if (isNaN(fecha.getTime())) return null;

    const diffMs = Date.now() - fecha.getTime();
    return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
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
    actualizarTexto('kpi-antiguedad-promedio', 'N/A');
    actualizarTexto('kpi-antiguedad-sub', 'Sin inventario activo para medir');
}

function mostrarErrorEnKpis() {
    actualizarTexto('kpi-valor-inventario', 'Error');
    actualizarTexto('kpi-valor-apartado', 'Error');
    actualizarTexto('kpi-ventas-totales', 'Error');
    actualizarTexto('kpi-ticket-promedio', 'Error');
    actualizarTexto('kpi-total-ejemplares', 'Error');
    actualizarTexto('kpi-top-especie', 'Error');
    actualizarTexto('kpi-antiguedad-promedio', 'Error');
}