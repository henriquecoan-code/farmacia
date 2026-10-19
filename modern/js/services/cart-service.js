// Cart Service - Handles shopping cart functionality
import { eventBus } from './event-bus.js';
import { normalizeProduct, escapeHTML } from './product-utils.js';
import { isVisibleProduct } from './catalog-utils.mjs';

export class CartService {
  constructor() {
    this.items = [];
    this.storageKey = 'modern_pharmacy_cart';
    this.listeners = [];
    this.firebaseService = null;
  }

  setFirebaseService(firebaseService) {
    this.firebaseService = firebaseService;
  }

  /**
   * Confere preço e estoque dos itens com o catálogo do Firestore (1 leitura ao abrir o carrinho).
   * - preço mudou: atualiza `price` e guarda o anterior em `previousPrice` (exibido como aviso)
   * - sem estoque / fora do catálogo: `unavailable = true` (item fica translúcido e sai do total)
   * - quantidade acima do estoque: limitada ao estoque
   * Retorna true se algo mudou.
   */
  async refreshFromCatalog() {
    if (!this.firebaseService || !this.items.length) return false;
    let products;
    try {
      products = await this.firebaseService.getProducts({ revalidate: true });
    } catch (e) {
      console.warn('[Cart] Não foi possível conferir preços', e);
      return false;
    }
    // Só confia em dados vindos do Firestore (não no JSON estático/offline, que pode estar velho)
    const source = this.firebaseService.productsSource;
    if (!Array.isArray(products) || !products.length || !['catalog', 'collection', 'cache'].includes(source)) return false;

    const byId = new Map(products.map(p => [String(p.id), p]));
    let changed = false;
    for (const item of this.items) {
      const before = JSON.stringify([item.price, item.unavailable, item.stock, item.quantity, item.previousPrice]);
      const raw = byId.get(String(item.id));
      if (!raw || !isVisibleProduct(raw)) {
        item.unavailable = true;
        item.stock = 0;
      } else {
        const n = normalizeProduct(raw);
        const price = Number(n.precoDesconto ?? n.precoCheio);
        if (Number.isFinite(price) && price > 0 && Math.abs(price - Number(item.price)) > 0.004) {
          item.previousPrice = Number(item.price);
          item.price = price;
        } else if (item.previousPrice != null && item.priceNoticeShown) {
          // aviso já exibido numa visualização anterior
          delete item.previousPrice;
          delete item.priceNoticeShown;
        }
        item.stock = Number(n.quantidade) || 0;
        item.unavailable = item.stock <= 0;
        if (!item.unavailable && item.quantity > item.stock) item.quantity = item.stock;
      }
      if (JSON.stringify([item.price, item.unavailable, item.stock, item.quantity, item.previousPrice]) !== before) changed = true;
    }
    if (changed) {
      this.saveToStorage();
      this.updateCartCounter();
      this.notifyListeners();
      eventBus.emit('cart:refreshed', { items: this.getItems(), total: this.getTotal() });
    }
    return changed;
  }

  // Marca o aviso de preço como exibido (some na próxima conferência sem mudança)
  markPriceNoticesShown() {
    let any = false;
    this.items.forEach(i => { if (i.previousPrice != null && !i.priceNoticeShown) { i.priceNoticeShown = true; any = true; } });
    if (any) this.saveToStorage();
  }

  hasUnavailableItems() {
    return this.items.some(i => i.unavailable);
  }

  init() {
    this.loadFromStorage();
    this.updateCartCounter();
  }

  // Add item to cart
  addItem(product) {
    const existingItem = this.items.find(item => item.id === product.id);
    
    if (existingItem) {
      if (existingItem.stock > 0 && existingItem.quantity >= existingItem.stock) return;
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
        if (item.unavailable) return;
        if (item.stock > 0) quantity = Math.min(quantity, item.stock);
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
    // Itens sem estoque continuam no carrinho, mas não entram no total
    return this.items.reduce((total, item) => total + (item.unavailable ? 0 : item.price * item.quantity), 0);
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
      this.refreshFromCatalog().then(() => this.renderCartItems());
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
      <div class="cart-item${item.unavailable ? ' cart-item--unavailable' : ''}" data-product-id="${escapeHTML(String(item.id))}">
        <div class="cart-item__info">
          <h4 class="cart-item__name">${escapeHTML(String(item.name || ''))}</h4>
          <p class="cart-item__price">R$ ${Number(item.price).toFixed(2).replace('.', ',')}</p>
          ${cartItemNotice(item)}
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
    ensureCartStatusStyles();
    this.markPriceNoticesShown();
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

// Aviso exibido no item: preço atualizado ou sem estoque (usado pelo modal e pelo checkout)
export function cartItemNotice(item) {
  const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  if (item.unavailable) return '<p class="cart-item__notice cart-item__notice--out">Sem estoque no momento — não entra no total</p>';
  const parts = [];
  if (item.previousPrice != null) {
    parts.push(`<p class="cart-item__notice cart-item__notice--price">Preço atualizado: era <s>${fmt(item.previousPrice)}</s>, agora ${fmt(item.price)}</p>`);
  }
  if (item.stock > 0 && item.quantity >= item.stock) {
    parts.push(`<p class="cart-item__notice">Máximo disponível: ${item.stock}</p>`);
  }
  return parts.join('');
}

export function ensureCartStatusStyles() {
  if (document.getElementById('cart-status-styles')) return;
  const style = document.createElement('style');
  style.id = 'cart-status-styles';
  style.textContent = `
    .cart-item--unavailable, .checkout-item--unavailable { opacity: .45; }
    p.cart-item__notice { margin: .2rem 0 0; font-size: .75rem; font-weight: 400; color: var(--gray-600, #4b5563); }
    p.cart-item__notice--price { color: #b45309; }
    p.cart-item__notice--out { color: var(--error-color, #dc2626); font-weight: 600; }
  `;
  document.head.appendChild(style);
}
