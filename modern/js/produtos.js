// Products Page JavaScript
import { FirebaseService } from './services/firebase-service.js';
import { CartService } from './services/cart-service.js';
import { AuthService } from './services/auth-service.js';
import { UIService } from './services/ui-service.js';

class ProductsPage {
  constructor() {
    this.firebase = new FirebaseService();
    this.cart = new CartService();
    this.auth = new AuthService();
    this.ui = new UIService();
    this.currentFilter = 'all';
    this.currentSort = 'name';
    this.products = [];
    
    this.init();
  }

  async init() {
    try {
      // Show loading
      this.showLoading();
      
      // Initialize Firebase
      await this.firebase.init();
      
      // Initialize services
      this.cart.init();
      this.auth.init();
      this.auth.setFirebaseService(this.firebase);
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load products
      await this.loadProducts();
      
      // Hide loading
      this.hideLoading();
      
      console.log('Products page initialized successfully');
    } catch (error) {
      console.error('Error initializing products page:', error);
      this.hideLoading();
      this.showError();
    }
  }

  setupEventListeners() {
    // Header search
    const searchInput = document.querySelector('.search-box__input');
    const searchButton = document.querySelector('.search-box__button');
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleSearch(e.target.value);
      });
    }
    
    if (searchButton) {
      searchButton.addEventListener('click', () => {
        const searchTerm = searchInput ? searchInput.value : '';
        this.handleSearch(searchTerm);
      });
    }

    // User authentication
    const userBtn = document.getElementById('user-btn');
    if (userBtn) {
      userBtn.addEventListener('click', () => this.auth.showAuthModal());
    }

    // Cart modal
    const cartBtn = document.getElementById('cart-btn');
    if (cartBtn) {
      cartBtn.addEventListener('click', () => this.cart.showCartModal());
    }

    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', () => this.toggleMobileMenu());
    }

    // Mobile sidebar close events
    const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
    const mobileOverlay = document.getElementById('mobile-overlay');
    
    if (mobileSidebarClose) {
      mobileSidebarClose.addEventListener('click', () => this.closeMobileSidebar());
    }
    
    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => this.closeMobileSidebar());
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
  }

  async loadProducts() {
    try {
      // Create sample products with the available images
      this.products = [
        {
          id: 1,
          name: 'Dipirona 500mg',
          description: 'Analgésico e antitérmico para dores e febre',
          price: 12.50,
          oldPrice: 15.00,
          image: 'img/produtos/produto1.jpg',
          category: 'medicamentos',
          featured: true
        },
        {
          id: 2,
          name: 'Vitamina D 50k UI',
          description: 'Suplemento vitamínico para fortalecimento ósseo',
          price: 28.90,
          image: 'img/produtos/vitaminad50k8un.png',
          category: 'suplementos',
          featured: true
        },
        {
          id: 3,
          name: 'Pampers Shampoo 400ml',
          description: 'Shampoo infantil para cabelos delicados',
          price: 18.50,
          oldPrice: 22.00,
          image: 'img/produtos/pampers-shampoo-400ml.jpg',
          category: 'infantil',
          featured: false
        },
        {
          id: 4,
          name: 'Pomada Prati',
          description: 'Pomada cicatrizante e anti-inflamatória',
          price: 24.90,
          image: 'img/produtos/pomadaprati.png',
          category: 'medicamentos',
          featured: true
        },
        {
          id: 5,
          name: 'Fluitoss Xarope',
          description: 'Xarope expectorante para tosse com catarro',
          price: 16.80,
          image: 'img/produtos/FLUITOSS.png',
          category: 'medicamentos',
          featured: false
        },
        {
          id: 6,
          name: 'Pampers Condicionador 200ml',
          description: 'Condicionador infantil hipoalergênico',
          price: 14.90,
          image: 'img/produtos/pampers-condicionador-200ml.jpg',
          category: 'infantil',
          featured: false
        },
        {
          id: 7,
          name: 'Toalha Mili Love',
          description: 'Toalha umedecida para bebês e crianças',
          price: 8.50,
          oldPrice: 10.00,
          image: 'img/produtos/toalha-mili-love.jpg',
          category: 'infantil',
          featured: false
        },
        {
          id: 8,
          name: 'Creme Germed Rosa',
          description: 'Creme dermatológico hidratante e calmante',
          price: 32.50,
          image: 'img/produtos/GERMEDROSA.png',
          category: 'dermocosmeticos',
          featured: true
        }
      ];

      this.renderProducts();
    } catch (error) {
      console.error('Error loading products:', error);
      this.showError();
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
          <p>Nenhum produto encontrado com os filtros selecionados.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = sortedProducts.map(product => `
      <div class="product-card" data-category="${product.category}">
        <div class="product-card__image">
          <img src="${product.image}" alt="${product.name}" loading="lazy">
          ${product.featured ? '<div class="product-card__badge">Destaque</div>' : ''}
        </div>
        <div class="product-card__content">
          <h3 class="product-card__title">${product.name}</h3>
          <p class="product-card__description">${product.description}</p>
          <div class="product-card__price">
            <span class="product-card__price-current">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
            ${product.oldPrice ? `<span class="product-card__price-old">R$ ${product.oldPrice.toFixed(2).replace('.', ',')}</span>` : ''}
          </div>
          <div class="product-card__actions">
            <button class="btn btn--primary btn--add-cart" onclick="window.addToCart(${product.id})">
              <i class="fas fa-shopping-cart"></i>
              Adicionar
            </button>
            <button class="btn--wishlist" onclick="window.addToWishlist(${product.id})">
              <i class="fas fa-heart"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  filterProducts() {
    if (this.currentFilter === 'all') {
      return this.products;
    }
    return this.products.filter(product => product.category === this.currentFilter);
  }

  sortProducts(products) {
    const sortedProducts = [...products];
    
    switch (this.currentSort) {
      case 'price-low':
        return sortedProducts.sort((a, b) => a.price - b.price);
      case 'price-high':
        return sortedProducts.sort((a, b) => b.price - a.price);
      case 'featured':
        return sortedProducts.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
      case 'name':
      default:
        return sortedProducts.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  handleFilter(category) {
    this.currentFilter = category;
    
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('filter-btn--active');
    });
    
    document.querySelector(`[data-category="${category}"]`).classList.add('filter-btn--active');
    
    // Re-render products
    this.renderProducts();
  }

  handleSort(sortType) {
    this.currentSort = sortType;
    this.renderProducts();
  }

  handleSearch(searchTerm) {
    if (!searchTerm.trim()) {
      this.renderProducts();
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const filteredProducts = this.products.filter(product =>
      product.name.toLowerCase().includes(searchLower) ||
      product.description.toLowerCase().includes(searchLower)
    );

    this.renderFilteredProducts(filteredProducts);
  }

  renderFilteredProducts(products) {
    const container = document.getElementById('products-container');
    if (!container) return;

    if (products.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
          <p>Nenhum produto encontrado com o termo pesquisado.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(product => `
      <div class="product-card" data-category="${product.category}">
        <div class="product-card__image">
          <img src="${product.image}" alt="${product.name}" loading="lazy">
          ${product.featured ? '<div class="product-card__badge">Destaque</div>' : ''}
        </div>
        <div class="product-card__content">
          <h3 class="product-card__title">${product.name}</h3>
          <p class="product-card__description">${product.description}</p>
          <div class="product-card__price">
            <span class="product-card__price-current">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
            ${product.oldPrice ? `<span class="product-card__price-old">R$ ${product.oldPrice.toFixed(2).replace('.', ',')}</span>` : ''}
          </div>
          <div class="product-card__actions">
            <button class="btn btn--primary btn--add-cart" onclick="window.addToCart(${product.id})">
              <i class="fas fa-shopping-cart"></i>
              Adicionar
            </button>
            <button class="btn--wishlist" onclick="window.addToWishlist(${product.id})">
              <i class="fas fa-heart"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  toggleMobileMenu() {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const toggle = document.getElementById('mobile-menu-toggle');
    
    if (sidebar && overlay && toggle) {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
      toggle.classList.toggle('active');
      
      // Prevent body scroll when sidebar is open
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

  showLoading() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
      spinner.classList.add('active');
    }
  }

  hideLoading() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
      spinner.classList.remove('active');
    }
  }

  showError() {
    const errorMsg = document.getElementById('error-message');
    if (errorMsg) {
      errorMsg.classList.add('active');
    }
  }
}

// Global functions for product actions
window.addToCart = function(productId) {
  console.log('Adding product to cart:', productId);
  // This would integrate with the existing cart service
  alert('Produto adicionado ao carrinho!');
};

window.addToWishlist = function(productId) {
  console.log('Adding product to wishlist:', productId);
  alert('Produto adicionado à lista de desejos!');
};

// Initialize products page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ProductsPage();
});

export default ProductsPage;