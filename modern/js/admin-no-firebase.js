// Modern Admin Panel - No Firebase
console.log('Loading admin without Firebase...');

class AdminApp {
  constructor() {
    this.currentSection = 'dashboard';
    this.products = [];
    this.clients = [];
    this.editingProduct = null;
    
    this.init();
  }

  init() {
    console.log('Initializing admin app...');
    this.setupEventListeners();
    this.loadSampleData();
    this.renderProducts();
    this.updateDashboard();
  }

  setupEventListeners() {
    console.log('Setting up event listeners...');
    // Navigation
    document.querySelectorAll('.admin-nav__link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        this.showSection(section);
      });
    });
  }

  showSection(sectionId) {
    console.log('Showing section:', sectionId);
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

  updateDashboard() {
    console.log('Updating dashboard...');
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

  loadSampleData() {
    console.log('Loading sample data...');
    // Fallback sample data
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
      }
    ];
    
    this.clients = [
      {
        id: '1',
        name: 'Maria Silva',
        email: 'maria.silva@email.com',
        phone: '(11) 99999-1234',
        createdAt: '2024-08-01T10:00:00Z'
      }
    ];
  }

  renderProducts() {
    console.log('Rendering products...');
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    const products = this.products;
    
    if (products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: var(--spacing-8); color: var(--gray-500);">
            Nenhum produto cadastrado
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
          <button class="btn-icon" title="Editar">✏️</button>
          <button class="btn-icon" title="Desativar">🔒</button>
          <button class="btn-icon" title="Excluir">🗑️</button>
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
}

// Initialize admin app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, creating AdminApp...');
  window.adminApp = new AdminApp();
});

export default AdminApp;