/**
 * src/components/common/footer/footer.js
 * CAMBIOS:
 * 1. Se quito el enlace publico a "/src/pages/admin/admin.html". El panel
 *    de administracion ahora exige inicio de sesion real con Supabase Auth,
 *    pero de todas formas no tiene sentido anunciar su URL exacta a
 *    cualquier visitante del catalogo publico -- es superficie de ataque
 *    gratuita que no aporta nada al cliente final.
 * 2. El nombre de marca, año y ubicacion vienen de site-config.js.
 */
import { siteConfig } from '../../../site-config.js';

export async function renderFooter(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <footer class="site-footer">
            <div class="footer-container">
                <nav class="footer-nav">
                    <a href="/index.html" class="footer-link">Ejemplares</a>
                    <a href="/nosotros.html" class="footer-link">Nosotros</a>
                </nav>
                <p class="footer-copyright">
                    &copy; ${siteConfig.footerCopyrightYear} ${siteConfig.brandName} - ${siteConfig.location}
                </p>
            </div>
        </footer>
    `;
}
