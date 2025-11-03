import ComponentLoader from './services/component-loader.js';
import { bootstrap } from './bootstrap.js';
import { eventBus } from './services/event-bus.js';
import { formatPrice } from './services/product-utils.js';

const loader = new ComponentLoader();

function statusToPt(status){
  const map = {
    pending: 'pendente',
    aguardando: 'aguardando',
    paid: 'pago',
    pago: 'pago',
    processing: 'processando',
    processando: 'processando',
    confirmed: 'confirmado',
    confirmado: 'confirmado',
    shipped: 'enviado',
    enviado: 'enviado',
    delivered: 'entregue',
    entregue: 'entregue',
    canceled: 'cancelado',
    cancelled: 'cancelado',
    cancelado: 'cancelado',
    refunded: 'reembolsado',
    reembolsado: 'reembolsado'
  };
  const key = String(status||'').toLowerCase();
  return map[key] || (key ? key : 'pendente');
}

function paymentToPt(method){
  const m = String(method||'').toLowerCase();
  if (m === 'pix') return 'Pix';
  if (m === 'card' || m === 'cartao' || m === 'cartão') return 'Cartão';
  if (m === 'boleto') return 'Boleto';
  return method || '—';
}

function shippingToPt(method){
  const m = String(method||'').toLowerCase();
  if (m === 'standard' || m === 'economica' || m === 'econômica') return 'Econômica';
  if (m === 'express') return 'Expressa';
  return method || '—';
}

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

function getOrderDisplayNumber(o){
  // Prefer explicit sequential numbers
  const candidates = [
    o.orderNumber,
    o.id,
    o.number,
    o.numero,
    o.orderNo,
    o.nPedido,
    o.npedido,
    o.nr,
    o.n,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
    if (typeof c === 'string' && c.trim()) {
      // If it's a numeric-looking string, return it; else still use it
      const trimmed = c.trim();
      if (/^\d+$/.test(trimmed)) return trimmed;
      return trimmed;
    }
  }
  // Fallback to Firestore doc id if available
  if (o._docId && String(o._docId).trim()) return String(o._docId);
  return '—';
}

function renderOrders(root, orders){
  if (!orders.length){
    root.innerHTML = `<div class="card" style="max-width:720px"><div class="card__content"><p class="card__text">Você ainda não possui pedidos.</p><a href="produtos.html" class="btn btn--primary">Ver produtos</a></div></div>`;
    return;
  }
  // Normalize and sort by createdAt desc (most recent first), regardless of backend ordering
  const toTs = (v) => {
    try {
      if (!v) return 0;
      // Firestore Timestamp
      if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
      // ISO string or date-like string
      if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
      // Number timestamp (ms)
      if (typeof v === 'number') return v;
      // Date instance
      if (v instanceof Date) return v.getTime();
    } catch {}
    return 0;
  };
  const sorted = orders.slice().sort((a,b)=> toTs(b.createdAt) - toTs(a.createdAt));
  const ensureTotals = (o)=>{
    if (o.totals && typeof o.totals.total === 'number') return o.totals;
    const items = Array.isArray(o.items) ? o.items : [];
    const subtotal = items.reduce((s,it)=> s + (Number(it.price)||0) * (Number(it.quantity)||0), 0);
    const shipping = Number(o.shippingValue || o.shipping || 0) || 0;
    const discount = Number(o.discount || 0) || (o.totals?.discount||0);
    const total = Math.max(0, subtotal - discount) + shipping;
    return { subtotal, shipping, discount, total };
  };
  root.innerHTML = `
    <div class="grid" style="grid-template-columns:1fr; gap: 1.25rem;">
      ${sorted.map(o=>{
        // Format createdAt robustly (only date)
        let createdDate = '—';
        try {
          const v = o.createdAt;
          if (v) {
            if (typeof v === 'object' && typeof v.toDate === 'function') createdDate = v.toDate().toLocaleDateString('pt-BR');
            else if (typeof v === 'string') createdDate = new Date(v).toLocaleDateString('pt-BR');
            else if (typeof v === 'number') createdDate = new Date(v).toLocaleDateString('pt-BR');
          }
        } catch {}
        const total = o.totals?.total ?? o.total ?? 0;
        const items = (o.items?.length)||0;
        const status = statusToPt(o.status || 'pendente');
        const num = getOrderDisplayNumber(o);
        const key = (o._docId || num || Math.random().toString(36).slice(2)).toString();
        const tt = ensureTotals(o);
        const addr = o.address || o.endereco || null;
        const addrParts = [];
        if (addr) {
          if (addr.street) addrParts.push(`${addr.street}${addr.number?`, ${addr.number}`:''}`);
          if (addr.district) addrParts.push(addr.district);
          const cityUf = [addr.city, addr.state].filter(Boolean).join('/');
          if (cityUf) addrParts.push(cityUf);
          if (addr.zipCode || addr.cep) addrParts.push(`CEP ${addr.zipCode || addr.cep}`);
        }
        const addressHTML = addrParts.length ? `<div style="font-size:.85rem; color:var(--gray-700);">${addrParts.join(' • ')}</div>` : '';
        const paymentHTML = `<div style="font-size:.85rem; color:var(--gray-700);">Pagamento: <strong>${paymentToPt(o.paymentMethod)}</strong>${o.installments?.count?` • ${o.installments.count}x`:''}</div>`;
        const shippingHTML = `<div style="font-size:.85rem; color:var(--gray-700);">Entrega: <strong>${shippingToPt(o.shippingMethod)}</strong></div>`;
        const lines = Array.isArray(o.items) ? o.items.map(it=>{
          const qty = Number(it.quantity)||0;
          const unit = Number(it.price)||0;
          const line = unit * qty;
          return `<div class="order-line" style="display:flex; justify-content:space-between; gap:.75rem; padding:.35rem 0; border-bottom:1px dashed var(--gray-200)">
            <div><strong>${qty}x</strong> ${it.name || it.title || it.id || '-'}</div>
            <div style="white-space:nowrap; text-align:right;">${formatPrice(unit)} • <strong>${formatPrice(line)}</strong></div>
          </div>`;
        }).join('') : '<div class="card__text">Itens indisponíveis para exibição.</div>';
        const totalsHTML = `
          <div class="order-totals" style="margin-top:.5rem; display:flex; flex-direction:column; gap:.25rem;">
            <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><strong>${formatPrice(tt.subtotal||0)}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Frete</span><strong>${formatPrice(tt.shipping||0)}</strong></div>
            ${tt.discount ? `<div style=\"display:flex; justify-content:space-between; color:var(--success-color)\"><span>Desconto</span><strong>- ${formatPrice(tt.discount)}</strong></div>`:''}
            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--gray-200); padding-top:.35rem;"><span>Total</span><strong>${formatPrice(tt.total||0)}</strong></div>
          </div>`;
        return `
          <div class="card order-card" data-target="order-${key}" style="cursor:pointer;">
            <div class="card__content">
              <div class="order-header" style="display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap">
                <h3 class="card__title" style="margin:0; color:var(--primary-color); text-decoration:underline;">Pedido #${num} — ${createdDate}</h3>
                <span style="background: var(--gray-100); padding: .25rem .5rem; border-radius: .375rem; font-weight:600; text-transform:capitalize">${status}</span>
              </div>
              <p class="card__text" style="margin:.5rem 0 0">${items} item(ns) • ${formatPrice(total)}</p>
              ${paymentHTML}
              ${shippingHTML}
              ${addressHTML}
              <div class="order-details" id="order-${key}" style="display:none; margin-top:.75rem; border-top:1px solid var(--gray-200); padding-top:.75rem;">
                <div class="order-lines" style="display:flex; flex-direction:column; gap:.25rem;">
                  ${lines}
                </div>
                ${totalsHTML}
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  // Toggle handlers
  const toggle = (card) => {
    const id = card.getAttribute('data-target');
    const panel = root.querySelector(`#${CSS.escape(id)}`);
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    card.classList.toggle('expanded', !visible);
  };
  root.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Avoid toggling when selecting text or clicking links inside details
      const t = e.target;
      if (t && (t.closest('a') || t.closest('button'))) return;
      toggle(card);
    });
    // Keyboard accessibility
    card.setAttribute('tabindex','0');
    card.setAttribute('role','button');
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(card); }
    });
  });
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
