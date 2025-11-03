// Cart Service - Handles shopping cart functionality
import { eventBus } from './event-bus.js';

export class CartService {
  constructor() {
    this.items = [];
    this.storageKey = 'modern_pharmacy_cart';
    this.listeners = [];
  }

  init() {
    this.loadFromStorage();
    this.updateCartCounter();
  }

  // Add item to cart
  addItem(product) {
    const existingItem = this.items.find(item => item.id === product.id);
    
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.items.push({
        ...product,
        quantity: 1,
        addedAt: new Date().toISOString()
      });
    }
    
    this.saveToStorage();
    this.updateCartCounter();
    this.notifyListeners();
  eventBus.emit('cart:added', { productId: product.id, items: this.getItems(), total: this.getTotal() });
  }

  // Remove item from cart
  removeItem(productId) {
    this.items = this.items.filter(item => item.id !== productId);
    this.saveToStorage();
    this.updateCartCounter();
    this.notifyListeners();
  eventBus.emit('cart:removed', { productId, items: this.getItems(), total: this.getTotal() });
  }

  // Update item quantity
  updateQuantity(productId, quantity) {
    const item = this.items.find(item => item.id === productId);
    
    if (item) {
      if (quantity <= 0) {
        this.removeItem(productId);
      } else {
        item.quantity = quantity;
        this.saveToStorage();
        this.updateCartCounter();
        this.notifyListeners();
  eventBus.emit('cart:updated', { productId, quantity, items: this.getItems(), total: this.getTotal() });
      }
    }
  }

  // Get cart items
  getItems() {
    return [...this.items];
  }

  // Get item count
  getItemCount() {
    return this.items.reduce((total, item) => total + item.quantity, 0);
  }

  // Get cart total
  getTotal() {
    return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  }

  // Clear cart
  clear() {
    this.items = [];
    this.saveToStorage();
    this.updateCartCounter();
    this.notifyListeners();
  eventBus.emit('cart:cleared', {});
  }

  // Save to localStorage
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    } catch (error) {
      console.error('Error saving cart to storage:', error);
    }
  }

  // Load from localStorage
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.items = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error);
      this.items = [];
    }
  }

  // Update cart counter in UI
  updateCartCounter() {
    const count = this.getItemCount();

    // Header counter (desktop)
    const headerCounter = document.getElementById('cart-counter');
    if (headerCounter) {
      headerCounter.textContent = count;
      headerCounter.style.display = count > 0 ? 'flex' : 'none';
    }

    // Bottom nav counter (mobile)
    const bottomCounter = document.getElementById('bottom-cart-counter');
    if (bottomCounter) {
      bottomCounter.textContent = String(count);
      bottomCounter.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  // Show cart modal
  showCartModal() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
      this.renderCartItems();
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  // Hide cart modal
  hideCartModal() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // Render cart items in modal
  renderCartItems() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    
    if (!cartItemsContainer || !cartTotal) return;

    if (this.items.length === 0) {
      cartItemsContainer.innerHTML = `
        <div style="text-align: center; padding: var(--spacing-8); color: var(--gray-500);">
          <i class="fas fa-shopping-cart" style="font-size: var(--font-size-3xl); margin-bottom: var(--spacing-4);"></i>
          <p>Seu carrinho está vazio</p>
        </div>
      `;
      cartTotal.textContent = 'Total: R$ 0,00';
      return;
    }

    cartItemsContainer.innerHTML = this.items.map(item => `
      <div class="cart-item" data-product-id="${item.id}">
        <div class="cart-item__info">
          <h4 class="cart-item__name">${item.name}</h4>
          <p class="cart-item__price">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
        </div>
        <div class="cart-item__controls">
          <button class="quantity-btn quantity-btn--minus" data-product-id="${item.id}">
            <i class="fas fa-minus"></i>
          </button>
          <span class="quantity-display">${item.quantity}</span>
          <button class="quantity-btn quantity-btn--plus" data-product-id="${item.id}">
            <i class="fas fa-plus"></i>
          </button>
          <button class="remove-btn" data-product-id="${item.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Add event listeners to cart item controls
    cartItemsContainer.querySelectorAll('.quantity-btn--minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const productId = btn.dataset.productId;
        const item = this.items.find(item => item.id === productId);
        if (item) {
          this.updateQuantity(productId, item.quantity - 1);
        }
      });
    });

    cartItemsContainer.querySelectorAll('.quantity-btn--plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const productId = btn.dataset.productId;
        const item = this.items.find(item => item.id === productId);
        if (item) {
          this.updateQuantity(productId, item.quantity + 1);
        }
      });
    });

    cartItemsContainer.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const productId = btn.dataset.productId;
        this.removeItem(productId);
      });
    });

    // Update total
    const total = this.getTotal();
    cartTotal.textContent = `Total: R$ ${total.toFixed(2).replace('.', ',')}`;

    // Add CSS for cart items
    this.addCartItemStyles();
  }

  // Add CSS styles for cart items
  addCartItemStyles() {
    if (document.getElementById('cart-item-styles')) return;

    const style = document.createElement('style');
    style.id = 'cart-item-styles';
    style.textContent = `
      .cart-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-4);
        border-bottom: 1px solid var(--gray-200);
      }

      .cart-item:last-child {
        border-bottom: none;
      }

      .cart-item__info {
        flex: 1;
      }

      .cart-item__name {
        font-size: var(--font-size-base);
        font-weight: 600;
        margin-bottom: var(--spacing-1);
      }

      .cart-item__price {
        color: var(--secondary-color);
        font-weight: 600;
        margin: 0;
      }

      .cart-item__controls {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
      }

      .quantity-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px solid var(--gray-300);
        background-color: var(--white);
        border-radius: var(--radius);
        cursor: pointer;
        transition: all var(--transition-fast);
      }

      .quantity-btn:hover {
        background-color: var(--gray-50);
        border-color: var(--primary-color);
      }

      .quantity-display {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 40px;
        font-weight: 600;
      }

      .remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background-color: var(--error-color);
        color: var(--white);
        border-radius: var(--radius);
        cursor: pointer;
        transition: all var(--transition-fast);
        margin-left: var(--spacing-2);
      }

      .remove-btn:hover {
        background-color: #dc2626;
        transform: scale(1.05);
      }
    `;
    document.head.appendChild(style);
  }

  // Add listener for cart changes
  addListener(callback) {
    this.listeners.push(callback);
  }

  // Remove listener
  removeListener(callback) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  // Notify all listeners
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.getItems(), this.getTotal());
      } catch (error) {
        console.error('Error in cart listener:', error);
      }
    });
  }
}