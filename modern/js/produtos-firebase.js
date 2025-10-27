// Página de produtos refatorada para usar bootstrap compartilhado
import ComponentLoader from './services/component-loader.js';
import { normalizeProduct, formatPrice, escapeHTML } from './services/product-utils.js';
import { analytics } from './services/analytics-service.js';
import { eventBus } from './services/event-bus.js';
import { bootstrap } from './bootstrap.js';

class ProdutosFirebaseApp {
    constructor() {
        this.componentLoader = new ComponentLoader();
        this.firebaseService = null;
        this.modals = null;
        this.auth = null;
        this.products = [];
        this.currentFilter = 'all';
        this.currentSort = 'name';
        this.searchQuery = '';
    this.searchDebounceTimer = null;
    this.currentPage = 1;
    this.pageSize = 12;
    this.imageObserver = null;
    }

    async init() {
        try {
            analytics.track('products_page_init');
            this.checkSearchQuery();
            this.showLoading();
            await this.componentLoader.loadHeader();
              // Exibe badge de vitrine, se aplicável
              this.showShowcaseBadge();
            await this.componentLoader.loadFooter();
            // Aguarda bootstrap (já inicia firebase, auth, cart, modals)
            await bootstrap.init();
            this.firebaseService = bootstrap.firebase;
            this.auth = bootstrap.auth;
            this.modals = bootstrap.modals;

              // Se estiver em modo vitrine (?vitrine=1), aplica overrides de leitura e bloqueia escritas
              await this.enableShowcaseModeIfNeeded();
            // Garantir que modal/form auth está ligado ao AuthService
            this.wireAuthForm();
            await this.loadProducts();
            this.setupEventListeners();
            this.setupHeaderAuthListeners();
            analytics.track('products_page_ready', { total: this.products.length });
        } catch (e) {
            console.error('Erro ao inicializar produtos:', e);
            this.showError();
        } finally {
            this.hideLoading();
        }
    }

        async enableShowcaseModeIfNeeded() {
            try {
                const params = new URLSearchParams(location.search);
                const showcase = params.get('vitrine') === '1' || window.SHOWCASE_MODE === true;
                if (!showcase) return;
                window.SHOWCASE_MODE = true;
                const cacheKey = 'products_cache_vitrine';
                const ttl = 60 * 60 * 1000; // 60 min
                const originalGetProducts = this.firebaseService?.getProducts;
                // Override fonte de produtos para arquivo local em modo vitrine
                if (this.firebaseService) {
                    this.firebaseService.getProducts = async () => {
                        const now = Date.now();
                        try {
                            const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
                            if (cached?.items && now - (cached.ts || 0) < ttl) {
                                return cached.items;
                            }
                        } catch {}
                        try {
                            const resp = await fetch('./data/products.json', { cache: 'no-store' });
                            const items = await resp.json();
                            try { localStorage.setItem(cacheKey, JSON.stringify({ items, ts: now })); } catch {}
                            return Array.isArray(items) ? items : [];
                        } catch (e) {
                            console.error('[Showcase] Falha ao carregar ./data/products.json', e);
                            // Fallback: tenta original se existir
                            if (typeof originalGetProducts === 'function') return await originalGetProducts.call(this.firebaseService);
                            return [];
                        }
                    };

                    ['addProduct','updateProduct','deleteProduct','createOrder','addClient','updateClient','deleteClient']
                        .forEach(m => {
                            if (typeof this.firebaseService[m] === 'function') {
                                this.firebaseService[m] = async () => { throw new Error('Modo vitrine: operação não permitida'); };
                            }
                        });
                }
            } catch (e) {
                console.warn('Falha ao habilitar modo vitrine:', e);
            }
        }

        showShowcaseBadge() {
            try {
                const params = new URLSearchParams(location.search);
                const showcase = (typeof window !== 'undefined' && window.SHOWCASE_MODE) || params.get('vitrine') === '1';
                const badge = document.getElementById('showcase-badge');
                if (badge) badge.style.display = showcase ? 'inline-flex' : 'none';
            } catch {}
        }

    checkSearchQuery() {
        const urlParams = new URLSearchParams(window.location.search);
        this.searchQuery = urlParams.get('search') || '';
        this.currentFilter = urlParams.get('cat') || 'all';
    this.currentSort = urlParams.get('sort') || 'name';
    const pageParam = parseInt(urlParams.get('page'));
    if (!isNaN(pageParam) && pageParam > 0) this.currentPage = pageParam;
        const searchInput = document.querySelector('.search-box__input');
        if (searchInput && this.searchQuery) searchInput.value = this.searchQuery;
    }

    async loadProducts() {
        try {
                        const raw = await this.firebaseService.getProducts();
                        this.products = raw.map(normalizeProduct)
                            .filter(p => p.ativo !== false && (p.publicado !== false) && (p.pendente !== true)
                                && (Number(p.quantidade) || 0) > 0);
            this.renderProducts();
        } catch (e) {
            console.warn('Falha ao carregar Firebase, usando amostras.', e);
            this.loadSampleProducts();
        }
    }

    loadSampleProducts() {
        const samples = [
            { id: '1', nome: 'Dipirona 500mg', descricao: 'Analgésico e antitérmico - 20 comprimidos', categoria: 'medicamentos', precoComDesconto: 8.9, precoMaximo: 12.5, quantidade: 50, codRed: 'DIP001', laboratorio: 'Medley', fotos: ['img/produtos/dipirona.jpg'] },
            { id: '2', nome: 'Protetor Solar FPS 60', descricao: 'Proteção solar FPS60 - 120ml', categoria: 'dermocosmeticos', precoComDesconto: 45.9, precoMaximo: 55.9, quantidade: 25, codRed: 'PS001', laboratorio: 'La Roche', fotos: ['img/produtos/protetor.jpg'] },
            { id: '3', nome: 'Vitamina C 1g', descricao: 'Suplemento vitamínico - 30 cápsulas', categoria: 'suplementos', precoComDesconto: 25.9, precoMaximo: 32.9, quantidade: 100, codRed: 'VIT001', laboratorio: 'Vitafor', fotos: ['img/produtos/vitamina-c.jpg'] },
            { id: '4', nome: 'Termômetro Digital', descricao: 'Termômetro digital LCD', categoria: 'equipamentos', precoComDesconto: 18.9, precoMaximo: 0, quantidade: 15, codRed: 'TERM001', laboratorio: 'G-Tech', fotos: ['img/produtos/termometro.jpg'] },
            { id: '5', nome: 'Shampoo Anticaspa', descricao: 'Shampoo medicamentoso 400ml', categoria: 'dermocosmeticos', precoComDesconto: 29.9, precoMaximo: 35.9, quantidade: 30, codRed: 'SHA001', laboratorio: 'Vichy', fotos: ['img/produtos/shampoo.jpg'] },
            { id: '6', nome: 'Ibuprofeno 600mg', descricao: 'Anti-inflamatório - 10 comprimidos', categoria: 'medicamentos', precoComDesconto: 15.5, precoMaximo: 18.9, quantidade: 40, codRed: 'IBU001', laboratorio: 'EMS', fotos: ['img/produtos/ibuprofeno.jpg'] },
            { id: '7', nome: 'Whey Protein', descricao: 'Proteína do soro 900g', categoria: 'suplementos', precoComDesconto: 89.9, precoMaximo: 110, quantidade: 20, codRed: 'WHE001', laboratorio: 'Optimum', fotos: ['img/produtos/whey.jpg'] },
            { id: '8', nome: 'Fralda Infantil', descricao: 'Fralda M - 30 unidades', categoria: 'infantil', precoComDesconto: 39.9, precoMaximo: 45.9, quantidade: 60, codRed: 'FRA001', laboratorio: 'Pampers', fotos: ['img/produtos/fralda.jpg'] }
        ];
        this.products = samples.map(normalizeProduct);
        this.renderProducts();
    }

    showLoading() {
        const spinner = document.getElementById('loading-spinner');
        const container = document.getElementById('products-container');
        if (spinner) { spinner.style.display = 'flex'; spinner.classList.add('active'); }
        if (container) {
            container.innerHTML = Array.from({ length: 8 }).map(() => this.renderSkeletonCard()).join('');
        }
    }

    hideLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) { spinner.style.display = 'none'; spinner.classList.remove('active'); }
    }

    showError() {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) { errorMessage.style.display = 'flex'; errorMessage.classList.add('active'); }
        this.hideLoading();
    }

    setupEventListeners() {
        const searchInput = document.querySelector('.search-box__input');
        const searchButton = document.querySelector('.search-box__button');
        if (searchInput && searchButton) {
            searchButton.addEventListener('click', () => this.handleSearch(true));
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = setTimeout(() => this.handleSearch(false), 350);
            });
            searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') this.handleSearch(true); });
        }
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleFilter(btn.dataset.category));
            const isActive = btn.dataset.category === this.currentFilter;
            btn.classList.toggle('filter-btn--active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        // Ajusta visibilidade de subfiltros (Genéricos/Referência/Similares) atrelados a Medicamentos
        this.updateFilterVisibility();
        const sortSelect = document.querySelector('.sort-select');
        if (sortSelect) {
            sortSelect.value = this.currentSort;
            sortSelect.addEventListener('change', e => this.handleSort(e.target.value));
        }
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', this.toggleMobileMenu);
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
        const mobileOverlay = document.getElementById('mobile-overlay');
        if (mobileSidebarClose) mobileSidebarClose.addEventListener('click', this.closeMobileSidebar);
        if (mobileOverlay) mobileOverlay.addEventListener('click', this.closeMobileSidebar);
        this.setupDelegatedEvents();
    }

    setupHeaderAuthListeners() {
        // Configura botão usuário e carrinho como na home
        const userBtn = document.getElementById('user-btn');
        if (userBtn && !userBtn.hasAttribute('data-listener-attached')) {
            userBtn.setAttribute('data-listener-attached', 'true');
            userBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.auth.user && this.firebaseService.isInitialized) {
                    // dropdown já tratado pelo AuthService
                    return;
                }
                if (window.modalsManager) {
                    window.modalsManager.openAuthModal('login');
                } else {
                    this.auth.showAuthModal();
                }
            });
        }
        const cartBtn = document.getElementById('cart-btn');
        if (cartBtn && !cartBtn.hasAttribute('data-listener-attached')) {
            cartBtn.setAttribute('data-listener-attached', 'true');
            cartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.modalsManager) {
                    window.modalsManager.openCartModal();
                }
            });
        }
    }

    wireAuthForm() {
        const form = document.getElementById('auth-form');
        if (!form) return;
        // Clona para remover listeners antigos do ModalsManager
        const clone = form.cloneNode(true);
        form.parentNode.replaceChild(clone, form);
        clone.addEventListener('submit', (e) => this.auth.handleAuthSubmit(e));
        // Toggle (login <-> register)
        const toggle = clone.querySelector('#auth-toggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.auth.toggleAuthMode();
            });
        }
    }

    handleSearch(pushState = false) {
        const input = document.querySelector('.search-box__input');
        this.searchQuery = input ? input.value.trim() : '';
        this.currentPage = 1;
    if (pushState) this.updateURLState();
    eventBus.emit('products:search', { query: this.searchQuery });
    this.renderProducts();
    }

    handleFilter(category) {
        this.currentFilter = category;
        this.currentPage = 1;
        document.querySelectorAll('.filter-btn').forEach(b => {
            const active = b.dataset.category === category;
            b.classList.toggle('filter-btn--active', active);
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        this.updateFilterVisibility();
    this.updateURLState();
    eventBus.emit('products:filterChange', { filter: this.currentFilter });
    this.renderProducts();
    }

    updateFilterVisibility() {
        // Subfiltros de medicamentos devem aparecer quando o filtro atual é
        // 'medicamentos' ou um dos subitens (genericos, referencia, similares)
        const f = (this.currentFilter || '').toLowerCase();
        const showMedsSubs = ['medicamentos','genericos','referencia','similares'].includes(f);
        // Só controlar a visibilidade dos subfiltros na barra lateral
        document.querySelectorAll('.filters-sidebar .filter-btn[data-subfilter="medicamentos"]').forEach(btn => {
            btn.style.display = showMedsSubs ? '' : 'none';
        });
    }

    handleSort(sort) {
        this.currentSort = sort;
        this.currentPage = 1;
    this.updateURLState();
    eventBus.emit('products:sortChange', { sort: this.currentSort });
    this.renderProducts();
    }

    updateURLState() {
        const params = new URLSearchParams();
        if (this.searchQuery) params.set('search', this.searchQuery);
        if (this.currentFilter && this.currentFilter !== 'all') params.set('cat', this.currentFilter);
    if (this.currentSort && this.currentSort !== 'name') params.set('sort', this.currentSort);
    if (this.currentPage > 1) params.set('page', String(this.currentPage));
        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
    }

    filterProducts() {
        let filtered = this.products;
        if (this.currentFilter !== 'all') {
            const f = (this.currentFilter || '').toLowerCase();
            if (f === 'medicamentos') {
                const medsSet = new Set(['medicamentos','genericos','referencia','similares']);
                filtered = filtered.filter(p => medsSet.has((p.categoria || '').toLowerCase()));
            } else {
                filtered = filtered.filter(p => (p.categoria || '').toLowerCase() === f);
            }
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(p => [p.nome, p.descricao, p.dcb, p.codRed, p.ean, p.laboratorio, p.categoria]
                .filter(Boolean).some(v => v.toLowerCase().includes(q)));
        }
        return filtered;
    }

    sortProducts(list) {
            const arr = [...list];

            const sortByChoice = (items) => {
                const copy = [...items];
                switch (this.currentSort) {
                    case 'price-low': return copy.sort((a, b) => (a.precoDesconto || 0) - (b.precoDesconto || 0));
                    case 'price-high': return copy.sort((a, b) => (b.precoDesconto || 0) - (a.precoDesconto || 0));
                    case 'featured': return copy.sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0));
                    case 'name':
                    default: return copy.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                }
            };

            // When there is a search query, prioritize: 1) name matches, 2) DCB matches, 3) others
            const q = (this.searchQuery || '').trim().toLowerCase();
            if (q) {
                const nameMatches = [];
                const dcbMatches = [];
                const others = [];
                const inName = new Set();
                const inDcb = new Set();

                for (const p of arr) {
                    const nameHas = (p.nome || '').toLowerCase().includes(q);
                    if (nameHas) {
                        nameMatches.push(p);
                        inName.add(p.id);
                        continue;
                    }
                    const dcbHas = (p.dcb || '').toLowerCase().includes(q);
                    if (dcbHas) {
                        dcbMatches.push(p);
                        inDcb.add(p.id);
                        continue;
                    }
                    others.push(p);
                }

                return [
                    ...sortByChoice(nameMatches),
                    ...sortByChoice(dcbMatches),
                    ...sortByChoice(others)
                ];
            }

            return sortByChoice(arr);
    }

    renderProducts() {
        const container = document.getElementById('products-container');
        if (!container) return;
        const filtered = this.filterProducts();
        const sorted = this.sortProducts(filtered);
        const totalItems = sorted.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        const start = (this.currentPage - 1) * this.pageSize;
        const paginated = sorted.slice(start, start + this.pageSize);
        const infoEl = document.getElementById('products-results-info');
        if (infoEl) {
            if (totalItems === 0) {
                infoEl.textContent = 'Nenhum produto encontrado';
            } else {
                const rangeStart = totalItems === 0 ? 0 : start + 1;
                const rangeEnd = Math.min(start + this.pageSize, totalItems);
                infoEl.textContent = `${rangeStart}-${rangeEnd} de ${totalItems} produto${totalItems !== 1 ? 's' : ''}`;
            }
        }
        if (totalItems === 0) {
            container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;"><i class="fas fa-search" style="font-size:3rem;color:#ccc;margin-bottom:1rem;"></i><p>Nenhum produto encontrado com os filtros selecionados.</p></div>`;
            this.renderPagination(0, 0);
            return;
        }
    container.innerHTML = paginated.map(p => this.renderProductCard(p)).join('');
        this.renderPagination(this.currentPage, totalPages);
    eventBus.emit('products:render', { page: this.currentPage, pageSize: this.pageSize, total: totalItems, filter: this.currentFilter, sort: this.currentSort, query: this.searchQuery });
    this.initLazyImages();
    }

    renderSkeletonCard() {
        return `<div class="product-card skeleton"><div class="product-card__image skeleton-box"></div><div class="product-card__content"><div class="skeleton-line skeleton-line--lg"></div><div class="skeleton-line"></div><div class="skeleton-price"></div></div></div>`;
    }

    renderProductCard(product) {
        const imageUrl = (product.imagens && product.imagens.length) ? product.imagens[0] : 'img/produtos/default-product.svg';
        const highlightedName = this.highlightSearch(product.nome);
        const highlightedDesc = this.highlightSearch(product.descricao || '');
        const cat = (product.categoria || '').toLowerCase();
        const isMeds = ['medicamentos','genericos','referencia','similares'].includes(cat);
        const labInline = (isMeds && product.laboratorio)
          ? `<div class="product-card__lab-inline"><i class="fas fa-flask" aria-hidden="true"></i><span>${escapeHTML(product.laboratorio)}</span></div>`
          : '';
        return `<div class="product-card" data-product-id="${product.id}" data-category="${product.categoria}">
    <div class="product-card__image">
        <img data-src="${imageUrl}" src="img/produtos/default-product.svg" alt="${product.nome}" loading="lazy" class="lazy-img" onerror="this.src='img/produtos/default-product.svg'">
        ${product.destaque ? '<div class="product-card__badge">Destaque</div>' : ''}
        ${product.desconto > 0 ? `<div class="product-card__discount-badge">${product.desconto}% OFF</div>` : ''}
    </div>
    ${labInline}
    <div class="product-card__content">
        <h3 class="product-card__title">${highlightedName}</h3>
        <p class="product-card__description">${highlightedDesc}</p>
        ${product.codRed ? `<p class="product-card__code">Cód: ${escapeHTML(product.codRed)}</p>` : ''}
        <div class="product-card__price">
            ${product.precoCheio && product.precoCheio > product.precoDesconto ? `<span class="product-card__price-old">${formatPrice(product.precoCheio)}</span>` : ''}
            <span class="product-card__price-current">${formatPrice(product.precoDesconto)}</span>
        </div>
        <div class="product-card__stock">
            ${product.quantidade > 0 ? `<span class="in-stock">Em estoque (${product.quantidade})</span>` : '<span class="out-of-stock">Fora de estoque</span>'}
        </div>
        <div class="product-card__actions" data-product-id="${product.id}">
            <div class="quantity-selector">
                <button class="quantity-btn quantity-btn--minus" data-action="qty-minus" aria-label="Diminuir quantidade"><i class="fas fa-minus" aria-hidden="true"></i></button>
                <input type="number" class="quantity-input" value="1" min="1" max="${product.quantidade || 99}" aria-label="Quantidade">
                <button class="quantity-btn quantity-btn--plus" data-action="qty-plus" aria-label="Aumentar quantidade"><i class="fas fa-plus" aria-hidden="true"></i></button>
            </div>
            <div class="action-buttons">
                <button class="btn btn--primary btn--add-cart" data-action="add-cart" ${product.quantidade <= 0 ? 'disabled' : ''}><i class="fas fa-shopping-cart" aria-hidden="true"></i>Adicionar</button>
                <button class="btn--wishlist" data-action="wishlist" aria-label="Adicionar aos favoritos"><i class="fas fa-heart" aria-hidden="true"></i></button>
            </div>
        </div>
    </div>
</div>`;
    }

    renderPagination(current, total) {
        const el = document.getElementById('pagination-container');
        if (!el) return;
        if (total <= 1) { el.innerHTML = ''; return; }
        const btn = (p, label = p, active = false, disabled = false) => `<button class="pagination__btn${active ? ' pagination__btn--active' : ''}" data-page="${p}" ${disabled ? 'disabled' : ''}>${label}</button>`;
        let html = '';
        html += btn(Math.max(1, current - 1), '<', false, current === 1);
        const windowSize = 5; let start = Math.max(1, current - Math.floor(windowSize / 2)); let end = start + windowSize - 1;
        if (end > total) { end = total; start = Math.max(1, end - windowSize + 1); }
        if (start > 1) { html += btn(1, '1', current === 1); if (start > 2) html += '<span class="pagination__ellipsis">...</span>'; }
        for (let p = start; p <= end; p++) html += btn(p, p, p === current);
        if (end < total) { if (end < total - 1) html += '<span class="pagination__ellipsis">...</span>'; html += btn(total, total, current === total); }
        html += btn(Math.min(total, current + 1), '>', false, current === total);
        el.innerHTML = html;
    }

    setupDelegatedEvents() {
        const container = document.getElementById('products-container');
        const paginationEl = document.getElementById('pagination-container');
        if (container) {
            container.addEventListener('click', e => {
                const actionEl = e.target.closest('[data-action]');
                if (!actionEl) return;
                const card = actionEl.closest('.product-card');
                if (!card) return;
                const id = card.getAttribute('data-product-id');
                const product = this.products.find(p => p.id === id);
                if (!product) return;
                const qtyInput = card.querySelector('.quantity-input');
                let qty = parseInt(qtyInput?.value || '1');
                if (isNaN(qty) || qty < 1) qty = 1;
                const max = parseInt(qtyInput?.getAttribute('max') || '99');
                switch (actionEl.dataset.action) {
                    case 'qty-minus': qty = Math.max(1, qty - 1); qtyInput.value = qty; break;
                    case 'qty-plus': qty = Math.min(max, qty + 1); qtyInput.value = qty; break;
                    case 'add-cart': {
                        const cartProduct = { id: product.id, name: product.nome, price: product.precoDesconto || 0, quantity: qty };
                        window.modalsManager?.addToCart(cartProduct);
                        analytics.track('add_to_cart', { id: product.id, qty, price: cartProduct.price });
                        break; }
                    case 'wishlist':
                        analytics.track('wishlist_add', { id: product.id });
                        window.modalsManager?.uiService?.showToast('Adicionado aos favoritos (simulado)');
                        break;
                }
            });
        }
        if (paginationEl) {
            paginationEl.addEventListener('click', e => {
                const btn = e.target.closest('.pagination__btn[data-page]');
                if (!btn) return;
                const page = parseInt(btn.getAttribute('data-page'));
                if (!isNaN(page) && page !== this.currentPage) {
                    this.currentPage = page;
                    this.renderProducts();
                    this.updateURLState();
                    eventBus.emit('products:pageChange', { page });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }
    }

    highlightSearch(text) {
        if (!this.searchQuery) return escapeHTML(text);
        const q = this.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${q})`, 'ig');
        return escapeHTML(text).replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    initLazyImages() {
        const imgs = document.querySelectorAll('img.lazy-img[data-src]');
        if (!('IntersectionObserver' in window)) {
            imgs.forEach(img => { img.src = img.dataset.src; });
            return;
        }
        if (!this.imageObserver) {
            this.imageObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        this.imageObserver.unobserve(img);
                    }
                });
            }, { rootMargin: '100px 0px' });
        }
        imgs.forEach(img => this.imageObserver.observe(img));
    }

    toggleMobileMenu() {
        const sidebar = document.getElementById('mobile-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        const toggle = document.getElementById('mobile-menu-toggle');
        if (sidebar && overlay && toggle) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            toggle.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
        }
    }

    closeMobileSidebar() {
        const sidebar = document.getElementById('mobile-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        const toggle = document.getElementById('mobile-menu-toggle');
        if (sidebar && overlay && toggle) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            toggle.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

}

document.addEventListener('DOMContentLoaded', async () => {
    const app = new ProdutosFirebaseApp();
    window.produtosApp = app;
    await app.init();
});
