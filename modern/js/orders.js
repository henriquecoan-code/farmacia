import ComponentLoader from './services/component-loader.js';
import { bootstrap } from './bootstrap.js';
import { eventBus } from './services/event-bus.js';
import { formatPrice } from './services/product-utils.js';

const loader = new ComponentLoader();

function renderLoggedOut(root){
  root.innerHTML = `
    <div class="card" style="max-width:720px">
      <div class="card__content">
        <h2 class="card__title"><i class="fas fa-lock"></i> Faça login para ver seus pedidos</h2>
        <p class="card__text">Entre para acompanhar o status e detalhes de seus pedidos.</p>
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

function renderLoading(root){
  root.innerHTML = `
    <div class="loading-spinner" style="display:flex">
      <div class="spinner"></div>
      <p>Carregando pedidos...</p>
    </div>`;
}

function renderOrders(root, orders){
  if (!orders.length){
    root.innerHTML = `<div class="card" style="max-width:720px"><div class="card__content"><p class="card__text">Você ainda não possui pedidos.</p><a href="produtos.html" class="btn btn--primary">Ver produtos</a></div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="grid" style="grid-template-columns:1fr;gap: var(--spacing-4)">
      ${orders.map(o=>{
        const created = o.createdAt ? new Date(o.createdAt).toLocaleString('pt-BR') : '—';
        const total = o.totals?.total ?? o.total ?? 0;
        const items = (o.items?.length)||0;
        const status = o.status || 'pendente';
        const num = o.orderNumber || o.id || o._docId || '—';
        return `
          <div class="card">
            <div class="card__content">
              <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap">
                <h3 class="card__title" style="margin:0">Pedido #${num}</h3>
                <span style="background: var(--gray-100); padding: .25rem .5rem; border-radius: .375rem; font-weight:600; text-transform:capitalize">${status}</span>
              </div>
              <p class="card__text" style="margin:.5rem 0 0">${items} item(ns) • ${formatPrice(total)} • ${created}</p>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

async function loadAndRenderOrders(root, user){
  if (!bootstrap.firebase?.isInitialized){
    root.innerHTML = `<div class="card"><div class="card__content"><p class="card__text">Modo offline: não foi possível carregar seus pedidos agora.</p></div></div>`;
    return;
  }
  try{
    renderLoading(root);
    if (bootstrap.firebase.listOrdersByUser) {
      const filtered = await bootstrap.firebase.listOrdersByUser({ uid: user.uid, email: user.email, limit: 100 });
      renderOrders(root, filtered);
    } else {
      const all = await bootstrap.firebase.listOrders({ limit: 100 });
      const filtered = all.filter(o => {
        const u = o.user || {};
        return (u.uid && u.uid === user.uid) || (u.email && user.email && u.email === user.email);
      });
      renderOrders(root, filtered);
    }
  } catch(e){
    console.error('Falha ao carregar pedidos', e);
    root.innerHTML = `<div class="card"><div class="card__content"><p class="card__text">Erro ao carregar pedidos.</p></div></div>`;
  }
}

async function main(){
  await loader.loadHeader();
  await loader.loadFooter();
  await bootstrap.init();
  const root = document.getElementById('orders-root');
  if (!root) return;
  const user = bootstrap.auth?.user || bootstrap.firebase?.getCurrentUser?.();
  if (!user) { renderLoggedOut(root); } else { await loadAndRenderOrders(root, user); }
  // Re-render on auth changes
  eventBus.on('auth:stateChanged', async ({ user }) => {
    if (!user) renderLoggedOut(root); else await loadAndRenderOrders(root, user);
  });
}

document.addEventListener('DOMContentLoaded', main);
