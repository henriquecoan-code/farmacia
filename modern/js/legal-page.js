// Páginas legais (privacidade.html, termos.html): só header/footer e o bootstrap compartilhado
import ComponentLoader from './services/component-loader.js';
import { bootstrap } from './bootstrap.js';

const initPage = async () => {
    const loader = new ComponentLoader();
    await loader.loadHeader();
    await loader.loadFooter();
    await bootstrap.init();
    // Âncoras (#armazenamento-local) depois que o header empurrou o conteúdo
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
};

initPage();
