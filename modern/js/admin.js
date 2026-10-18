// Clean rebuilt Admin Panel (products + orders)
import { bootstrap } from './bootstrap.js';
import { eventBus } from './services/event-bus.js';
import { escapeHTML } from './services/product-utils.js';

// Escapa qualquer valor vindo do Firestore antes de interpolar em HTML
const esc = (v) => escapeHTML(String(v ?? ''));

class AdminApp {
  constructor(){
    this.currentSection='dashboard';
    this.products=[]; this.clients=[]; this.orders=[]; this.ordersLoaded=false;
    this.editingProduct=null;
    this.firebase=null;
    this.loginPromptShown=false;
    // Evita avisos repetidos ao usuário quando coleções estiverem vazias em produção
    this._hintsShown = { orders:false, clients:false, moderation:false };
    this.pagination={ products:{page:1,pageSize:50}, moderation:{page:1,pageSize:50}, orders:{page:1,pageSize:50} };
    this.init();
  }

  async init(){
    try {
      await bootstrap.init();
      this.firebase = bootstrap.firebase;
      this.setupEventListeners();
      this.setupAuthObservers();
      await this.ensureModalsAvailable();
      // Respeita a seção inicial da URL (#dashboard, #products, #orders, #customers, #reports)
      this.applyInitialSectionFromHash();
      await this.enforceAdminAuth();
    } catch(err){
      console.warn('Init fallback', err);
      this.loadSampleData();
      // Em modo offline, renderiza todas as seções possíveis com dados locais
      this.renderProducts();
      this.renderCustomers();
      this.renderModeration();
      await this.loadAndRenderOrders();
      this.updateDashboard();
      this.showNotification('Falha ao conectar dados remotos. Modo local.', 'warning');
      this.updateHeaderAuthUI(false, null);
      // Mesmo em modo offline, tente injetar os modais para permitir login simulado
      await this.ensureModalsAvailable();
    }
  }

  setupAuthObservers(){
    try {
      eventBus.on('auth:stateChanged', ({ user }) => {
        this.updateHeaderAuthUI(!!user, user?.email || null);
      });
      eventBus.on('auth:login', ({ user }) => {
        this.updateHeaderAuthUI(true, user?.email || null);
      });
      eventBus.on('auth:logout', () => {
        this.updateHeaderAuthUI(false, null);
      });
    } catch {}
  }

  async ensureModalsAvailable(){
    try {
      if (document.getElementById('auth-modal')) return;
      // Se o ModalsManager global existir, ele cuida; senão, injeta diretamente
      if (window.modalsManager?.init) {
        await window.modalsManager.init();
        return;
      }
      const resp = await fetch('modern/components/modals.html');
      if (resp.ok) {
        const html = await resp.text();
        document.body.insertAdjacentHTML('beforeend', html);
      }
    } catch (e) {
      console.warn('[Admin] Falha ao garantir modais', e);
    }
  }

  async enforceAdminAuth(){
    // Dev bypass (apenas em localhost): ?adminDev=1 ou localStorage.setItem('adminDev','1')
    try {
      const qs = new URLSearchParams(window.location.search);
      const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
      const devBypass = isLocalHost && (qs.has('adminDev') || localStorage.getItem('adminDev') === '1');
      if (devBypass) {
        this.showNotification('Admin (DEV bypass): autenticação desabilitada nesta sessão.', 'warning');
        if (this.firebase.isInitialized) {
          await this.loadFirestoreData();
          await this.loadAndRenderOrders();
        } else {
          this.loadSampleData();
        }
        this.renderProducts();
        this.renderCustomers();
        this.updateDashboard();
        this.updateHeaderAuthUI(true, 'DEV');
        return;
      }
    } catch {}

    // If Firebase not available, proceed in local mode
    if (!this.firebase?.isInitialized) {
      this.showNotification('Modo offline: admin sem autenticação.', 'warning');
      // Renderiza o que for possível em modo offline
      this.renderProducts();
      this.renderCustomers();
      this.renderModeration();
      await this.loadAndRenderOrders();
      this.updateDashboard();
      return;
    }
    // Inject minimal auth overlay and wait for admin user
    const ensureOverlay = () => this.ensureLoginOverlay();
    const hideOverlay = () => this.hideLoginOverlay();
    const showUnauthorized = () => this.showUnauthorizedOverlay();

    const openUnifiedAuthModal = () => { try { window.modalsManager?.openAuthModal('login'); } catch {} };

    return new Promise((resolve)=>{
      this.firebase.onAuthStateChanged(async (user)=>{
        if (!user){
          if (!this.loginPromptShown){
            if (window.modalsManager?.openAuthModal) openUnifiedAuthModal();
            else ensureOverlay();
            this.loginPromptShown = true;
          }
          return;
        }
        try{
          const claims = await this.firebase.getIdTokenClaims(true);
          const isAdmin = !!(claims && (claims.admin === true || claims.role === 'admin'));
          // Fallbacks de produção: aceita admin por Firestore (usuarios/{uid}.role|admin, admins/{uid}, adminsByEmail/{email}, meta/admins)
          let allow = isAdmin;
          if (!allow) {
            try { allow = await this.checkAdminInFirestore(user); } catch (e) { console.warn('[Admin] Fallback admin check failed', e); }
          }
          if (!allow){ hideOverlay(); showUnauthorized(); this.updateHeaderAuthUI(false, user.email || null); return; }
          // Authorized
          hideOverlay();
          const _nameEl = document.getElementById('admin-user-name');
          if (_nameEl) _nameEl.textContent = user.email || 'Administrador';
          this.updateHeaderAuthUI(true, user.email || null);
          this.loginPromptShown = false;
          // Optional: seed sample data only if really desired; keeping off by default in admin
          // await this.firebase.initializeSampleData();
          await this.loadFirestoreData();
          await this.loadAndRenderOrders();
          this.renderProducts();
          this.renderCustomers();
          this.updateDashboard();
          resolve();
        } catch(e){
          console.warn('Auth claims check failed', e);
        }
      });
    });
  }

  // Header auth UI toggling
  updateHeaderAuthUI(isAuth, email){
    try {
      const nameEl = document.getElementById('admin-user-name');
      const btnLogin = document.getElementById('admin-login');
      const btnLogout = document.getElementById('admin-logout');
      if (nameEl) nameEl.textContent = isAuth ? (email || 'Administrador') : 'Visitante';
      if (btnLogin) btnLogin.style.display = isAuth ? 'none' : '';
      if (btnLogout) btnLogout.style.display = isAuth ? '' : 'none';
    } catch {}
  }

  // Utils: pagination + debounce
  paginate(list, {page, pageSize}){
    const total = Array.isArray(list) ? list.length : 0;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * pageSize;
    const end = start + pageSize;
    return { total, pages, current, slice: (list||[]).slice(start, end) };
  }
  renderPagination(containerId, total, pagerKey, onPage){
    const el = document.getElementById(containerId); if(!el) return;
    const pageSize = this.pagination[pagerKey].pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(this.pagination[pagerKey].page, totalPages);
    if(totalPages <= 1){ el.innerHTML=''; return; }
    const btn = (label, page, disabled=false, active=false)=>`<button class="pagination__btn ${active?'pagination__btn--active':''}" data-page="${page}" ${disabled?'disabled':''}>${label}</button>`;
    const parts=[];
    parts.push(btn('«', 1, current===1));
    parts.push(btn('‹', current-1, current===1));
    // window of pages around current
    const span=2; let from=Math.max(1,current-span); let to=Math.min(totalPages,current+span);
    if(from>1){ parts.push(`<span class="pagination__ellipsis">…</span>`); }
    for(let p=from;p<=to;p++){ parts.push(btn(String(p), p, false, p===current)); }
    if(to<totalPages){ parts.push(`<span class="pagination__ellipsis">…</span>`); }
    parts.push(btn('›', current+1, current===totalPages));
    parts.push(btn('»', totalPages, current===totalPages));
    el.innerHTML = parts.join('');
    el.querySelectorAll('[data-page]')?.forEach(b=> b.addEventListener('click', ()=>{
      const n = parseInt(b.getAttribute('data-page'),10) || 1;
      this.pagination[pagerKey].page = Math.min(Math.max(1,n), totalPages);
      onPage?.(this.pagination[pagerKey].page);
    }));
  }
  debounce(fn, delay=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=> fn.apply(this,args), delay); }; }

  ensureLoginOverlay(){
    if (document.getElementById('admin-auth-overlay')) return;
    const wrap = document.createElement('div');
    wrap.id = 'admin-auth-overlay';
    Object.assign(wrap.style, { position:'fixed', inset:'0', background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:'10000' });
    wrap.innerHTML = `
      <div style="background:#fff; padding:1rem 1.25rem; border-radius:12px; width:100%; max-width:380px; box-shadow:var(--shadow-lg);">
        <h3 style="margin:0 0 .75rem 0;">Login do Administrador</h3>
        <div class="form-group"><label>E-mail</label><input id="admin-login-email" type="email" style="width:100%; padding:.5rem; border:1px solid var(--gray-300); border-radius:8px;"></div>
        <div class="form-group" style="margin-top:.5rem"><label>Senha</label><input id="admin-login-pass" type="password" style="width:100%; padding:.5rem; border:1px solid var(--gray-300); border-radius:8px;"></div>
        <div style="margin-top:.35rem;text-align:right;"><a href="#" id="admin-forgot-link" style="font-size:.8rem;">Esqueci minha senha</a></div>
        <div id="admin-login-status" style="margin:.5rem 0; font-size:.85rem; color:var(--gray-600);"></div>
        <div style="display:flex; gap:.5rem; justify-content:flex-end; margin-top:.5rem;">
          <button id="admin-login-btn" class="btn btn--primary">Entrar</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const btn = wrap.querySelector('#admin-login-btn');
    btn?.addEventListener('click', async () => {
      const email = document.getElementById('admin-login-email')?.value?.trim();
      const pass = document.getElementById('admin-login-pass')?.value;
      const st = document.getElementById('admin-login-status');
      if (!email || !pass) { if (st) st.textContent = 'Informe e-mail e senha.'; return; }
      try {
        btn.disabled = true; if (st) st.textContent = 'Entrando...';
        await this.firebase.signIn(email, pass);
        if (st) st.textContent = 'Autenticado. Verificando permissões...';
      } catch(e){
        if (st) st.textContent = 'Falha no login: ' + (e?.message || 'erro');
        btn.disabled = false;
      }
    });
    // Handler do link de recuperação no overlay mínimo
    wrap.querySelector('#admin-forgot-link')?.addEventListener('click', async (e)=>{
      e.preventDefault();
      const st = document.getElementById('admin-login-status');
      try {
        const email = document.getElementById('admin-login-email')?.value?.trim();
        if(!email){ if(st) st.textContent='Informe o e-mail para recuperar.'; return; }
        if(!this.firebase?.isInitialized){ if(st) st.textContent='Offline: não é possível enviar.'; return; }
        await this.firebase.sendPasswordReset(email);
        if(st) st.textContent='E-mail de redefinição enviado.';
        this.showNotification('Link de redefinição enviado para seu e-mail.', 'success');
      } catch(err){
        this.showNotification('Falha ao enviar redefinição: '+(err?.message||'erro'), 'error');
      }
    });
  }

  hideLoginOverlay(){ const el = document.getElementById('admin-auth-overlay'); if (el) el.remove(); }

  showUnauthorizedOverlay(){
    let u = document.getElementById('admin-unauth-overlay');
    if (!u){
      u = document.createElement('div');
      u.id='admin-unauth-overlay';
      Object.assign(u.style,{position:'fixed',inset:'0',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:'10000'});
      u.innerHTML = `<div style="background:#fff;padding:1rem 1.25rem;border-radius:12px;max-width:420px;width:100%;text-align:center;">
        <h3>Acesso não autorizado</h3>
        <p>Seu usuário não possui permissão de administrador.</p>
        <div style="display:flex;gap:.5rem;justify-content:center;margin-top:.5rem;">
          <button id="admin-unauth-logout" class="btn btn--secondary">Sair</button>
        </div>
      </div>`;
      document.body.appendChild(u);
      u.querySelector('#admin-unauth-logout')?.addEventListener('click', async ()=>{
        try { await this.firebase.signOut(); } catch {}
        u.remove();
        this.loginPromptShown = false; // allow auth listener to show the appropriate prompt once
        this.updateHeaderAuthUI(false, null);
      });
    }
  }

  // Verificações alternativas de admin em Firestore (1–2 leituras no máximo)
  async checkAdminInFirestore(user){
    if (!this.firebase?.isInitialized) return false;
    const db = this.firebase.firestore;
    const email = String(user?.email || '').toLowerCase();
    const uid = user?.uid;
    try {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');

      // 1) usuarios/{uid} com flags admin/role
      if (uid) {
        try {
          const uref = doc(db, 'usuarios', uid);
          const usnap = await getDoc(uref);
          if (usnap.exists()) {
            const data = usnap.data() || {};
            if (data.admin === true || data.role === 'admin' || (data.roles && Array.isArray(data.roles) && data.roles.includes('admin'))) {
              console.info('[Admin] Grant by usuarios/{uid}');
              return true;
            }
          }
        } catch {}
      }

      // 2) admins/{uid}
      if (uid) {
        try {
          const aref = doc(db, 'admins', uid);
          const asnap = await getDoc(aref);
          if (asnap.exists()) {
            console.info('[Admin] Grant by admins/{uid}');
            return true;
          }
        } catch {}
      }

      // 3) adminsByEmail/{email}
      if (email) {
        try {
          const eref = doc(db, 'adminsByEmail', email);
          const esnap = await getDoc(eref);
          if (esnap.exists()) {
            console.info('[Admin] Grant by adminsByEmail/{email}');
            return true;
          }
        } catch {}
      }

      // 4) meta/admins com arrays 'uids' e/ou 'emails'
      try {
        const mref = doc(db, 'meta', 'admins');
        const msnap = await getDoc(mref);
        if (msnap.exists()) {
          const d = msnap.data() || {};
          const uids = Array.isArray(d.uids) ? d.uids : [];
          const emails = Array.isArray(d.emails) ? d.emails.map(x=>String(x).toLowerCase()) : [];
          if ((uid && uids.includes(uid)) || (email && emails.includes(email))) {
            console.info('[Admin] Grant by meta/admins');
            return true;
          }
        }
      } catch {}

      return false;
    } catch (e) {
      console.warn('[Admin] Firestore admin check error', e);
      return false;
    }
  }

  // Navigation
  setupEventListeners(){
    document.querySelectorAll('.admin-nav__link').forEach(a=> a.addEventListener('click',e=>{
      e.preventDefault();
      const sec = a.dataset.section;
      this.showSection(sec);
      // Reflete a seção na URL para facilitar recarregamento e compartilhamento
      try { window.history.replaceState({}, '', `#${sec}`); } catch {}
    }));
    // Suporta navegação via hash (ex.: voltar/avançar do navegador)
    window.addEventListener('hashchange', ()=> this.applyInitialSectionFromHash());
    // Header auth buttons
    document.getElementById('admin-login')?.addEventListener('click', ()=>{
      try { window.modalsManager?.openAuthModal('login'); } catch {}
      // Fallback overlay mínimo
      if (!window.modalsManager) this.ensureLoginOverlay();
    });
  // Link de recuperação no modal principal de autenticação
  document.addEventListener('click', async (ev)=>{
    const a = ev.target?.closest?.('#auth-forgot-link');
    if (!a) return;
    ev.preventDefault();
    try {
      const email = document.getElementById('auth-email')?.value?.trim();
      if (!email) { this.showNotification('Informe seu e-mail para recuperar a senha.', 'warning'); return; }
      if (!this.firebase?.isInitialized) { this.showNotification('Modo offline: não é possível enviar recuperação.', 'warning'); return; }
      await this.firebase.sendPasswordReset(email);
      this.showNotification('Enviamos um link de redefinição para o seu e-mail.', 'success');
    } catch(e){
      this.showNotification(e?.message || 'Falha ao enviar e-mail de redefinição.', 'error');
    }
  });
  document.getElementById('add-product-btn')?.addEventListener('click',()=> this.showProductModal());
  document.getElementById('product-form')?.addEventListener('submit',e=> this.handleProductSubmit(e));
  const debouncedProducts = this.debounce(()=>{ this.pagination.products.page=1; this.filterProducts(); }, 250);
  document.getElementById('products-search')?.addEventListener('input', debouncedProducts);
  document.getElementById('category-filter')?.addEventListener('change', ()=>{ this.pagination.products.page=1; this.filterProducts(); });
  document.getElementById('orders-status-filter')?.addEventListener('change',()=>{ this.pagination.orders.page=1; this.renderOrders(); });
    document.getElementById('admin-logout')?.addEventListener('click', ()=> this.handleLogout());
    this.setupProductModalEvents();
    // Moderation
  document.getElementById('moderation-refresh')?.addEventListener('click', ()=> this.loadAndRenderModeration());
  const debouncedModeration = this.debounce(()=>{ this.pagination.moderation.page=1; this.renderModeration(); }, 250);
  document.getElementById('moderation-search')?.addEventListener('input', debouncedModeration);
  // Admin section events
  document.getElementById('admin-grant-form')?.addEventListener('submit', (e)=> this.handleAdminGrantSubmit(e));
  document.getElementById('admin-requests-refresh')?.addEventListener('click', ()=> this.loadAndRenderAdminRequests());
  }
  // Lê o hash atual e mostra a seção correspondente
  applyInitialSectionFromHash(){
    try {
      const raw = (window.location.hash || '').replace(/^#/, '').trim();
  const allowed = new Set(['dashboard','products','orders','customers','reports','moderation','admin']);
      const sec = allowed.has(raw) ? raw : (this.currentSection || 'dashboard');
      this.showSection(sec);
    } catch {}
  }
  showSection(id){
    document.querySelectorAll('.admin-nav__link').forEach(a=>a.classList.remove('admin-nav__link--active'));
    document.querySelector(`[data-section="${id}"]`)?.classList.add('admin-nav__link--active');
    document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('admin-section--active'));
    document.getElementById(`${id}-section`)?.classList.add('admin-section--active');
    this.currentSection=id;
    // Ao trocar de seção, garante a renderização/carregamento necessário
    try{
      if(id==='products') this.filterProducts();
      if(id==='moderation') this.loadAndRenderModeration();
      if(id==='orders') this.loadAndRenderOrders();
      if(id==='customers') this.renderCustomers();
      if(id==='dashboard') this.updateDashboard();
      if(id==='admin') this.loadAndRenderAdminRequests();
    } catch(e){ console.warn('Erro ao preparar seção', id, e); }
  }

  // Product modal
  setupProductModalEvents(){
    const modal=document.getElementById('product-modal'); if(!modal) return;
    const hide=()=>{ modal.classList.remove('active'); document.body.style.overflow=''; this.resetProductForm(); };
    document.getElementById('product-modal-close')?.addEventListener('click',hide);
    document.getElementById('product-cancel')?.addEventListener('click',hide);
    modal.querySelector('.modal__backdrop')?.addEventListener('click',hide);
  }
  showProductModal(product=null){
    const modal=document.getElementById('product-modal'); const title=document.getElementById('product-modal-title'); if(!modal||!title) return;
    this.editingProduct=product; title.textContent = product? 'Editar Produto':'Adicionar Produto';
    product? this.fillProductForm(product): this.resetProductForm();
    modal.classList.add('active'); document.body.style.overflow='hidden';
  }
  fillProductForm(p){
    document.getElementById('product-name').value=p.name||'';
    document.getElementById('product-category').value=p.category||'';
    document.getElementById('product-price').value=p.price||'';
    document.getElementById('product-stock').value=p.stock||'';
    document.getElementById('product-description').value=p.description||'';
    document.getElementById('product-status').value=p.status||'active';
    document.getElementById('product-featured').checked=!!p.featured;
  }
  resetProductForm(){ document.getElementById('product-form')?.reset(); this.editingProduct=null; }

  // Data
  async loadFirestoreData(){
    if(!this.firebase.isInitialized) return;
    const rawProducts = await this.firebase.getProducts();
    this.products = this.mapAdminProducts(rawProducts);
    this.clients = await this.firebase.getClients();
    // Se não carregou clientes, provavelmente falta login admin ou regras bloqueiam leitura
    if (!this._hintsShown.clients && (!Array.isArray(this.clients) || this.clients.length===0)){
      this._hintsShown.clients = true;
      const logged = !!this.firebase.getCurrentUser();
      this.showNotification(logged
        ? 'Nenhum cliente carregado. Verifique as regras do Firestore e a coleção usuarios/clientes.'
        : 'Faça login como administrador para visualizar clientes (ou ajuste as regras do Firestore).',
        'warning');
    }
    await this.loadAndRenderModeration();
    await this.loadAndRenderAdminRequests();
  }

  mapAdminProducts(list){
    return (Array.isArray(list)? list: []).map(p=>{
      const price = p.price ?? p.precoComDesconto ?? p.valorComDesconto ?? p.preco ?? p.precoMaximo ?? 0;
      const stock = p.stock ?? p.quantidade ?? 0;
      const name = p.name || p.nome || 'Produto';
      const description = p.description || p.descricao || '';
      const category = p.category || p.categoria || 'outros';
      const status = p.status || ((p.ativo === false)? 'inactive' : 'active');
      const featured = p.featured ?? p.destaque ?? false;
      const publicado = (p.publicado !== false);
      const pendente = (p.pendente === true);
      const motivos = Array.isArray(p.motivosBloqueio)? p.motivosBloqueio: [];
      const codRed = p.codRed || p.codigo || p.id;
      return { id:p.id, codRed, name, description, category, price:Number(price)||0, stock:Number(stock)||0, status, featured, publicado, pendente, motivos };
    });
  }

  // Dashboard
  updateDashboard(){
    const totalSales = this.orders.reduce((s,o)=> s + (o.totals?.total||0),0);
    const activeProducts = this.products.filter(p=>p.status==='active').length;
    this.updateDashboardCard('sales-value', 'R$ '+ totalSales.toFixed(2).replace('.',','));
    this.updateDashboardCard('orders-count', this.orders.length);
    this.updateDashboardCard('products-count', activeProducts);
    this.updateDashboardCard('clients-count', this.clients.length);
  }
  updateDashboardCard(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

  // Product CRUD
  async handleProductSubmit(e){
    e.preventDefault();
    const fd=new FormData(e.target);
    const product={ name:fd.get('name'), category:fd.get('category'), price:parseFloat(fd.get('price')), stock:parseInt(fd.get('stock')), description:fd.get('description'), status:fd.get('status'), featured:fd.has('featured'), updatedAt:new Date().toISOString() };
    try {
      if(this.editingProduct){
        await this.firebase.updateProduct(this.editingProduct.id, product);
        const idx=this.products.findIndex(p=>p.id===this.editingProduct.id); if(idx>-1) this.products[idx]={...this.editingProduct,...product};
        this.showNotification('Produto atualizado','success');
      } else {
        product.createdAt=new Date().toISOString();
        const id=await this.firebase.addProduct(product); this.products.push({id,...product});
        this.showNotification('Produto adicionado','success');
      }
      document.getElementById('product-modal')?.classList.remove('active'); document.body.style.overflow='';
      this.resetProductForm(); this.renderProducts(); this.updateDashboard();
    }catch(err){ console.error(err); this.showNotification('Erro ao salvar produto','error'); }
  }
  editProduct(id){ const p=this.products.find(x=>x.id===id); if(p) this.showProductModal(p); }
  async deleteProduct(id){ if(!confirm('Excluir produto?')) return; try { await this.firebase.deleteProduct(id); this.products=this.products.filter(p=>p.id!==id); this.renderProducts(); this.updateDashboard(); this.showNotification('Produto excluído','success'); } catch(e){ this.showNotification('Erro ao excluir','error'); } }
  async toggleProductStatus(id){ const p=this.products.find(pr=>pr.id===id); if(!p) return; const ns=p.status==='active'?'inactive':'active'; try { await this.firebase.updateProduct(id,{status:ns,updatedAt:new Date().toISOString()}); p.status=ns; this.renderProducts(); this.updateDashboard(); } catch(e){ this.showNotification('Erro status','error'); } }

  // Products list
  filterProducts(){
    const term=(document.getElementById('products-search')?.value||'').toLowerCase();
    const cat=document.getElementById('category-filter')?.value||'';
    let list=[...this.products];
    if(term) list=list.filter(p=> (p.name||'').toLowerCase().includes(term) || (p.description||'').toLowerCase().includes(term));
    if(cat) list=list.filter(p=> p.category===cat);
    this.renderProducts(list);
  }
  renderProducts(list=null){
    const tbody=document.getElementById('products-table-body'); if(!tbody) return; const full=list||this.products;
    if(!full.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:1rem;color:var(--gray-500);">Nenhum produto</td></tr>'; document.getElementById('products-pagination')?.replaceChildren(); return; }
    const pageData = this.paginate(full, this.pagination.products);
    if (this.pagination.products.page !== pageData.current) this.pagination.products.page = pageData.current;
    const data = pageData.slice;
    tbody.innerHTML=data.map(p=>`<tr>
      <td><div class="product-image">${this.getCategoryIcon(p.category)}</div></td>
      <td><strong>${esc(p.name||'Produto')}</strong><br><small style="color:var(--gray-500);">${esc(p.description||'—')}</small></td>
      <td>${this.getCategoryName(p.category)}</td>
      <td>R$ ${(Number(p.price)||0).toFixed(2).replace('.',',')}</td>
      <td>${Number(p.stock)||0}</td>
      <td><span class="status status--${p.status}">${p.status==='active'?'Ativo':'Inativo'}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn-icon" onclick="adminApp.editProduct('${p.id}')">✏️</button>
        <button class="btn-icon" onclick="adminApp.toggleProductStatus('${p.id}')">${p.status==='active'?'🔒':'🔓'}</button>
        <button class="btn-icon" onclick="adminApp.deleteProduct('${p.id}')">🗑️</button>
      </td>
    </tr>`).join('');
    this.renderPagination('products-pagination', full.length, 'products', ()=> this.renderProducts(full));
  }

  // Moderation (validation)
  async loadAndRenderModeration(){
    // Reuse loaded products; optionally refetch if needed
    this.renderModeration();
  }
  getModerationItems(){
    const term=(document.getElementById('moderation-search')?.value||'').toLowerCase();
    let items = this.products.filter(p=> p.pendente===true || p.publicado===false);
    if (term) items = items.filter(p=> (p.name||'').toLowerCase().includes(term) || String(p.codRed||'').includes(term));
    return items;
  }
  renderModeration(){
    const tbody=document.getElementById('moderation-table-body'); if(!tbody) return;
    const full=this.getModerationItems();
    if(!full.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--gray-500);">Nenhum item pendente</td></tr>';
      document.getElementById('moderation-pagination')?.replaceChildren();
      // Dica: esta lista depende de flags pendente/publicado nos produtos
      if (!this._hintsShown.moderation && Array.isArray(this.products) && this.products.length){
        this._hintsShown.moderation = true;
        this.showNotification('Validação vazia: somente produtos com pendente=true ou publicado=false aparecem aqui.', 'info');
      }
      return;
    }
    const pageData = this.paginate(full, this.pagination.moderation);
    if (this.pagination.moderation.page !== pageData.current) this.pagination.moderation.page = pageData.current;
    const data = pageData.slice;
    tbody.innerHTML = data.map(p=>`<tr>
      <td>${esc(p.codRed||p.id)}</td>
      <td><strong>${esc(p.name||'-')}</strong>${p.pendente? ' <span class="status status--inactive">pendente</span>':''}${p.publicado===false? ' <span class="status status--inactive">não publicado</span>':''}</td>
      <td>R$ ${(Number(p.price)||0).toFixed(2).replace('.',',')}</td>
      <td>${Number(p.stock)||0}</td>
      <td>${esc((p.motivos||[]).join(', ')||'—')}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn--primary" data-action="approve" data-id="${p.id}">Publicar</button>
        <button class="btn btn--secondary" data-action="keepblocked" data-id="${p.id}">Manter bloqueado</button>
      </td>
    </tr>`).join('');
    tbody.querySelectorAll('button[data-action]')
      .forEach(btn=> btn.addEventListener('click', ()=> this.handleModerationAction(btn.getAttribute('data-action'), btn.getAttribute('data-id'))));
    this.renderPagination('moderation-pagination', full.length, 'moderation', ()=> this.renderModeration());
  }
  async handleModerationAction(action, id){
    const p = this.products.find(x=>x.id===id); if(!p) return;
    try{
      if(action==='approve'){
        await this.firebase.updateProduct(id, { publicado:true, pendente:false, updatedAt:new Date().toISOString() });
        p.publicado=true; p.pendente=false; p.motivos=[];
        this.showNotification('Produto publicado','success');
      } else if(action==='keepblocked'){
        await this.firebase.updateProduct(id, { publicado:false, pendente:true, updatedAt:new Date().toISOString() });
        p.publicado=false; p.pendente=true;
        this.showNotification('Mantido como bloqueado','info');
      }
      this.renderModeration();
      this.renderProducts();
    }catch(e){
      console.error(e); this.showNotification('Falha na validação','error');
    }
  }
  getCategoryIcon(c){ return ({medicamentos:'💊',dermocosmeticos:'💄',suplementos:'💪',higiene:'🧼',bebes:'👶',equipamentos:'🩺'})[c]||'📦'; }
  getCategoryName(c){ const names={medicamentos:'Medicamentos',dermocosmeticos:'Dermocosméticos',suplementos:'Suplementos',higiene:'Higiene',bebes:'Bebês',equipamentos:'Equipamentos'}; return names[c]||c; }

  // Orders
  async loadAndRenderOrders(force=false){
    if(this.ordersLoaded && !force) return;
    this.orders = [];
    // 1) Tenta Firestore se disponível
    if(this.firebase?.isInitialized){
      try {
        this.orders = await this.firebase.listOrders({ limit:200 });
        console.debug('[Admin] Pedidos Firestore carregados:', this.orders.length);
      } catch(e){
        console.warn('[Admin] Falha ao buscar pedidos Firestore', e);
        this.orders = [];
      }
    }
    // Fallback: mostrar último pedido local (checkout) se nenhum no Firestore
    if(!this.orders.length){
      try {
        const raw = localStorage.getItem('last_order');
        if(raw){
          const localOrder = JSON.parse(raw);
            if(localOrder){
              // Ajusta para formato esperado
        if(!localOrder._docId) localOrder._docId = 'local-'+localOrder.id;
              this.orders = [ localOrder ];
              this.showNotification('Mostrando pedido local (nenhum no Firestore).','warning');
              console.info('[Admin] Usando fallback last_order do localStorage');
            }
        }
      } catch(err){ console.warn('Fallback last_order falhou', err); }
    }
    this.ordersLoaded = true;
    this.renderOrders();
  }
  formatDate(iso){ try { const d=new Date(iso); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});} catch{return iso;} }
  getOrderStatusLabel(s){ return ({pending:'Pendente',processing:'Processando',shipped:'Enviado',delivered:'Entregue',cancelled:'Cancelado'})[s]||s; }
  nextStatus(s){ const flow=['pending','processing','shipped','delivered']; const i=flow.indexOf(s); return (i>-1 && i<flow.length-1)?flow[i+1]:null; }
  renderOrders(){
    const tbody=document.getElementById('orders-table-body'); if(!tbody) return;
    const filter=document.getElementById('orders-status-filter')?.value||'';
    let full=[...this.orders];
    if(filter) full=full.filter(o=>o.status===filter);
    if(!full.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:1rem;color:var(--gray-500);">Nenhum pedido'+(filter?' filtrado':'')+'</td></tr>';
      document.getElementById('orders-pagination')?.replaceChildren();
      this.updateDashboard();
      // Ajuda contextual quando não houver pedidos por falta de permissão/login
      if (!this._hintsShown.orders){
        this._hintsShown.orders = true;
        const logged = !!(this.firebase?.isInitialized && this.firebase.getCurrentUser());
        this.showNotification(logged
          ? 'Nenhum pedido carregado. Verifique se existem documentos em pedidos/orders e se as regras permitem leitura.'
          : 'Faça login como administrador para visualizar pedidos (ou ajuste as regras do Firestore).',
          'warning');
      }
      return;
    }
    const pageData=this.paginate(full, this.pagination.orders);
    if(this.pagination.orders.page!==pageData.current) this.pagination.orders.page=pageData.current;
    const list=pageData.slice;
    tbody.innerHTML=list.map(o=>`<tr>
      <td>#${esc(o.id)}</td>
      <td>${esc(o.user||'-')}</td>
      <td>${this.formatDate(o.createdAt)}</td>
      <td>R$ ${(o.totals?.total||0).toFixed(2).replace('.',',')}</td>
      <td><span class="status status--${esc(o.status)}">${this.getOrderStatusLabel(o.status)}</span></td>
      <td style="display:flex;gap:.35rem;">
        <button class="btn-icon" data-action="view" data-id="${esc(o._docId)}">👁️</button>
        <button class="btn-icon" data-action="advance" data-id="${esc(o._docId)}">⏭️</button>
        <button class="btn-icon" title="WhatsApp" data-action="whatsapp" data-id="${esc(o._docId)}">💬</button>
      </td>
    </tr>`).join('');
    tbody.querySelectorAll('button[data-action]')
      .forEach(btn=> btn.addEventListener('click',()=>{
        const id=btn.getAttribute('data-id');
        const action=btn.getAttribute('data-action');
        const order=this.orders.find(o=>o._docId===id);
        if(!order) return;
        if(action==='view') this.showOrderDetail(order);
        if(action==='advance') this.advanceOrderStatus(order);
        if(action==='whatsapp') this.openWhatsAppModal(order);
      }));
    this.updateDashboard();
    this.renderPagination('orders-pagination', full.length, 'orders', ()=> this.renderOrders());
  }
  async advanceOrderStatus(order){ const next=this.nextStatus(order.status); if(!next){ this.showNotification('Status final','warning'); return; } if(!confirm(`Avançar pedido #${order.id} para ${this.getOrderStatusLabel(next)}?`)) return; try { await this.firebase.updateOrderStatus(order._docId,next,'Avanço manual'); order.status=next; (order.history=order.history||[]).push({status:next,at:new Date().toISOString(),note:'Avanço manual (admin)'}); this.renderOrders(); this.showNotification('Status atualizado','success'); } catch(e){ this.showNotification('Falha status','error'); } }
  showOrderDetail(order){ let modal=document.getElementById('order-detail-modal'); if(!modal){ modal=document.createElement('div'); modal.id='order-detail-modal'; Object.assign(modal.style,{position:'fixed',inset:'0',background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:'10000'}); modal.innerHTML=`<div style="background:var(--white);padding:1rem 1.25rem;max-width:640px;width:100%;border-radius:12px;max-height:80vh;overflow:auto;box-shadow:var(--shadow-lg);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
          <h3 style="margin:0;">Pedido #<span id="od-id"></span></h3>
          <button id="od-close" style="background:none;border:none;font-size:1rem;cursor:pointer;">❌</button>
        </div>
        <div id="od-body" style="margin-top:.75rem;font-size:.85rem;line-height:1.4;"></div>
      </div>`; document.body.appendChild(modal); modal.addEventListener('click',e=>{ if(e.target===modal) modal.remove(); }); modal.querySelector('#od-close').addEventListener('click',()=> modal.remove()); }
    modal.querySelector('#od-id').textContent=order.id; const body=modal.querySelector('#od-body'); const itemsHTML=(order.items||[]).map(i=>`<li>${esc(i.quantity)}x ${esc(i.name)} <small>R$ ${(i.price||0).toFixed(2).replace('.',',')}</small></li>`).join(''); const histHTML=(order.history||[]).map(h=>`<li>${this.getOrderStatusLabel(h.status)} - <small>${this.formatDate(h.at)}</small> ${h.note?`<em>${esc(h.note)}</em>`:''}</li>`).join(''); body.innerHTML=`<p><strong>Status:</strong> ${this.getOrderStatusLabel(order.status)}</p>
      <p><strong>Cliente:</strong> ${esc(order.user||'-')}</p>
      <p><strong>Data:</strong> ${this.formatDate(order.createdAt)}</p>
      <p><strong>Total:</strong> R$ ${(order.totals?.total||0).toFixed(2).replace('.',',')}</p>
      <p><strong>Pagamento:</strong> ${esc(order.paymentMethod)}${order.installments?` (${esc(order.installments.count)}x)`:''}</p>
      <p><strong>Endereço:</strong> ${esc(order.address?.street)}, ${esc(order.address?.number)} - ${esc(order.address?.city)}/${esc(order.address?.state)}</p>
      <div style="margin:.5rem 0;"><strong>Itens:</strong><ul style="margin:.25rem 0 .5rem 1.1rem;">${itemsHTML}</ul></div>
      <div style="margin:.5rem 0;"><strong>Histórico:</strong><ul style="margin:.25rem 0 .5rem 1.1rem;">${histHTML}</ul></div>
      ${this.nextStatus(order.status)?`<button id="od-advance" class="btn btn--primary">Avançar para ${this.getOrderStatusLabel(this.nextStatus(order.status))}</button>`:''}
      <button id="od-whatsapp" class="btn btn--secondary" style="margin-left:.5rem">Enviar WhatsApp</button>`;
    if(this.nextStatus(order.status)) body.querySelector('#od-advance').addEventListener('click',()=>{ this.advanceOrderStatus(order); modal.remove(); });
    const waBtn = body.querySelector('#od-whatsapp'); if (waBtn) waBtn.addEventListener('click',()=>{ this.openWhatsAppModal(order); }); }

  // ===== WhatsApp Messaging (manual) =====
  findClientForOrder(order){
    try{
      const email = (order?.user || '').toLowerCase();
      const uid = order?.userId || order?.uid || null;
      // Prefer uid match
      let c = null;
      if (uid) c = (this.clients||[]).find(x=> x.id === uid);
      // Fallback by email
      if (!c && email) c = (this.clients||[]).find(x=> String(x.email||'').toLowerCase() === email);
      return c || null;
    } catch { return null; }
  }
  getOrderCustomerPhone(order){
    // Prefer Firebase profile (clientes/usuarios)
    const client = this.findClientForOrder(order);
    const raw = client?.phone || client?.telefone || order?.address?.phone || order?.phone || '';
    let digits = String(raw||'').replace(/\D/g,'');
    // If already includes country code (e.g., starts with 55 and length 12/13) keep
    if (digits.startsWith('55')) return digits;
    // Brazilian local numbers usually 10 or 11 digits (DDD + number). Prepend 55.
    if (digits.length >= 10 && digits.length <= 11) digits = '55'+digits;
    return digits;
  }
  getOrderCustomerName(order){
    const client = this.findClientForOrder(order);
    const nome = client?.name || client?.nome || client?.displayName || order?.address?.name || order?.name || '';
    if (nome) return nome;
    // Fallback: use email local-part as a friendly name
    const email = order?.user || '';
    const local = email.includes('@') ? email.split('@')[0] : '';
    return local || 'Cliente';
  }
  getReviewLink(){
    // Central configurable review link (could move to remote config later)
    return 'https://g.page/r/CdbJtDrB_SSkEBM/review';
  }
  buildWhatsAppTemplates(order){
    const id = order.orderNumber || order.id;
    const nome = this.getOrderCustomerName(order);
    const reviewLink = this.getReviewLink();
    const fmt = (v)=> 'R$ '+(Number(v)||0).toFixed(2).replace('.', ',');
    const items = Array.isArray(order.items) ? order.items : [];
    const lines = items.map(i=>`• ${i.quantity}x ${i.name} — ${fmt((Number(i.price)||0)*(Number(i.quantity)||0))}`).join('\n');
    const pay = order.installments && order.installments.count ? `${order.paymentMethod} (${order.installments.count}x)` : (order.paymentMethod||'');
    const total = fmt(order.totals?.total||0);
    return {
      pending: `Olá ${nome}! Recebemos seu pedido #${id} e estamos conferindo o estoque para separação.\n\nResumo da compra:\n${lines}\nTotal: ${total}${pay?`\nPagamento: ${pay}`:''}\n\nAssim que estiver pronto avisaremos por aqui. Qualquer dúvida estamos à disposição.`,
      processing: `Atualização do pedido: itens separados e preparando envio. Logo sairá para a entrega. Obrigado pela confiança!`,
      shipped: `Seu pedido saiu para entrega 🚚. Em breve chegará até você. Caso precise, responda esta mensagem.`,
      delivered: `Pedido entregue! Esperamos que tenha gostado. Pode avaliar sua experiência? ${reviewLink} Obrigado pela compra!`
    };
  }
  openWhatsAppModal(order){
    let modal = document.getElementById('wa-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id='wa-modal';
      Object.assign(modal.style,{position:'fixed',inset:'0',background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:'10002'});
      modal.innerHTML = `<div style="background:#fff;padding:1rem 1.25rem;border-radius:12px;max-width:520px;width:100%;box-shadow:var(--shadow-lg);font-size:.85rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
          <h3 style="margin:0;">Mensagem WhatsApp</h3>
          <button id="wa-close" style="background:none;border:none;cursor:pointer;font-size:1rem;">❌</button>
        </div>
        <div id="wa-body" style="margin-top:.75rem;display:flex;flex-direction:column;gap:.75rem;"></div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
      modal.querySelector('#wa-close').addEventListener('click',()=> modal.remove());
    }
    const phone = this.getOrderCustomerPhone(order);
    const templates = this.buildWhatsAppTemplates(order);
    const current = order.status;
    const body = modal.querySelector('#wa-body');
    const renderTemplateRow = (key,label,text)=>`
      <div class="wa-row" data-wa-item="${key}" style="border:1px solid var(--gray-200);padding:.6rem;border-radius:8px;display:flex;flex-direction:column;gap:.5rem;background:var(--gray-50);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <strong style="font-size:.75rem;text-transform:uppercase;">${label}</strong>
          <div style="display:flex;gap:.35rem;">
            <button class="btn btn--secondary" data-wa="copy" data-key="${key}" style="font-size:.65rem;padding:.35rem .5rem;">Copiar</button>
            <button class="btn btn--primary" data-wa="send" data-key="${key}" style="font-size:.65rem;padding:.35rem .5rem;">Abrir WhatsApp</button>
          </div>
        </div>
        <textarea readonly style="width:100%;min-height:70px;font-size:.75rem;border:1px solid var(--gray-300);border-radius:6px;padding:.4rem;background:#fff;resize:vertical;">${esc(text)}</textarea>
      </div>`;
    const statusLabelMap = { pending:'Confirmação', processing:'Separação', shipped:'Saiu para Entrega', delivered:'Recebido'};
    // Decide which templates to show: current + next stage proactive
    const keys = [current];
    const next = this.nextStatus(current); if (next) keys.push(next);
    // Always allow final delivered template for manual resend
    if(!keys.includes('delivered')) keys.push('delivered');
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.5rem;">
        <label style="font-size:.75rem;color:var(--gray-600);">Telefone do cliente (ajuste se necessário)</label>
        <input id="wa-phone" value="${esc(phone)}" style="width:100%;padding:.45rem .6rem;border:1px solid var(--gray-300);border-radius:8px;font-size:.85rem;" />
        <small style="color:var(--gray-500);">Usar formato internacional sem símbolos. Ex: 55DDDNÚMERO</small>
      </div>
      <div style="display:flex;flex-direction:column;gap:.75rem;">${keys.map(k=> renderTemplateRow(k,statusLabelMap[k]||k, templates[k])).join('')}</div>
    `;
    // Wire copy/send
    body.querySelectorAll('button[data-wa]')?.forEach(btn=>{
      btn.addEventListener('click',()=>{
        const action = btn.getAttribute('data-wa');
        const key = btn.getAttribute('data-key');
        const row = btn.closest('[data-wa-item]');
        const txtArea = row ? row.querySelector('textarea') : null;
        const phoneInput = modal.querySelector('#wa-phone');
        const dest = String(phoneInput.value||'').replace(/\D/g,'');
        const message = txtArea?.value || '';
        if(action==='copy'){
          const doCopy = async () => {
            try {
              if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(message);
                return true;
              }
            } catch(_) {}
            // Fallback
            try {
              const ta = document.createElement('textarea');
              ta.value = message;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              const ok = document.execCommand('copy');
              document.body.removeChild(ta);
              return ok;
            } catch (_) { return false; }
          };
          doCopy().then(ok=>{
            this.showNotification(ok?'Mensagem copiada.':'Falha ao copiar.','success');
          });
        }
        if(action==='send'){
          if(!dest){ this.showNotification('Telefone inválido.','warning'); return; }
          const url = `https://wa.me/${dest}?text=${encodeURIComponent(message)}`;
          window.open(url,'_blank');
        }
      });
    });
  }

  // Customers
  renderCustomers(list=null){
    // Find the customers table body within the customers section
    const section = document.getElementById('customers-section');
    const tbody = section?.querySelector('tbody');
    if(!tbody) return;
    const data = list || this.clients || [];
    if(!data.length){
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--gray-500);">Nenhum cliente encontrado</td></tr>';
      return;
    }
    const getName = (c)=> c.name || c.nome || c.displayName || '—';
    const getEmail = (c)=> c.email || '—';
    const getPhone = (c)=> c.phone || c.telefone || '—';
    const getCreated = (c)=> c.createdAt ? this.formatDate(c.createdAt) : '—';
    const ordersCountFor = (c)=> this.orders.filter(o => (o.userId && c.id && o.userId===c.id) || (o.user && getEmail(c) && String(o.user).toLowerCase()===String(getEmail(c)).toLowerCase())).length;
    tbody.innerHTML = data.map(c=>`
      <tr>
        <td>${esc(getName(c))}</td>
        <td>${esc(getEmail(c))}</td>
        <td>${esc(getPhone(c))}</td>
        <td>${getCreated(c)}</td>
        <td>${ordersCountFor(c)}</td>
        <td>
          <button class="btn-icon" title="Ver perfil" data-action="view" data-id="${esc(c.id)}">👁️</button>
          <button class="btn-icon" title="Editar" data-action="edit" data-id="${esc(c.id)}">✏️</button>
        </td>
      </tr>`).join('');
    // Minimal actions wiring (placeholder)
    tbody.querySelectorAll('button[data-action]')
      .forEach(btn => btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const c = this.clients.find(x=>x.id===id);
        if(!c) return;
        if(action==='view') this.showNotification(`Cliente: ${getName(c)} <${getEmail(c)}>`, 'info');
        if(action==='edit') this.showNotification('Edição de cliente em breve.', 'warning');
      }));
  }

  // ======= Admin (grant/revoke) =======
  async handleAdminGrantSubmit(e){
    e.preventDefault();
    try{
      const email = document.getElementById('admin-target-email')?.value?.trim().toLowerCase();
      const action = document.getElementById('admin-action')?.value || 'grant';
      if(!email){ this.showNotification('Informe um e-mail válido.','warning'); return; }
      if(!this.firebase?.isInitialized){ this.showNotification('Modo offline.','warning'); return; }
      const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const col = collection(this.firebase.firestore, 'adminRequests');
      const user = this.firebase.getCurrentUser();
      const payload = {
        email,
        action: (action==='revoke'?'revoke':'grant'),
        status: 'pending',
        requestedBy: user?.uid || null,
        requestedByEmail: user?.email || null,
        createdAt: new Date().toISOString(),
        createdAtTs: serverTimestamp()
      };
      await addDoc(col, payload);
      this.showNotification('Solicitação registrada. Aguarde processamento.','success');
      document.getElementById('admin-grant-form')?.reset();
      await this.loadAndRenderAdminRequests();
    }catch(err){
      console.error(err);
      this.showNotification('Falha ao registrar solicitação.','error');
    }
  }

  async loadAndRenderAdminRequests(){
    if(!this.firebase?.isInitialized) return;
    try{
      const { collection, getDocs, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const col = collection(this.firebase.firestore, 'adminRequests');
      let q = null;
      try{ q = query(col, orderBy('createdAtTs','desc'), limit(50)); }
      catch{ q = query(col, limit(50)); }
      const snap = await getDocs(q);
      const items = [];
      snap.forEach(d=> items.push(Object.assign({ id:d.id }, d.data())));
      this.renderAdminRequests(items);
    }catch(e){ console.warn('adminRequests load fail', e); this.renderAdminRequests([]); }
  }

  renderAdminRequests(list){
    const tbody = document.getElementById('admin-requests-table-body'); if(!tbody) return;
    if(!Array.isArray(list) || !list.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:1rem;color:var(--gray-500);">Nenhuma solicitação</td></tr>'; return; }
    tbody.innerHTML = list.map(r=>{
      const created = r.createdAt || '-';
      const processed = r.processedAt || '-';
      const result = r.result || r.error || '-';
      const st = String(r.status||'pending');
      const statusCls = st==='done'?'status--active':(st==='failed'?'status--cancelled':'status--pending');
      return `<tr>
        <td><span class="status ${statusCls}">${esc(st)}</span></td>
        <td>${esc(r.action||'-')}</td>
        <td>${esc(r.email||'-')}</td>
        <td>${esc(r.requestedByEmail||r.requestedBy||'-')}</td>
        <td>${esc(created)}</td>
        <td>${esc(processed)}</td>
        <td>${esc(result)}</td>
      </tr>`;
    }).join('');
  }

  // Sample data fallback
  loadSampleData(){ this.products=[{id:'1',name:'Dipirona 500mg',category:'medicamentos',price:8.90,stock:50,description:'20 comprimidos',status:'active'},{id:'2',name:'Protetor Solar FPS 60',category:'dermocosmeticos',price:45.90,stock:25,description:'FPS 60',status:'active'}]; this.clients=[{id:'c1',name:'Maria',email:'maria@example.com'}]; }
  async handleLogout(){
    if(!confirm('Sair do painel?')) return;
    try { if (this.firebase?.isInitialized) await this.firebase.signOut(); } catch {}
    this.showNotification('Logout efetuado','success');
    setTimeout(()=>{ window.location='index.html'; },800);
  }

  // Notifications
  showNotification(msg,type='info'){ const n=document.createElement('div'); n.className=`notification notification--${type}`; n.innerHTML=`<div class="notification__content"><span>${this.getNotificationIcon(type)}</span><span>${msg}</span><button class="notification__close">❌</button></div>`; this.addNotificationStyles(); document.body.appendChild(n); setTimeout(()=> n.classList.add('show'),30); n.querySelector('.notification__close')?.addEventListener('click',()=> this.hideNotification(n)); setTimeout(()=> this.hideNotification(n),4500); return n; }
  hideNotification(n){ n.classList.remove('show'); setTimeout(()=> n.remove(),300); }
  getNotificationIcon(t){ return ({success:'✅',error:'❌',warning:'⚠️'})[t]||'ℹ️'; }
  addNotificationStyles(){ if(document.getElementById('admin-notification-styles')) return; const s=document.createElement('style'); s.id='admin-notification-styles'; s.textContent=`.notification{position:fixed;top:1rem;right:1rem;background:var(--white);padding:.75rem 1rem;border-radius:10px;box-shadow:var(--shadow-lg);transform:translateX(120%);transition:transform .3s;display:flex;gap:.5rem;z-index:10000;min-width:280px;} .notification.show{transform:translateX(0);} .notification--success{border-left:4px solid var(--success-color);} .notification--error{border-left:4px solid var(--error-color);} .notification--warning{border-left:4px solid var(--warning-color);} .notification--info{border-left:4px solid var(--primary-color);} .notification__content{display:flex;align-items:center;gap:.5rem;width:100%;} .notification__content span:nth-child(2){flex:1;} .notification__close{background:none;border:none;cursor:pointer;font-size:.9rem;}`; document.head.appendChild(s); }
}

document.addEventListener('DOMContentLoaded', ()=> { window.adminApp=new AdminApp(); });

export default AdminApp;