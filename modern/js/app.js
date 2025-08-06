// Modern Pharmacy App
import { FirebaseService } from './services/firebase-service.js';
import { CartService } from './services/cart-service.js';
import { AuthService } from './services/auth-service.js';
import { UIService } from './services/ui-service.js';
import ComponentLoader from './services/component-loader.js';

class PharmacyApp {
  constructor() {
    this.firebase = new FirebaseService();
    this.cart = new CartService();
    this.auth = new AuthService();
    this.ui = new UIService();
    this.componentLoader = new ComponentLoader();
    
    this.init();
  }

  async init() {
    try {
      // Show loading
      this.ui.showLoading();
      
      // Load components first
      await this.loadComponents();
      
      // Initialize Firebase
      await this.firebase.init();
      
      // Initialize services
      this.cart.init();
      this.auth.init();
      this.auth.setFirebaseService(this.firebase);
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load initial data
      await this.loadInitialData();
      
      // Hide loading
      this.ui.hideLoading();
      
      console.log('Pharmacy App initialized successfully');
    } catch (error) {
      console.error('Error initializing app:', error);
      this.ui.hideLoading();
      this.ui.showError('Erro ao carregar a aplicação. Tente novamente.');
    }
  }

  async loadComponents() {
    try {
      // Load header and footer components
      await this.componentLoader.loadHeader();
      await this.componentLoader.loadFooter();
      
      console.log('Components loaded successfully');
    } catch (error) {
      console.error('Error loading components:', error);
    }
  }

  setupEventListeners() {
    // Wait for components to be loaded before setting up event listeners
    document.addEventListener('componentLoaded', (event) => {
      if (event.detail.componentName === 'header') {
        this.setupHeaderEventListeners();
      }
    });
    
    // Setup other general event listeners
    this.setupGeneralEventListeners();
  }

  setupHeaderEventListeners() {
    // Header search
    const searchInput = document.querySelector('.search-box__input');
    const searchButton = document.querySelector('.search-box__button');
    
    if (searchInput && searchButton) {
      searchButton.addEventListener('click', () => this.handleSearch());
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleSearch();
      });
    }

    // User authentication
    const userBtn = document.getElementById('user-btn');
    if (userBtn) {
      userBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.auth.showAuthModal();
      });
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
  }

  setupGeneralEventListeners() {
    // Hero buttons
    const heroButtons = document.querySelectorAll('.hero__actions .btn');
    heroButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        if (index === 0) {
          this.scrollToSection('products');
        } else {
          this.scrollToSection('categories');
        }
      });
    });

    // Modal close events
    this.setupModalEvents();
  }

  setupModalEvents() {
    // Cart modal
    const cartModal = document.getElementById('cart-modal');
    const cartModalClose = document.getElementById('cart-modal-close');
    const cartModalBackdrop = document.getElementById('cart-modal-backdrop');

    if (cartModalClose) {
      cartModalClose.addEventListener('click', () => this.cart.hideCartModal());
    }
    if (cartModalBackdrop) {
      cartModalBackdrop.addEventListener('click', () => this.cart.hideCartModal());
    }

    // Auth modal
    const authModal = document.getElementById('auth-modal');
    const authModalClose = document.getElementById('auth-modal-close');
    const authModalBackdrop = document.getElementById('auth-modal-backdrop');

    if (authModalClose) {
      authModalClose.addEventListener('click', () => this.auth.hideAuthModal());
    }
    if (authModalBackdrop) {
      authModalBackdrop.addEventListener('click', () => this.auth.hideAuthModal());
    }

    // Auth form
    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', (e) => this.auth.handleAuthSubmit(e));
    }

    // Auth toggle
    const authToggle = document.getElementById('auth-toggle');
    if (authToggle) {
      authToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.auth.toggleAuthMode();
      });
    }
  }

  async loadInitialData() {
    try {
      // Load categories
      await this.loadCategories();
      
      // Load featured products
      await this.loadFeaturedProducts();
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  async loadCategories() {
    const categoriesGrid = document.getElementById('categories-grid');
    if (!categoriesGrid) return;

    const categories = [
      {
        id: 'medicamentos',
        name: 'Medicamentos',
        icon: 'fas fa-pills',
        description: 'Medicamentos de referência, genéricos e similares'
      },
      {
        id: 'dermocosmeticos',
        name: 'Dermocosméticos',
        icon: 'fas fa-heart',
        description: 'Cuidados com a pele e beleza'
      },
      {
        id: 'suplementos',
        name: 'Suplementos',
        icon: 'fas fa-dumbbell',
        description: 'Vitaminas e suplementos alimentares'
      },
      {
        id: 'higiene',
        name: 'Higiene',
        icon: 'fas fa-soap',
        description: 'Produtos de higiene pessoal'
      },
      {
        id: 'bebes',
        name: 'Bebês',
        icon: 'fas fa-baby',
        description: 'Cuidados especiais para bebês'
      },
      {
        id: 'equipamentos',
        name: 'Equipamentos',
        icon: 'fas fa-stethoscope',
        description: 'Equipamentos e materiais médicos'
      }
    ];

    categoriesGrid.innerHTML = categories.map(category => `
      <div class="card category-card" data-category="${category.id}">
        <div class="card__image">
          <i class="${category.icon}"></i>
        </div>
        <div class="card__content">
          <h3 class="card__title">${category.name}</h3>
          <p class="card__text">${category.description}</p>
          <div class="card__actions">
            <button class="btn btn--primary btn--full">Ver Produtos</button>
          </div>
        </div>
      </div>
    `).join('');

    // Add click events to category cards
    categoriesGrid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        const categoryId = card.dataset.category;
        this.filterProductsByCategory(categoryId);
      });
    });
  }

  async loadFeaturedProducts() {
    const productsGrid = document.getElementById('products-grid');
    if (!productsGrid) return;

    try {
      // Load products from Firebase
      const products = await this.firebase.getProducts();
      const featuredProducts = products.filter(product => product.featured || products.length <= 4);
      
      // If no featured products, show first 4
      const productsToShow = featuredProducts.length > 0 ? featuredProducts.slice(0, 4) : products.slice(0, 4);

      if (productsToShow.length === 0) {
        productsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: var(--spacing-8); color: var(--gray-500);">
            <p>Nenhum produto encontrado.</p>
            <p>Configure produtos no painel administrativo.</p>
          </div>
        `;
        return;
      }

      productsGrid.innerHTML = productsToShow.map(product => `
        <div class="card product-card" data-product-id="${product.id}">
          <div class="card__image">
            <i class="fas fa-prescription-bottle-alt"></i>
          </div>
          <div class="card__content">
            <h3 class="card__title">${product.name}</h3>
            <p class="card__text">${product.description}</p>
            <div class="card__price">
              R$ ${product.price.toFixed(2).replace('.', ',')}
            </div>
            <div class="card__actions">
              <button class="btn btn--primary add-to-cart-btn" data-product='${JSON.stringify(product)}'>
                <i class="fas fa-cart-plus"></i>
                Adicionar
              </button>
              <button class="btn btn--secondary view-product-btn" data-product-id="${product.id}">
                Ver Detalhes
              </button>
            </div>
          </div>
        </div>
      `).join('');

      // Add event listeners to product buttons
      productsGrid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const product = JSON.parse(btn.dataset.product);
          this.cart.addItem(product);
          this.ui.showSuccess(`${product.name} adicionado ao carrinho!`);
        });
      });

      productsGrid.querySelectorAll('.view-product-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const productId = btn.dataset.productId;
          this.viewProductDetails(productId);
        });
      });
    } catch (error) {
      console.error('Error loading featured products:', error);
      // Fallback to sample data
      this.loadSampleProducts();
    }
  }

  loadSampleProducts() {
    const productsGrid = document.getElementById('products-grid');
    if (!productsGrid) return;

    // Sample products as fallback - same as before
    const products = [
      {
        id: '1',
        name: 'Dipirona 500mg',
        category: 'medicamentos',
        price: 8.90,
        originalPrice: 12.50,
        image: null,
        description: 'Analgésico e antitérmico - 20 comprimidos'
      },
      {
        id: '2',
        name: 'Protetor Solar FPS 60',
        category: 'dermocosmeticos',
        price: 45.90,
        originalPrice: null,
        image: null,
        description: 'Proteção solar para todos os tipos de pele'
      },
      {
        id: '3',
        name: 'Vitamina C 1g',
        category: 'suplementos',
        price: 25.90,
        originalPrice: 32.90,
        image: null,
        description: 'Suplemento vitamínico - 30 cápsulas'
      },
      {
        id: '4',
        name: 'Termômetro Digital',
        category: 'equipamentos',
        price: 18.90,
        originalPrice: null,
        image: null,
        description: 'Termômetro digital com display LCD'
      }
    ];

    productsGrid.innerHTML = products.map(product => `
      <div class="card product-card" data-product-id="${product.id}">
        <div class="card__image">
          <i class="fas fa-prescription-bottle-alt"></i>
        </div>
        <div class="card__content">
          <h3 class="card__title">${product.name}</h3>
          <p class="card__text">${product.description}</p>
          <div class="card__price">
            R$ ${product.price.toFixed(2).replace('.', ',')}
            ${product.originalPrice ? `<span style="text-decoration: line-through; color: var(--gray-400); font-size: var(--font-size-sm); margin-left: var(--spacing-2);">R$ ${product.originalPrice.toFixed(2).replace('.', ',')}</span>` : ''}
          </div>
          <div class="card__actions">
            <button class="btn btn--primary add-to-cart-btn" data-product='${JSON.stringify(product)}'>
              <i class="fas fa-cart-plus"></i>
              Adicionar
            </button>
            <button class="btn btn--secondary view-product-btn" data-product-id="${product.id}">
              Ver Detalhes
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Add event listeners to product buttons
    productsGrid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const product = JSON.parse(btn.dataset.product);
        this.cart.addItem(product);
        this.ui.showSuccess(`${product.name} adicionado ao carrinho!`);
      });
    });

    productsGrid.querySelectorAll('.view-product-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const productId = btn.dataset.productId;
        this.viewProductDetails(productId);
      });
    });
  }

  handleSearch() {
    const searchInput = document.querySelector('.search-box__input');
    const query = searchInput ? searchInput.value.trim() : '';
    
    if (!query) {
      this.ui.showWarning('Digite algo para buscar');
      return;
    }

    // Redirect to produtos.html with search query
    const searchUrl = new URL('produtos.html', window.location.origin);
    searchUrl.searchParams.set('search', query);
    window.location.href = searchUrl.toString();
  }

  filterProductsByCategory(categoryId) {
    console.log('Filtering by category:', categoryId);
    this.ui.showInfo(`Carregando produtos da categoria...`);
    // TODO: Implement category filtering
  }

  viewProductDetails(productId) {
    console.log('Viewing product:', productId);
    this.ui.showInfo('Carregando detalhes do produto...');
    // TODO: Implement product details view
  }

  scrollToSection(sectionId) {
    const section = document.querySelector(`.${sectionId}`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
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
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PharmacyApp();
});

export default PharmacyApp;