// Modern Admin Panel
import { FirebaseService } from './services/firebase-service.js';
// import ComponentLoader from './services/component-loader.js';

class AdminApp {
  constructor() {
    this.currentSection = 'dashboard';
    this.products = [];
    this.clients = [];
    this.editingProduct = null;
    this.firebase = new FirebaseService();
    // this.componentLoader = new ComponentLoader();
    
    this.init();
  }

  async init() {
    try {
      // Load components first
      // await this.loadComponents();
      
      // Initialize Firebase
      await this.firebase.init();
      
      // Initialize sample data if needed
      await this.firebase.initializeSampleData();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load data from Firestore
      await this.loadFirestoreData();
      
      // Render initial data
      this.renderProducts();
      this.updateDashboard();
      
      console.log('Admin app initialized successfully');
    } catch (error) {
      console.error('Error initializing admin app:', error);
      this.showNotification('Erro ao inicializar aplicação. Usando dados locais.', 'warning');
      this.loadSampleData();
      this.renderProducts();
    }
  }

  // async loadComponents() {
  //   try {
  //     // Load admin header component
  //     await this.componentLoader.loadHeader('admin');
      
  //     console.log('Admin components loaded successfully');
  //   } catch (error) {
  //     console.error('Error loading admin components:', error);
  //   }
  // }

  setupEventListeners() {
    // Admin logout
    const logoutBtn = document.getElementById('admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Navigation
    document.querySelectorAll('.admin-nav__link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        this.showSection(section);
      });
    });

    // Add Product Button
    const addProductBtn = document.getElementById('add-product-btn');
    if (addProductBtn) {
      addProductBtn.addEventListener('click', () => this.showProductModal());
    }

    // Product Modal Events
    this.setupProductModalEvents();

    // Product Form
    const productForm = document.getElementById('product-form');
    if (productForm) {
      productForm.addEventListener('submit', (e) => this.handleProductSubmit(e));
    }

    // Search and Filters
    const searchInput = document.getElementById('products-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.filterProducts());
    }

    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => this.filterProducts());
    }
  }

  setupProductModalEvents() {
    const modal = document.getElementById('product-modal');
    const closeBtn = document.getElementById('product-modal-close');
    const cancelBtn = document.getElementById('product-cancel');
    const backdrop = modal && modal.querySelector('.modal__backdrop');

    const hideModal = () => {
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        this.resetProductForm();
      }
    };

    if (closeBtn) closeBtn.addEventListener('click', hideModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (backdrop) backdrop.addEventListener('click', hideModal);
  }

  showSection(sectionId) {
    // Update navigation
    document.querySelectorAll('.admin-nav__link').forEach(link => {
      link.classList.remove('admin-nav__link--active');
    });
    
    const activeLink = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeLink) {
      activeLink.classList.add('admin-nav__link--active');
    }

    // Show section
    document.querySelectorAll('.admin-section').forEach(section => {
      section.classList.remove('admin-section--active');
    });

    const targetSection = document.getElementById(`${sectionId}-section`);
    if (targetSection) {
      targetSection.classList.add('admin-section--active');
    }

    this.currentSection = sectionId;
  }

  showProductModal(product = null) {
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');
    
    if (modal && title) {
      this.editingProduct = product;
      
      if (product) {
        title.textContent = 'Editar Produto';
        this.fillProductForm(product);
      } else {
        title.textContent = 'Adicionar Produto';
        this.resetProductForm();
      }
      
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  fillProductForm(product) {
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-category').value = product.category || '';
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-stock').value = product.stock || '';
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-status').value = product.status || 'active';
    document.getElementById('product-featured').checked = product.featured || false;
  }

  resetProductForm() {
    const form = document.getElementById('product-form');
    if (form) {
      form.reset();
    }
    this.editingProduct = null;
  }

  async loadFirestoreData() {
    try {
      // Load products from Firestore
      this.products = await this.firebase.getProducts();
      console.log('Loaded products from Firestore:', this.products.length);
      
      // Load clients from Firestore
      this.clients = await this.firebase.getClients();
      console.log('Loaded clients from Firestore:', this.clients.length);
    } catch (error) {
      console.error('Error loading Firestore data:', error);
      throw error;
    }
  }

  updateDashboard() {
    // Update dashboard metrics
    const totalSales = this.products.reduce((sum, product) => sum + (product.price * (50 - product.stock)), 0);
    const totalOrders = Math.floor(Math.random() * 50) + 20;
    const activeProducts = this.products.filter(p => p.status === 'active').length;
    const totalClients = this.clients.length;

    // Update dashboard elements
    this.updateDashboardCard('sales-value', `R$ ${totalSales.toFixed(2).replace('.', ',')}`);
    this.updateDashboardCard('orders-count', totalOrders);
    this.updateDashboardCard('products-count', activeProducts);
    this.updateDashboardCard('clients-count', totalClients);
  }

  updateDashboardCard(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
    }
  }

  async handleProductSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const product = {
      name: formData.get('name'),
      category: formData.get('category'),
      price: parseFloat(formData.get('price')),
      stock: parseInt(formData.get('stock')),
      description: formData.get('description'),
      status: formData.get('status'),
      featured: formData.has('featured'),
      updatedAt: new Date().toISOString()
    };

    try {
      if (this.editingProduct) {
        // Update existing product in Firestore
        await this.firebase.updateProduct(this.editingProduct.id, product);
        
        // Update local array
        const index = this.products.findIndex(p => p.id === this.editingProduct.id);
        if (index !== -1) {
          this.products[index] = Object.assign({}, this.editingProduct, product);
        }
        
        this.showNotification('Produto atualizado com sucesso!', 'success');
      } else {
        // Add new product to Firestore
        product.createdAt = new Date().toISOString();
        const newId = await this.firebase.addProduct(product);
        
        // Add to local array
        this.products.push(Object.assign({ id: newId }, product));
        
        this.showNotification('Produto adicionado com sucesso!', 'success');
      }

      // Refresh data and UI
      this.renderProducts();
      this.updateDashboard();
      
      // Hide modal
      const modal = document.getElementById('product-modal');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
      
      this.resetProductForm();
    } catch (error) {
      console.error('Error saving product:', error);
      this.showNotification('Erro ao salvar produto. Tente novamente.', 'error');
    }
  }
    
    this.resetProductForm();
  }

  editProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (product) {
      this.showProductModal(product);
    }
  }

  async deleteProduct(productId) {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
      try {
        // Delete from Firestore
        await this.firebase.deleteProduct(productId);
        
        // Remove from local array
        this.products = this.products.filter(p => p.id !== productId);
        
        // Update UI
        this.renderProducts();
        this.updateDashboard();
        this.showNotification('Produto excluído com sucesso!', 'success');
      } catch (error) {
        console.error('Error deleting product:', error);
        this.showNotification('Erro ao excluir produto. Tente novamente.', 'error');
      }
    }
  }

  async toggleProductStatus(productId) {
    const product = this.products.find(p => p.id === productId);
    if (product) {
      try {
        const newStatus = product.status === 'active' ? 'inactive' : 'active';
        
        // Update in Firestore
        await this.firebase.updateProduct(productId, { 
          status: newStatus, 
          updatedAt: new Date().toISOString() 
        });
        
        // Update local array
        product.status = newStatus;
        
        // Update UI
        this.renderProducts();
        this.updateDashboard();
        this.showNotification(`Produto ${newStatus === 'active' ? 'ativado' : 'desativado'} com sucesso!`, 'success');
      } catch (error) {
        console.error('Error updating product status:', error);
        this.showNotification('Erro ao atualizar status do produto. Tente novamente.', 'error');
      }
    }
  }

  filterProducts() {
    const searchInput = document.getElementById('products-search');
    const categoryFilterEl = document.getElementById('category-filter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const categoryFilter = categoryFilterEl ? categoryFilterEl.value : '';
    
    let filteredProducts = this.products;
    
    if (searchTerm) {
      filteredProducts = filteredProducts.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm)
      );
    }
    
    if (categoryFilter) {
      filteredProducts = filteredProducts.filter(product => 
        product.category === categoryFilter
      );
    }
    
    this.renderProducts(filteredProducts);
  }

  renderProducts(productsToRender = null) {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    const products = productsToRender || this.products;
    
    if (products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: var(--spacing-8); color: var(--gray-500);">
            ${productsToRender ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = products.map(product => `
      <tr>
        <td>
          <div class="product-image">
            ${this.getCategoryIcon(product.category)}
          </div>
        </td>
        <td>
          <strong>${product.name}</strong>
          <br>
          <small style="color: var(--gray-500);">${product.description || 'Sem descrição'}</small>
        </td>
        <td>${this.getCategoryName(product.category)}</td>
        <td>R$ ${product.price.toFixed(2).replace('.', ',')}</td>
        <td>${product.stock}</td>
        <td>
          <span class="status status--${product.status}">
            ${product.status === 'active' ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td>
          <button class="btn-icon" onclick="adminApp.editProduct('${product.id}')" title="Editar">
            ✏️
          </button>
          <button class="btn-icon" onclick="adminApp.toggleProductStatus('${product.id}')" title="${product.status === 'active' ? 'Desativar' : 'Ativar'}">
            ${product.status === 'active' ? '🔒' : '🔓'}
          </button>
          <button class="btn-icon" onclick="adminApp.deleteProduct('${product.id}')" title="Excluir">
            🗑️
          </button>
        </td>
      </tr>
    `).join('');
  }

  getCategoryIcon(category) {
    const icons = {
      medicamentos: '💊',
      dermocosmeticos: '💄',
      suplementos: '💪',
      higiene: '🧼',
      bebes: '👶',
      equipamentos: '🩺'
    };
    return icons[category] || '📦';
  }

  getCategoryName(category) {
    const names = {
      medicamentos: 'Medicamentos',
      dermocosmeticos: 'Dermocosméticos',
      suplementos: 'Suplementos',
      higiene: 'Higiene',
      bebes: 'Bebês',
      equipamentos: 'Equipamentos'
    };
    return names[category] || category;
  }

  loadSampleData() {
    // Fallback sample data if Firebase fails
    this.products = [
      {
        id: '1',
        name: 'Dipirona 500mg',
        category: 'medicamentos',
        price: 8.90,
        stock: 50,
        description: 'Analgésico e antitérmico - 20 comprimidos',
        status: 'active',
        featured: true,
        createdAt: '2024-08-01T10:00:00Z',
        updatedAt: '2024-08-01T10:00:00Z'
      },
      {
        id: '2',
        name: 'Protetor Solar FPS 60',
        category: 'dermocosmeticos',
        price: 45.90,
        stock: 25,
        description: 'Proteção solar para todos os tipos de pele',
        status: 'active',
        featured: true,
        createdAt: '2024-08-01T11:00:00Z',
        updatedAt: '2024-08-01T11:00:00Z'
      },
      {
        id: '3',
        name: 'Vitamina C 1g',
        category: 'suplementos',
        price: 25.90,
        stock: 30,
        description: 'Suplemento vitamínico - 30 cápsulas',
        status: 'active',
        featured: false,
        createdAt: '2024-08-01T12:00:00Z',
        updatedAt: '2024-08-01T12:00:00Z'
      },
      {
        id: '4',
        name: 'Termômetro Digital',
        category: 'equipamentos',
        price: 18.90,
        stock: 15,
        description: 'Termômetro digital com display LCD',
        status: 'active',
        featured: false,
        createdAt: '2024-08-01T13:00:00Z',
        updatedAt: '2024-08-01T13:00:00Z'
      },
      {
        id: '5',
        name: 'Shampoo Infantil',
        category: 'bebes',
        price: 12.50,
        stock: 40,
        description: 'Shampoo suave para bebês - 200ml',
        status: 'active',
        featured: false,
        createdAt: '2024-08-01T14:00:00Z',
        updatedAt: '2024-08-01T14:00:00Z'
      }
    ];
    
    this.clients = [
      {
        id: '1',
        name: 'Maria Silva',
        email: 'maria.silva@email.com',
        phone: '(11) 99999-1234',
        createdAt: '2024-08-01T10:00:00Z'
      },
      {
        id: '2',
        name: 'João Santos',
        email: 'joao.santos@email.com',
        phone: '(11) 98888-5678',
        createdAt: '2024-08-01T11:00:00Z'
      }
    ];
  }

  generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  handleLogout() {
    if (confirm('Tem certeza que deseja sair?')) {
      this.showNotification('Logout realizado com sucesso!', 'success');
      // In a real app, this would redirect to login page
      setTimeout(() => {
        window.location.href = 'modern-index.html';
      }, 1000);
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.innerHTML = `
      <div class="notification__content">
        <span>${this.getNotificationIcon(type)}</span>
        <span>${message}</span>
        <button class="notification__close">❌</button>
      </div>
    `;

    // Add styles if not exists
    this.addNotificationStyles();

    // Add to page
    document.body.appendChild(notification);

    // Add close event
    const closeBtn = notification.querySelector('.notification__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideNotification(notification);
      });
    }

    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.hideNotification(notification);
    }, 5000);

    return notification;
  }

  hideNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }

  getNotificationIcon(type) {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  }

  addNotificationStyles() {
    if (document.getElementById('admin-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'admin-notification-styles';
    style.textContent = `
      .notification {
        position: fixed;
        top: var(--spacing-4);
        right: var(--spacing-4);
        background-color: var(--white);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: var(--spacing-4);
        z-index: 10000;
        transform: translateX(100%);
        transition: transform var(--transition);
        min-width: 300px;
        max-width: 400px;
      }

      .notification.show {
        transform: translateX(0);
      }

      .notification--success {
        border-left: 4px solid var(--success-color);
      }

      .notification--error {
        border-left: 4px solid var(--error-color);
      }

      .notification--warning {
        border-left: 4px solid var(--warning-color);
      }

      .notification--info {
        border-left: 4px solid var(--primary-color);
      }

      .notification__content {
        display: flex;
        align-items: center;
        gap: var(--spacing-3);
      }

      .notification__content span:nth-child(2) {
        flex: 1;
      }

      .notification__close {
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--spacing-1);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize admin app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.adminApp = new AdminApp();
});

export default AdminApp;