import { supabase } from '../../supabase-config.js';
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
        'Año',
        'Precio',
        'Estatus',
        'Fecha Registro'
    ];

    const rows = data.map(ejemplar => [
        `"${ejemplar.id || ''}"`,
        `"${ejemplar.especie || ''}"`,
        `"${ejemplar.genetica || ''}"`,
        `"${ejemplar.sexo || ''}"`,
        ejemplar.nacimiento || '',
        ejemplar.precio || 0,
        `"${ejemplar.estatus || ''}"`,
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

    setValue('edit-especie', ejemplar.especie);
    setValue('edit-genetica', ejemplar.genetica || '');
    setValue('edit-sexo', ejemplar.sexo || 'No sexado');
    setValue('edit-nacimiento', ejemplar.nacimiento ?? '');
    setValue('edit-precio', ejemplar.precio ?? '');
    setValue('edit-estatus', ejemplar.estatus || 'Disponible');

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

    const especie = document.getElementById('edit-especie')?.value.trim();
    const genetica = document.getElementById('edit-genetica')?.value.trim() || 'Nominal';
    const sexo = document.getElementById('edit-sexo')?.value || 'No sexado';
    const nacimientoValue = document.getElementById('edit-nacimiento')?.value.trim();
    const precioValue = document.getElementById('edit-precio')?.value.trim();
    const estatus = document.getElementById('edit-estatus')?.value || 'Disponible';

    if (!especie) {
        showAlert('La especie es obligatoria.', 'error');
        return;
    }

    const nacimiento = nacimientoValue ? parseInt(nacimientoValue, 10) : null;
    const precio = precioValue === '' ? 0 : parseFloat(precioValue);

    const btnActualizar = document.getElementById('btn-actualizar');

    if (btnActualizar) {
        btnActualizar.disabled = true;
        btnActualizar.innerHTML = 'Guardando...';
    }

    const data = {
        especie,
        genetica,
        sexo,
        nacimiento,
        precio,
        estatus
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
        const especieVal = document.getElementById('especie')?.value.trim();
        const geneticaVal = document.getElementById('genetica')?.value.trim() || 'Nominal';
        const sexoVal = document.getElementById('sexo')?.value || 'No sexado';
        const nacimientoRaw = document.getElementById('nacimiento')?.value;
        const precioRaw = document.getElementById('precio')?.value;
        const estatusVal = document.getElementById('estatus')?.value || 'Disponible';

        const file1 = document.getElementById('imagen1')?.files[0];
        const file2 = document.getElementById('imagen2')?.files[0];
        const file3 = document.getElementById('imagen3')?.files[0];

        if (!idVal) {
            throw new Error('El ID / Código del ejemplar es obligatorio (ej. CR-16).');
        }

        if (!especieVal) {
            throw new Error('El campo "Especie" es obligatorio.');
        }

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

        const url1 = await uploadImage(file1, idVal);
        const url2 = file2 ? await uploadImage(file2, idVal) : null;
        const url3 = file3 ? await uploadImage(file3, idVal) : null;

        const nuevoEjemplar = {
            id: idVal,
            especie: especieVal,
            genetica: geneticaVal,
            sexo: sexoVal,
            nacimiento: nacimientoVal,
            precio: precioValNum,
            estatus: estatusVal,
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
// CARGA DEL DASHBOARD
// ==========================================

async function loadDashboardData() {

    await Promise.all([
        loadFullInventory(),
        populateYearFilter(),
        renderEstadisticas()
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
            <td colspan="9" style="text-align: center;">
                Cargando inventario...
            </td>
        </tr>
    `;

    try {
        let query = supabase.from('ejemplares').select('*');

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
                <td colspan="9" style="text-align: center; color: red;">
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
                <td colspan="9" style="text-align: center;">
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