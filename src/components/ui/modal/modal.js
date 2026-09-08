import './modal.css';
import { escapeHTML, safeImageUrl } from '../../../utils/security.js';
import { siteConfig } from '../../../site-config.js';
// CAMBIO DE SEGURIDAD: todo campo que viene de la base de datos (especie,
// genetica, sexo, estatus, imagen_url, id...) se inserta mas abajo dentro
// de `innerHTML`. Antes se interpolaba sin escapar, lo que permitia XSS
// almacenado si esos campos llegaban manipulados. Ahora se sanea con
// escapeHTML()/safeImageUrl() antes de insertarse en cualquier plantilla.

let currentList = [];
let currentIndex = 0;
let keyListenerBound = false;

/**
 * Genera la URL de WhatsApp y el texto del botón según el estatus del ejemplar
 */
function getWhatsAppDetails(ejemplar) {
    const especie = ejemplar.especie || 'ejemplar';
    const id = ejemplar.id ? `#${ejemplar.id}` : 'sin ID';
    const estatus = (ejemplar.estatus || '').toLowerCase().trim();

    let mensaje = '';
    let btnText = '';

    const marca = siteConfig.brandName;

    switch (estatus) {
        case 'disponible':
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id}. ¿Continúa disponible?`;
            btnText = 'Consultar por WhatsApp';
            break;
        case 'apartado':
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id} que aparece como Apartado. ¿Sigue disponible o ya fue separado?`;
            btnText = 'Preguntar por disponibilidad';
            break;
        case 'vendido':
            mensaje = `Hola, ${marca}. Vi el ejemplar ${especie} con ID ${id} pero aparece como Vendido. ¿Tienen ejemplares similares disponibles?`;
            btnText = 'Preguntar por similares';
            break;
        case 'holdback':
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id} que aparece como Holdback. ¿Está disponible para venta o es de reserva?`;
            btnText = 'Consultar disponibilidad';
            break;
        default:
            mensaje = `Hola, ${marca}. Me interesa el ejemplar ${especie} con ID ${id}. ¿Podrían darme más información?`;
            btnText = 'Consultar por WhatsApp';
    }

    // CAMBIO: antes este numero estaba hardcodeado aqui y era DISTINTO al
    // que usa header.js (bug real de copy-paste). Ahora ambos toman el
    // mismo numero desde site-config.js.
    const url = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(mensaje)}`;
    return { url, btnText };
}

/**
 * Filtra los ejemplares con estatus "Disponible", excluyendo el ejemplar actualmente abierto
 */
function getAvailableEjemplares(todosLosEjemplares, ejemplarActual) {
    return todosLosEjemplares.filter(ejemplar => 
        ejemplar &&
        ejemplar.estatus &&
        ejemplar.estatus.toLowerCase().trim() === 'disponible' && 
        ejemplar.id !== ejemplarActual.id
    );
}

/**
 * Inicializa y escucha eventos globales de la modal
 */
export function initModalEvents() {
    const modalElement = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('modal-close-btn');

    if (!modalElement) return;

    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.addEventListener('click', closeModal);
        closeBtn.dataset.bound = 'true';
    }

    if (!modalElement.dataset.bound) {
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) closeModal();
        });
        modalElement.dataset.bound = 'true';
    }

    if (!keyListenerBound) {
        window.addEventListener('keydown', handleKeyPress);
        keyListenerBound = true;
    }
}

/**
 * Manejador de eventos de teclado (Esc, Flecha Izquierda, Flecha Derecha)
 */
function handleKeyPress(e) {
    const modalElement = document.getElementById('modal-overlay');
    if (!modalElement || !modalElement.classList.contains('is-open')) return;

    if (e.key === 'Escape') {
        closeModal();
    } else if (e.key === 'ArrowLeft') {
        navigateModal('prev');
    } else if (e.key === 'ArrowRight') {
        navigateModal('next');
    }
}

/**
 * Abre la modal con el ejemplar seleccionado y el contexto del catálogo
 */
export function openModal(ejemplar, todosLosEjemplares = [], indexActual = 0) {
    const modalElement = document.getElementById('modal-overlay');
    if (!modalElement) return;

    currentList = todosLosEjemplares.length > 0 ? todosLosEjemplares : [ejemplar];
    currentIndex = indexActual >= 0 ? indexActual : 0;

    initModalEvents();
    renderModalContent(currentList[currentIndex]);

    modalElement.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

/**
 * Cierra la modal y restablece el scroll
 */
export function closeModal() {
    const modalElement = document.getElementById('modal-overlay');
    if (!modalElement) return;

    modalElement.classList.remove('is-open');
    document.body.style.overflow = '';
}

/**
 * Navega al ejemplar anterior o siguiente con loop infinito
 */
export function navigateModal(direccion) {
    if (!currentList || currentList.length <= 1) return;

    if (direccion === 'next') {
        currentIndex = (currentIndex + 1) % currentList.length;
    } else if (direccion === 'prev') {
        currentIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    }

    updateModalContent(currentList[currentIndex]);
}

/**
 * Actualiza el contenido con transición de opacidad y leve desplazamiento
 */
function updateModalContent(nuevoEjemplar) {
    const content = document.getElementById('modal-body-content');
    if (!content) return;

    content.classList.add('fade-out');

    setTimeout(() => {
        renderModalContent(nuevoEjemplar);
        content.classList.remove('fade-out');
        content.classList.add('fade-in');

        setTimeout(() => {
            content.classList.remove('fade-in');
        }, 300);
    }, 200);
}

/**
 * Renderiza la estructura interna de la modal
 */
function renderModalContent(ejemplar = {}) {
    const content = document.getElementById('modal-body-content');
    if (!content) return;

    const imagenes = [ejemplar.imagen_url, ejemplar.imagen_url_2, ejemplar.imagen_url_3]
        .filter(url => typeof url === 'string' && url.trim() !== '');

    const imagenPrincipal = safeImageUrl(imagenes[0], 'https://via.placeholder.com/800x600?text=Sin+Imagen');

    const especie = escapeHTML(ejemplar.especie || 'Crotalus');
    const genetica = escapeHTML(ejemplar.genetica || 'Nominal');
    const sexo = escapeHTML(ejemplar.sexo || 'Sin sexar');
    const estatus = escapeHTML((ejemplar.estatus || 'Disponible').trim());
    const estatusNormalizado = (ejemplar.estatus || 'Disponible').trim().toLowerCase();
    const idEjemplar = escapeHTML(ejemplar.id ? `#${ejemplar.id}` : 'N/A');
    const anio = escapeHTML(ejemplar.nacimiento ? String(ejemplar.nacimiento).substring(0, 4) : 'N/A');
    
    const precioFormat = new Intl.NumberFormat('es-MX', { 
        style: 'currency', 
        currency: 'MXN',
        minimumFractionDigits: 2 
    }).format(Number(ejemplar.precio) || 0);

    const isDisponible = estatusNormalizado === 'disponible';
    
    // Generar enlace y texto dinámicos según el estatus
    const { url: linkWhatsApp, btnText } = getWhatsAppDetails(ejemplar);

    const statusClass = escapeHTML(`status-${estatusNormalizado.replace(/\s+/g, '-')}`);
    const btnClass = isDisponible ? 'btn-available' : 'btn-unavailable';

    // Filtrar ejemplares disponibles para la sección inferior
    const ejemplaresDisponibles = getAvailableEjemplares(currentList, ejemplar);
    
    let otrosEjemplaresHTML = '';
    if (ejemplaresDisponibles.length > 0) {
        otrosEjemplaresHTML = `
            <div class="modal-others-grid">
                ${ejemplaresDisponibles.map((item) => {
                    const indexEnListaOriginal = currentList.findIndex(e => e.id === item.id);
                    const itemImg = safeImageUrl(item.imagen_url, 'https://via.placeholder.com/150');
                    const itemEspecie = escapeHTML(item.especie || 'Crotalus');
                    const itemPrecio = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(Number(item.precio) || 0);

                    return `
                        <div class="other-card" data-index="${indexEnListaOriginal}">
                            <div class="other-card-img-wrapper">
                                <img src="${itemImg}" alt="${itemEspecie}" />
                            </div>
                            <div class="other-card-info">
                                <span class="other-card-species">${itemEspecie}</span>
                                <span class="other-card-price">${itemPrecio}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else {
        otrosEjemplaresHTML = `<p class="no-others-message">No hay más ejemplares disponibles en este momento</p>`;
    }

    content.innerHTML = `
        <div class="modal-main-layout">
            <!-- Columna Izquierda: Imagen Principal sin etiqueta flotante -->
            <div class="modal-col-left">
                <div class="modal-image-main-wrapper" id="zoom-wrapper">
                    <img id="modal-main-img" src="${imagenPrincipal}" alt="${especie}" class="modal-main-img" />
                </div>
                ${imagenes.length > 1 ? `
                    <div class="modal-thumbnails">
                        ${imagenes.map((img, idx) => {
                            const safeImg = safeImageUrl(img);
                            return `
                            <div class="modal-thumb-wrapper">
                                <img src="${safeImg}" class="modal-thumb ${idx === 0 ? 'active' : ''}" data-src="${safeImg}" alt="Miniatura ${idx + 1}" />
                            </div>
                        `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>

            <!-- Columna Derecha: Navegación + Detalles -->
            <div class="modal-col-right">
                <!-- Barra de Navegación -->
                <div class="modal-nav-bar">
                    <button type="button" class="modal-nav-btn" id="modal-prev-btn" aria-label="Anterior">
                        ‹ Anterior
                    </button>
                    <span class="modal-counter">Ejemplar ${currentIndex + 1} de ${currentList.length}</span>
                    <button type="button" class="modal-nav-btn" id="modal-next-btn" aria-label="Siguiente">
                        Siguiente ›
                    </button>
                </div>

                <!-- Cabecera -->
                <div class="modal-header-info">
                    <h1 class="modal-title-species">${especie}</h1>
                    <span class="modal-genetics-badge">${genetica}</span>
                </div>

                <!-- Cuadrícula de Datos (Estatus visible aquí) -->
                <div class="modal-details-grid">
                    <div class="detail-item">
                        <label>SEXO</label>
                        <span>${sexo}</span>
                    </div>
                    <div class="detail-item">
                        <label>AÑO NACIMIENTO</label>
                        <span>${anio}</span>
                    </div>
                    <div class="detail-item">
                        <label>ID EJEMPLAR</label>
                        <span>${idEjemplar}</span>
                    </div>
                    <div class="detail-item">
                        <label>ESTATUS</label>
                        <span class="detail-status-text ${statusClass}">${estatus}</span>
                    </div>
                </div>

                <!-- Precio -->
                <div class="modal-price-box">
                    <span class="modal-price-label">PRECIO:</span>
                    <span class="modal-price">${precioFormat} MXN</span>
                </div>

                <!-- Botón de WhatsApp -->
                <a href="${linkWhatsApp}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp ${btnClass}">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.299.425 2.5 1.144 3.473l-.751 2.74 2.802-.735c.937.511 2.012.808 3.153.808 3.18 0 5.767-2.586 5.768-5.766.001-3.18-2.585-5.766-5.768-5.766zm3.327 8.2c-.145.405-.838.774-1.164.823-.326.049-.751.084-2.158-.468-1.785-.701-2.922-2.522-3.011-2.641-.088-.119-.723-.961-.723-1.832 0-.871.458-1.301.621-1.478.163-.177.355-.222.473-.222.119 0 .237 0 .341.006.109.006.255-.042.399.304.145.346.495 1.209.539 1.298.044.089.074.193.015.311-.059.119-.089.193-.177.296-.089.104-.187.232-.267.311-.089.089-.182.186-.078.365.104.178.463.765 1.001 1.244.692.617 1.275.808 1.454.897.178.089.282.074.385-.044.104-.119.444-.518.563-.696.119-.178.237-.148.399-.089.163.059 1.035.488 1.213.577.178.089.296.133.341.207.045.074.045.43-.1 0.835z"/>
                    </svg>
                    ${btnText}
                </a>
            </div>
        </div>

        <!-- Otros Ejemplares Disponibles -->
        <div class="modal-others-section">
            <h3 class="modal-others-title">Ejemplares disponibles</h3>
            ${otrosEjemplaresHTML}
        </div>
    `;

    // Activar Zoom Interactivo (Lupa)
    const zoomWrapper = content.querySelector('#zoom-wrapper');
    const mainImg = content.querySelector('#modal-main-img');
    setupInteractiveZoom(zoomWrapper, mainImg);

    // Activar selector de imágenes miniatura
    const thumbs = content.querySelectorAll('.modal-thumb');
    thumbs.forEach(thumb => {
        thumb.onclick = () => {
            thumbs.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            if (mainImg) {
                mainImg.style.opacity = '0.4';
                setTimeout(() => {
                    mainImg.src = thumb.dataset.src;
                    mainImg.style.opacity = '1';
                }, 150);
            }
        };
    });

    // Eventos de Navegación
    const prevBtn = content.querySelector('#modal-prev-btn');
    const nextBtn = content.querySelector('#modal-next-btn');

    if (prevBtn) prevBtn.onclick = () => navigateModal('prev');
    if (nextBtn) nextBtn.onclick = () => navigateModal('next');

    // Eventos para seleccionar otros ejemplares disponibles
    const otherCards = content.querySelectorAll('.other-card');
    otherCards.forEach(card => {
        card.onclick = () => {
            const idx = parseInt(card.dataset.index, 10);
            if (!isNaN(idx) && idx !== currentIndex) {
                currentIndex = idx;
                updateModalContent(currentList[currentIndex]);
            }
        };
    });
}

/**
 * Lupa interactiva que sigue la posición del cursor
 */
function setupInteractiveZoom(wrapper, img) {
    if (!wrapper || !img) return;

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
        wrapper.onclick = () => {
            wrapper.classList.toggle('is-zoomed');
            if (wrapper.classList.contains('is-zoomed')) {
                img.style.transform = 'scale(1.8)';
                img.style.transformOrigin = 'center center';
            } else {
                img.style.transform = 'scale(1)';
            }
        };
        return;
    }

    wrapper.onmousemove = (e) => {
        const rect = wrapper.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        img.style.transformOrigin = `${x}% ${y}%`;
        img.style.transform = 'scale(2)';
    };

    wrapper.onmouseleave = () => {
        img.style.transform = 'scale(1)';
        setTimeout(() => {
            img.style.transformOrigin = 'center center';
        }, 200);
    };
}