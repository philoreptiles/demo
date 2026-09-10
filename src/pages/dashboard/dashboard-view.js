import { supabase } from '../../supabase-config.js';

// ==========================================
// dashboard-view.js
// ------------------------------------------
// Lógica principal de la página Dashboard:
//   1. Guardián de sesión con Supabase Auth.
//   2. Consulta en tiempo real de la tabla "ejemplares" (+ "especies"
//      para resolver especie_id -> nombre real, ver resolverEspecie()).
//   3. KPIs, distribuciones (estatus/sexo/especie/año/etapa), ranking
//      de progenitores, % de linaje documentado, antigüedad de
//      inventario, alertas de calidad de datos y últimos movimientos.
//
// Todo se calcula en el navegador a partir de dos únicas consultas
// ("ejemplares" completo + "especies" completo) -- no se agregan
// llamadas extra a Supabase por cada gráfica.
//
// CAMBIO (relación especie real): "especie" (texto libre) era una
// columna duplicada que se llenaba a mano en Control desde el
// principio del proyecto. Ahora que "ejemplares.especie_id" apunta a
// la tabla "especies", el dashboard resuelve el nombre real de la
// especie por esa relación (resolverEspecie()) y solo cae de vuelta al
// texto libre "especie" para los registros viejos que todavía no
// tienen especie_id asignado -- esos registros además se marcan en la
// sección de Alertas para que el criador los vincule desde Control.
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

// Estatus que cuentan como "inventario activo" para la antigüedad
// (todavía no se vendieron ni están retenidos fuera de venta).
const ESTATUS_INVENTARIO_ACTIVO = ['DISPONIBLE', 'APARTADO'];

// A partir de cuántos días sin venderse se marca una alerta de
// antigüedad en la sección de Alertas y sugerencias.
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
        // Dos consultas en paralelo: los ejemplares completos y el
        // catálogo de especies (solo id + nombre, es una tabla chica)
        // para poder resolver especie_id -> nombre real.
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
            // No es un error fatal para el dashboard: si falla la
            // consulta de especies simplemente no se podrá resolver
            // especie_id y todo cae de vuelta al texto libre "especie".
            console.error('Error al consultar especies:', especiesRes.error);
        }

        const especiesMap = new Map(
            (especiesRes.data || []).map(especie => [especie.id, especie.nombre])
        );

        if (!ejemplares || ejemplares.length === 0) {
            mostrarKpisVacios();
            renderBarList('status-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderBarList('sexo-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderBarList('especies-bar-list', [], 'Aún no hay ejemplares registrados.');
            renderEtapaPriceList([]);
            renderYearChart([]);
            renderProgenitoresRanking([], especiesMap);
            renderInsights([]);
            renderRecentTable([], null, especiesMap);
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
        const sinEspecieId = [];

        // Para "Precio promedio por etapa": suma y conteo por etapa.
        const etapaAcumulado = {};

        // Para antigüedad de inventario (solo Disponible/Apartado).
        const antiguedadesDias = [];

        // Para % de linaje documentado.
        let linajeCompleto = 0; // padre y madre registrados
        let linajeParcial = 0;  // solo uno de los dos

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

            const sexoClean = (item.sexo || 'No especificado').trim();
            conteoSexo[sexoClean] = (conteoSexo[sexoClean] || 0) + 1;

            if (estatus === 'DISPONIBLE' && !item.imagen_url) {
                sinImagenDisponibles.push(item);
            }

            if (!item.precio || parseFloat(item.precio) <= 0) {
                sinPrecio.push(item);
            }

            if (item.especie_id == null) {
                sinEspecieId.push(item);
            }

            // Precio promedio por etapa (solo con precio válido, para
            // que un ejemplar en $0 no jale el promedio hacia abajo).
            if (precio > 0) {
                const etapaClean = (item.etapa || 'Sin etapa').trim() || 'Sin etapa';
                if (!etapaAcumulado[etapaClean]) {
                    etapaAcumulado[etapaClean] = { suma: 0, cantidad: 0 };
                }
                etapaAcumulado[etapaClean].suma += precio;
                etapaAcumulado[etapaClean].cantidad++;
            }

            // Antigüedad: días desde created_at, solo inventario activo.
            if (ESTATUS_INVENTARIO_ACTIVO.includes(estatus) && item.created_at) {
                const dias = diasDesde(item.created_at);
                if (dias !== null) {
                    antiguedadesDias.push({ item, dias, nombreEspecie });
                }
            }

            // Linaje documentado.
            const tienePadre = !!item.id_padre;
            const tieneMadre = !!item.id_madre;
            if (tienePadre && tieneMadre) {
                linajeCompleto++;
            } else if (tienePadre || tieneMadre) {
                linajeParcial++;
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

        // Módulo "KPIs por Sector · Ventas": reutiliza el mismo cálculo,
        // no se vuelve a consultar Supabase para esto.
        actualizarTexto('sector-ticket-medio', formatoMoneda.format(ticketPromedio));
        actualizarTexto(
            'sector-ticket-medio-sub',
            vendidosCount > 0 ? `Sobre ${vendidosCount} venta${vendidosCount === 1 ? '' : 's'} registrada${vendidosCount === 1 ? '' : 's'}` : 'Sin ventas registradas'
        );

        actualizarTexto('kpi-total-ejemplares', ejemplares.length.toString());
        actualizarTexto('kpi-disponibles-sub', `${disponiblesCount} disponibles actualmente`);

        actualizarTexto('kpi-top-especie', topEspecie[0]);
        actualizarTexto('kpi-top-especie-count', `${topEspecie[1]} ejemplares registrados`);

        // Antigüedad de inventario (nuevo).
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

        // % de linaje documentado (nuevo).
        const totalConLinaje = linajeCompleto + linajeParcial;
        const pctLinaje = ejemplares.length > 0 ? Math.round((totalConLinaje / ejemplares.length) * 100) : 0;
        actualizarTexto('kpi-linaje-pct', `${pctLinaje}%`);
        actualizarTexto(
            'kpi-linaje-sub',
            `${linajeCompleto} con ambos padres · ${linajeParcial} con solo uno`
        );

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

        // -------- Precio promedio por etapa (nuevo) --------
        renderEtapaPriceList(etapaAcumulado, formatoMoneda);

        // -------- Ejemplares por año de nacimiento --------
        renderYearChart(ejemplares);

        // -------- Ranking de progenitores (nuevo) --------
        renderProgenitoresRanking(ejemplares, especiesMap);

        // -------- Alertas y sugerencias --------
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

        // -------- Últimos ejemplares agregados --------
        const recientes = [...ejemplares]
            .filter(item => item.created_at)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);
        renderRecentTable(recientes, formatoMoneda, especiesMap);

    } catch (err) {
        console.error('Excepción al procesar estadísticas:', err);
        mostrarErrorEnKpis();
    }
}

// ==========================================
// RESOLUCIÓN DE ESPECIE (relación real vs. texto legado)
// ==========================================

/**
 * Devuelve el nombre de la especie de un ejemplar usando la relación
 * real (especie_id -> especies.nombre) cuando existe. Si el ejemplar
 * todavía no tiene especie_id asignado (registros capturados antes de
 * que existiera la relación), cae de vuelta al campo de texto libre
 * "especie" para no perder el dato, y ese caso se reporta aparte en
 * construirInsights() como pendiente de vincular.
 */
function resolverEspecie(item, especiesMap) {
    if (item.especie_id != null && especiesMap.has(item.especie_id)) {
        return especiesMap.get(item.especie_id);
    }
    const legado = (item.especie || '').trim();
    return legado || 'Sin especie';
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

/**
 * Precio promedio por etapa. A diferencia de renderBarList (que
 * escala barras como % del total de conteos), aquí cada barra se
 * escala respecto al promedio MÁS ALTO entre etapas, porque lo que se
 * compara es un precio promedio, no una parte de un total.
 */
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
                    <div class="bar-fill" style="width: ${pct}%; background-color: #EE6C29;"></div>
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

/**
 * Ranking de progenitores: cuenta, para cada id que aparece como
 * id_padre o id_madre de al menos un ejemplar, cuántas crías tiene
 * registradas y el valor total (suma de "precio") de esas crías.
 * El nombre/especie del progenitor se resuelve buscando su propio
 * registro dentro del mismo arreglo de ejemplares (por su "id") --
 * no hace falta una consulta aparte a Supabase.
 */
function renderProgenitoresRanking(ejemplares, especiesMap) {
    const container = document.getElementById('progenitores-list');
    if (!container) return;

    const ejemplaresPorId = new Map(ejemplares.map(item => [item.id, item]));
    const progenitores = new Map(); // id -> { crias, valorCrias, roles:Set }

    ejemplares.forEach(item => {
        const precio = parseFloat(item.precio) || 0;

        [
            { id: item.id_padre, rol: 'Padre' },
            { id: item.id_madre, rol: 'Madre' }
        ].forEach(({ id, rol }) => {
            if (!id) return;

            if (!progenitores.has(id)) {
                progenitores.set(id, { crias: 0, valorCrias: 0, roles: new Set() });
            }
            const registro = progenitores.get(id);
            registro.crias++;
            registro.valorCrias += precio;
            registro.roles.add(rol);
        });
    });

    if (progenitores.size === 0) {
        container.innerHTML = `
            <p class="dash-loading">
                Aún no hay ejemplares con "Padre" o "Madre" capturados en Control.
            </p>
        `;
        return;
    }

    const formatoMoneda = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0
    });

    const ranking = Array.from(progenitores.entries())
        .sort((a, b) => b[1].crias - a[1].crias)
        .slice(0, 5);

    const maxCrias = ranking[0][1].crias || 1;

    container.innerHTML = ranking.map(([id, datos]) => {
        const propioRegistro = ejemplaresPorId.get(id);
        const nombreEspecie = propioRegistro
            ? resolverEspecie(propioRegistro, especiesMap)
            : 'Sin registro propio en el inventario';
        const rolTexto = Array.from(datos.roles).join(' / ');
        const pct = Math.max(Math.round((datos.crias / maxCrias) * 100), 4);

        return `
            <div class="bar-row">
                <div class="bar-row-meta">
                    <span class="bar-row-label">${escapeHtml(id)} <span class="bar-row-tag">${escapeHtml(rolTexto)} · ${escapeHtml(nombreEspecie)}</span></span>
                    <span class="bar-row-value">${datos.crias} cría${datos.crias === 1 ? '' : 's'} · ${formatoMoneda.format(datos.valorCrias)}</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${pct}%; background-color: #7AA6B3;"></div>
                </div>
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

function renderRecentTable(items, formatoMoneda, especiesMap) {
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
        const nombreEspecie = especiesMap ? resolverEspecie(item, especiesMap) : (item.especie ?? '—');

        return `
            <tr>
                <td>${escapeHtml(item.id ?? '—')}</td>
                <td>${escapeHtml(nombreEspecie)}</td>
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

/**
 * Días completos transcurridos desde una fecha (created_at) hasta
 * ahora. Devuelve null si la fecha no es válida, para que quien la
 * use pueda decidir si la descarta en vez de sumar un NaN.
 */
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
    actualizarTexto('kpi-linaje-pct', '0%');
    actualizarTexto('kpi-linaje-sub', '0 con ambos padres · 0 con solo uno');
    actualizarTexto('sector-ticket-medio', '$0.00');
    actualizarTexto('sector-ticket-medio-sub', 'Sin ventas registradas');
}

function mostrarErrorEnKpis() {
    actualizarTexto('kpi-valor-inventario', 'Error');
    actualizarTexto('kpi-valor-apartado', 'Error');
    actualizarTexto('kpi-ventas-totales', 'Error');
    actualizarTexto('kpi-ticket-promedio', 'Error');
    actualizarTexto('kpi-total-ejemplares', 'Error');
    actualizarTexto('kpi-top-especie', 'Error');
    actualizarTexto('kpi-antiguedad-promedio', 'Error');
    actualizarTexto('kpi-linaje-pct', 'Error');
    actualizarTexto('sector-ticket-medio', 'Error');
}
