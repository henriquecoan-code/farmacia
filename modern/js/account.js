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
          <a href="modern-index.html" class="btn btn--secondary">Voltar à página inicial</a>
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
    <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-6); max-width: 900px; margin-inline: auto;">
      <div class="card" style="min-width: 320px;">
        <div class="card__content">
          <h2 class="card__title"><i class="fas fa-user-circle"></i> Informações do usuário</h2>
          <div class="card__text">
            <p><strong>Nome:</strong> ${nome}</p>
            <p><strong>E-mail:</strong> ${email}</p>
          </div>
          <div class="card__actions">
            <a class="btn btn--secondary" href="pedidos.html"><i class="fas fa-box"></i> Meus pedidos</a>
            <button id="btn-logout" class="btn"><i class="fas fa-sign-out-alt"></i> Sair</button>
          </div>
        </div>
      </div>
      <div id="addresses-section" style="min-width: 320px;"></div>
    </div>`;

  // logout
  root.querySelector('#btn-logout')?.addEventListener('click', ()=>{ window.authService?.signOut(); });

  // addresses
  const addrContainer = root.querySelector('#addresses-section');
  renderAddressSection(addrContainer, client);
}

async function main(){
  await loader.loadHeader();
  await loader.loadFooter();
  await bootstrap.init();
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
