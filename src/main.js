import './styles/main.css';
import './components/common/card/card.css';
import './components/ui/modal/modal.css';
import { initApp } from './app.js';
import { siteConfig, applySiteTheme } from './site-config.js';

// Se ejecuta ANTES de DOMContentLoaded para evitar cualquier parpadeo
// con los colores/tipografía de fallback definidos en main.css.
applySiteTheme();
document.title = siteConfig.pageTitle || siteConfig.brandName;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});