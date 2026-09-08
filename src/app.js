import { initSupabase } from './supabase-config.js';
import { renderHeader } from './components/common/header/header.js';
import { renderFooter } from './components/common/footer/footer.js';
import { renderFilters } from './components/ui/filters/filters.js';
import { renderCatalog } from './components/ui/catalog/catalog.js';

export async function initApp() {
    initSupabase();
    
    renderHeader('header-root');
    renderFooter('footer-root');
    
    await renderFilters('filters-root', (filters) => {
        renderCatalog('catalog-root', filters);
    });

    await renderCatalog('catalog-root');
}