// Products Firebase Integration
import { FirebaseService } from './services/firebase-service.js';
import { ComponentLoader } from './services/component-loader.js';

class ProdutosFirebaseApp {
    constructor() {
        this.firebaseService = new FirebaseService();
        this.componentLoader = new ComponentLoader();
        this.products = [];
        this.currentFilter = 'all';
        this.currentSort = 'name';
    }

    async init() {
        try {
            // Load components first
            await this.componentLoader.loadComponent('header', '#header-container');
            await this.componentLoader.loadComponent('footer', '#footer-container');
            
            // Initialize Firebase
            await this.firebaseService.init();
            
            // Hide loading spinner
            this.hideLoading();
            
            // Load products from Firebase
            await this.loadProducts();
            
            // Setup event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing products app:', error);
            this.showError();
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
            this.showError();
        }
    }

    showLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'flex';
    }

    hideLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'none';
    }

    showError() {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) errorMessage.style.display = 'flex';
        this.hideLoading();
    }

    setupEventListeners() {
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

        // Check if product is featured
        const isFeatured = product.featured || false;

        return `
            <div class="product-card" data-category="${categoria}">
                <div class="product-card__image">
                    <img src="${imageUrl}" alt="${nome}" loading="lazy" onerror="this.src='img/produtos/default-product.svg'">
                    ${isFeatured ? '<div class="product-card__badge">Destaque</div>' : ''}
                    ${product.laboratorio ? `<div class="product-card__brand">${product.laboratorio}</div>` : ''}
                </div>
                <div class="product-card__content">
                    <h3 class="product-card__title">${nome}</h3>
                    <p class="product-card__description">${descricao}</p>
                    ${product.codRed ? `<p class="product-card__code">Cód: ${product.codRed}</p>` : ''}
                    <div class="product-card__price">
                        <span class="product-card__price-current">R$ ${precoComDesconto.toFixed(2).replace('.', ',')}</span>
                        ${precoMaximo ? `<span class="product-card__price-old">R$ ${precoMaximo.toFixed(2).replace('.', ',')}</span>` : ''}
                        ${product.desconto ? `<span class="product-card__discount">${(product.desconto * 100).toFixed(0)}% OFF</span>` : ''}
                    </div>
                    <div class="product-card__stock">
                        ${product.quantidade > 0 ? `<span class="in-stock">Em estoque (${product.quantidade})</span>` : '<span class="out-of-stock">Fora de estoque</span>'}
                    </div>
                    <div class="product-card__actions">
                        <button class="btn btn--primary btn--add-cart" onclick="addToCart('${product.id}')" ${product.quantidade <= 0 ? 'disabled' : ''}>
                            <i class="fas fa-shopping-cart"></i>
                            Adicionar
                        </button>
                        <button class="btn--wishlist" onclick="addToWishlist('${product.id}')">
                            <i class="fas fa-heart"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    filterProducts() {
        if (this.currentFilter === 'all') {
            return this.products;
        }
        return this.products.filter(product => {
            const categoria = product.categoria || product.category || '';
            return categoria.toLowerCase() === this.currentFilter.toLowerCase();
        });
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

window.addToWishlist = function(productId) {
    console.log('Adding product to wishlist:', productId);
    alert('Produto adicionado à lista de desejos!');
};

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    const app = new ProdutosFirebaseApp();
    await app.init();
});