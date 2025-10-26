// Modals Manager - Handles all modal components
export class ModalsManager {
  constructor() {
    this.cartModal = null;
    this.authModal = null;
    this.addressModal = null;
    this.loadingOverlay = null;
    this.isInitialized = false;
    this.currentAuthMode = 'login'; // 'login' or 'register'
  this.lastFocusedElement = null; // for focus return
  this._addressSaveHandler = null;
  this._addressInFlight = false;
  // CEP lookup helpers
  this._cepTimer = null;
  this._lastCepLookup = '';
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
      this.addressModal = document.getElementById('address-modal');
      this.loadingOverlay = document.getElementById('loading-overlay');
      
    } catch (error) {
      console.error('Error loading modal HTML:', error);
    }
  }

  setupEventListeners() {
    // Cart Modal Events
    const cartCloseBtn = document.getElementById('cart-modal-close');
    const cartBackdrop = document.getElementById('cart-modal-backdrop');
  const goCheckoutBtn = document.getElementById('go-checkout-btn');
    
    if (cartCloseBtn) {
      cartCloseBtn.addEventListener('click', () => this.closeCartModal());
    }
    
    if (cartBackdrop) {
      cartBackdrop.addEventListener('click', () => this.closeCartModal());
    }
    if (goCheckoutBtn) {
      goCheckoutBtn.addEventListener('click', () => {
        this.closeCartModal();
        window.location.href = 'checkout.html';
      });
    }

    // Auth Modal Events
    const authCloseBtn = document.getElementById('auth-modal-close');
    const authBackdrop = document.getElementById('auth-modal-backdrop');
    const authToggle = document.getElementById('auth-toggle');
    const authForm = document.getElementById('auth-form');
    const authPwdToggle = document.getElementById('auth-password-toggle');
    const authPwdConfirmToggle = document.getElementById('auth-password-confirm-toggle');
    const authPwdInput = document.getElementById('auth-password');
    const authPwdConfirmInput = document.getElementById('auth-password-confirm');
    
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

    // Show/hide password
    const toggleType = (input, btn) => {
      if (!input || !btn) return;
      const isPwd = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPwd ? 'text' : 'password');
      const icon = btn.querySelector('i');
      if (icon) { icon.classList.toggle('fa-eye'); icon.classList.toggle('fa-eye-slash'); }
    };
    if (authPwdToggle) authPwdToggle.addEventListener('click', () => toggleType(authPwdInput, authPwdToggle));
    if (authPwdConfirmToggle) authPwdConfirmToggle.addEventListener('click', () => toggleType(authPwdConfirmInput, authPwdConfirmToggle));

    // Password strength (only meaningful in register mode, but we update anyway)
    const pwdStrengthEl = document.getElementById('auth-password-strength');
    const pwdStrengthLabel = document.getElementById('auth-password-strength-label');
    if (authPwdInput && pwdStrengthEl && pwdStrengthLabel) {
      authPwdInput.addEventListener('input', () => this._updatePasswordStrength(authPwdInput.value, pwdStrengthEl, pwdStrengthLabel));
    }

    // Address Modal Events
    const addressCloseBtn = document.getElementById('address-modal-close');
    const addressBackdrop = document.getElementById('address-modal-backdrop');
    const addressCancelBtn = document.getElementById('address-cancel-btn');
    const addressForm = document.getElementById('address-form-modal');
  const cepInput = document.getElementById('addrm-cep');
  const ufInput = document.getElementById('addrm-state');
    if (addressCloseBtn) addressCloseBtn.addEventListener('click', () => this.closeAddressModal());
    if (addressBackdrop) addressBackdrop.addEventListener('click', () => this.closeAddressModal());
    if (addressCancelBtn) addressCancelBtn.addEventListener('click', () => this.closeAddressModal());
    if (addressForm) addressForm.addEventListener('submit', (e) => this.handleAddressSubmit(e));
    if (cepInput) {
      cepInput.addEventListener('input', (e) => { this._maskCep(e); this._scheduleCepLookup(); });
      cepInput.addEventListener('blur', () => this._maybeLookupCep(true));
    }
  if (ufInput) ufInput.addEventListener('input', (e) => { e.target.value = (e.target.value || '').toUpperCase().slice(0,2); });

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
    // accessibility attributes
    this.cartModal.setAttribute('role', 'dialog');
    this.cartModal.setAttribute('aria-modal', 'true');
    this.cartModal.setAttribute('aria-label', 'Carrinho de compras');
    this.lastFocusedElement = document.activeElement;
    this.cartModal.classList.add('modal--active');
    document.body.classList.add('modal-open');
    
    // Load cart items
    this.updateCartDisplay();

    // focus first focusable element
    const focusTarget = this.cartModal.querySelector('.modal__close, button, [href], input');
    if (focusTarget) {
      setTimeout(() => focusTarget.focus(), 50);
    }

    this.trapFocus(this.cartModal);
  }

  closeCartModal() {
    if (!this.cartModal) return;
    
    this.cartModal.classList.remove('modal--active');
    document.body.classList.remove('modal-open');
    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
      this.lastFocusedElement = null;
    }
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
    cartItemsContainer.innerHTML = cart.map(item => {
      const total = (item.price * item.quantity).toFixed(2);
      return `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item__info">
          <h4>${item.name}</h4>
          <p class="cart-item__price">R$ ${item.price.toFixed(2)} <span class="cart-item__mult">x${item.quantity}</span> <span class="cart-item__total">= R$ ${total}</span></p>
        </div>
        <div class="cart-item__controls">
          <button class="btn-qty" onclick="window.modalsManager.updateCartItemQuantity('${item.id}', ${item.quantity - 1})">-</button>
          <span class="cart-item__qty">${item.quantity}</span>
          <button class="btn-qty" onclick="window.modalsManager.updateCartItemQuantity('${item.id}', ${item.quantity + 1})">+</button>
          <button class="btn-remove" onclick="window.modalsManager.removeCartItem('${item.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
    }).join('');

    this.ensureCartPriceStyles();

    // Calculate total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotalElement.textContent = `Total: R$ ${total.toFixed(2)}`;
  }

  // Auth Modal Methods
  openAuthModal(mode = 'login') {
    if (!this.authModal) return;
    
    this.currentAuthMode = mode;
    this.updateAuthModalContent();
    
    // accessibility attributes
    this.authModal.setAttribute('role', 'dialog');
    this.authModal.setAttribute('aria-modal', 'true');
    this.authModal.setAttribute('aria-labelledby', 'auth-modal-title');
    this.lastFocusedElement = document.activeElement;
    this.authModal.classList.add('modal--active');
    document.body.classList.add('modal-open');

    // focus first input
    const firstInput = this.authModal.querySelector('input');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50);
    }
    this.trapFocus(this.authModal);
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
    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
      this.lastFocusedElement = null;
    }
  }

  // Address Modal Methods
  openAddressModal(options = {}) {
    if (!this.addressModal) return;
    const { onSave = null, initial = null } = options;
    this._addressSaveHandler = onSave;

    // Prefill if provided
    const byId = (id) => this.addressModal.querySelector('#' + id);
    const setVal = (id, v) => { const el = byId(id); if (el) el.value = v || ''; };
    if (initial) {
      setVal('addrm-cep', initial.zipCode || initial.cep || '');
      setVal('addrm-street', initial.street || initial.rua || '');
      setVal('addrm-number', initial.number || initial.numero || '');
      setVal('addrm-district', initial.district || initial.bairro || '');
      setVal('addrm-comp', initial.comp || initial.complemento || '');
      setVal('addrm-city', initial.city || initial.cidade || '');
      setVal('addrm-state', (initial.state || initial.estado || '').toString().toUpperCase());
      const fav = this.addressModal.querySelector('#addrm-favorite');
      if (fav) fav.checked = !!initial.favorite;
    } else {
      // reset
      const form = this.addressModal.querySelector('#address-form-modal');
      if (form) form.reset();
    }

    // accessibility
    this.addressModal.setAttribute('role', 'dialog');
    this.addressModal.setAttribute('aria-modal', 'true');
    this.addressModal.setAttribute('aria-label', 'Novo endereço');
    this.lastFocusedElement = document.activeElement;
    this.addressModal.classList.add('modal--active');
    document.body.classList.add('modal-open');

    const firstInput = this.addressModal.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
    this.trapFocus(this.addressModal);
  }

  closeAddressModal() {
    if (!this.addressModal) return;
    this.addressModal.classList.remove('modal--active');
    document.body.classList.remove('modal-open');
    // reset invalid states
    this.addressModal.querySelectorAll('.field-wrapper.invalid').forEach(el => el.classList.remove('invalid'));
    const form = this.addressModal.querySelector('#address-form-modal');
    if (form) form.reset();
    this._addressSaveHandler = null;
    this._addressInFlight = false;
    const submitBtn = this.addressModal.querySelector('#address-form-modal button[type="submit"]');
    if (submitBtn) submitBtn.disabled = false;
    if (this.lastFocusedElement) { this.lastFocusedElement.focus(); this.lastFocusedElement = null; }
  }

  handleAddressSubmit(e) {
    e.preventDefault();
    if (this._addressInFlight) return;
    const q = (id) => this.addressModal.querySelector('#' + id);
    const payload = {
      zipCode: q('addrm-cep')?.value?.trim() || '',
      street: q('addrm-street')?.value?.trim() || '',
      number: q('addrm-number')?.value?.trim() || '',
      district: q('addrm-district')?.value?.trim() || '',
      comp: q('addrm-comp')?.value?.trim() || '',
      city: q('addrm-city')?.value?.trim() || '',
      state: (q('addrm-state')?.value || '').trim().toUpperCase(),
      favorite: !!q('addrm-favorite')?.checked,
    };
    // Basic validation
    const required = [
      ['addrm-cep', payload.zipCode && payload.zipCode.replace(/\D/g, '').length === 8],
      ['addrm-street', !!payload.street],
      ['addrm-number', !!payload.number],
      ['addrm-district', !!payload.district],
      ['addrm-city', !!payload.city],
      ['addrm-state', !!payload.state && payload.state.length === 2],
    ];
    let ok = true;
    required.forEach(([id, valid]) => {
      const wrap = this.addressModal.querySelector(`[data-field="${id}"]`);
      if (wrap) wrap.classList.toggle('invalid', !valid);
      const input = this.addressModal.querySelector(`#${id}`);
      if (input) {
        if (!valid) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
      ok = ok && !!valid;
    });
    if (!ok) { this.showToast('Corrija os campos destacados.', 'warn'); return; }

    try {
      this._addressInFlight = true;
      const submitBtn = this.addressModal.querySelector('#address-form-modal button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      if (typeof this._addressSaveHandler === 'function') {
        const res = this._addressSaveHandler(payload);
        if (res && typeof res.then === 'function') {
          // promise
          this.showLoading();
          res.then(() => {
            this.hideLoading();
            this.showToast('Endereço salvo.');
            this.closeAddressModal();
          }).catch((err) => {
            console.error('Erro ao salvar endereço:', err);
            this.hideLoading();
            this.showToast('Erro ao salvar endereço.', 'error');
          }).finally(() => { this._addressInFlight = false; if (submitBtn) submitBtn.disabled = false; });
        } else {
          this.showToast('Endereço salvo.');
          this.closeAddressModal();
          this._addressInFlight = false; if (submitBtn) submitBtn.disabled = false;
        }
      } else {
        this.closeAddressModal();
        this._addressInFlight = false; if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      console.error('Erro no handler de salvar endereço:', err);
      this.showToast('Erro ao salvar endereço.', 'error');
      this._addressInFlight = false; const submitBtn = this.addressModal.querySelector('#address-form-modal button[type="submit"]'); if (submitBtn) submitBtn.disabled = false;
    }
  }

  _maskCep(e) {
    try {
      const el = e.target;
      let v = (el.value || '').replace(/\D/g, '').slice(0, 8);
      if (v.length > 5) v = `${v.slice(0,5)}-${v.slice(5)}`;
      el.value = v;
    } catch (err) { /* noop */ }
  }

  _getCepDigits() {
    const el = this.addressModal?.querySelector('#addrm-cep');
    return (el?.value || '').replace(/\D/g, '').slice(0, 8);
  }

  _scheduleCepLookup() {
    if (!this.addressModal) return;
    clearTimeout(this._cepTimer);
    this._cepTimer = setTimeout(() => this._maybeLookupCep(false), 450);
  }

  async _maybeLookupCep(force = false) {
    try {
      const cep = this._getCepDigits();
      if (cep.length !== 8) return;
      if (!force && this._lastCepLookup === cep) return; // prevent duplicate lookups
      this._lastCepLookup = cep;
      await this._lookupCep(cep);
    } catch (_) { /* noop */ }
  }

  async _lookupCep(cep) {
    if (!this.addressModal) return;
    this.showLoading?.();
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!resp.ok) throw new Error('CEP request failed');
      const data = await resp.json();
      if (data.erro) {
        this.showToast('CEP não encontrado.', 'warn');
        return;
      }
      this._fillAddressFromCep(data);
    } catch (err) {
      console.error('Erro ao consultar CEP:', err);
      this.showToast('Não foi possível consultar o CEP.', 'error');
    } finally {
      this.hideLoading?.();
    }
  }

  _fillAddressFromCep(viaCep) {
    const setVal = (id, val) => {
      const el = this.addressModal.querySelector('#' + id);
      if (el && !el.value) el.value = val || '';
      const wrap = this.addressModal.querySelector(`[data-field="${id}"]`);
      if (wrap && val) wrap.classList.remove('invalid');
      if (el && val) el.removeAttribute('aria-invalid');
    };
    setVal('addrm-street', viaCep.logradouro);
    setVal('addrm-district', viaCep.bairro);
    setVal('addrm-city', viaCep.localidade);
    const uf = (viaCep.uf || '').toString().toUpperCase();
    const ufInput = this.addressModal.querySelector('#addrm-state');
    if (ufInput && !ufInput.value && uf) {
      ufInput.value = uf;
      const wrap = this.addressModal.querySelector('[data-field="addrm-state"]');
      if (wrap) wrap.classList.remove('invalid');
      ufInput.removeAttribute('aria-invalid');
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
    const registerOnly = document.querySelectorAll('#auth-modal .auth-register-only');
    const pwdInput = document.getElementById('auth-password');
    const pwdStrengthEl = document.getElementById('auth-password-strength');
    
    if (this.currentAuthMode === 'login') {
      if (titleElement) titleElement.textContent = 'Entrar';
      if (submitButton) submitButton.textContent = 'Entrar';
      if (toggleLink) toggleLink.textContent = 'Cadastre-se';
      if (switchText) switchText.innerHTML = 'Não tem conta? <a href="#" id="auth-toggle" class="auth-switch__link">Cadastre-se</a>';
      registerOnly.forEach(el => el.style.display = 'none');
      if (pwdInput) pwdInput.setAttribute('autocomplete', 'current-password');
      if (pwdStrengthEl) pwdStrengthEl.style.display = 'none';
    } else {
      if (titleElement) titleElement.textContent = 'Cadastrar';
      if (submitButton) submitButton.textContent = 'Cadastrar';
      if (toggleLink) toggleLink.textContent = 'Entrar';
      if (switchText) switchText.innerHTML = 'Já tem conta? <a href="#" id="auth-toggle" class="auth-switch__link">Entrar</a>';
      registerOnly.forEach(el => el.style.display = 'block');
      if (pwdInput) pwdInput.setAttribute('autocomplete', 'new-password');
      if (pwdStrengthEl) pwdStrengthEl.style.display = 'flex';
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
    
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const nameInput = document.getElementById('auth-name');
    const confirmInput = document.getElementById('auth-password-confirm');
    const email = emailInput?.value || '';
    const password = passwordInput?.value || '';
    const name = nameInput?.value || '';
    const passwordConfirm = confirmInput?.value || '';
    const setInvalid = (el, msgId, msg) => {
      const m = msgId ? document.getElementById(msgId) : null;
      if (el) { el.setAttribute('aria-invalid', 'true'); el.closest('.field-wrapper')?.classList.add('invalid'); }
      if (m) { m.textContent = msg || ''; }
    };
    const clearInvalid = (el, msgId) => {
      const m = msgId ? document.getElementById(msgId) : null;
      if (el) { el.removeAttribute('aria-invalid'); el.closest('.field-wrapper')?.classList.remove('invalid'); }
      if (m) { m.textContent = ''; }
    };
    // clear previous errors
    clearInvalid(emailInput, 'auth-email-error');
    clearInvalid(passwordInput, 'auth-password-error');
    clearInvalid(nameInput, 'auth-name-error');
    clearInvalid(confirmInput, 'auth-password-confirm-error');
    
    if (!email || !password) {
      if (!email) setInvalid(emailInput, 'auth-email-error', 'Informe o e-mail.');
      if (!password) setInvalid(passwordInput, 'auth-password-error', 'Informe a senha.');
      window.toast?.warn('Preencha todos os campos.');
      return;
    }

    if (this.currentAuthMode === 'register') {
      if (!name) {
        setInvalid(nameInput, 'auth-name-error', 'Informe seu nome.');
        window.toast?.warn('Informe seu nome.');
        return;
      }
      if (password.length < 6) {
        setInvalid(passwordInput, 'auth-password-error', 'A senha precisa ter ao menos 6 caracteres.');
        window.toast?.warn('A senha precisa ter ao menos 6 caracteres.');
        return;
      }
      if (password !== passwordConfirm) {
        setInvalid(confirmInput, 'auth-password-confirm-error', 'As senhas não conferem.');
        window.toast?.warn('As senhas não conferem.');
        return;
      }
    }

    this.showLoading();
    
    try {
      // Here you would integrate with your auth service
      if (this.currentAuthMode === 'register') {
        console.log('register:', { email, password, name });
      } else {
        console.log('login:', { email, password });
      }
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
  // Success
  window.toast?.success(`${this.currentAuthMode === 'login' ? 'Login' : 'Cadastro'} realizado!`);
      this.closeAuthModal();
      
    } catch (error) {
      console.error('Auth error:', error);
      window.toast?.error('Erro na autenticação.');
    } finally {
      this.hideLoading();
    }
  }

  _updatePasswordStrength(value, barEl, labelEl) {
    const score = this._passwordScore(value);
    barEl.classList.remove('level-1', 'level-2', 'level-3');
    if (score <= 1) { barEl.classList.add('level-1'); labelEl.textContent = 'Fraca'; }
    else if (score === 2) { barEl.classList.add('level-2'); labelEl.textContent = 'Média'; }
    else { barEl.classList.add('level-3'); labelEl.textContent = 'Forte'; }
  }

  _passwordScore(pwd) {
    let s = 0;
    if (!pwd) return s;
    if (pwd.length >= 6) s++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
    if (/\d/.test(pwd) || /[^\w\s]/.test(pwd)) s++;
    return Math.min(s, 3);
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
    // Prefer CartService se existir
    if (window.cartService) return window.cartService.getItems();
    try {
      const cart = localStorage.getItem('modern_pharmacy_cart') || localStorage.getItem('cart');
      return cart ? JSON.parse(cart) : [];
    } catch (error) { console.error('Error getting cart items:', error); return []; }
  }

  saveCartItems(items) {
    if (window.cartService) {
      // CartService já persiste e notifica
      window.cartService.items = items;
      window.cartService.saveToStorage();
      window.cartService.updateCartCounter();
      window.cartService.notifyListeners?.();
      this.updateCartDisplay();
      return;
    }
    try { localStorage.setItem('modern_pharmacy_cart', JSON.stringify(items)); this.updateCartDisplay(); } catch (e) { console.error('Error saving cart items:', e); }
  }

  addToCart(product) {
    if (window.cartService) {
      // Adapt product shape
      window.cartService.addItem({ id: product.id, name: product.name, price: product.price });
      if (product.quantity && product.quantity > 1) {
        // adjust quantity if >1 (addItem adds 1 by default)
        window.cartService.updateQuantity(product.id, product.quantity);
      }
      const qty = product.quantity || 1;
      this.showToast(`${qty}x ${product.name} adicionad${qty > 1 ? 'os' : 'o'} ao carrinho!`);
      return;
    }
    const cart = this.getCartItems();
    const existingItem = cart.find(i => i.id === product.id);
    if (existingItem) existingItem.quantity += product.quantity || 1; else cart.push({ id: product.id, name: product.name, price: product.price, quantity: product.quantity || 1 });
    this.saveCartItems(cart);
    const qty = product.quantity || 1;
    this.showToast(`${qty}x ${product.name} adicionad${qty > 1 ? 'os' : 'o'} ao carrinho!`);
  }

  ensureCartPriceStyles() {
    if (document.getElementById('cart-price-styles')) return;
    const style = document.createElement('style');
    style.id = 'cart-price-styles';
    style.textContent = `
      .cart-item__price { font-weight: 600; margin: 4px 0 0; }
      .cart-item__mult { color: var(--gray-500); font-weight: 400; margin: 0 4px; }
      .cart-item__total { color: var(--primary-color); font-weight: 700; }
      .dark-mode .cart-item__total { color: var(--secondary-color); }
    `;
    document.head.appendChild(style);
  }

  addToCartWithQuantity(id, name, price, quantity) {
    this.addToCart({ id, name, price, quantity });
  }

  updateCartItemQuantity(productId, newQuantity) {
  if (window.cartService) { window.cartService.updateQuantity(productId, newQuantity); this.updateCartDisplay(); return; }
  if (newQuantity <= 0) { this.removeCartItem(productId); return; }
  const cart = this.getCartItems();
  const item = cart.find(i => i.id === productId);
  if (item) { item.quantity = newQuantity; this.saveCartItems(cart); }
  }

  removeCartItem(productId) {
  if (window.cartService) { window.cartService.removeItem(productId); this.updateCartDisplay(); return; }
  const cart = this.getCartItems().filter(i => i.id !== productId); this.saveCartItems(cart);
  }

  // Utility Methods
  closeAllModals() {
    this.closeCartModal();
    this.closeAuthModal();
    this.closeAddressModal();
  }

  showToast(message, type = 'success') {
    // Delegate to unified toast service
    if (window.toast) {
      if (type === 'error') window.toast.error(message);
      else if (type === 'warning' || type === 'warn') window.toast.warn(message);
      else if (type === 'info') window.toast.info(message);
      else window.toast.success(message);
      return;
    }
    // Fallback minimal
    console.log(`[toast:${type}]`, message);
  }

  // Focus trap implementation
  trapFocus(modalEl) {
    function getFocusable(container) {
      return [...container.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
    }
    const focusable = getFocusable(modalEl);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const keyHandler = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    };
    modalEl.addEventListener('keydown', keyHandler, { once: true });
  }
}

// Make modalsManager globally available
window.modalsManager = null;
