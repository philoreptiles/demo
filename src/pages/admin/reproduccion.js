import { supabase, getEspecies } from '../../supabase-config.js';
import { escapeHTML } from '../../utils/security.js';

// ==========================================
// reproduccion.js
// ------------------------------------------
// Módulo de "Camadas" / eventos reproductivos. Vive como archivo
// aparte (no dentro de admin-view.js) para no seguir haciendo crecer
// ese archivo, y porque su ciclo de vida es independiente: escucha su
// propia sesión de Supabase Auth igual que dashboard-view.js hace en
// su página.
//
// Este módulo está pensado para los dos casos reales del cliente,
// no para cubrir "reproducción" en abstracto:
//
//   OVÍPARAS (ej. Python regius / bola africana) -- 3 etapas:
//     1. Apareamiento/bloqueo -> fecha estimada de puesta.
//     2. Puesta real: huevos fértiles / huevos no fértiles.
//     3. Eclosión: huevos eclosionados / huevos perdidos (de aquí
//        sale la estadística de sobrevivencia por huevo).
//
//   OVOVIVÍPARAS (ej. Boa constrictor/imperator) -- 2 etapas:
//     1. Último día que estuvo junta la pareja + día de la ovulación
//        (si se detectó) -> fecha esperada de parto.
//     2. Parto real: crías vivas / slugs / stillborns.
//
// No se pide ninguna "cantidad esperada": antes de que ocurra el
// evento (puesta o parto) esa cifra es pura especulación y no aporta
// nada verificable.
//
// La etiqueta de "fecha esperada" (y la de "fecha de
// apareamiento/bloqueo") cambia sola según el tipo de reproducción de
// la especie de la hembra elegida. Esa decisión se toma UNA vez al
// crear el evento y se guarda en la fila (columna tipo_reproduccion)
// -- así el Dashboard no necesita volver a resolverla con un JOIN.
// ==========================================

let especiesCache = [];
let hembrasCache = [];
let machosCache = [];

document.addEventListener('DOMContentLoaded', () => {
    initReproduccion();
});

async function initReproduccion() {
    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (session) {
        await cargarDatosBase();
    }

    // admin-view.js ya controla mostrar/ocultar #admin-dashboard según
    // la sesión; aquí solo nos importa (re)cargar nuestros propios
    // datos cuando el criador inicia o cierra sesión.
    supabase.auth.onAuthStateChange((_event, newSession) => {
        if (newSession) {
            cargarDatosBase();
        } else {
            especiesCache = [];
            hembrasCache = [];
            machosCache = [];
        }
    });

    setupFormListener();
}

async function cargarDatosBase() {
    const [especies, ejemplares] = await Promise.all([
        getEspecies(),
        cargarEjemplaresParaSelects()
    ]);

    especiesCache = especies;
    hembrasCache = ejemplares.filter(e => e.sexo === 'Hembra');
    machosCache = ejemplares.filter(e => e.sexo === 'Macho');

    poblarSelectsEjemplares();
    await cargarEventos();
}

async function cargarEjemplaresParaSelects() {
    const { data, error } = await supabase
        .from('ejemplares')
        .select('id, especie, especie_id, genetica, sexo');

    if (error) {
        console.error('Error al cargar ejemplares para Reproducción:', error);
        return [];
    }
    return data || [];
}

function nombreEspecieDe(ejemplar) {
    if (ejemplar.especie_id != null) {
        const especie = especiesCache.find(e => e.id === ejemplar.especie_id);
        if (especie) return especie.nombre;
    }
    return (ejemplar.especie || '').trim() || 'Especie sin registrar';
}

function tipoReproduccionDe(ejemplar) {
    if (ejemplar.especie_id != null) {
        const especie = especiesCache.find(e => e.id === ejemplar.especie_id);
        if (especie) return especie.tipo_reproduccion || null;
    }
    return null;
}

function poblarSelectsEjemplares() {
    const selectHembra = document.getElementById('repro-hembra');
    const selectMacho = document.getElementById('repro-macho');

    if (selectHembra) {
        selectHembra.innerHTML = hembrasCache.length
            ? `<option value="">Selecciona una hembra</option>${hembrasCache
                  .map(h => `<option value="${escapeHTML(h.id)}">${escapeHTML(h.id)} — ${escapeHTML(nombreEspecieDe(h))} ${escapeHTML(h.genetica || '')}</option>`)
                  .join('')}`
            : `<option value="">No hay ejemplares marcados como "Hembra" todavía</option>`;
    }

    if (selectMacho) {
        selectMacho.innerHTML = `<option value="">Sin registrar</option>${machosCache
            .map(m => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.id)} — ${escapeHTML(nombreEspecieDe(m))} ${escapeHTML(m.genetica || '')}</option>`)
            .join('')}`;
    }

    actualizarEtiquetaFechaEsperada();
}

/**
 * Cambia las etiquetas del formulario (fecha de inicio, ovulación,
 * fecha esperada) según el tipo de reproducción de la especie de la
 * hembra seleccionada. Si todavía no se elige hembra, o su especie no
 * tiene tipo de reproducción registrado, se queda con etiquetas
 * genéricas y se oculta el campo de ovulación (solo aplica a
 * ovovivíparas).
 */
function actualizarEtiquetaFechaEsperada() {
    const selectHembra = document.getElementById('repro-hembra');
    const labelInicio = document.getElementById('repro-fecha-inicio-label');
    const grupoOvulacion = document.getElementById('repro-fecha-ovulacion-grupo');
    const label = document.getElementById('repro-fecha-esperada-label');
    const ayuda = document.getElementById('repro-fecha-esperada-ayuda');
    if (!selectHembra || !label) return;

    const hembra = hembrasCache.find(h => String(h.id) === String(selectHembra.value));
    const tipo = hembra ? tipoReproduccionDe(hembra) : null;

    if (tipo === 'Ovípara') {
        if (labelInicio) labelInicio.textContent = 'Fecha de apareamiento/bloqueo *';
        grupoOvulacion?.classList.add('hidden');
        label.textContent = 'Fecha estimada de puesta';
        if (ayuda) ayuda.textContent = 'Puedes dejarla en blanco si todavía no lo sabes y completarla después.';
    } else if (tipo === 'Ovovivípara') {
        if (labelInicio) labelInicio.textContent = 'Último día que estuvo junta la pareja *';
        grupoOvulacion?.classList.remove('hidden');
        label.textContent = 'Fecha esperada de parto';
        if (ayuda) ayuda.textContent = 'Puedes dejarla en blanco si todavía no lo sabes y completarla después.';
    } else {
        if (labelInicio) labelInicio.textContent = 'Fecha de apareamiento/bloqueo *';
        grupoOvulacion?.classList.add('hidden');
        label.textContent = 'Fecha esperada';
        if (ayuda) ayuda.textContent = 'Elige primero la hembra para que esta etiqueta se ajuste a su tipo de reproducción.';
    }
}

function setupFormListener() {
    document
        .getElementById('repro-hembra')
        ?.addEventListener('change', actualizarEtiquetaFechaEsperada);

    const form = document.getElementById('repro-form');
    form?.addEventListener('submit', async event => {
        event.preventDefault();

        const hembraId = document.getElementById('repro-hembra')?.value;
        const machoId = document.getElementById('repro-macho')?.value || null;
        const fechaInicio = document.getElementById('repro-fecha-inicio')?.value;
        const fechaOvulacion = document.getElementById('repro-fecha-ovulacion')?.value || null;
        const fechaEsperada = document.getElementById('repro-fecha-esperada')?.value || null;
        const notas = document.getElementById('repro-notas')?.value.trim() || null;

        if (!hembraId || !fechaInicio) {
            showReproAlert('Elige la hembra y la fecha de apareamiento/bloqueo.', 'error');
            return;
        }

        const hembra = hembrasCache.find(h => String(h.id) === String(hembraId));
        const tipo = hembra ? tipoReproduccionDe(hembra) : null;

        const nuevoEvento = {
            hembra_id: hembraId,
            macho_id: machoId,
            hembra_label: hembraId,
            especie_nombre: hembra ? nombreEspecieDe(hembra) : null,
            tipo_reproduccion: tipo,
            fecha_inicio: fechaInicio,
            // La ovulación solo aplica a ovovivíparas; si la especie es
            // ovípara o no tiene tipo registrado, no tiene sentido guardarla.
            fecha_ovulacion: tipo === 'Ovovivípara' ? fechaOvulacion : null,
            fecha_esperada: fechaEsperada,
            notas,
            estado: 'EN_CURSO'
        };

        const { error } = await supabase.from('eventos_reproductivos').insert([nuevoEvento]);

        if (error) {
            console.error('Error al registrar evento reproductivo:', error);
            showReproAlert(`No se pudo registrar el evento: ${error.message}`, 'error');
            return;
        }

        showReproAlert('Evento reproductivo registrado.', 'success');
        form.reset();
        actualizarEtiquetaFechaEsperada();
        await cargarEventos();
    });
}

async function cargarEventos() {
    const contenedor = document.getElementById('repro-eventos-list');
    if (!contenedor) return;

    const { data, error } = await supabase
        .from('eventos_reproductivos')
        .select('*')
        // EN_CURSO: esperando puesta/parto. PUESTA_REGISTRADA: solo existe
        // para ovíparas, esperando eclosión. Ambos son "en curso" para el
        // criador -- lo que ya se cerró es COMPLETADO/CANCELADO.
        .in('estado', ['EN_CURSO', 'PUESTA_REGISTRADA'])
        .order('fecha_esperada', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('Error al cargar eventos reproductivos:', error);
        contenedor.innerHTML = '<p class="dash-loading">No se pudieron cargar los eventos.</p>';
        return;
    }

    renderEventos(data || [], contenedor);
}

/**
 * Devuelve la config de la "siguiente etapa" para un evento: qué
 * botón mostrar, qué campos pedir en el form inline y cómo guardarlos.
 * Ovípara tiene dos etapas posibles (puesta, luego eclosión);
 * Ovovivípara tiene una sola (parto). Si el tipo no está registrado
 * (especie vieja sin tipo_reproduccion), no se ofrece ninguna etapa
 * estructurada -- solo cancelar -- porque no sabemos qué campos pedir.
 */
function siguienteEtapaDe(ev) {
    if (ev.tipo_reproduccion === 'Ovípara' && ev.estado === 'EN_CURSO') {
        return {
            boton: 'Registrar puesta',
            campos: [
                { clase: 'repro-input-fecha', tipo: 'date', label: 'Fecha de la puesta' },
                { clase: 'repro-input-a', tipo: 'number', label: 'Huevos fértiles' },
                { clase: 'repro-input-b', tipo: 'number', label: 'Huevos no fértiles' }
            ],
            guardar: (card, valores) => ({
                estado: 'PUESTA_REGISTRADA',
                fecha_puesta: valores.fecha,
                huevos_fertiles: valores.a,
                huevos_no_fertiles: valores.b
            })
        };
    }

    if (ev.tipo_reproduccion === 'Ovípara' && ev.estado === 'PUESTA_REGISTRADA') {
        return {
            boton: 'Registrar eclosión',
            campos: [
                { clase: 'repro-input-fecha', tipo: 'date', label: 'Fecha de eclosión' },
                { clase: 'repro-input-a', tipo: 'number', label: 'Huevos eclosionados' },
                { clase: 'repro-input-b', tipo: 'number', label: 'Huevos perdidos' }
            ],
            guardar: (card, valores) => ({
                estado: 'COMPLETADO',
                fecha_eclosion: valores.fecha,
                huevos_eclosionados: valores.a,
                huevos_perdidos: valores.b
            })
        };
    }

    if (ev.tipo_reproduccion === 'Ovovivípara' && ev.estado === 'EN_CURSO') {
        return {
            boton: 'Registrar parto',
            campos: [
                { clase: 'repro-input-fecha', tipo: 'date', label: 'Fecha del parto' },
                { clase: 'repro-input-a', tipo: 'number', label: 'Crías vivas' },
                { clase: 'repro-input-b', tipo: 'number', label: 'Slugs' },
                { clase: 'repro-input-c', tipo: 'number', label: 'Stillborns' }
            ],
            guardar: (card, valores) => ({
                estado: 'COMPLETADO',
                fecha_parto: valores.fecha,
                crias_vivas: valores.a,
                slugs: valores.b,
                stillborns: valores.c
            })
        };
    }

    return null;
}

function renderEventos(eventos, contenedor) {
    if (eventos.length === 0) {
        contenedor.innerHTML = '<p class="dash-loading">No hay eventos reproductivos en curso.</p>';
        return;
    }

    contenedor.innerHTML = eventos.map(ev => {
        const esPuestaRegistrada = ev.estado === 'PUESTA_REGISTRADA';
        const etiquetaFecha = ev.tipo_reproduccion === 'Ovípara'
            ? (esPuestaRegistrada ? 'Puesta registrada' : 'Puesta estimada')
            : ev.tipo_reproduccion === 'Ovovivípara'
                ? 'Parto esperado'
                : 'Fecha esperada';

        const fechaMostrada = esPuestaRegistrada ? ev.fecha_puesta : ev.fecha_esperada;
        const fechaTexto = fechaMostrada
            ? new Date(`${fechaMostrada}T00:00:00`).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Aún sin definir';

        // Cuando ya hay puesta registrada, mostramos esos números fijos
        // en la tarjeta -- ya no son especulación, son el resultado real
        // de la puesta -- mientras se espera la eclosión.
        const detallePuesta = esPuestaRegistrada
            ? `<div class="bar-row-meta">
                   <span class="bar-row-value">Huevos fértiles: ${escapeHTML(ev.huevos_fertiles ?? '—')} · No fértiles: ${escapeHTML(ev.huevos_no_fertiles ?? '—')}</span>
               </div>`
            : '';

        const etapa = siguienteEtapaDe(ev);
        const campos = etapa ? etapa.campos.map(c => `
            <div class="form-group-premium">
                <label>${escapeHTML(c.label)}</label>
                <input type="${c.tipo}" ${c.tipo === 'number' ? 'min="0"' : ''} class="${c.clase}">
            </div>
        `).join('') : '';

        return `
            <div class="evento-repro-card" data-evento-id="${escapeHTML(ev.id)}">
                <div class="evento-repro-header">
                    <span class="bar-row-label">${escapeHTML(ev.hembra_label || ev.hembra_id || '—')}</span>
                    <span class="bar-row-tag">${escapeHTML(ev.especie_nombre || '')}${ev.macho_id ? ' · ♂ ' + escapeHTML(ev.macho_id) : ''}</span>
                </div>
                <div class="bar-row-meta">
                    <span class="bar-row-value">${escapeHTML(etiquetaFecha)}: ${fechaTexto}</span>
                </div>
                ${detallePuesta}
                <div class="evento-repro-actions">
                    ${etapa ? `<button type="button" class="btn-secondary-premium btn-sm" data-accion="siguiente-etapa">${escapeHTML(etapa.boton)}</button>` : ''}
                    <button type="button" class="btn-text-premium btn-sm" data-accion="cancelar">
                        Cancelar
                    </button>
                </div>
                ${etapa ? `
                <div class="evento-repro-inline-form hidden" data-form="siguiente-etapa">
                    ${campos}
                    <div class="evento-repro-actions">
                        <button type="button" class="btn-premium btn-sm" data-accion="guardar-etapa">Guardar</button>
                        <button type="button" class="btn-text-premium btn-sm" data-accion="cerrar-form">Cancelar</button>
                    </div>
                </div>` : ''}
            </div>
        `;
    }).join('');

    contenedor.querySelectorAll('.evento-repro-card').forEach(card => {
        const eventoId = card.dataset.eventoId;
        const evento = eventos.find(e => String(e.id) === String(eventoId));
        const inlineForm = card.querySelector('[data-form="siguiente-etapa"]');
        const etapa = evento ? siguienteEtapaDe(evento) : null;

        card.querySelector('[data-accion="siguiente-etapa"]')?.addEventListener('click', () => {
            inlineForm?.classList.remove('hidden');
        });

        card.querySelector('[data-accion="cerrar-form"]')?.addEventListener('click', () => {
            inlineForm?.classList.add('hidden');
        });

        card.querySelector('[data-accion="guardar-etapa"]')?.addEventListener('click', async () => {
            if (!etapa) return;

            const leer = (clase, tipo) => {
                const input = card.querySelector(`.${clase}`);
                if (!input || !input.value) return null;
                return tipo === 'number' ? parseInt(input.value, 10) : input.value;
            };

            const valores = {
                fecha: leer('repro-input-fecha', 'date'),
                a: leer('repro-input-a', 'number'),
                b: leer('repro-input-b', 'number'),
                c: leer('repro-input-c', 'number')
            };

            const cambios = etapa.guardar(card, valores);

            const { error } = await supabase
                .from('eventos_reproductivos')
                .update({ ...cambios, updated_at: new Date().toISOString() })
                .eq('id', eventoId);

            if (error) {
                console.error('Error al actualizar evento reproductivo:', error);
                showReproAlert(`No se pudo guardar: ${error.message}`, 'error');
                return;
            }

            showReproAlert(
                cambios.estado === 'COMPLETADO' ? 'Evento marcado como completado.' : 'Puesta registrada.',
                'success'
            );
            await cargarEventos();
        });

        card.querySelector('[data-accion="cancelar"]')?.addEventListener('click', async () => {
            const { error } = await supabase
                .from('eventos_reproductivos')
                .update({ estado: 'CANCELADO', updated_at: new Date().toISOString() })
                .eq('id', eventoId);

            if (error) {
                console.error('Error al cancelar evento reproductivo:', error);
                showReproAlert(`No se pudo cancelar el evento: ${error.message}`, 'error');
                return;
            }

            await cargarEventos();
        });
    });
}

/**
 * admin-view.js ya define showAlert() pero no la exporta -- para no
 * tocar ese archivo de 1800+ líneas, este módulo reutiliza el mismo
 * contenedor #status-alert (ya presente en admin.html) con la misma
 * convención de clases (alert-premium alert-<tipo>), así ambos
 * módulos se ven idénticos aunque no compartan función.
 */
function showReproAlert(message, type = 'info') {
    const box = document.getElementById('status-alert');
    if (!box) return;

    box.className = `alert-premium alert-${type}`;
    box.textContent = message;
    box.classList.remove('hidden');

    // La sección de Reproducción vive más abajo en la página que
    // #status-alert (que está pegado hasta arriba de #admin-dashboard).
    // Sin este scroll, la confirmación aparece fuera de la vista del
    // criador si ya estaba desplazado hacia abajo -- da la impresión de
    // que "no pasó nada" aunque el guardado sí funcionó.
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (type === 'success' || type === 'info') {
        setTimeout(() => box.classList.add('hidden'), 4000);
    }
}
