// Shared bootstrap to unify initialization across pages
import { FirebaseService } from './services/firebase-service.js';
import { AuthService } from './services/auth-service.js';
import { CartService } from './services/cart-service.js';
import { ModalsManager } from './services/modals-service.js';
import { eventBus } from './services/event-bus.js';
import { analytics } from './services/analytics-service.js';
import './services/toast-service.js'; // initializes toast global

class Bootstrap {
  constructor() {
    this.firebase = new FirebaseService();
    this.auth = new AuthService();
    this.cart = new CartService();
    this.modals = new ModalsManager();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    // init firebase (soft fail)
    try { await this.firebase.init(); } catch(e) { console.warn('Firebase init falhou (modo offline)', e); }
    this.cart.init();
    this.auth.init();
    this.auth.setFirebaseService(this.firebase);
    await this.modals.init();
    window.modalsManager = this.modals;
    window.authService = this.auth;
    window.cartService = this.cart;
    // Reemit events
    eventBus.emit('bootstrap:ready', { firebase: this.firebase, auth: this.auth, cart: this.cart, modals: this.modals });
    // Listeners globais de analytics (uma vez)
    this.installAnalyticsListeners();
    this.initialized = true;
  }

  installAnalyticsListeners() {
    if (this._analyticsHooksInstalled) return;
    eventBus.on('auth:login', ({ user, newUser }) => analytics.track('auth_login', { uid: user?.uid || null, newUser: !!newUser }));
    eventBus.on('auth:logout', () => analytics.track('auth_logout'));
    eventBus.on('cart:added', (p) => analytics.track('cart_add', { productId: p.productId, total: p.total }));
    eventBus.on('cart:removed', (p) => analytics.track('cart_remove', { productId: p.productId, total: p.total }));
    eventBus.on('cart:updated', (p) => analytics.track('cart_update', { productId: p.productId, qty: p.quantity, total: p.total }));
    eventBus.on('cart:cleared', () => analytics.track('cart_cleared'));
  // Produtos
  eventBus.on('products:render', (p) => analytics.track('products_render', p));
  eventBus.on('products:pageChange', (p) => analytics.track('products_page_change', p));
  eventBus.on('products:search', (p) => analytics.track('products_search', p));
  eventBus.on('products:filterChange', (p) => analytics.track('products_filter', p));
  eventBus.on('products:sortChange', (p) => analytics.track('products_sort', p));
    this._analyticsHooksInstalled = true;
  }
}

export const bootstrap = new Bootstrap();

// Auto init when imported (pages can await bootstrap.init())
bootstrap.init();