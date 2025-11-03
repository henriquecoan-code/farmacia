import { bootstrap } from './bootstrap.js';
import { eventBus } from './services/event-bus.js';
import { analytics } from './services/analytics-service.js';
import ComponentLoader from './services/component-loader.js';

class CheckoutPage {
  constructor() {
    this.items = [];
    this.shipping = 'standard';
    this.payment = 'pix';
    this.coupon = null;
    this.discountValue = 0;
    this.couponApplied = false;
  this.installmentOptions = [];
  this.selectedInstallment = null; // {count, rate, totalWithInterest, perInstallment}
  this.prefillAttempted = false;
  this.clientRecord = null;
  this.currentAddressId = null; // selected saved address id
  this.tempAddressPayload = null; // when Firebase is not available, keep modal payload here
  // Funnel timing marks
  this.funnel = {
    start: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    addressValidAt: null,
    paymentSelectedAt: null,
    installmentSelectedAt: null,
    orderPlacedAt: null
  };
    this.componentLoader = new ComponentLoader();
    this.ready = false;
    this.init();
  }

  async init() {
    await bootstrap.init();
    await this.componentLoader.loadHeader();
    await this.componentLoader.loadFooter();
    this.loadItems();
    this.bindEvents();
  this.setupMasks();
    this.updateAll();
    this.checkAuth();
    analytics.track('checkout_page_view');
    this.ready = true;
  }

  loadItems() {
    if (window.cartService) {
      this.items = window.cartService.getItems();
    } else {
      try {
        const raw = localStorage.getItem('modern_pharmacy_cart');
        this.items = raw ? JSON.parse(raw) : [];
      } catch { this.items = []; }
    }
    const listEl = document.getElementById('checkout-items');
    const emptyMsg = document.getElementById('empty-cart-msg');
    if (!listEl) return;
    if (this.items.length === 0) {
      emptyMsg.style.display = 'block';
      listEl.innerHTML = '';
      return;
    }
    emptyMsg.style.display = 'none';
    listEl.innerHTML = this.items.map(it => {
      const lineTotal = (it.price * it.quantity).toFixed(2).replace('.', ',');
      return `<div class="checkout-item" data-id="${it.id}">
        <div class="checkout-item__title">${it.name}</div>
        <div class="qty-control">
          <button data-action="minus" aria-label="Diminuir">-</button>
          <span class="qty" aria-live="polite">${it.quantity}</span>
          <button data-action="plus" aria-label="Aumentar">+</button>
        </div>
        <div class="line-total">R$ ${lineTotal}</div>
      </div>`;
    }).join('');
  // Remove cart skeleton if present (first render cleanup for modal)
  const sk = document.getElementById('cart-skeleton');
  if (sk) sk.remove();
  }

  bindEvents() {
    // Bottom nav menu button (mobile)
    const bottomMenuBtn = document.getElementById('bottom-menu-btn');
    if (bottomMenuBtn) bottomMenuBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('mobile-sidebar');
      const overlay = document.getElementById('mobile-overlay');
      const toggle = document.getElementById('mobile-menu-toggle');
      if (sidebar && overlay && toggle) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        toggle.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
      }
    });
    const listEl = document.getElementById('checkout-items');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const row = btn.closest('.checkout-item');
        if (!row) return;
        const id = row.getAttribute('data-id');
        const item = this.items.find(i => i.id === id);
        if (!item) return;
        if (btn.dataset.action === 'minus') item.quantity = Math.max(1, item.quantity - 1);
        if (btn.dataset.action === 'plus') item.quantity += 1;
        if (window.cartService) window.cartService.updateQuantity(id, item.quantity); else this.persistLocal();
        this.loadItems();
        this.updateAll();
        analytics.track('checkout_quantity_change', { id, qty: item.quantity });
      });
    }
    document.getElementById('shipping-group')?.addEventListener('change', (e) => {
      if (e.target.name === 'shipping') { this.shipping = e.target.value; this.updateAll(); analytics.track('checkout_shipping_change', { method: this.shipping }); }
    });
    document.getElementById('payment-group')?.addEventListener('change', (e) => {
      if (e.target.name === 'payment') { 
        this.payment = e.target.value; 
        this.renderPaymentExtra(); 
        // Recompute installments after rendering card fields
        this.updateAll();
        analytics.track('checkout_payment_change', { method: this.payment }); 
        if (!this.funnel.paymentSelectedAt) {
          this.funnel.paymentSelectedAt = this._funnelNow();
          analytics.track('checkout_funnel_payment', { t: this._funnelElapsed(this.funnel.paymentSelectedAt), method: this.payment });
        }
      }
    });
    document.getElementById('apply-coupon')?.addEventListener('click', () => this.applyCoupon());
    document.getElementById('place-order')?.addEventListener('click', () => this.placeOrder());
    document.getElementById('open-auth')?.addEventListener('click', () => {
      window.modalsManager?.openAuthModal('login');
    });
    // Open Address Modal CTA
    document.getElementById('open-address-modal')?.addEventListener('click', () => this.openAddressModalForNew());
    // Inline save is deprecated (form hidden); edits go through modal now
    // CEP auto lookup (viacep)
    const cepInput = document.getElementById('addr-cep');
    if (cepInput) {
      cepInput.addEventListener('blur', () => this.lookupCEP());
    }

    // Payment card placeholder fields injection on demand
    this.injectCardFields();

  // Field validation listeners
  this.installFieldValidation();

    // React to auth change
    eventBus.on('auth:stateChanged', () => this.checkAuth());
  eventBus.on('auth:stateChanged', () => this.tryPrefillAddress());
  eventBus.on('auth:stateChanged', () => this.loadSavedAddresses());
    eventBus.on('cart:updated', () => { this.syncFromCart(); });
    eventBus.on('cart:removed', () => { this.syncFromCart(); });
    eventBus.on('cart:added', () => { this.syncFromCart(); });
  }

  syncFromCart() {
    if (window.cartService) { this.items = window.cartService.getItems(); this.loadItems(); this.updateAll(); }
  }

  persistLocal() {
    try { localStorage.setItem('modern_pharmacy_cart', JSON.stringify(this.items)); } catch {}
  }

  format(v){ return 'R$ ' + v.toFixed(2).replace('.', ','); }

  getSubtotal(){ return this.items.reduce((s,i)=> s + i.price * i.quantity, 0); }

  getShippingValue(){ return this.shipping === 'express' ? 24.90 : (this.items.length ? 9.90 : 0); }

  applyCoupon(){
    const input = document.getElementById('coupon-input');
    if (!input) return;
    const code = (input.value || '').trim().toUpperCase();
    if (!code) return;
    if (this.couponApplied) { window.toast?.warn('Cupom já aplicado.'); this.setStatus('checkout-status','Cupom já aplicado.', 'warn'); return; }
    // Simple mock coupons
    const coupons = { DESCONTO10: 0.10, BEMVINDO5: 0.05 };
    if (!coupons[code]) { this.setStatus('checkout-status','Cupom inválido', 'error'); window.toast?.error('Cupom inválido.'); return; }
    this.coupon = code;
    this.discountValue = coupons[code];
    this.couponApplied = true;
    this.setStatus('checkout-status','Cupom aplicado!','success');
    window.toast?.success('Cupom aplicado!');
    analytics.track('checkout_coupon', { code });
    this.updateAll();
  }

  calcTotals(){
    const subtotal = this.getSubtotal();
    const shipping = this.getShippingValue();
    const discount = this.couponApplied ? subtotal * this.discountValue : 0;
    const total = Math.max(0, subtotal - discount) + shipping;
    return { subtotal, shipping, discount, total };
  }

  updateAll(){
    const { subtotal, shipping, discount, total } = this.calcTotals();
    const stEl = document.getElementById('order-subtotal');
    const shEl = document.getElementById('order-shipping');
    const dRow = document.getElementById('row-discount');
    const dVal = document.getElementById('order-discount');
    const totEl = document.getElementById('order-total');
    const instRow = document.getElementById('row-installments');
    const instVal = document.getElementById('order-installments');
    if (stEl) stEl.textContent = this.format(subtotal);
    if (shEl) shEl.textContent = this.format(shipping);
    if (totEl) totEl.textContent = this.format(total);
    if (dRow && dVal) {
      if (discount > 0) { dRow.style.display = 'flex'; dVal.textContent = '-'+this.format(discount); }
      else { dRow.style.display = 'none'; }
    }
    // Update installments if card
    if (this.payment === 'card') this.updateInstallments(total);
    if (instRow && instVal) {
      if (this.payment === 'card' && this.selectedInstallment) {
        const si = this.selectedInstallment;
        instRow.style.display = 'flex';
        instVal.textContent = `${si.count}x de ${this.format(si.perInstallment)}${si.rate?` (total ${this.format(si.totalWithInterest)})`:''}`;
      } else instRow.style.display = 'none';
    }
    const btn = document.getElementById('place-order');
    if (btn) btn.disabled = !(this.items.length && this.isAddressValid() && this.isAuth());
    this.saveAddressDraft();
    this.renderSelectedAddressSummary();
    if (!this.funnel.addressValidAt && this.isAddressValid()) {
      this.funnel.addressValidAt = this._funnelNow();
      analytics.track('checkout_funnel_address', { t: this._funnelElapsed(this.funnel.addressValidAt) });
    }
  }

  isAuth(){ return !!(window.authService && window.authService.user); }

  checkAuth(){
    const box = document.getElementById('auth-reminder');
    if (!box) return;
    if (this.isAuth()) { box.style.display = 'none'; this.updateAll(); }
    else { box.style.display = 'block'; this.updateAll(); }
  }

  saveAddressDraft(){
    if (!this.isAuth()) return;
    const a = this.readAddress();
    try { localStorage.setItem('checkout_address_draft', JSON.stringify(a)); } catch {}
  }

  loadAddressDraft(){
    try {
      const raw = localStorage.getItem('checkout_address_draft');
      if (!raw) return;
      const a = JSON.parse(raw);
      const map = {
        'addr-name': a.name,
        'addr-phone': a.phone,
        'addr-cep': a.cep,
        'addr-city': a.city,
        'addr-street': a.street,
        'addr-number': a.number,
        'addr-district': a.district,
        'addr-comp': a.comp,
        'addr-state': a.state
      };
      Object.entries(map).forEach(([id,val]) => { const el = document.getElementById(id); if (el && !el.value) el.value = val || ''; });
    } catch {}
  }

  async tryPrefillAddress(){
    if (this.prefillAttempted) return;
    if (!this.isAuth()) return;
    if (!bootstrap.firebase || !bootstrap.firebase.isInitialized) return;
    const user = window.authService?.user;
    if (!user?.email) return;
    try {
      const client = await (bootstrap.firebase.getCurrentUserProfile?.() || bootstrap.firebase.getClientByEmail(user.email));
      if (client) {
        const addr = client.address || client.endereco || null;
        if (addr) {
          const map = {
            'addr-name': client.name || client.nome,
            'addr-phone': client.phone || client.telefone,
            'addr-cep': addr.zipCode || addr.cep || '',
            'addr-street': addr.street || addr.rua || '',
            'addr-city': addr.city || addr.cidade || '',
            'addr-state': (addr.state || addr.estado || '').toString().toUpperCase(),
            'addr-number': addr.number || addr.numero || '',
            'addr-district': addr.district || addr.bairro || '',
            'addr-comp': addr.comp || addr.complemento || ''
          };
          Object.entries(map).forEach(([id,val]) => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = val || '';
          });
          // Auto-format phone if digits only (10-11)
          const phoneEl = document.getElementById('addr-phone');
          const rawPhone = (phoneEl?.value || '').replace(/\D/g,'');
          if (phoneEl && /^\d{10,11}$/.test(rawPhone)) {
            const ddd = rawPhone.slice(0,2);
            const middle = rawPhone.length === 11 ? rawPhone.slice(2,7) : rawPhone.slice(2,6);
            const end = rawPhone.length === 11 ? rawPhone.slice(7) : rawPhone.slice(6);
            phoneEl.value = `(${ddd}) ${middle}-${end}`;
          }
          const status = document.getElementById('address-status');
          if (status) { status.textContent = 'Endereço carregado do cadastro.'; status.style.color = 'var(--success-color)'; }
          analytics.track('checkout_address_prefill',{ source:'client_record'});
          this.updateAll();
        }
      }
    } catch (e){ console.warn('Prefill address failed', e); }
    this.prefillAttempted = true;
  this.loadAddressDraft();
  }

  async loadSavedAddresses(){
    if (!this.isAuth()) return;
    if (!bootstrap.firebase?.isInitialized) return;
    const user = window.authService?.user;
    if (!user?.email) return;
    try {
  this.clientRecord = await (bootstrap.firebase.getCurrentUserProfile?.() || bootstrap.firebase.getClientByEmail(user.email));
      const container = document.getElementById('saved-addresses-box');
      const list = document.getElementById('saved-addresses-list');
      if (!container || !list) return;
      list.innerHTML = '';
      const addresses = this.clientRecord?.addresses || [];
      if (!addresses.length) { container.style.display = 'none'; return; }
      container.style.display = 'block';
      addresses.forEach(addr => {
        const labelText = `${addr.street || ''} ${addr.number || ''} - ${addr.city || ''} ${addr.state || ''}`.trim();
        const wrapper = document.createElement('div');
        wrapper.className = 'radio-item';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.alignItems = 'center';
        wrapper.innerHTML = `
          <label style="flex:1; display:flex; gap:.5rem; align-items:center; cursor:pointer;">
            <input type="radio" name="saved-address" value="${addr.id}" ${addr.favorite?'checked':''}/>
            <span>${addr.favorite ? '⭐ ' : ''}${labelText}</span>
          </label>
          <div class="addr-actions" style="display:flex; gap:.35rem;">
            <button type="button" class="addr-fav" data-id="${addr.id}" title="Favorito" style="background:none;border:1px solid var(--gray-300);padding:.25rem .4rem;border-radius:4px;cursor:pointer;${addr.favorite?'color:var(--primary-color);':''}">★</button>
            <button type="button" class="addr-edit" data-id="${addr.id}" title="Editar" style="background:none;border:1px solid var(--gray-300);padding:.25rem .4rem;border-radius:4px;cursor:pointer;">✎</button>
            <button type="button" class="addr-del" data-id="${addr.id}" title="Excluir" style="background:none;border:1px solid var(--error-color);color:var(--error-color);padding:.25rem .4rem;border-radius:4px;cursor:pointer;">🗑</button>
          </div>`;
        list.appendChild(wrapper);
        if (addr.favorite) this.currentAddressId = addr.id;
      });

      list.querySelectorAll('.addr-fav').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          await this.markFavoriteAddress(id);
        });
      });
      list.querySelectorAll('.addr-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          this.editSavedAddress(id);
        });
      });
      list.querySelectorAll('.addr-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          await this.deleteSavedAddress(id);
        });
      });
      list.addEventListener('change', (e) => {
        if (e.target.name === 'saved-address') {
          const id = e.target.value;
          this.selectSavedAddress(id);
        }
      }, { once: true });
      document.getElementById('new-address-btn')?.addEventListener('click', () => this.openAddressModalForNew());
      if (this.currentAddressId) this.selectSavedAddress(this.currentAddressId, { silent:true });
    } catch(e){ console.warn('loadSavedAddresses fail', e); }
  }

  clearAddressForm(){
    ['addr-name','addr-phone','addr-cep','addr-city','addr-street','addr-number','addr-district','addr-comp','addr-state'].forEach(id=>{ const el = document.getElementById(id); if (el) el.value=''; });
    const fav = document.getElementById('addr-favorite'); if (fav) fav.checked = false;
  }

  selectSavedAddress(id, { silent = false } = {}){
    const addr = (this.clientRecord?.addresses || []).find(a=>a.id===id);
    if (!addr) return;
    this.currentAddressId = id;
    // Update state (inline form is hidden; we avoid mutating inputs)
    const fav = document.getElementById('addr-favorite'); if (fav) fav.checked = !!addr.favorite;
    this.updateAll();
    if (!silent) analytics.track('checkout_address_select', { id, favorite: !!addr.favorite });
  }

  editSavedAddress(id){
    const addr = (this.clientRecord?.addresses || []).find(a=>a.id===id);
    if (!addr) return;
    this.currentAddressId = id;
    analytics.track('checkout_address_edit_start', { id });
    window.modalsManager?.openAddressModal({
      initial: {
        zipCode: addr.zipCode,
        street: addr.street,
        number: addr.number || '',
        district: addr.district || '',
        comp: addr.comp || '',
        city: addr.city,
        state: addr.state,
        favorite: !!addr.favorite
      },
      onSave: async (payload) => {
        try {
          if (bootstrap.firebase?.isInitialized && this.clientRecord?.id) {
            await bootstrap.firebase.updateClientAddress(this.clientRecord.id, id, {
              street: payload.street,
              number: payload.number,
              district: payload.district,
              comp: payload.comp,
              city: payload.city,
              state: payload.state,
              zipCode: payload.zipCode,
              favorite: !!payload.favorite
            });
            // Update local cache
            this.clientRecord.addresses = (this.clientRecord.addresses||[]).map(a => a.id===id ? Object.assign({}, a, {
              street: payload.street,
              number: payload.number,
              district: payload.district,
              comp: payload.comp,
              city: payload.city,
              state: payload.state,
              zipCode: payload.zipCode,
              favorite: !!payload.favorite
            }) : a);
            if (payload.favorite) this.clientRecord.addresses.forEach(a=> { if (a.id!==id) a.favorite=false; });
            this.currentAddressId = id;
            this.tempAddressPayload = null;
            window.toast?.success('Endereço atualizado.');
            this.loadSavedAddresses();
          } else {
            // Offline fallback: update local list and selection
            this.clientRecord.addresses = (this.clientRecord.addresses||[]).map(a => a.id===id ? Object.assign({}, a, {
              street: payload.street,
              number: payload.number,
              district: payload.district,
              comp: payload.comp,
              city: payload.city,
              state: payload.state,
              zipCode: payload.zipCode,
              favorite: !!payload.favorite
            }) : a);
            if (payload.favorite) this.clientRecord.addresses.forEach(a=> { if (a.id!==id) a.favorite=false; });
            this.currentAddressId = id;
            this.tempAddressPayload = null;
            window.toast?.info('Endereço atualizado localmente.');
            this.loadSavedAddresses();
          }
          analytics.track('checkout_address_edit_save', { id, favorite: !!payload.favorite });
        } catch (e) {
          console.warn('Falha ao atualizar endereço', e);
          window.toast?.error('Falha ao atualizar endereço.');
        }
      }
    });
  }

  async markFavoriteAddress(id){
    if (!this.clientRecord) return;
    try {
      await bootstrap.firebase.setFavoriteAddress(this.clientRecord.id, id);
      analytics.track('checkout_address_favorite', { id });
      // update local
      (this.clientRecord.addresses||[]).forEach(a => a.favorite = (a.id===id));
      this.currentAddressId = id;
      this.loadSavedAddresses();
    } catch(e){ console.warn('favorite failed', e); }
  }

  async deleteSavedAddress(id){
    if (!this.clientRecord) return;
    if (!confirm('Remover este endereço?')) return;
    try {
      await bootstrap.firebase.deleteClientAddress(this.clientRecord.id, id);
      analytics.track('checkout_address_delete', { id });
      this.clientRecord.addresses = (this.clientRecord.addresses||[]).filter(a=>a.id!==id);
      if (this.currentAddressId === id) {
        this.currentAddressId = null;
        this.clearAddressForm();
      }
      this.loadSavedAddresses();
    } catch(e){ console.warn('delete failed', e); }
  }

  async saveCurrentAddressIfNew(){
    if (!this.isAuth()) return;
    if (!this.clientRecord) return; // not loaded yet
    if (this.currentAddressId) return; // existing
    if (!this.isAddressValid()) return;
    try {
      const addr = this.readAddress();
      const favorite = document.getElementById('addr-favorite')?.checked || false;
      const payload = {
        street: addr.street,
        number: addr.number,
        district: addr.district,
        comp: addr.comp,
        city: addr.city,
        state: addr.state,
        zipCode: addr.cep,
        favorite
      };
      const saved = await bootstrap.firebase.addAddressToClient(this.clientRecord.id, payload, { favorite });
      analytics.track('checkout_address_saved', { favorite });
  window.toast?.success('Endereço salvo.');
      // Refresh local record
      this.clientRecord.addresses = this.clientRecord.addresses || [];
      if (favorite) this.clientRecord.addresses.forEach(a=> a.favorite = false);
      this.clientRecord.addresses.push(saved);
      this.currentAddressId = saved.id;
      this.loadSavedAddresses();
    } catch(e){ console.warn('save address failed', e); }
  }

  isAddressValid(){
    // Valid if there's a selected saved address or a temp payload from modal
    if (this.currentAddressId && (this.clientRecord?.addresses || []).some(a=>a.id===this.currentAddressId)) return true;
    const a = this.tempAddressPayload;
    if (a) {
      const has = (v)=> !!(v && String(v).trim());
      return has(a.zipCode) && has(a.street) && has(a.number) && has(a.district) && has(a.city) && has(a.state);
    }
    return false;
  }

  installFieldValidation(){
    const fields = ['addr-name','addr-phone','addr-cep','addr-city','addr-street','addr-number','addr-district','addr-state'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('blur', () => { this.validateField(id); this.updateAll(); });
      el.addEventListener('input', () => { this.validateField(id, {silent:true}); });
    });
  }

  validateField(id, { silent = false } = {}){
    const el = document.getElementById(id);
    if (!el) return true;
    const wrapper = el.closest('.field-wrapper');
    let valid = true;
    const val = (el.value || '').trim();
    switch(id){
      case 'addr-phone': valid = /\(\d{2}\) \d{4,5}-\d{4}$/.test(val) || /^\d{10,11}$/.test(val.replace(/\D/g,'')); break;
      case 'addr-cep': valid = /^\d{5}-\d{3}$/.test(val); break;
      case 'addr-state': valid = /^[A-Za-z]{2}$/.test(val); break;
      default: valid = !!val; break;
    }
    if (wrapper) {
      wrapper.classList.toggle('invalid', !valid);
      wrapper.classList.toggle('valid', valid);
      el.classList.toggle('input-invalid', !valid);
      if (!valid && !silent) {
        // Could extend analytics for first error display
      }
    }
    return valid;
  }

  renderPaymentExtra(){
    const container = document.getElementById('payment-extra');
    if (!container) return;
    if (this.payment === 'pix') container.innerHTML = 'Código Pix será gerado após confirmar o pedido.';
    else if (this.payment === 'card') container.innerHTML = this.cardFieldsHTML();
    else container.innerHTML = 'Boleto válido por 2 dias úteis.';
  }

  cardFieldsHTML(){
    return `<div class="card-box-mini">
      <div class="grid-2">
        <div><label>Número do Cartão</label><input id="card-number" placeholder="0000 0000 0000 0000" maxlength="19" /></div>
        <div><label>Nome Impresso</label><input id="card-holder" /></div>
      </div>
      <div class="grid-2">
        <div><label>Validade</label><input id="card-exp" placeholder="MM/AA" maxlength="5" /></div>
        <div><label>CVV</label><input id="card-cvv" placeholder="000" maxlength="4" /></div>
      </div>
      <div id="installments-box" style="margin-top:.75rem"></div>
      <p class="status-msg">(Simulação - dados não são enviados)</p>
    </div>`;
  }

  injectCardFields(){
    if (this.payment === 'card') this.renderPaymentExtra();
  }

  setStatus(id,msg,type){
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'error' ? 'var(--error-color)' : (type==='warn'?'#b58900':'var(--success-color)');
  }

  readAddress(){
    // Prefer selected saved address
    const saved = (this.clientRecord?.addresses || []).find(a=>a.id===this.currentAddressId);
    if (saved) {
      return {
        name: this.clientRecord?.name || '',
        phone: this.clientRecord?.phone || '',
        cep: saved.zipCode || '',
        city: saved.city || '',
        street: saved.street || '',
        number: saved.number || '',
        district: saved.district || '',
        comp: saved.comp || '',
        state: (saved.state || '').toString().toUpperCase()
      };
    }
    // Then temp payload from modal (no persistence)
    if (this.tempAddressPayload) {
      const p = this.tempAddressPayload;
      return {
        name: this.clientRecord?.name || '',
        phone: this.clientRecord?.phone || '',
        cep: p.zipCode || p.cep || '',
        city: p.city || '',
        street: p.street || '',
        number: p.number || '',
        district: p.district || '',
        comp: p.comp || '',
        state: (p.state || '').toString().toUpperCase()
      };
    }
    // Fallback (inline form hidden): try read but likely empty
    return {
      name: document.getElementById('addr-name')?.value.trim(),
      phone: document.getElementById('addr-phone')?.value.trim(),
      cep: document.getElementById('addr-cep')?.value.trim(),
      city: document.getElementById('addr-city')?.value.trim(),
      street: document.getElementById('addr-street')?.value.trim(),
      number: document.getElementById('addr-number')?.value.trim(),
      district: document.getElementById('addr-district')?.value.trim(),
      comp: document.getElementById('addr-comp')?.value.trim(),
      state: document.getElementById('addr-state')?.value.trim().toUpperCase()
    };
  }

  // Prefill the inline checkout form with data coming from the modal
  fillFormFromModalPayload(payload){
    if (!payload) return;
    this.tempAddressPayload = {
      zipCode: payload.zipCode || payload.cep || '',
      street: payload.street || '',
      number: payload.number || '',
      district: payload.district || '',
      comp: payload.comp || '',
      city: payload.city || '',
      state: (payload.state || '').toString().toUpperCase(),
      favorite: !!payload.favorite
    };
    this.currentAddressId = null; // using temp address instead of saved selection
    this.updateAll();
  }

  // Centralized Address Modal opener for creating a new address
  openAddressModalForNew(){
    const hideSaveBtn = () => { const b = document.getElementById('save-address-changes'); if (b) b.style.display = 'none'; };
    this.currentAddressId = null;
    hideSaveBtn();
    window.modalsManager?.openAddressModal({
      onSave: async (payload) => {
        try {
          if (bootstrap.firebase?.isInitialized && this.clientRecord?.id) {
            const saved = await bootstrap.firebase.addAddressToClient(this.clientRecord.id, payload, { favorite: payload.favorite });
            // Update local cache and selection
            this.clientRecord.addresses = this.clientRecord.addresses || [];
            if (payload.favorite) this.clientRecord.addresses.forEach(a=> a.favorite = false);
            this.clientRecord.addresses.push(saved);
            this.currentAddressId = saved.id;
            // Select and refresh UI
            this.selectSavedAddress(saved.id, { silent: true });
            this.tempAddressPayload = null;
            this.loadSavedAddresses();
            window.toast?.success('Endereço salvo.');
          } else {
            // Fallback: keep payload in memory so order can proceed
            this.fillFormFromModalPayload(payload);
          }
        } catch (e) {
          console.warn('Falha ao salvar novo endereço', e);
          this.fillFormFromModalPayload(payload);
        }
      }
    });
  }

  renderSelectedAddressSummary(){
    const box = document.getElementById('address-selected-summary');
    if (!box) return;
    const saved = (this.clientRecord?.addresses || []).find(a=>a.id===this.currentAddressId);
    const a = saved ? {
      street: saved.street, number: saved.number, district: saved.district,
      city: saved.city, state: saved.state, zipCode: saved.zipCode
    } : this.tempAddressPayload;
    if (!a) { box.style.display = 'none'; box.textContent = ''; return; }
    const parts = [];
    if (a.street) parts.push(`${a.street}${a.number?`, ${a.number}`:''}`);
    if (a.district) parts.push(a.district);
    const cityUf = [a.city, a.state].filter(Boolean).join('/');
    if (cityUf) parts.push(cityUf);
    if (a.zipCode) parts.push(`CEP ${a.zipCode}`);
    box.textContent = parts.join(' • ');
    box.style.display = 'block';
  }

  validateBeforeOrder(){
    if (!this.items.length) { this.setStatus('checkout-status','Carrinho vazio.', 'error'); return false; }
    if (!this.isAuth()) { this.setStatus('checkout-status','Faça login para continuar.', 'error'); return false; }
    if (!this.isAddressValid()) { this.setStatus('checkout-status','Preencha endereço completo.', 'error'); return false; }
    if (this.payment === 'card') {
      // Minimal validation for simulation
      const num = document.getElementById('card-number')?.value.replace(/\s+/g,'');
      const holder = document.getElementById('card-holder')?.value.trim();
      const exp = document.getElementById('card-exp')?.value.trim();
      const cvv = document.getElementById('card-cvv')?.value.trim();
      if (!(num && num.length >= 12 && holder && /\d{2}\/\d{2}/.test(exp) && cvv && cvv.length >= 3)) {
        this.setStatus('checkout-status','Preencha dados do cartão válidos.', 'error');
        return false;
      }
      if (!this.selectedInstallment) {
        this.setStatus('checkout-status','Selecione parcelas.', 'error');
        return false;
      }
    }
    return true;
  }

  async placeOrder(){
    if (!this.validateBeforeOrder()) return;
    const btn = document.getElementById('place-order');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    // Build initial order (id/orderNumber will be assigned by backend if available)
    const order = {
      createdAt: new Date().toISOString(),
      items: this.items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
      totals: this.calcTotals(),
      shippingMethod: this.shipping,
      paymentMethod: this.payment,
  installments: this.payment === 'card' ? this.selectedInstallment : null,
      address: this.readAddress(),
      user: window.authService?.user?.email || null,
      userId: window.authService?.user?.uid || null,
  coupon: this.coupon || null,
  status: 'pending'
    };
    // Persist order (Firestore if available, else local fallback)
    let persisted = null;
    if (bootstrap.firebase?.isInitialized) {
      try {
        persisted = await bootstrap.firebase.createOrder(order);
        if (persisted && typeof persisted.orderNumber === 'number') {
          order.orderNumber = persisted.orderNumber;
          order.id = persisted.orderNumber; // legacy compatibility
        }
        if (persisted?.docId) order._docId = persisted.docId;
      } catch (e) {
        console.warn('Persist order failed, storing locally only', e);
      }
    }
    // Fallback local sequential id if backend didn't assign
    if (typeof order.id !== 'number') {
      let orderSeq = 0;
      try {
        orderSeq = parseInt(localStorage.getItem('order_sequence')||'0',10) || 0;
        orderSeq += 1;
        localStorage.setItem('order_sequence', String(orderSeq));
      } catch {}
      order.id = orderSeq || Date.now();
    }
    analytics.track('checkout_place_order', { id: order.id, total: order.totals.total, items: order.items.length });
    if (!this.funnel.orderPlacedAt) {
      this.funnel.orderPlacedAt = this._funnelNow();
      analytics.track('checkout_funnel_complete', {
        t_address: this.funnel.addressValidAt ? this._funnelElapsed(this.funnel.addressValidAt) : null,
        t_payment: this.funnel.paymentSelectedAt ? this._funnelElapsed(this.funnel.paymentSelectedAt) : null,
        t_installment: this.funnel.installmentSelectedAt ? this._funnelElapsed(this.funnel.installmentSelectedAt) : null,
        t_order: this._funnelElapsed(this.funnel.orderPlacedAt),
        payment: this.payment,
        installments: this.selectedInstallment ? this.selectedInstallment.count : null
      });
    }
    try { localStorage.setItem('last_order', JSON.stringify(order)); } catch {}
    // Limpa carrinho
    if (window.cartService) window.cartService.clear(); else localStorage.removeItem('modern_pharmacy_cart');
    this.showSuccess(order);
  }

  showSuccess(order){
    const root = document.getElementById('checkout-root');
  // Número do WhatsApp da loja (formato internacional sem +). Ajuste aqui se necessário.
  const storeWhatsApp = '554834643201';
  const lineItems = order.items.map(i=>`- ${i.quantity}x ${i.name} (R$ ${i.price.toFixed(2)})`).join('\n');
  const displayNum = order.orderNumber || order.id;
  const msg = `Olá! Pedido *#${displayNum}* confirmado.\nTotal: R$ ${order.totals.total.toFixed(2)}\nPagamento: ${order.paymentMethod}${order.installments?` (${order.installments.count}x)`:''}\nItens:\n${lineItems}`;
  const waLink = `https://wa.me/${storeWhatsApp}?text=${encodeURIComponent(msg)}`;
    root.innerHTML = `<div class="card-box success-box">
      <h2><i class="fas fa-check-circle"></i> Pedido Confirmado</h2>
      <p>Número do Pedido: <strong>${displayNum}</strong></p>
      <p>Total: <strong>${this.format(order.totals.total)}</strong></p>
      <div style="display:flex; flex-direction:column; gap:.75rem; max-width:320px; margin:1rem auto;">
    <button class="btn-primary" onclick="window.open('${waLink}','_blank')">Enviar para WhatsApp da Loja</button>
        <button class="btn-primary" style="background:var(--gray-700);" onclick="window.location='modern-index.html'">Voltar à Loja</button>
      </div>
    </div>`;
  }

  setupMasks(){
    // Telefone mask
    const phone = document.getElementById('addr-phone');
    if (phone) {
      phone.addEventListener('input', () => {
        let v = phone.value.replace(/\D/g,'').slice(0,11);
        if (v.length > 6) phone.value = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
        else if (v.length > 2) phone.value = `(${v.slice(0,2)}) ${v.slice(2)}`;
        else phone.value = v;
      });
    }
    // CEP mask
    const cep = document.getElementById('addr-cep');
    if (cep) {
      cep.addEventListener('input', () => {
        let v = cep.value.replace(/\D/g,'').slice(0,8);
        if (v.length > 5) cep.value = v.slice(0,5)+'-'+v.slice(5);
        else cep.value = v;
      });
    }
    // Card masks (delegated on input event)
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.id === 'card-number') {
        let v = t.value.replace(/\D/g,'').slice(0,16);
        t.value = v.replace(/(\d{4})(?=\d)/g,'$1 ').trim();
      }
      if (t && t.id === 'card-exp') {
        let v = t.value.replace(/\D/g,'').slice(0,4);
        if (v.length >= 3) t.value = v.slice(0,2)+'/'+v.slice(2);
        else t.value = v;
      }
      if (t && t.id === 'card-cvv') {
        t.value = t.value.replace(/\D/g,'').slice(0,4);
      }
    });
  }

  async lookupCEP(){
    const cepEl = document.getElementById('addr-cep');
    if (!cepEl) return;
    const raw = (cepEl.value || '').replace(/\D/g,'');
    if (raw.length !== 8) return; // ignore incomplete
    const status = document.getElementById('address-status');
    const token = Math.random().toString(36).slice(2);
    this._cepLookupToken = token;
    const maxAttempts = 3;
    if (status) { status.textContent = 'Buscando CEP...'; status.style.color = 'var(--primary-color)'; }

    const sleep = ms => new Promise(r=>setTimeout(r, ms));

    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      attempt++;
      analytics.track('checkout_cep_lookup_attempt', { attempt });
      try {
        const controller = new AbortController();
        const t = setTimeout(()=>controller.abort(), 6000); // 6s timeout
        const resp = await fetch(`https://viacep.com.br/ws/${raw}/json/`, { signal: controller.signal });
        clearTimeout(t);
        if (!resp.ok) throw new Error('HTTP '+resp.status);
        const data = await resp.json();
        if (this._cepLookupToken !== token) return; // a newer request started
        if (data.erro) {
          if (status) {
            status.innerHTML = 'CEP não encontrado. Verifique o número ou preencha manualmente.';
            status.style.color = 'var(--error-color)';
          }
          analytics.track('checkout_cep_lookup_fail', { attempts: attempt, reason: 'not_found' });
          return;
        }
        // success
        const map = {
          'addr-street': data.logradouro,
          'addr-district': data.bairro,
          'addr-city': data.localidade,
          'addr-state': data.uf
        };
        Object.entries(map).forEach(([id,val]) => { const el = document.getElementById(id); if (el && !el.value) el.value = val || ''; });
        if (status) { status.textContent = `Endereço preenchido pelo CEP (tentativa ${attempt}).`; status.style.color = 'var(--success-color)'; }
        analytics.track('checkout_cep_lookup_success', { attempts: attempt });
        this.updateAll();
        return;
      } catch (e) {
        lastError = e;
        if (this._cepLookupToken !== token) return; // superseded
        if (attempt < maxAttempts) {
          // backoff: 250ms, 600ms
            await sleep( attempt === 1 ? 250 : 600 );
          continue;
        }
      }
    }
    // Final failure
    if (this._cepLookupToken !== token) return;
    if (status) {
      status.innerHTML = 'Não foi possível buscar o CEP agora. <button type="button" id="retry-cep" style="background:none;border:none;color:var(--primary-color);text-decoration:underline;cursor:pointer;font-size:.75rem;">Tentar novamente</button>'; 
      status.style.color = 'var(--error-color)';
    }
    analytics.track('checkout_cep_lookup_fail', { attempts: maxAttempts, reason: lastError?.name === 'AbortError' ? 'timeout' : 'network' });
    // Attach retry handler
    setTimeout(()=>{
      const retryBtn = document.getElementById('retry-cep');
      if (retryBtn) retryBtn.addEventListener('click', () => this.lookupCEP());
    }, 0);
  }

  async saveEditedAddress(){
    if (!this.isAuth()) return;
    if (!this.clientRecord) return;
    if (!this.currentAddressId) return; // Only for existing addresses
    if (!this.isAddressValid()) { this.setStatus('address-status','Corrija campos inválidos.','error'); return; }
    try {
      const addr = this.readAddress();
      const favorite = document.getElementById('addr-favorite')?.checked || false;
      const patch = {
        street: addr.street,
        number: addr.number,
        district: addr.district,
        comp: addr.comp,
        city: addr.city,
        state: addr.state,
        zipCode: addr.cep,
        favorite
      };
      await bootstrap.firebase.updateClientAddress(this.clientRecord.id, this.currentAddressId, patch);
      analytics.track('checkout_address_edit_save', { id: this.currentAddressId, favorite });
      // Update local cache
      this.clientRecord.addresses = (this.clientRecord.addresses||[]).map(a => a.id===this.currentAddressId ? Object.assign({}, a, patch) : a);
      if (favorite) this.clientRecord.addresses.forEach(a=> { if (a.id!==this.currentAddressId) a.favorite=false; });
  this.setStatus('address-status','Endereço atualizado.','success');
  window.toast?.success('Endereço atualizado.');
      // Refresh list & keep selection
      this.loadSavedAddresses();
      // Hide save button
      const saveBtn = document.getElementById('save-address-changes');
      if (saveBtn) saveBtn.style.display = 'none';
    } catch(e){
      console.warn('edit address failed', e);
      this.setStatus('address-status','Falha ao salvar alterações.','error');
    }
  }

  // Generate installment options based on rules:
  // From 1x (no interest) to up to 6x provided per installment >= 40.
  // Starting 2x: 1% interest; each subsequent +0.2% (2x 1.0, 3x 1.2 ... 6x 1.8)
  generateInstallmentOptions(total){
    const opts = [];
    // 1x no interest always available
    opts.push({ count:1, rate:0, totalWithInterest: total, perInstallment: total });
    for (let n=2; n<=6; n++) {
      const rate = (1 + (n-2)*0.2) / 100; // convert percent to fraction
      const totalWithInterest = total * (1 + rate);
      const per = totalWithInterest / n;
      if (per >= 40) {
        opts.push({ count:n, rate, totalWithInterest, perInstallment: per });
      }
    }
    return opts;
  }

  formatMoney(v){ return 'R$ '+v.toFixed(2).replace('.', ','); }

  updateInstallments(total){
    const box = document.getElementById('installments-box');
    if (!box) return;
    this.installmentOptions = this.generateInstallmentOptions(total);
    if (!this.installmentOptions.length) { box.innerHTML = '<small>Sem opções de parcelamento.</small>'; return; }
    const currentCount = this.selectedInstallment?.count;
    const optionsHTML = this.installmentOptions.map(opt => {
      const percent = opt.rate*100;
      const label = opt.count === 1
        ? `1x de ${this.formatMoney(opt.perInstallment)} (sem juros)`
        : `${opt.count}x de ${this.formatMoney(opt.perInstallment)} (total ${this.formatMoney(opt.totalWithInterest)} ${percent?'+ '+percent.toFixed(1).replace('.0','')+'%':''})`;
      return `<option value="${opt.count}" ${currentCount===opt.count?'selected':''}>${label}</option>`;
    }).join('');
    box.innerHTML = `<label style="display:block;font-size:.8rem;margin-bottom:.25rem;">Parcelamento</label><select id="installments-select" class="installments-select" style="width:100%;padding:.5rem;">${optionsHTML}</select>`;
    const select = document.getElementById('installments-select');
    select.addEventListener('change', () => {
      const val = parseInt(select.value,10);
      this.selectedInstallment = this.installmentOptions.find(o=>o.count===val);
      analytics.track('checkout_installment_select', { count: this.selectedInstallment.count, rate: this.selectedInstallment.rate });
      if (!this.funnel.installmentSelectedAt) {
        this.funnel.installmentSelectedAt = this._funnelNow();
        analytics.track('checkout_funnel_installment', { t: this._funnelElapsed(this.funnel.installmentSelectedAt), count: this.selectedInstallment.count });
      }
    });
    // Default selection
    if (!this.selectedInstallment) {
      this.selectedInstallment = this.installmentOptions[0];
    } else {
      // Ensure still valid
      const still = this.installmentOptions.find(o=>o.count===this.selectedInstallment.count);
      if (!still) this.selectedInstallment = this.installmentOptions[0];
    }
    select.value = this.selectedInstallment.count;
  }

  _funnelNow(){ return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
  _funnelElapsed(ts){ return Math.round(ts - this.funnel.start); }
}

document.addEventListener('DOMContentLoaded', () => new CheckoutPage());
