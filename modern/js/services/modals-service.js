// Modals Manager - Handles all modal components
export class ModalsManager {
  constructor() {
    this.cartModal = null;
    this.authModal = null;
    this.loadingOverlay = null;
    this.isInitialized = false;
    this.currentAuthMode = 'login'; // 'login' or 'register'
  }

  async init() {
    if (this.isInitialized) return;
    
    await this.loadModalHTML();
    this.setupEventListeners();
    this.isInitialized = true;
    
    console.log('Modals initialized successfully');
  }

  async loadModalHTML() {
    try {
      const response = await fetch('modern/components/modals.html');
      const modalHTML = await response.text();
      
      // Inject modal HTML into body
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      
      // Get modal references
      this.cartModal = document.getElementById('cart-modal');
      this.authModal = document.getElementById('auth-modal');
      this.loadingOverlay = document.getElementById('loading-overlay');
      
    } catch (error) {
      console.error('Error loading modal HTML:', error);
    }
  }

  setupEventListeners() {
    // Cart Modal Events
    const cartCloseBtn = document.getElementById('cart-modal-close');
    const cartBackdrop = document.getElementById('cart-modal-backdrop');
    
    if (cartCloseBtn) {
      cartCloseBtn.addEventListener('click', () => this.closeCartModal());
    }
    
    if (cartBackdrop) {
      cartBackdrop.addEventListener('click', () => this.closeCartModal());
    }

    // Auth Modal Events
    const authCloseBtn = document.getElementById('auth-modal-close');
    const authBackdrop = document.getElementById('auth-modal-backdrop');
    const authToggle = document.getElementById('auth-toggle');
    const authForm = document.getElementById('auth-form');
    
    if (authCloseBtn) {
      authCloseBtn.addEventListener('click', () => this.closeAuthModal());
    }
    
    if (authBackdrop) {
      authBackdrop.addEventListener('click', () => this.closeAuthModal());
    }
    
    if (authToggle) {
      authToggle.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleAuthMode();
      });
    }
    
    if (authForm) {
      authForm.addEventListener('submit', (e) => this.handleAuthSubmit(e));
    }

    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
  }

  // Cart Modal Methods
  openCartModal() {
    if (!this.cartModal) return;
    
    this.cartModal.classList.add('modal--active');
    document.body.classList.add('modal-open');
    
    // Load cart items
    this.updateCartDisplay();
  }

  closeCartModal() {
    if (!this.cartModal) return;
    
    this.cartModal.classList.remove('modal--active');
    document.body.classList.remove('modal-open');
  }

  updateCartDisplay() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    
    if (!cartItemsContainer || !cartTotalElement) return;

    // Get cart from localStorage or service
    const cart = this.getCartItems();
    
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<p class="cart-empty">Seu carrinho está vazio</p>';
      cartTotalElement.textContent = 'Total: R$ 0,00';
      return;
    }

    // Render cart items
    cartItemsContainer.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item__info">
          <h4>${item.name}</h4>
          <p>R$ ${item.price.toFixed(2)}</p>
        </div>
        <div class="cart-item__controls">
          <button class="btn-qty" onclick="window.modalsManager.updateCartItemQuantity('${item.id}', ${item.quantity - 1})">-</button>
          <span class="cart-item__qty">${item.quantity}</span>
          <button class="btn-qty" onclick="window.modalsManager.updateCartItemQuantity('${item.id}', ${item.quantity + 1})">+</button>
          <button class="btn-remove" onclick="window.modalsManager.removeCartItem('${item.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Calculate total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotalElement.textContent = `Total: R$ ${total.toFixed(2)}`;
  }

  // Auth Modal Methods
  openAuthModal(mode = 'login') {
    if (!this.authModal) return;
    
    this.currentAuthMode = mode;
    this.updateAuthModalContent();
    
    this.authModal.classList.add('modal--active');
    document.body.classList.add('modal-open');
  }

  closeAuthModal() {
    if (!this.authModal) return;
    
    this.authModal.classList.remove('modal--active');
    document.body.classList.remove('modal-open');
    
    // Reset form
    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.reset();
    }
  }

  toggleAuthMode() {
    this.currentAuthMode = this.currentAuthMode === 'login' ? 'register' : 'login';
    this.updateAuthModalContent();
  }

  updateAuthModalContent() {
    const titleElement = document.getElementById('auth-modal-title');
    const submitButton = document.querySelector('#auth-form button[type="submit"]');
    const toggleLink = document.getElementById('auth-toggle');
    const switchText = document.querySelector('.auth-switch');
    
    if (this.currentAuthMode === 'login') {
      if (titleElement) titleElement.textContent = 'Entrar';
      if (submitButton) submitButton.textContent = 'Entrar';
      if (toggleLink) toggleLink.textContent = 'Cadastre-se';
      if (switchText) switchText.innerHTML = 'Não tem conta? <a href="#" id="auth-toggle">Cadastre-se</a>';
    } else {
      if (titleElement) titleElement.textContent = 'Cadastrar';
      if (submitButton) submitButton.textContent = 'Cadastrar';
      if (toggleLink) toggleLink.textContent = 'Entrar';
      if (switchText) switchText.innerHTML = 'Já tem conta? <a href="#" id="auth-toggle">Entrar</a>';
    }
    
    // Re-attach event listener for toggle
    const newToggleLink = document.getElementById('auth-toggle');
    if (newToggleLink) {
      newToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleAuthMode();
      });
    }
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    if (!email || !password) {
      alert('Por favor, preencha todos os campos');
      return;
    }

    this.showLoading();
    
    try {
      // Here you would integrate with your auth service
      console.log(`${this.currentAuthMode}:`, { email, password });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Success
      alert(`${this.currentAuthMode === 'login' ? 'Login' : 'Cadastro'} realizado com sucesso!`);
      this.closeAuthModal();
      
    } catch (error) {
      console.error('Auth error:', error);
      alert('Erro na autenticação. Tente novamente.');
    } finally {
      this.hideLoading();
    }
  }

  // Loading Methods
  showLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('loading-overlay--active');
    }
  }

  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.remove('loading-overlay--active');
    }
  }

  // Cart Management Methods
  getCartItems() {
    try {
      const cart = localStorage.getItem('cart');
      return cart ? JSON.parse(cart) : [];
    } catch (error) {
      console.error('Error getting cart items:', error);
      return [];
    }
  }

  saveCartItems(items) {
    try {
      localStorage.setItem('cart', JSON.stringify(items));
      this.updateCartDisplay();
    } catch (error) {
      console.error('Error saving cart items:', error);
    }
  }

  addToCart(product) {
    const cart = this.getCartItems();
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1
      });
    }
    
    this.saveCartItems(cart);
    
    // Show feedback
    this.showToast(`${product.name} adicionado ao carrinho!`);
  }

  updateCartItemQuantity(productId, newQuantity) {
    if (newQuantity <= 0) {
      this.removeCartItem(productId);
      return;
    }
    
    const cart = this.getCartItems();
    const item = cart.find(item => item.id === productId);
    
    if (item) {
      item.quantity = newQuantity;
      this.saveCartItems(cart);
    }
  }

  removeCartItem(productId) {
    const cart = this.getCartItems();
    const filteredCart = cart.filter(item => item.id !== productId);
    this.saveCartItems(filteredCart);
  }

  // Utility Methods
  closeAllModals() {
    this.closeCartModal();
    this.closeAuthModal();
  }

  showToast(message, type = 'success') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('toast--show'), 100);
    
    // Hide and remove toast
    setTimeout(() => {
      toast.classList.remove('toast--show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }
}

// Make modalsManager globally available
window.modalsManager = null;
