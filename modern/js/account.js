import ComponentLoader from './services/component-loader.js';
import { bootstrap } from './bootstrap.js';
import { eventBus } from './services/event-bus.js';

const loader = new ComponentLoader();

function renderLoggedOut(root){
  root.innerHTML = `
    <div class="card" style="max-width:720px">
      <div class="card__content">
        <h2 class="card__title"><i class="fas fa-lock"></i> Faça login para acessar sua conta</h2>
        <p class="card__text">Entre para ver seus dados e acompanhar seus pedidos.</p>
        <div class="card__actions">
          <button id="btn-open-login" class="btn btn--primary"><i class="fas fa-sign-in-alt"></i> Entrar</button>
          <a href="index.html" class="btn btn--secondary">Voltar à página inicial</a>
        </div>
      </div>
    </div>`;
  root.querySelector('#btn-open-login')?.addEventListener('click', ()=>{
    window.modalsManager?.openAuthModal('login');
  });
}

function normalizeEndereco(e){
  if (!e) return null;
  return {
    id: 'endereco_cadastro',
    label: 'Endereço do cadastro',
    zipCode: e.cep || e.zipCode || '',
    street: e.rua || e.street || '',
    number: e.numero || e.number || '',
    district: e.bairro || e.district || '',
    comp: e.complemento || e.comp || '',
    complement: e.complemento || e.complement || '',
    city: e.cidade || e.city || '',
    state: e.estado || e.state || '',
    favorite: true
  };
}

function renderAddressSection(container, client){
  const listFromArray = Array.isArray(client?.addresses) ? client.addresses.slice() : [];
  const cadastroAddr = normalizeEndereco(client?.endereco);
  const addresses = listFromArray.length ? listFromArray : (cadastroAddr ? [cadastroAddr] : []);
  const isCadastroOnly = !listFromArray.length && !!cadastroAddr;
  container.innerHTML = `
    <div class="card">
      <div class="card__content">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <h3 class="card__title" style="margin:0"><i class="fas fa-map-marker-alt"></i> Endereços</h3>
          <button id="addr-add-toggle" class="btn btn--secondary"><i class="fas fa-plus"></i> Novo endereço</button>
        </div>
  <div id="addr-list" style="margin-top:1rem"></div>
  ${isCadastroOnly ? `<div class="alert-inline" style="margin-top:.5rem">Este é o seu endereço do cadastro. <button id="btn-save-cadastro" class="btn btn--secondary" style="margin-left:.5rem">Salvar nos meus endereços</button></div>` : ''}
      </div>
    </div>`;

  const listEl = container.querySelector('#addr-list');
  const toggleBtn = container.querySelector('#addr-add-toggle');

  function renderList(){
    if (!addresses.length){
      listEl.innerHTML = '<p class="card__text">Nenhum endereço cadastrado.</p>';
      return;
    }
    listEl.innerHTML = addresses.map(a=>{
      const street = a.street || a.rua || a.logradouro || '';
      const number = a.number || a.numero || '';
      const mainLine = [street, number].filter(Boolean).join(', ');
      const compVal = a.complement || a.comp || a.complemento || '';
      const showComp = compVal && !mainLine.toLowerCase().includes(compVal.toLowerCase());
      const labelText = a.label || mainLine || 'Endereço';
      const details = [a.district || a.bairro || '', a.city || a.cidade || '', a.state || a.estado || '', a.zipCode || a.cep || '']
        .filter(Boolean)
        .map((v, i) => i === 0 ? v : `• ${v}`)
        .join(' ');
      return `
      <div class="card" style="margin-bottom:.5rem">
        <div class="card__content" style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start">
          <div>
            <div style="display:flex;align-items:center;gap:.5rem">
              <strong>${labelText}</strong>
              ${a.favorite ? '<span style="background:#e0f2fe;color:#075985;padding:.125rem .375rem;border-radius:.375rem;font-size:.75rem">Favorito</span>' : ''}
            </div>
            ${details ? `<div class="card__text" style="margin:.25rem 0 0">${details}</div>` : ''}
            ${showComp ? `<div class="card__text" style="margin:.25rem 0 0">${compVal}</div>`: ''}
          </div>
          <div class="card__actions" style="flex-shrink:0;display:flex;gap:.5rem">
            ${a.id === 'endereco_cadastro' ? '' : (!a.favorite ? `<button class="btn" data-fav="${a.id}"><i class="fas fa-star"></i> Favoritar</button>`:'')}
            ${a.id === 'endereco_cadastro' ? '' : `<button class="btn btn--secondary" data-del="${a.id}"><i class="fas fa-trash"></i> Remover</button>`}
          </div>
        </div>
      </div>`;
    }).join('');

    // bind actions
    listEl.querySelectorAll('[data-fav]')?.forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        try {
          await bootstrap.firebase.setFavoriteAddress(client.id, btn.getAttribute('data-fav'));
          const idx = addresses.findIndex(x=>x.id===btn.getAttribute('data-fav'));
          if (idx>=0){ addresses.forEach(x=>x.favorite=false); addresses[idx].favorite=true; }
          renderList();
          window.toast?.success('Endereço definido como favorito');
        } catch(e){ console.error(e); window.toast?.error('Falha ao favoritar'); }
      });
    });
    listEl.querySelectorAll('[data-del]')?.forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if (!confirm('Remover este endereço?')) return;
        try {
          await bootstrap.firebase.deleteClientAddress(client.id, btn.getAttribute('data-del'));
          const id = btn.getAttribute('data-del');
          const idx = addresses.findIndex(x=>x.id===id);
          if (idx>=0) addresses.splice(idx,1);
          renderList();
          window.toast?.success('Endereço removido');
        } catch(e){ console.error(e); window.toast?.error('Falha ao remover'); }
      });
    });
  }

  renderList();
  // Quando existe apenas o endereço do cadastro, permitir salvar na subcoleção 'enderecos'
  if (isCadastroOnly) {
    const saveBtn = container.querySelector('#btn-save-cadastro');
    if (saveBtn) {
      saveBtn.addEventListener('click', async ()=>{
        if (saveBtn.disabled) return;
        try {
          saveBtn.disabled = true;
          const payload = {
            zipCode: cadastroAddr.zipCode,
            street: cadastroAddr.street,
            number: cadastroAddr.number,
            district: cadastroAddr.district,
            comp: cadastroAddr.comp || cadastroAddr.complement || '',
            city: cadastroAddr.city,
            state: cadastroAddr.state
          };
          // Usa um ID determinístico para evitar duplicatas do endereço do cadastro
          const saved = await bootstrap.firebase.addAddressToClient(client.id, payload, { favorite: true, docId: 'cadastro' });
          if (!addresses.find(x => x.id === saved.id)) addresses.push(saved);
          // Agora existem endereços salvos; remove banner e re-renderiza
          renderList();
          const alert = container.querySelector('.alert-inline'); if (alert) alert.remove();
          window.toast?.success('Endereço salvo nos seus endereços.');
        } catch(e){ console.error(e); window.toast?.error('Não foi possível salvar endereço.'); }
        finally { saveBtn.disabled = false; }
      });
    }
  }

  // Botão "Novo endereço" abre modal moderno
  toggleBtn.addEventListener('click', () => {
    window.modalsManager?.openAddressModal({
      onSave: async (payload) => {
        const favorite = !!payload.favorite;
        const addrPayload = {
          zipCode: payload.zipCode,
          street: payload.street,
          number: payload.number,
          district: payload.district,
          comp: payload.comp || '',
          city: payload.city,
          state: payload.state,
        };
        const newAddr = await bootstrap.firebase.addAddressToClient(client.id, addrPayload, { favorite });
        if (!addresses.find(x => x.id === newAddr.id)) addresses.push(newAddr);
        if (favorite) addresses.forEach(a => { if (a.id !== newAddr.id) a.favorite = false; });
        renderList();
      }
    });
  });
}

function renderAccount(root, user, client){
  const email = user?.email || '—';
  const uid = user?.uid || '—';
  const nome = client?.nome || client?.name || 'Usuário';
  root.innerHTML = `
    <div class="account-grid">
      <div class="card">
        <div class="card__content">
          <h2 class="card__title"><i class="fas fa-user-circle"></i> Informações do usuário</h2>
          <div class="card__text">
            <p><strong>Nome:</strong> ${nome}</p>
            <p><strong>E-mail:</strong> ${email}</p>
          </div>
          <div class="card__actions">
            <a class="btn btn--secondary" href="pedidos.html"><i class="fas fa-box"></i> Meus pedidos</a>
            <button id="btn-logout" class="btn" aria-label="Fazer logout"><i class="fas fa-sign-out-alt"></i> Sair</button>
          </div>
        </div>
      </div>
      <div id="addresses-section"></div>
      <div id="privacy-section"></div>
    </div>`;

  // logout
  root.querySelector('#btn-logout')?.addEventListener('click', ()=>{ 
    window.authService?.signOut(); 
    // Opcional: redirecionar para página inicial após logout
    setTimeout(()=>{ window.location.href = 'index.html'; }, 600);
  });

  // addresses
  const addrContainer = root.querySelector('#addresses-section');
  renderAddressSection(addrContainer, client);

  renderPrivacySection(root.querySelector('#privacy-section'), user);
}

// LGPD (art. 18): portabilidade (baixar dados) e eliminação (excluir conta)
function renderPrivacySection(container, user){
  container.innerHTML = `
    <div class="card">
      <div class="card__content">
        <h3 class="card__title"><i class="fas fa-user-shield"></i> Privacidade e dados</h3>
        <p class="card__text">Veja como tratamos seus dados na <a href="privacidade.html">Política de Privacidade</a>.</p>
        <div class="card__actions" style="flex-wrap:wrap">
          <button id="btn-export-data" class="btn btn--secondary"><i class="fas fa-download"></i> Baixar meus dados</button>
          <button id="btn-delete-start" class="btn" style="color:var(--error-color)"><i class="fas fa-user-times"></i> Excluir minha conta</button>
        </div>
        <div id="delete-panel" hidden style="margin-top:1rem;border:1px solid var(--error-color);border-radius:var(--radius-lg);padding:1rem">
          <p class="card__text"><strong>O que acontece ao excluir a conta:</strong></p>
          <ul class="card__text" style="padding-left:1.25rem;margin-bottom:.75rem">
            <li>Seu perfil, seus endereços salvos e seu login são apagados. Não dá para desfazer.</li>
            <li>Seus pedidos <strong>não são apagados</strong>, porque a farmácia precisa guardá-los por obrigação fiscal e sanitária.
              Eles são <strong>anonimizados</strong>: perdem o vínculo com você, o e-mail e o endereço completo (ficam só itens, valores, data, cidade e estado).</li>
            <li>Receitas e conversas no WhatsApp não ficam no site; para apagá-las, fale com a farmácia.</li>
          </ul>
          <p class="card__text">Se quiser uma cópia, use "Baixar meus dados" antes.</p>
          <div class="field-wrapper">
            <label for="delete-confirm-text">Digite <strong>EXCLUIR</strong> para confirmar</label>
            <input id="delete-confirm-text" autocomplete="off" />
          </div>
          <div class="field-wrapper">
            <label for="delete-password">Sua senha</label>
            <input id="delete-password" type="password" autocomplete="current-password" />
          </div>
          <div class="card__actions">
            <button id="btn-delete-cancel" class="btn btn--secondary">Cancelar</button>
            <button id="btn-delete-confirm" class="btn btn--primary" style="background:var(--error-color);border-color:var(--error-color)" disabled>
              <i class="fas fa-trash"></i> Excluir definitivamente
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const exportBtn = container.querySelector('#btn-export-data');
  exportBtn.addEventListener('click', async ()=>{
    exportBtn.disabled = true;
    try {
      const data = await bootstrap.firebase.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-farmacia-sao-benedito-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      window.toast?.success('Arquivo com seus dados gerado.');
    } catch(e){ console.error(e); window.toast?.error('Não foi possível gerar o arquivo. Tente novamente.'); }
    finally { exportBtn.disabled = false; }
  });

  const panel = container.querySelector('#delete-panel');
  const confirmText = container.querySelector('#delete-confirm-text');
  const pwd = container.querySelector('#delete-password');
  const confirmBtn = container.querySelector('#btn-delete-confirm');
  const syncConfirm = ()=>{ confirmBtn.disabled = confirmText.value.trim().toUpperCase() !== 'EXCLUIR' || !pwd.value; };
  confirmText.addEventListener('input', syncConfirm);
  pwd.addEventListener('input', syncConfirm);
  container.querySelector('#btn-delete-start').addEventListener('click', ()=>{ panel.hidden = false; confirmText.focus(); });
  container.querySelector('#btn-delete-cancel').addEventListener('click', ()=>{
    panel.hidden = true; confirmText.value = ''; pwd.value = ''; syncConfirm();
  });
  confirmBtn.addEventListener('click', async ()=>{
    if (confirmBtn.disabled) return;
    if (!confirm(`Excluir definitivamente a conta ${user?.email || ''}? Esta ação não pode ser desfeita.`)) return;
    confirmBtn.disabled = true;
    try {
      const { pedidosAnonimizados } = await bootstrap.firebase.deleteMyAccount(pwd.value);
      try { localStorage.removeItem('modern_pharmacy_cart'); localStorage.removeItem('cart'); } catch {}
      alert(`Sua conta foi excluída.${pedidosAnonimizados ? ` ${pedidosAnonimizados} pedido(s) foram anonimizados.` : ''}`);
      window.location.href = 'index.html';
    } catch(e){
      console.error(e);
      const code = e?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') window.toast?.error('Senha incorreta.');
      else if (code === 'auth/too-many-requests') window.toast?.error('Muitas tentativas. Tente novamente mais tarde.');
      else window.toast?.error('Não foi possível excluir a conta. Tente novamente ou fale com a farmácia.');
      syncConfirm();
    }
  });
}

async function main(){
  await loader.loadHeader();
  await loader.loadFooter();
  await bootstrap.init();
  // Wire bottom menu button to toggle mobile sidebar
  const toggleMobileMenu = () => {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const toggle = document.getElementById('mobile-menu-toggle');
    if (sidebar && overlay && toggle) {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
      toggle.classList.toggle('active');
      const isOpen = sidebar.classList.contains('active');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    }
  };
  document.getElementById('bottom-menu-btn')?.addEventListener('click', toggleMobileMenu);
  const root = document.getElementById('account-root');
  if (!root) return;
  const user = bootstrap.auth?.user || bootstrap.firebase?.getCurrentUser?.();
  if (!user) { renderLoggedOut(root); }
  else {
    // Buscar perfil por UID (regras exigem request.auth.uid == userId)
    let client = null;
    try {
      if (bootstrap.firebase?.getCurrentUserProfile) {
        client = await bootstrap.firebase.getCurrentUserProfile();
      }
      // Fallback por email se necessário (menos recomendado)
      if (!client && bootstrap.firebase?.getClientByEmail) {
        client = await bootstrap.firebase.getClientByEmail(user.email);
      }
    } catch (e) {
      console.error('Erro ao obter cliente', e);
    }
    renderAccount(root, user, client || { id: user.uid, endereco: null, addresses: [] });
  }
  // Re-render on auth changes
  eventBus.on('auth:stateChanged', async ({ user }) => {
    if (!user) { renderLoggedOut(root); return; }
    let client = null;
    try {
      client = await bootstrap.firebase.getCurrentUserProfile?.();
      if (!client) client = await bootstrap.firebase.getClientByEmail?.(user.email);
    } catch {}
    renderAccount(root, user, client || { id: user.uid, addresses: [] });
  });
}

document.addEventListener('DOMContentLoaded', main);
