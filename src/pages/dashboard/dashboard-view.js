﻿import { supabase } from '../../supabase-config.js';

// ==========================================
// dashboard-view.js
// ------------------------------------------
// Lógica principal de la página de Estadísticas:
//   1. Guardián de sesión con Supabase Auth.
//   2. Consulta en tiempo real de la tabla "ejemplares".
//   3. Cálculo automático de KPIs (Valor de inventario disponible,
//      ventas acumuladas, disponibilidad y especie dominante).
// ==========================================

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

    // Carga las métricas del inventario
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
            return;
        }

        let valorInventario = 0;
        let ventasTotales = 0;
        let disponiblesCount = 0;
        let vendidosCount = 0;
        const conteoEspecies = {};

        ejemplares.forEach(item => {
            const estatus = (item.estatus || '').trim().toUpperCase();
            const precio = parseFloat(item.precio) || 0;

            if (estatus === 'DISPONIBLE') {
                valorInventario += precio;
                disponiblesCount++;
            } else if (estatus === 'VENDIDO') {
                ventasTotales += precio;
                vendidosCount++;
            }

            if (item.especie) {
                const especieClean = item.especie.trim();
                conteoEspecies[especieClean] = (conteoEspecies[especieClean] || 0) + 1;
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

        actualizarTexto('kpi-ventas-totales', formatoMoneda.format(ventasTotales));
        actualizarTexto('kpi-ventas-sub', `${vendidosCount} ejemplares vendidos`);

        actualizarTexto('kpi-total-ejemplares', ejemplares.length.toString());
        actualizarTexto('kpi-disponibles-sub', `${disponiblesCount} disponibles actualmente`);

        actualizarTexto('kpi-top-especie', topEspecie[0]);
        actualizarTexto('kpi-top-especie-count', `${topEspecie[1]} ejemplares registrados`);

    } catch (err) {
        console.error('Excepción al procesar estadísticas:', err);
        mostrarErrorEnKpis();
    }
}

function actualizarTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function mostrarKpisVacios() {
    actualizarTexto('kpi-valor-inventario', '$0.00');
    actualizarTexto('kpi-valor-sub', 'Sin ejemplares disponibles');
    actualizarTexto('kpi-ventas-totales', '$0.00');
    actualizarTexto('kpi-ventas-sub', 'Sin ventas registradas');
    actualizarTexto('kpi-total-ejemplares', '0');
    actualizarTexto('kpi-disponibles-sub', '0 disponibles');
    actualizarTexto('kpi-top-especie', 'N/A');
    actualizarTexto('kpi-top-especie-count', '0 ejemplares');
}

function mostrarErrorEnKpis() {
    actualizarTexto('kpi-valor-inventario', 'Error');
    actualizarTexto('kpi-ventas-totales', 'Error');
    actualizarTexto('kpi-total-ejemplares', 'Error');
    actualizarTexto('kpi-top-especie', 'Error');
}