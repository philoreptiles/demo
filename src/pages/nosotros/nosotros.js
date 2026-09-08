import { renderHeader } from '../../components/common/header/header.js';
import { renderFooter } from '../../components/common/footer/footer.js';
import '../../components/common/header/header.css';
import '../../components/common/footer/footer.css';
import '../../styles/pages/nosotros.css';

export async function renderNosotrosPage() {
    await renderHeader('header-root');
    await renderFooter('footer-root');

    const main = document.getElementById('nosotros-app');
    if (!main) return;
    
    main.innerHTML = `
        <section class="nosotros-hero">
            <div class="section-container">
                <div class="hero-card">
                    <span class="hero-subtitle">Criadero Especializado</span>
                    <h1>Sobre Escama y Colmillo</h1>
                    <p class="nosotros-description">
                        Somos un criadero especializado en el género <strong>Crotalus</strong>, ubicado en Guadalajara, Jalisco. 
                        Con más de 10 años de experiencia, nos dedicamos a la reproducción ética y conservación de serpientes 
                        de cascabel, ofreciendo ejemplares de alta calidad genética y sanidad.
                    </p>
                </div>
            </div>
        </section>

        <section class="nosotros-valores-section">
            <div class="section-container">
                <h2 class="section-title">Nuestros Pilares</h2>
                <div class="nosotros-valores">
                    <div class="valor-card">
                        <div class="valor-icon"><i class="fa-solid fa-dna"></i></div>
                        <h3>Calidad Genética</h3>
                        <p>Trabajamos con líneas genéticas seleccionadas para garantizar ejemplares sanos y con características excepcionales.</p>
                    </div>

                    <div class="valor-card">
                        <div class="valor-icon"><i class="fa-solid fa-leaf"></i></div>
                        <h3>Ética y Conservación</h3>
                        <p>Nuestro compromiso es con el bienestar animal y la conservación de la especie, siguiendo los más altos estándares éticos.</p>
                    </div>

                    <div class="valor-card">
                        <div class="valor-icon"><i class="fa-solid fa-handshake"></i></div>
                        <h3>Confianza y Profesionalismo</h3>
                        <p>Contamos con registro ante SEMARNAT y ofrecemos asesoría especializada a nuestros clientes.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="nosotros-registro-section">
            <div class="registro-card">
                <div class="registro-badge"><i class="fa-solid fa-shield-halved"></i></div>
                <h2>Unidad de Manejo Autorizada</h2>
                <p class="registro-number">SEMARNAT-PIMVS-IN-0000-JAL</p>
                <p class="registro-text">Criadero registrado ante la Secretaría de Medio Ambiente y Recursos Naturales</p>
            </div>
        </section>
    `;
}

document.addEventListener('DOMContentLoaded', renderNosotrosPage);