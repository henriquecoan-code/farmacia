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

function renderAddressSection(container, client){
  const addresses = Array.isArray(client?.addresses) ? client.addresses : [];
  container.innerHTML = `
    <div class="card">
      <div class="card__content">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <h3 class="card__title" style="margin:0"><i class="fas fa-map-marker-alt"></i> Endereços</h3>
          <button id="addr-add-toggle" class="btn btn--secondary"><i class="fas fa-plus"></i> Novo endereço</button>
        </div>
        <div id="addr-list" style="margin-top:1rem"></div>
        <form id="addr-form" class="form" style="display:none;margin-top:1rem">
          <div class="grid" style="grid-template-columns:1fr 1fr; gap: var(--spacing-3)">
            <div class="form__group"><label>CEP</label><input id="addr-zip" type="text" placeholder="00000-000"></div>
            <div class="form__group"><label>Cidade</label><input id="addr-city" type="text" placeholder="São Paulo"></div>
            <div class="form__group"><label>Estado</label><input id="addr-state" type="text" placeholder="SP"></div>
            <div class="form__group" style="grid-column:1 / -1"><label>Rua</label><input id="addr-street" type="text" placeholder="Rua Exemplo, 123"></div>
            <div class="form__group"><label>Bairro</label><input id="addr-district" type="text" placeholder="Centro"></div>
            <div class="form__group"><label>Complemento</label><input id="addr-complement" type="text" placeholder="Apto / Bloco"></div>
            <div class="form__group" style="grid-column:1 / -1"><label>Referência</label><input id="addr-reference" type="text" placeholder="Ponto de referência"></div>
            <div class="form__group" style="grid-column:1 / -1;display:flex;align-items:center;gap:.5rem">
              <input id="addr-favorite" type="checkbox"> <label for="addr-favorite">Definir como favorito</label>
            </div>
          </div>
          <div class="card__actions" style="margin-top: .75rem">
            <button type="submit" class="btn btn--primary"><i class="fas fa-save"></i> Salvar</button>
            <button type="button" id="addr-cancel" class="btn"><i class="fas fa-times"></i> Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;

  const listEl = container.querySelector('#addr-list');
  const toggleBtn = container.querySelector('#addr-add-toggle');
  const formEl = container.querySelector('#addr-form');
  const cancelBtn = container.querySelector('#addr-cancel');

  function renderList(){
    if (!addresses.length){
      listEl.innerHTML = '<p class="card__text">Nenhum endereço cadastrado.</p>';
      return;
    }
    listEl.innerHTML = addresses.map(a=>`
      <div class="card" style="margin-bottom:.5rem">
        <div class="card__content" style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start">
          <div>
            <div style="display:flex;align-items:center;gap:.5rem">
              <strong>${a.street || a.logradouro || 'Endereço'}</strong>
              ${a.favorite ? '<span style="background:#e0f2fe;color:#075985;padding:.125rem .375rem;border-radius:.375rem;font-size:.75rem">Favorito</span>' : ''}
            </div>
            <div class="card__text" style="margin:.25rem 0 0">${a.district || ''} ${a.city ? '• ' + a.city : ''} ${a.state ? '• ' + a.state : ''} ${a.zipCode ? '• ' + a.zipCode : ''}</div>
            ${a.complement ? `<div class="card__text" style="margin:.25rem 0 0">${a.complement}</div>`: ''}
          </div>
          <div class="card__actions" style="flex-shrink:0;display:flex;gap:.5rem">
            ${!a.favorite ? `<button class="btn" data-fav="${a.id}"><i class="fas fa-star"></i> Favoritar</button>`:''}
            <button class="btn btn--secondary" data-del="${a.id}"><i class="fas fa-trash"></i> Remover</button>
          </div>
        </div>
      </div>`).join('');

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

  toggleBtn.addEventListener('click', ()=>{
    formEl.style.display = formEl.style.display === 'none' ? 'block' : 'none';
  });
  cancelBtn.addEventListener('click', ()=>{ formEl.reset?.(); formEl.style.display='none'; });

  formEl.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const payload = {
      zipCode: container.querySelector('#addr-zip')?.value?.trim()||'',
      city: container.querySelector('#addr-city')?.value?.trim()||'',
      state: container.querySelector('#addr-state')?.value?.trim()||'',
      street: container.querySelector('#addr-street')?.value?.trim()||'',
      district: container.querySelector('#addr-district')?.value?.trim()||'',
      complement: container.querySelector('#addr-complement')?.value?.trim()||'',
      reference: container.querySelector('#addr-reference')?.value?.trim()||''
    };
    const favorite = !!container.querySelector('#addr-favorite')?.checked;
    if (!payload.street || !payload.city || !payload.state) { window.toast?.warn('Informe pelo menos Rua, Cidade e Estado.'); return; }
    try {
      const newAddr = await bootstrap.firebase.addAddressToClient(client.id, payload, { favorite });
      addresses.push(newAddr);
      if (favorite) addresses.forEach(a=>{ if (a.id !== newAddr.id) a.favorite = false; });
      renderList();
      formEl.reset();
      formEl.style.display = 'none';
      window.toast?.success('Endereço adicionado');
    } catch(e){ console.error(e); window.toast?.error('Falha ao adicionar endereço'); }
  });
}

function renderAccount(root, user, client){
  const email = user?.email || '—';
  const uid = user?.uid || '—';
  root.innerHTML = `
    <div class="grid" style="grid-template-columns:1fr;gap: var(--spacing-6);max-width:960px">
      <div class="card">
        <div class="card__content">
          <h2 class="card__title"><i class="fas fa-user-circle"></i> Informações do usuário</h2>
          <div class="card__text">
            <p><strong>E-mail:</strong> ${email}</p>
            <p><strong>ID do usuário:</strong> <code>${uid}</code></p>
          </div>
          <div class="card__actions">
            <a class="btn btn--secondary" href="pedidos.html"><i class="fas fa-box"></i> Meus pedidos</a>
            <button id="btn-logout" class="btn"><i class="fas fa-sign-out-alt"></i> Sair</button>
          </div>
        </div>
      </div>
      <div id="addresses-section"></div>
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
    // Buscar/garantir cliente por e-mail
    let client = null;
    try {
      if (bootstrap.firebase?.getClientByEmail) {
        client = await bootstrap.firebase.getClientByEmail(user.email);
      }
      if (!client && bootstrap.firebase?.addClient) {
        const payload = {
          name: user.displayName || (user.email?.split('@')[0] || 'Usuário'),
          email: user.email,
          addresses: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const id = await bootstrap.firebase.addClient(payload);
        client = Object.assign({ id }, payload);
      }
    } catch (e) {
      console.error('Erro ao obter/criar cliente', e);
    }
    renderAccount(root, user, client || { id: 'unknown', addresses: [] });
  }
  // Re-render on auth changes
  eventBus.on('auth:stateChanged', async ({ user }) => {
    if (!user) { renderLoggedOut(root); return; }
    let client = null;
    try {
      client = await bootstrap.firebase.getClientByEmail(user.email);
    } catch {}
    renderAccount(root, user, client || { id: 'unknown', addresses: [] });
  });
}

document.addEventListener('DOMContentLoaded', main);
