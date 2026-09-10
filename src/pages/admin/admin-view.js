import { supabase, getEspecies, crearEspecie } from '../../supabase-config.js';
import { compressImage } from '../../utils/image-compressor.js';

// Limites de validacion para archivos subidos por el formulario.
// MAX_RAW_FILE_SIZE es el limite del archivo ORIGINAL (antes de comprimir);
// existe para no intentar procesar fotos absurdamente grandes en el navegador
// del criador (celulares modernos pueden generar fotos de 10-20MB).
const MAX_RAW_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

// ==========================================
// VARIABLES GLOBALES
// ==========================================

let currentFilteredData = [];
let editingEjemplarId = null;
let showingAll = false;

// Cache en memoria de especies y ejemplares (para llenar selects sin
// disparar una consulta nueva cada vez que se abre un formulario).
let especiesCache = [];
let ejemplaresParaGenealogiaCache = [];


// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    initAuthListener();

    setupDragAndDrop('drop-zone-1', 'imagen1', 'preview-1');
    setupDragAndDrop('drop-zone-2', 'imagen2', 'preview-2');
    setupDragAndDrop('drop-zone-3', 'imagen3', 'preview-3');

    setupFormListeners();
    setupEditModalListeners();
    setupEspeciesFormListener();

});


// ==========================================
// AUTENTICACIÓN
// ==========================================

async function initAuthListener() {

    const loginForm = document.getElementById('login-form');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const {
        data: { session }
    } = await supabase.auth.getSession();

    updateUI(session);

    supabase.auth.onAuthStateChange((_event, session) => {
        updateUI(session);
    });
}


async function handleLogin(event) {

    event.preventDefault();

    const loginErrorMsg = document.getElementById('login-error-msg');
    const btnLogin = document.getElementById('btn-login');

    loginErrorMsg?.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.textContent = 'Iniciando sesión...';
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error && loginErrorMsg) {
        loginErrorMsg.textContent = 'Credenciales inválidas. Verifica tu correo y contraseña.';
        loginErrorMsg.classList.remove('hidden');
    }

    if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar Sesión';
    }
}


function updateUI(session) {

    const loginSection = document.getElementById('login-section');
    const adminDashboard = document.getElementById('admin-dashboard');
    const authHeaderAction = document.getElementById('auth-header-action');

    if (session) {
        loginSection?.classList.add('hidden');
        adminDashboard?.classList.remove('hidden');

        if (authHeaderAction) {
            authHeaderAction.innerHTML = `
                <button
                    id="btn-logout"
                    class="btn-secondary-premium"
                >
                    Cerrar sesión
                </button>
            `;

            document
                .getElementById('btn-logout')
                ?.addEventListener('click', () => supabase.auth.signOut());
        }

        loadDashboardData();

    } else {
        loginSection?.classList.remove('hidden');
        adminDashboard?.classList.add('hidden');

        if (authHeaderAction) {
            authHeaderAction.innerHTML = '';
        }
    }
}


// ==========================================
// ESPECIES (catálogo normalizado)
// ==========================================
//
// Reemplaza el antiguo campo de texto libre "especie" por un catálogo
// real. Se carga una sola vez por sesión de Control y se reutiliza en
// tres lugares: el select del formulario de alta, el select del modal
// de edición, y el filtro de inventario -- así el criador nunca vuelve
// a escribir el nombre de la especie a mano.

async function loadEspecies() {
    especiesCache = await getEspecies();
    renderEspeciesList();
    populateEspecieSelects();
}

function renderEspeciesList() {

    const container = document.getElementById('especies-list');
    if (!container) return;

    if (especiesCache.length === 0) {
        container.innerHTML = `
            <p class="dash-loading">
                Aún no registras ninguna especie. Agrega la primera arriba para poder dar de alta ejemplares.
            </p>
        `;
        return;
    }

    container.innerHTML = especiesCache.map(especie => `
        <div class="bar-row-meta" style="padding: 0.4rem 0;">
            <span class="bar-row-label">${escapeHTML(especie.nombre)}</span>
            <span class="bar-row-value">${escapeHTML(especie.tipo_reproduccion)}</span>
        </div>
    `).join('');
}

function populateEspecieSelects() {

    const opciones = especiesCache
        .map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`)
        .join('');

    const selectAdd = document.getElementById('especie_id');
    if (selectAdd) {
        selectAdd.innerHTML = especiesCache.length
            ? `<option value="">Selecciona una especie</option>${opciones}`
            : `<option value="">Registra una especie primero</option>`;
    }

    const selectEdit = document.getElementById('edit-especie_id');
    if (selectEdit) {
        selectEdit.innerHTML = especiesCache.length
            ? opciones
            : `<option value="">Registra una especie primero</option>`;
    }

    const selectFiltro = document.getElementById('filter-especie_id');
    if (selectFiltro) {
        selectFiltro.innerHTML = `<option value="">Todas</option>${opciones}`;
    }
}

function setupEspeciesFormListener() {

    const form = document.getElementById('add-especie-form');
    form?.addEventListener('submit', async event => {
        event.preventDefault();

        const nombreInput = document.getElementById('especie-nombre');
        const tipoSelect = document.getElementById('especie-tipo-reproduccion');

        const nombre = nombreInput?.value.trim();
        const tipoReproduccion = tipoSelect?.value;

        if (!nombre) {
            showAlert('El nombre de la especie es obligatorio.', 'error');
            return;
        }

        try {
            await crearEspecie(nombre, tipoReproduccion);
            showAlert(`Especie "${nombre}" agregada correctamente.`, 'success');
            form.reset();
            await loadEspecies();
            await loadPadreMadreOptions();

        } catch (error) {
            console.error('Error al crear especie:', error);
            showAlert(`No se pudo agregar la especie: ${error.message}`, 'error');
        }
    });
}


// ==========================================
// SELECTS DE GENEALOGÍA (PADRE / MADRE)
// ==========================================
//
// Se listan ejemplares por sexo para que el criador elija de una lista
// real en vez de escribir un ID a mano (evita romper la relación por un
// error de dedo). "excludeId" se usa en el modal de edición para que un
// ejemplar no pueda elegirse a sí mismo como su propio padre/madre.

async function loadPadreMadreOptions() {

    const { data, error } = await supabase
        .from('ejemplares')
        .select('id, especie, genetica, sexo')
        .in('sexo', ['Macho', 'Hembra']);

    if (error) {
        console.error('Error al cargar opciones de genealogía:', error);
        return;
    }

    ejemplaresParaGenealogiaCache = data || [];
    populatePadreMadreSelects();
}

function populatePadreMadreSelects(excludeId = null) {

    const construirOpciones = sexoDeseado =>
        ejemplaresParaGenealogiaCache
            .filter(e => e.sexo === sexoDeseado && String(e.id) !== String(excludeId))
            .map(e => `<option value="${escapeHTML(e.id)}">${escapeHTML(e.id)} — ${escapeHTML(e.especie || '')} ${escapeHTML(e.genetica || '')}</option>`)
            .join('');

    const opcionesMachos = construirOpciones('Macho');
    const opcionesHembras = construirOpciones('Hembra');

    const selectPadreAdd = document.getElementById('id_padre');
    if (selectPadreAdd) selectPadreAdd.innerHTML = `<option value="">Sin registrar</option>${opcionesMachos}`;

    const selectMadreAdd = document.getElementById('id_madre');
    if (selectMadreAdd) selectMadreAdd.innerHTML = `<option value="">Sin registrar</option>${opcionesHembras}`;

    const selectPadreEdit = document.getElementById('edit-id_padre');
    if (selectPadreEdit) selectPadreEdit.innerHTML = `<option value="">Sin registrar</option>${opcionesMachos}`;

    const selectMadreEdit = document.getElementById('edit-id_madre');
    if (selectMadreEdit) selectMadreEdit.innerHTML = `<option value="">Sin registrar</option>${opcionesHembras}`;
}


// ==========================================
// FORMULARIOS
// ==========================================

function setupFormListeners() {

    const filterForm = document.getElementById('filter-form');
    const btnResetFilters = document.getElementById('btn-reset-filters');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const addForm = document.getElementById('add-ejemplar-form');
    const btnToggleInventory = document.getElementById('btn-toggle-inventory');

    filterForm?.addEventListener('submit', event => {
        event.preventDefault();

        showingAll = false;

        const filtros = {
            especie_id: document.getElementById('filter-especie_id').value,
            etapa: document.getElementById('filter-etapa').value,
            estatus: document.getElementById('filter-estatus').value,
            genetica: document.getElementById('filter-genetica').value.trim(),
            sexo: document.getElementById('filter-sexo').value,
            anio: document.getElementById('filter-anio').value
        };

        loadFullInventory(filtros);
    });

    btnResetFilters?.addEventListener('click', () => {
        showingAll = false;
        filterForm?.reset();
        loadFullInventory();
    });

    btnExportCsv?.addEventListener('click', () => {
        const filename = getCSVFilename();
        downloadCSV(currentFilteredData, filename);
    });

    btnToggleInventory?.addEventListener('click', () => {
        showingAll = !showingAll;
        renderInventoryTable();
    });

    addForm?.addEventListener('submit', handleAddEjemplar);
}


// ==========================================
// ESTADÍSTICAS
// ==========================================

async function getEstadisticas() {

    // CAMBIO: se agrega "precio" al select. Antes esta consulta solo
    // traía "estatus" porque solo se contaban ejemplares por categoría;
    // ahora también se necesita el precio de cada uno para poder sumar
    // el valor de los que están Disponibles (ver "valorDisponible" abajo).
    const { data, error } = await supabase
        .from('ejemplares')
        .select('estatus, precio');

    if (error) {
        throw error;
    }

    const disponibles = data.filter(e => e.estatus === 'Disponible');

    // Suma de "precio" solo de los ejemplares Disponibles. Se usa
    // "Number(e.precio) || 0" por si algún registro viejo tuviera el
    // precio guardado como texto o vacío/null — así un dato sucio no
    // rompe la suma completa (se cuenta como $0 en vez de tronar).
    const valorDisponible = disponibles.reduce(
        (suma, e) => suma + (Number(e.precio) || 0),
        0
    );

    return {
        total: data.length,
        disponibles: disponibles.length,
        valorDisponible,
        apartados: data.filter(e => e.estatus === 'Apartado').length,
        vendidos: data.filter(e => e.estatus === 'Vendido').length,
        holdbacks: data.filter(e => e.estatus === 'Holdback').length
    };
}

// Formateador de moneda reutilizado tal cual se usa en la tabla de
// inventario (ver más abajo en este mismo archivo, dentro de
// renderTableRows), para que el mismo número siempre se vea igual en
// todo el panel: símbolo "$", separador de miles y 2 decimales, en
// formato mexicano (es-MX / MXN).
const formateadorMoneda = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
});

async function renderEstadisticas() {

    try {
        const stats = await getEstadisticas();

        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-disponibles').textContent = stats.disponibles;
        document.getElementById('stat-valor-disponible').textContent =
            formateadorMoneda.format(stats.valorDisponible);
        document.getElementById('stat-apartados').textContent = stats.apartados;
        document.getElementById('stat-vendidos').textContent = stats.vendidos;
        document.getElementById('stat-holdbacks').textContent = stats.holdbacks;

    } catch (error) {
        console.error('Error al actualizar estadísticas:', error);
    }
}


// ==========================================
// CSV
// ==========================================

function downloadCSV(data, filename = 'inventario.csv') {

    if (!data || data.length === 0) {
        showAlert('No hay datos disponibles para exportar.', 'error');
        return;
    }

    const headers = [
        'ID',
        'Especie',
        'Genética',
        'Sexo',
        'Etapa',
        'Año',
        'Longitud (cm)',
        'Peso (g)',
        'Precio',
        'Estatus',
        'Visible en catálogo',
        'Fecha Registro'
    ];

    const rows = data.map(ejemplar => [
        `"${ejemplar.id || ''}"`,
        `"${ejemplar.especie || ''}"`,
        `"${ejemplar.genetica || ''}"`,
        `"${ejemplar.sexo || ''}"`,
        `"${ejemplar.etapa || ''}"`,
        ejemplar.nacimiento || '',
        ejemplar.longitud ?? '',
        ejemplar.peso_gramos ?? '',
        ejemplar.precio || 0,
        `"${ejemplar.estatus || ''}"`,
        ejemplar.visible_publico === false ? 'No' : 'Sí',
        ejemplar.created_at ? new Date(ejemplar.created_at).toLocaleDateString() : ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}


function getCSVFilename() {

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `inventario_${year}-${month}-${day}.csv`;
}


// ==========================================
// DRAG & DROP
// ==========================================

function setupDragAndDrop(zoneId, inputId, previewId) {

    const dropZone = document.getElementById(zoneId);
    const fileInput = document.getElementById(inputId);
    const previewContainer = document.getElementById(previewId);

    if (!dropZone || !fileInput || !previewContainer) {
        return;
    }

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', event => {
        const files = event.dataTransfer.files;

        if (files.length > 0) {
            fileInput.files = files;
            handleFilePreview(files[0], previewContainer, dropZone);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFilePreview(fileInput.files[0], previewContainer, dropZone);
        }
    });
}


function handleFilePreview(file, previewContainer, dropZone) {

    // CAMBIO: antes no se validaba nada aquí, así que un PDF o un video
    // arrastrado al drop-zone rompía el preview silenciosamente y aun así
    // se intentaba subir a Storage en handleAddEjemplar. Ahora se rechaza
    // temprano con un mensaje claro.
    if (!file.type || !file.type.startsWith('image/')) {
        showAlert('Selecciona un archivo de imagen válido (JPG, PNG, WEBP).', 'error');
        return;
    }
    if (file.size > MAX_RAW_FILE_SIZE) {
        showAlert('La imagen pesa demasiado (máximo 15MB).', 'error');
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {
        previewContainer.innerHTML = `
            <img src="${event.target.result}" class="preview-thumb" alt="Vista previa">
            <button type="button" class="btn-change-img">Cambiar imagen</button>
        `;

        previewContainer.classList.remove('hidden');
        dropZone.style.display = 'none';

        previewContainer
            .querySelector('.btn-change-img')
            ?.addEventListener('click', () => {
                previewContainer.classList.add('hidden');
                previewContainer.innerHTML = '';
                dropZone.style.display = 'flex';

                const input = dropZone.querySelector('input');
                if (input) {
                    input.value = '';
                }
            });
    };

    reader.readAsDataURL(file);
}


// ==========================================
// SUBIR IMAGEN A SUPABASE STORAGE
// ==========================================
//
// CAMBIO IMPORTANTE: antes esta funcion subia el archivo ORIGINAL tal
// cual salia de la camara del celular (3-8MB por foto, x3 fotos por
// ejemplar). El plan gratuito de Supabase da 1GB de almacenamiento y
// 5-10GB de transferencia al mes COMPARTIDOS entre todo lo que sirvas
// -- a ese ritmo el espacio se agota con apenas ~100 ejemplares y el
// catalogo publico se queda sin ancho de banda con unas cuantas
// centenas de visitas. Ahora cada imagen se valida (tipo y tamano) y
// se comprime a un JPEG de hasta 1280px antes de subirse, lo que deja
// cada foto en ~100-250KB sin perder detalle util para mostrar la
// genetica del ejemplar. Con esto, el mismo 1GB alcanza para miles de
// ejemplares en vez de un centenar.

function validateImageFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('El archivo seleccionado no es una imagen válida.');
    }
    if (file.size > MAX_RAW_FILE_SIZE) {
        throw new Error('La imagen pesa demasiado (máximo 15MB antes de comprimir).');
    }
}

async function uploadImage(file, ejemplarId = null) {

    validateImageFile(file);

    // Comprime a JPEG antes de subir. Si por alguna razón la compresión
    // falla (formato raro, navegador viejo, etc.), se sube el archivo
    // original en vez de bloquear por completo el registro del ejemplar.
    let uploadBlob = file;
    let fileExt = file.name.split('.').pop();

    try {
        uploadBlob = await compressImage(file, 1280, 1280, 0.78);
        fileExt = 'jpg';
    } catch (compressionError) {
        console.warn('No se pudo comprimir la imagen, se subirá sin comprimir:', compressionError);
    }

    const prefix = ejemplarId ? `${ejemplarId}_` : '';
    const fileName = `${prefix}${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `ejemplares/${fileName}`;

    const { error } = await supabase.storage
        .from('ejemplares')
        .upload(filePath, uploadBlob, {
            contentType: uploadBlob.type || 'image/jpeg',
            upsert: false
        });

    if (error) {
        throw error;
    }

    const { data } = supabase.storage
        .from('ejemplares')
        .getPublicUrl(filePath);

    return data.publicUrl;
}


// ==========================================
// MODAL DE EDICIÓN
// ==========================================

function openEditModal(ejemplar) {

    const modal = document.getElementById('edit-modal');

    if (!modal || !ejemplar || !ejemplar.id) {
        showAlert('No se encontraron los datos para editar este ejemplar.', 'error');
        return;
    }

    editingEjemplarId = ejemplar.id;

    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value ?? '';
        }
    };

    setValue('edit-id', ejemplar.id);

    const idDisplay = document.getElementById('edit-id-display');
    if (idDisplay) {
        idDisplay.textContent = ejemplar.id ?? '—';
    }

    setValue('edit-genetica', ejemplar.genetica || '');
    setValue('edit-sexo', ejemplar.sexo || 'No sexado');
    setValue('edit-etapa', ejemplar.etapa || 'Cría');
    setValue('edit-nacimiento', ejemplar.nacimiento ?? '');
    setValue('edit-longitud', ejemplar.longitud ?? '');
    setValue('edit-peso_gramos', ejemplar.peso_gramos ?? '');
    setValue('edit-precio', ejemplar.precio ?? '');
    setValue('edit-estatus', ejemplar.estatus || 'Disponible');
    setValue('edit-notas', ejemplar.notas || '');

    const especieSelect = document.getElementById('edit-especie_id');
    if (especieSelect) especieSelect.value = ejemplar.especie_id ?? '';

    const visibleCheckbox = document.getElementById('edit-visible_publico');
    if (visibleCheckbox) visibleCheckbox.checked = ejemplar.visible_publico !== false;

    // Excluye al propio ejemplar de sus selects de padre/madre (no puede
    // ser su propio ancestro).
    populatePadreMadreSelects(ejemplar.id);

    const padreSelect = document.getElementById('edit-id_padre');
    if (padreSelect) padreSelect.value = ejemplar.id_padre ?? '';

    const madreSelect = document.getElementById('edit-id_madre');
    if (madreSelect) madreSelect.value = ejemplar.id_madre ?? '';

    setupCurrentImage('edit-imagen-actual-1', 'edit-imagen-empty-1', ejemplar.imagen_url);
    setupCurrentImage('edit-imagen-actual-2', 'edit-imagen-empty-2', ejemplar.imagen_url_2);
    setupCurrentImage('edit-imagen-actual-3', 'edit-imagen-empty-3', ejemplar.imagen_url_3);

    resetNewImagePreviews();

    ['1', '2', '3'].forEach(num => {
        const imgInput = document.getElementById(`edit-imagen-${num}`);
        if (imgInput) imgInput.value = '';
    });

    const title = document.getElementById('edit-modal-title');
    if (title) {
        title.textContent = `Editar ${ejemplar.id} (${ejemplar.especie || 'Ejemplar'})`;
    }

    modal.dataset.ejemplarId = ejemplar.id;
    modal.classList.remove('hidden');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    document.body.classList.add('modal-open');
}


function setupCurrentImage(imageId, emptyId, url) {

    const img = document.getElementById(imageId);
    const empty = document.getElementById(emptyId);

    if (!img || !empty) {
        return;
    }

    if (url) {
        img.src = url;
        img.style.display = 'block';
        empty.style.display = 'none';
    } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        empty.style.display = 'block';
    }
}


function resetNewImagePreviews() {

    ['1', '2', '3'].forEach(number => {
        const preview = document.getElementById(`new-image-preview-${number}`);

        if (preview) {
            preview.innerHTML = '';
            preview.classList.add('hidden');
        }
    });
}


function previewEditImage(input, previewId) {

    const file = input?.files?.[0];
    const preview = document.getElementById(previewId);

    if (!preview) return;

    if (!file) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
        return;
    }

    if (!file.type.startsWith('image/')) {
        input.value = '';
        preview.innerHTML = '';
        preview.classList.add('hidden');
        showAlert('Selecciona un archivo de imagen válido.', 'error');
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {
        preview.innerHTML = `
            <span>Nueva imagen</span>
            <img src="${event.target.result}" alt="Vista previa de nueva imagen">
        `;
        preview.classList.remove('hidden');
    };

    reader.readAsDataURL(file);
}


function closeEditModal() {

    const modal = document.getElementById('edit-modal');

    if (!modal) return;

    modal.classList.remove('is-open');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    editingEjemplarId = null;

    const form = document.getElementById('edit-ejemplar-form');
    form?.reset();

    resetNewImagePreviews();
}


function setupEditModalListeners() {

    const form = document.getElementById('edit-ejemplar-form');
    const btnCancelar = document.getElementById('btn-cancelar-edit');
    const btnCloseX = document.getElementById('btn-close-modal-x');
    const editModal = document.getElementById('edit-modal');

    if (!form || !editModal) return;

    form.addEventListener('submit', handleEditSubmit);
    btnCancelar?.addEventListener('click', closeEditModal);
    btnCloseX?.addEventListener('click', closeEditModal);

    editModal.addEventListener('click', event => {
        if (event.target === editModal) closeEditModal();
    });

    ['1', '2', '3'].forEach(num => {
        document.getElementById(`edit-imagen-${num}`)?.addEventListener('change', event => {
            previewEditImage(event.target, `new-image-preview-${num}`);
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && editModal.classList.contains('is-open')) {
            closeEditModal();
        }
    });
}


async function handleEditSubmit(event) {

    event.preventDefault();

    const id = editingEjemplarId || document.getElementById('edit-id')?.value.trim();

    if (!id) {
        showAlert('No se encontró el ID del ejemplar que deseas editar.', 'error');
        return;
    }

    const especieIdVal = document.getElementById('edit-especie_id')?.value;
    const genetica = document.getElementById('edit-genetica')?.value.trim() || 'Nominal';
    const sexo = document.getElementById('edit-sexo')?.value || 'No sexado';
    const etapa = document.getElementById('edit-etapa')?.value || 'Cría';
    const nacimientoValue = document.getElementById('edit-nacimiento')?.value.trim();
    const longitudValue = document.getElementById('edit-longitud')?.value;
    const pesoValue = document.getElementById('edit-peso_gramos')?.value;
    const precioValue = document.getElementById('edit-precio')?.value.trim();
    const estatus = document.getElementById('edit-estatus')?.value || 'Disponible';
    const visiblePublico = document.getElementById('edit-visible_publico')?.checked ?? true;
    const notas = document.getElementById('edit-notas')?.value.trim() || null;
    const idPadre = document.getElementById('edit-id_padre')?.value || null;
    const idMadre = document.getElementById('edit-id_madre')?.value || null;

    if (!especieIdVal) {
        showAlert('Selecciona una especie.', 'error');
        return;
    }

    const especieObj = especiesCache.find(e => String(e.id) === String(especieIdVal));
    const especie = especieObj?.nombre || '';

    const nacimiento = nacimientoValue ? parseInt(nacimientoValue, 10) : null;
    const precio = precioValue === '' ? 0 : parseFloat(precioValue);
    const longitud = longitudValue ? parseFloat(longitudValue) : null;
    const pesoGramos = pesoValue ? parseFloat(pesoValue) : null;

    const btnActualizar = document.getElementById('btn-actualizar');

    if (btnActualizar) {
        btnActualizar.disabled = true;
        btnActualizar.innerHTML = 'Guardando...';
    }

    const data = {
        especie,
        especie_id: Number(especieIdVal),
        genetica,
        sexo,
        etapa,
        nacimiento,
        longitud,
        peso_gramos: pesoGramos,
        precio,
        estatus,
        visible_publico: visiblePublico,
        notas,
        id_padre: idPadre,
        id_madre: idMadre
    };

    const nuevasImagenes = {
        imagen1: document.getElementById('edit-imagen-1')?.files?.[0] || null,
        imagen2: document.getElementById('edit-imagen-2')?.files?.[0] || null,
        imagen3: document.getElementById('edit-imagen-3')?.files?.[0] || null
    };

    try {
        await updateEjemplar(id, data, nuevasImagenes);

        showAlert(`Ejemplar ${id} actualizado correctamente.`, 'success');
        closeEditModal();
        await loadDashboardData();

    } catch (error) {
        console.error('Error al actualizar ejemplar:', error);
        showAlert(`No se pudo actualizar: ${error.message}`, 'error');

    } finally {
        if (btnActualizar) {
            btnActualizar.disabled = false;
            btnActualizar.innerHTML = 'Guardar cambios';
        }
    }
}


async function updateEjemplar(ejemplarId, data, nuevasImagenes) {

    if (nuevasImagenes.imagen1) {
        data.imagen_url = await uploadImage(nuevasImagenes.imagen1, ejemplarId);
    }

    if (nuevasImagenes.imagen2) {
        data.imagen_url_2 = await uploadImage(nuevasImagenes.imagen2, ejemplarId);
    }

    if (nuevasImagenes.imagen3) {
        data.imagen_url_3 = await uploadImage(nuevasImagenes.imagen3, ejemplarId);
    }

    const { error } = await supabase
        .from('ejemplares')
        .update(data)
        .eq('id', ejemplarId);

    if (error) throw error;

    return true;
}


// ==========================================
// AGREGAR EJEMPLAR
// ==========================================

async function handleAddEjemplar(event) {

    event.preventDefault();

    showAlert('Guardando ejemplar...', 'info');

    const btnSave = document.getElementById('btn-save');
    const addForm = document.getElementById('add-ejemplar-form');

    if (btnSave) btnSave.disabled = true;

    try {
        const idVal = document.getElementById('id')?.value.trim();
        const especieIdVal = document.getElementById('especie_id')?.value;
        const geneticaVal = document.getElementById('genetica')?.value.trim() || 'Nominal';
        const sexoVal = document.getElementById('sexo')?.value || 'No sexado';
        const etapaVal = document.getElementById('etapa')?.value || 'Cría';
        const nacimientoRaw = document.getElementById('nacimiento')?.value;
        const longitudRaw = document.getElementById('longitud')?.value;
        const pesoRaw = document.getElementById('peso_gramos')?.value;
        const precioRaw = document.getElementById('precio')?.value;
        const estatusVal = document.getElementById('estatus')?.value || 'Disponible';
        const visiblePublicoVal = document.getElementById('visible_publico')?.checked ?? true;
        const notasVal = document.getElementById('notas')?.value.trim() || null;
        const idPadreVal = document.getElementById('id_padre')?.value || null;
        const idMadreVal = document.getElementById('id_madre')?.value || null;

        const file1 = document.getElementById('imagen1')?.files[0];
        const file2 = document.getElementById('imagen2')?.files[0];
        const file3 = document.getElementById('imagen3')?.files[0];

        if (!idVal) {
            throw new Error('El ID / Código del ejemplar es obligatorio (ej. CR-16).');
        }

        if (!especieIdVal) {
            throw new Error('Selecciona una especie. Si no aparece ninguna, agrégala primero en "Especies registradas".');
        }

        // La columna "especie" (texto) se mantiene sincronizada automáticamente
        // a partir del catálogo de especies, para no romper el catálogo público
        // ni el Dashboard mientras se actualizan para leer la relación directa.
        const especieObj = especiesCache.find(e => String(e.id) === String(especieIdVal));
        const especieVal = especieObj?.nombre || '';

        if (!file1) {
            throw new Error('La imagen 1 (principal) es obligatoria.');
        }

        const nacimientoVal = parseInt(nacimientoRaw, 10);
        if (isNaN(nacimientoVal)) {
            throw new Error('Ingresa un año de nacimiento válido (ej. 2026).');
        }

        const precioValNum = parseFloat(precioRaw);
        if (isNaN(precioValNum) || precioValNum < 0) {
            throw new Error('Ingresa un precio válido (ej. 5000).');
        }

        const longitudVal = longitudRaw ? parseFloat(longitudRaw) : null;
        const pesoVal = pesoRaw ? parseFloat(pesoRaw) : null;

        const url1 = await uploadImage(file1, idVal);
        const url2 = file2 ? await uploadImage(file2, idVal) : null;
        const url3 = file3 ? await uploadImage(file3, idVal) : null;

        const nuevoEjemplar = {
            id: idVal,
            especie: especieVal,
            especie_id: Number(especieIdVal),
            genetica: geneticaVal,
            sexo: sexoVal,
            etapa: etapaVal,
            nacimiento: nacimientoVal,
            longitud: longitudVal,
            peso_gramos: pesoVal,
            precio: precioValNum,
            estatus: estatusVal,
            visible_publico: visiblePublicoVal,
            notas: notasVal,
            id_padre: idPadreVal,
            id_madre: idMadreVal,
            imagen_url: url1,
            imagen_url_2: url2,
            imagen_url_3: url3
        };

        const { error } = await supabase
            .from('ejemplares')
            .insert([nuevoEjemplar]);

        if (error) {
            const detalleError = [error.message, error.details, error.hint].filter(Boolean).join(' - ');
            throw new Error(`[Código ${error.code || 'BD'}] ${detalleError || 'Error al insertar en la base de datos'}`);
        }

        showAlert('¡Ejemplar registrado exitosamente!', 'success');

        addForm?.reset();
        resetPreviews();
        await loadDashboardData();

    } catch (err) {
        console.error('Error al agregar ejemplar:', err);
        showAlert(`Error al insertar: ${err.message}`, 'error');

    } finally {
        if (btnSave) btnSave.disabled = false;
    }
}


function resetPreviews() {

    ['1', '2', '3'].forEach(id => {
        const preview = document.getElementById(`preview-${id}`);
        const zone = document.getElementById(`drop-zone-${id}`);

        if (preview && zone) {
            preview.classList.add('hidden');
            preview.innerHTML = '';
            zone.style.display = 'flex';
        }
    });
}


// ==========================================
// ELIMINAR EJEMPLAR
// ==========================================

async function deleteEjemplar(id, especie) {

    if (!confirm(`¿Eliminar el ejemplar ${id} (${especie})?`)) {
        return;
    }

    showAlert('Eliminando...', 'info');

    const { error } = await supabase
        .from('ejemplares')
        .delete()
        .eq('id', id);

    if (error) {
        showAlert(`Error: ${error.message}`, 'error');
    } else {
        showAlert('Ejemplar eliminado correctamente.', 'success');
        loadDashboardData();
    }
}


// ==========================================
// LIBERAR IMÁGENES (conserva el registro de venta, libera Storage)
// ==========================================
//
// A diferencia de "Eliminar ejemplar" (que borra TODO, incluyendo el
// historial para las métricas del Dashboard), esta acción solo borra
// los archivos de Supabase Storage y deja en null las 3 columnas de
// imagen. La fila sigue existiendo con precio, especie, fecha, etc.
// intactos -- pensada para ejemplares "Vendido" donde ya no se necesita
// conservar la foto, solo el dato de la venta.

function extraerPathDeStorageUrl(url) {

    if (!url) return null;

    // Las URLs públicas de Supabase Storage tienen la forma:
    // https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path>
    const marcador = '/object/public/ejemplares/';
    const index = url.indexOf(marcador);

    if (index === -1) return null;

    return url.substring(index + marcador.length);
}

async function liberarImagenes(ejemplar) {

    if (!confirm(`¿Liberar las imágenes del ejemplar ${ejemplar.id}? El registro de la venta se conserva, solo se borran las fotos.`)) {
        return;
    }

    showAlert('Liberando imágenes...', 'info');

    const paths = [ejemplar.imagen_url, ejemplar.imagen_url_2, ejemplar.imagen_url_3]
        .map(extraerPathDeStorageUrl)
        .filter(Boolean);

    try {
        if (paths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('ejemplares')
                .remove(paths);

            if (storageError) {
                console.warn('No se pudieron borrar todos los archivos de Storage:', storageError);
            }
        }

        const { error } = await supabase
            .from('ejemplares')
            .update({ imagen_url: null, imagen_url_2: null, imagen_url_3: null })
            .eq('id', ejemplar.id);

        if (error) throw error;

        showAlert(`Imágenes de ${ejemplar.id} liberadas. El registro de venta se conservó.`, 'success');
        await loadDashboardData();

    } catch (error) {
        console.error('Error al liberar imágenes:', error);
        showAlert(`No se pudieron liberar las imágenes: ${error.message}`, 'error');
    }
}


// ==========================================
// CARGA DEL DASHBOARD
// ==========================================

async function loadDashboardData() {

    await Promise.all([
        loadFullInventory(),
        populateYearFilter(),
        renderEstadisticas(),
        loadEspecies(),
        loadPadreMadreOptions()
    ]);
}


// ==========================================
// INVENTARIO COMPLETO Y DESPLEGABLE
// ==========================================

async function loadFullInventory(filtros = {}) {

    const fullTableBody = document.getElementById('full-inventory-table-body');

    if (!fullTableBody) return;

    fullTableBody.innerHTML = `
        <tr>
            <td colspan="11" style="text-align: center;">
                Cargando inventario...
            </td>
        </tr>
    `;

    try {
        let query = supabase.from('ejemplares').select('*');

        if (filtros.especie_id) query = query.eq('especie_id', filtros.especie_id);
        if (filtros.etapa) query = query.eq('etapa', filtros.etapa);
        if (filtros.estatus) query = query.eq('estatus', filtros.estatus);
        if (filtros.genetica) query = query.ilike('genetica', `%${filtros.genetica}%`);
        if (filtros.sexo) query = query.eq('sexo', filtros.sexo);
        if (filtros.anio) query = query.eq('nacimiento', parseInt(filtros.anio, 10));

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        currentFilteredData = data || [];
        renderInventoryTable();

    } catch (err) {
        console.error('Error al filtrar inventario:', err);

        fullTableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; color: red;">
                    Error al consultar inventario: ${err.message}
                </td>
            </tr>
        `;
    }
}


function renderInventoryTable() {

    const fullTableBody = document.getElementById('full-inventory-table-body');
    const btnToggleInventory = document.getElementById('btn-toggle-inventory');

    if (!fullTableBody) return;

    const totalItems = currentFilteredData.length;

    if (btnToggleInventory) {
        if (totalItems <= 5) {
            btnToggleInventory.disabled = true;
            btnToggleInventory.textContent = 'Ver todos';
        } else {
            btnToggleInventory.disabled = false;
            btnToggleInventory.textContent = showingAll ? 'Mostrar menos' : 'Ver todos';
        }
    }

    const dataToRender = showingAll ? currentFilteredData : currentFilteredData.slice(0, 5);
    renderTableRows(dataToRender, fullTableBody);
}


// ==========================================
// FILTRO DE AÑOS
// ==========================================

async function populateYearFilter() {

    const filterAnioSelect = document.getElementById('filter-anio');

    if (!filterAnioSelect) return;

    try {
        const { data, error } = await supabase
            .from('ejemplares')
            .select('nacimiento');

        if (error) throw error;

        const years = [
            ...new Set(
                data
                    .map(i => i.nacimiento)
                    .filter(Boolean)
            )
        ].sort((a, b) => b - a);

        let optionsHtml = `<option value="">Todos los años</option>`;

        years.forEach(year => {
            optionsHtml += `<option value="${year}">${year}</option>`;
        });

        filterAnioSelect.innerHTML = optionsHtml;

    } catch (err) {
        console.error('Error al cargar filtro de años:', err);
    }
}


// ==========================================
// SEGURIDAD HTML
// ==========================================

function escapeHTML(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// ==========================================
// RENDERIZAR TABLAS
// ==========================================

function renderTableRows(ejemplares, targetTbody) {

    if (!ejemplares || ejemplares.length === 0) {
        targetTbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center;">
                    No se encontraron registros.
                </td>
            </tr>
        `;
        return;
    }

    targetTbody.innerHTML = ejemplares
        .map(item => {
            const precioFormatted = new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: 'MXN'
            }).format(Number(item.precio) || 0);

            const estatus = item.estatus || 'Disponible';
            const estatusClass = estatus.toLowerCase().replace(/\s+/g, '-');
            const imgSrc = item.imagen_url || 'https://via.placeholder.com/40?text=Sin+Foto';

            return `
                <tr>
                    <td><strong>${escapeHTML(item.id)}</strong></td>
                    <td>
                        <img
                            src="${escapeHTML(imgSrc)}"
                            class="table-thumb"
                            alt="${escapeHTML(item.especie || 'Ejemplar')}"
                        >
                    </td>
                    <td>
                        <strong>${escapeHTML(item.especie || 'N/A')}</strong>
                    </td>
                    <td>${escapeHTML(item.genetica || 'Nominal')}</td>
                    <td>${escapeHTML(item.sexo || 'No sexado')}</td>
                    <td>${escapeHTML(item.etapa || '—')}</td>
                    <td>${escapeHTML(item.nacimiento || 'N/A')}</td>
                    <td style="font-weight: 700; color: var(--color-orange, #EE6C29);">
                        ${precioFormatted}
                    </td>
                    <td>
                        <span class="status-badge status-${escapeHTML(estatusClass)}">
                            ${escapeHTML(estatus)}
                        </span>
                    </td>
                    <td>
                        ${item.visible_publico === false
                            ? '<span class="status-badge status-holdback">Oculto</span>'
                            : '<span class="status-badge status-disponible">Visible</span>'}
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button
                                type="button"
                                class="btn-icon btn-edit-icon"
                                title="Editar ejemplar"
                                data-id="${escapeHTML(item.id)}"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>

                            ${estatus === 'Vendido' && (item.imagen_url || item.imagen_url_2 || item.imagen_url_3) ? `
                            <button
                                type="button"
                                class="btn-icon btn-liberar-icon"
                                title="Liberar imágenes (libera espacio, conserva el registro de venta)"
                                data-id="${escapeHTML(item.id)}"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <path d="M21 15l-5-5L5 21"/>
                                </svg>
                            </button>
                            ` : ''}

                            <button
                                type="button"
                                class="btn-icon btn-delete-icon"
                                title="Eliminar ejemplar"
                                data-id="${escapeHTML(item.id)}"
                                data-especie="${escapeHTML(item.especie || 'ejemplar')}"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');

    targetTbody.querySelectorAll('.btn-edit-icon').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const id = event.currentTarget.getAttribute('data-id');
            const item = ejemplares.find(e => String(e.id).trim() === String(id).trim());
            if (item) openEditModal(item);
        });
    });

    targetTbody.querySelectorAll('.btn-liberar-icon').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const id = event.currentTarget.getAttribute('data-id');
            const item = ejemplares.find(e => String(e.id).trim() === String(id).trim());
            if (item) liberarImagenes(item);
        });
    });

    targetTbody.querySelectorAll('.btn-delete-icon').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            const button = event.currentTarget;
            deleteEjemplar(button.getAttribute('data-id'), button.getAttribute('data-especie'));
        });
    });
}


// ==========================================
// ALERTAS DE ESTADO
// ==========================================

function showAlert(message, type = 'info') {

    const statusAlert = document.getElementById('status-alert');

    if (!statusAlert) return;

    statusAlert.className = `alert-premium alert-${type}`;
    statusAlert.textContent = message;
    statusAlert.classList.remove('hidden');

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusAlert.classList.add('hidden');
        }, 4000);
    }
}