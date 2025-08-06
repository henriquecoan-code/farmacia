// Products Firebase Integration
import { FirebaseService } from './services/firebase-service.js';
import { ModalsManager } from './services/modals-service.js';
import ComponentLoader from './services/component-loader.js';

class ProdutosFirebaseApp {
    constructor() {
        this.firebaseService = new FirebaseService();
        this.componentLoader = new ComponentLoader();
        this.modals = new ModalsManager();
        this.products = [];
        this.currentFilter = 'all';
        this.currentSort = 'name';
        this.searchQuery = '';
    }

    async init() {
        try {
            console.log('Initializing Products Firebase App...');
            
            // Check for search query in URL
            this.checkSearchQuery();
            
            // Show loading while initializing
            this.showLoading();
            
            // Load components first
            console.log('Loading components...');
            await this.componentLoader.loadHeader();
            await this.componentLoader.loadFooter();
            console.log('Components loaded successfully');
            
            // Initialize Firebase
            console.log('Initializing Firebase...');
            await this.firebaseService.init();
            console.log('Firebase initialized');
            
            // Initialize modals
            console.log('Initializing modals...');
            await this.modals.init();
            window.modalsManager = this.modals;
            console.log('Modals initialized');
            
            // Load products from Firebase
            console.log('Loading products...');
            await this.loadProducts();
            
            // Setup event listeners
            console.log('Setting up event listeners...');
            this.setupEventListeners();
            
            console.log('Products Firebase App initialized successfully');
            
        } catch (error) {
            console.error('Error initializing products app:', error);
            this.hideLoading();
            this.showError();
        }
    }

    checkSearchQuery() {
        const urlParams = new URLSearchParams(window.location.search);
        this.searchQuery = urlParams.get('search') || '';
        
        // Update search input if it exists
        const searchInput = document.querySelector('.search-box__input');
        if (searchInput && this.searchQuery) {
            searchInput.value = this.searchQuery;
        }
    }

    async loadProducts() {
        try {
            this.showLoading();
            this.products = await this.firebaseService.getProducts();
            console.log('Loaded products from Firebase:', this.products);
            this.renderProducts();
            this.hideLoading();
        } catch (error) {
            console.error('Error loading products:', error);
            // Load sample products as fallback
            this.loadSampleProducts();
            this.hideLoading();
        }
    }

    loadSampleProducts() {
        // Sample products for testing/demo
        this.products = [
            {
                id: '1',
                nome: 'Dipirona 500mg',
                descricao: 'Analgésico e antitérmico - 20 comprimidos',
                categoria: 'medicamentos',
                precoComDesconto: 8.90,
                precoMaximo: 12.50,
                quantidade: 50,
                codRed: 'DIP001',
                laboratorio: 'Medley',
                fotos: ['img/produtos/dipirona.jpg']
            },
            {
                id: '2',
                nome: 'Protetor Solar FPS 60',
                descricao: 'Proteção solar para todos os tipos de pele - 120ml',
                categoria: 'dermocosmeticos',
                precoComDesconto: 45.90,
                precoMaximo: 55.90,
                quantidade: 25,
                codRed: 'PS001',
                laboratorio: 'La Roche Posay',
                fotos: ['img/produtos/protetor.jpg']
            },
            {
                id: '3',
                nome: 'Vitamina C 1g',
                descricao: 'Suplemento vitamínico - 30 cápsulas',
                categoria: 'suplementos',
                precoComDesconto: 25.90,
                precoMaximo: 32.90,
                quantidade: 100,
                codRed: 'VIT001',
                laboratorio: 'Vitafor',
                fotos: ['img/produtos/vitamina-c.jpg']
            },
            {
                id: '4',
                nome: 'Termômetro Digital',
                descricao: 'Termômetro digital com display LCD',
                categoria: 'equipamentos',
                precoComDesconto: 18.90,
                quantidade: 15,
                codRed: 'TERM001',
                laboratorio: 'G-Tech',
                fotos: ['img/produtos/termometro.jpg']
            },
            {
                id: '5',
                nome: 'Shampoo Anticaspa',
                descricao: 'Shampoo medicinal contra caspa - 400ml',
                categoria: 'dermocosmeticos',
                precoComDesconto: 29.90,
                precoMaximo: 35.90,
                quantidade: 30,
                codRed: 'SHA001',
                laboratorio: 'Vichy',
                fotos: ['img/produtos/shampoo.jpg']
            },
            {
                id: '6',
                nome: 'Ibuprofeno 600mg',
                descricao: 'Anti-inflamatório - 10 comprimidos',
                categoria: 'medicamentos',
                precoComDesconto: 15.50,
                precoMaximo: 18.90,
                quantidade: 40,
                codRed: 'IBU001',
                laboratorio: 'EMS',
                fotos: ['img/produtos/ibuprofeno.jpg']
            },
            {
                id: '7',
                nome: 'Whey Protein',
                descricao: 'Proteína do soro do leite - 900g',
                categoria: 'suplementos',
                precoComDesconto: 89.90,
                precoMaximo: 110.00,
                quantidade: 20,
                codRed: 'WHE001',
                laboratorio: 'Optimum',
                fotos: ['img/produtos/whey.jpg']
            },
            {
                id: '8',
                nome: 'Fralda Infantil',
                descricao: 'Fralda descartável tamanho M - 30 unidades',
                categoria: 'infantil',
                precoComDesconto: 39.90,
                precoMaximo: 45.90,
                quantidade: 60,
                codRed: 'FRA001',
                laboratorio: 'Pampers',
                fotos: ['img/produtos/fralda.jpg']
            }
        ];
        
        console.log('Loaded sample products:', this.products);
        this.renderProducts();
    }

    showLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'flex';
            spinner.classList.add('active');
        }
    }

    hideLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'none';
            spinner.classList.remove('active');
        }
    }

    showError() {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.style.display = 'flex';
            errorMessage.classList.add('active');
        }
        this.hideLoading();
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.querySelector('.search-box__input');
        const searchButton = document.querySelector('.search-box__button');
        
        if (searchInput && searchButton) {
            searchButton.addEventListener('click', () => this.handleSearch());
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSearch();
            });
        }

        // Filter buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => this.handleFilter(btn.dataset.category));
        });

        // Sort dropdown
        const sortSelect = document.querySelector('.sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => this.handleSort(e.target.value));
        }

        // Mobile menu
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', this.toggleMobileMenu);
        }

        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        if (mobileSidebarClose) {
            mobileSidebarClose.addEventListener('click', this.closeMobileSidebar);
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', this.closeMobileSidebar);
        }
    }

    handleSearch() {
        const searchInput = document.querySelector('.search-box__input');
        this.searchQuery = searchInput ? searchInput.value.trim() : '';
        this.renderProducts();
    }

    renderProducts() {
        const container = document.getElementById('products-container');
        if (!container) return;

        const filteredProducts = this.filterProducts();
        const sortedProducts = this.sortProducts(filteredProducts);

        if (sortedProducts.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                    <i class="fas fa-search" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                    <p>Nenhum produto encontrado com os filtros selecionados.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sortedProducts.map(product => this.renderProductCard(product)).join('');
    }

    renderProductCard(product) {
        // Handle different price fields from Firebase structure
        const precoComDesconto = product.precoComDesconto || product.valorComDesconto || product.price || 0;
        const precoMaximo = product.precoMaximo || product.oldPrice || null;
        const nome = product.nome || product.name || 'Produto sem nome';
        const descricao = product.descricao || product.description || '';
        const categoria = product.categoria || product.category || 'outros';
        
        // Get first photo from fotos array if available
        let imageUrl = 'img/produtos/default-product.svg'; // fallback image
        if (product.fotos && Array.isArray(product.fotos) && product.fotos.length > 0) {
            imageUrl = product.fotos[0];
        } else if (product.image) {
            imageUrl = product.image;
        }

        // Calculate discount percentage if we have both prices
        const discountPercentage = precoMaximo && precoComDesconto ? 
            Math.round(((precoMaximo - precoComDesconto) / precoMaximo) * 100) : 
            (product.desconto ? Math.round(product.desconto * 100) : 0);

        // Check if product is featured
        const isFeatured = product.destaque || product.featured || false;

        return `
            <div class="product-card" data-category="${categoria}">
                <div class="product-card__image">
                    <img src="${imageUrl}" alt="${nome}" loading="lazy" onerror="this.src='img/produtos/default-product.svg'">
                    ${isFeatured ? '<div class="product-card__badge">Destaque</div>' : ''}
                    ${discountPercentage > 0 ? `<div class="product-card__discount-badge">${discountPercentage}% OFF</div>` : ''}
                </div>
                <div class="product-card__content">
                    <h3 class="product-card__title">${nome}</h3>
                    <p class="product-card__description">${descricao}</p>
                    ${product.codRed ? `<p class="product-card__code">Cód: ${product.codRed}</p>` : ''}
                    <div class="product-card__price">
                        <span class="product-card__price-current">R$ ${precoComDesconto.toFixed(2).replace('.', ',')}</span>
                        ${precoMaximo ? `<span class="product-card__price-old">R$ ${precoMaximo.toFixed(2).replace('.', ',')}</span>` : ''}
                    </div>
                    <div class="product-card__stock">
                        ${product.quantidade > 0 ? `<span class="in-stock">Em estoque (${product.quantidade})</span>` : '<span class="out-of-stock">Fora de estoque</span>'}
                    </div>
                    <div class="product-card__actions">
                        <div class="quantity-selector">
                            <button class="quantity-btn quantity-btn--minus" onclick="changeQuantity('${product.id}', -1)">
                                <i class="fas fa-minus"></i>
                            </button>
                            <input type="number" class="quantity-input" id="quantity-${product.id}" value="1" min="1" max="${product.quantidade || 99}">
                            <button class="quantity-btn quantity-btn--plus" onclick="changeQuantity('${product.id}', 1)">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                        <button class="btn btn--primary btn--add-cart" onclick="addToCartWithQuantity('${product.id}')" ${product.quantidade <= 0 ? 'disabled' : ''}>
                            <i class="fas fa-shopping-cart"></i>
                            Adicionar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    filterProducts() {
        let filtered = this.products;
        
        // Apply category filter
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(product => {
                const categoria = product.categoria || product.category || '';
                return categoria.toLowerCase() === this.currentFilter.toLowerCase();
            });
        }
        
        // Apply search filter
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(product => {
                const nome = (product.nome || product.name || '').toLowerCase();
                const descricao = (product.descricao || product.description || '').toLowerCase();
                const dcb = (product.dcb || '').toLowerCase();
                const codRed = (product.codRed || product.codigo || '').toLowerCase();
                const ean = (product.ean || product.codigoBarras || '').toLowerCase();
                const laboratorio = (product.laboratorio || product.marca || '').toLowerCase();
                const categoria = (product.categoria || product.category || '').toLowerCase();
                
                return nome.includes(query) || 
                       descricao.includes(query) || 
                       dcb.includes(query) || 
                       codRed.includes(query) || 
                       ean.includes(query) || 
                       laboratorio.includes(query) || 
                       categoria.includes(query);
            });
        }
        
        return filtered;
    }

    sortProducts(products) {
        const sortedProducts = [...products];
        
        switch (this.currentSort) {
            case 'price-low':
                return sortedProducts.sort((a, b) => {
                    const priceA = a.precoComDesconto || a.valorComDesconto || a.price || 0;
                    const priceB = b.precoComDesconto || b.valorComDesconto || b.price || 0;
                    return priceA - priceB;
                });
            case 'price-high':
                return sortedProducts.sort((a, b) => {
                    const priceA = a.precoComDesconto || a.valorComDesconto || a.price || 0;
                    const priceB = b.precoComDesconto || b.valorComDesconto || b.price || 0;
                    return priceB - priceA;
                });
            case 'featured':
                return sortedProducts.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
            case 'name':
            default:
                return sortedProducts.sort((a, b) => {
                    const nameA = a.nome || a.name || '';
                    const nameB = b.nome || b.name || '';
                    return nameA.localeCompare(nameB);
                });
        }
    }

    handleFilter(category) {
        this.currentFilter = category;
        
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('filter-btn--active');
        });
        
        document.querySelector(`[data-category="${category}"]`).classList.add('filter-btn--active');
        
        this.renderProducts();
    }

    handleSort(sortType) {
        this.currentSort = sortType;
        this.renderProducts();
    }

    toggleMobileMenu() {
        const sidebar = document.getElementById('mobile-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        const toggle = document.getElementById('mobile-menu-toggle');
        
        if (sidebar && overlay && toggle) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            toggle.classList.toggle('active');
            
            if (sidebar.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
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

// Global functions for cart and wishlist
window.addToCart = function(productId) {
    console.log('Adding product to cart:', productId);
    alert('Produto adicionado ao carrinho!');
};

// Global functions for onclick events
window.addToCartWithQuantity = function(productId) {
    const quantityInput = document.getElementById(`quantity-${productId}`);
    const quantity = quantityInput ? parseInt(quantityInput.value) : 1;
    
    // Find the product
    const app = window.produtosApp;
    if (!app) {
        console.error('Products app not available');
        return;
    }
    
    const product = app.products.find(p => p.id === productId);
    if (!product) {
        console.error('Product not found:', productId);
        return;
    }
    
    // Create product object for cart
    const cartProduct = {
        id: product.id,
        name: product.nome || product.name,
        price: product.precoComDesconto || product.price || 0,
        quantity: quantity
    };
    
    // Use modals manager if available
    if (window.modalsManager) {
        for (let i = 0; i < quantity; i++) {
            window.modalsManager.addToCart(cartProduct);
        }
    } else {
        console.log('Adding product to cart:', productId, 'with quantity:', quantity);
        alert(`${quantity} unidade(s) adicionada(s) ao carrinho!`);
    }
};

window.changeQuantity = function(productId, change) {
    const quantityInput = document.getElementById(`quantity-${productId}`);
    if (!quantityInput) return;
    
    const currentValue = parseInt(quantityInput.value);
    const newValue = Math.max(1, Math.min(currentValue + change, parseInt(quantityInput.max)));
    quantityInput.value = newValue;
};

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    const app = new ProdutosFirebaseApp();
    window.produtosApp = app; // Make app globally available
    await app.init();
});