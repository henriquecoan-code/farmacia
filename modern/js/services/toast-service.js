// ToastService - unified toast/notification system
// Usage: import { toast } from './services/toast-service.js'; toast.success('Mensagem');
// Also exposes window.toast for convenience.
import { analytics } from './analytics-service.js';

class ToastService {
  constructor(){
    this.queue = [];
    this.active = null;
    this.defaultDuration = 3200;
    this.container = null;
    this.maxStack = 3; // limit simultaneous to avoid overlap flood
  }

  ensureContainer(){
    if (this.container) return;
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.style.position = 'fixed';
    el.style.top = '16px';
    el.style.right = '16px';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '10px';
    el.style.zIndex = '11000';
    document.body.appendChild(el);
    this.container = el;
  }

  show(message, { type = 'info', duration, icon = null, dismissible = true } = {}){
    this.ensureContainer();
    const id = 'toast_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast--${type}`;
    toastEl.setAttribute('role','status');
    toastEl.setAttribute('aria-live','polite');
    toastEl.style.position='relative';
    toastEl.style.display='flex';
    toastEl.style.alignItems='flex-start';
    toastEl.style.gap='8px';

    const closeBtn = dismissible ? `<button data-close="${id}" aria-label="Fechar" style="background:none;border:none;cursor:pointer;font-size:14px;line-height:1;position:absolute;top:6px;right:8px;color:var(--gray-500);">×</button>` : '';
    const icn = icon ? `<span style="font-size:16px;line-height:1.2;">${icon}</span>` : '';

    toastEl.innerHTML = `${icn}<div style="flex:1;">${message}</div>${closeBtn}`;

    // limit stack
    while (this.container.children.length >= this.maxStack) {
      this.container.removeChild(this.container.firstChild);
    }

    this.container.appendChild(toastEl);
    // Trigger show animation (CSS existing .toast--show)
    requestAnimationFrame(()=> toastEl.classList.add('toast--show'));

    const totalDuration = duration || this.defaultDuration;
    const timer = setTimeout(()=> this.dismiss(id), totalDuration);

    if (dismissible) {
      toastEl.addEventListener('click', (e) => {
        const btn = e.target.closest(`[data-close="${id}"]`);
        if (btn) this.dismiss(id);
      });
    }

    analytics.track('ui_toast_show', { type });
    return id;
  }

  dismiss(id){
    const el = this.container?.querySelector(`[data-close="${id}"]`)?.parentElement || [...(this.container?.children||[])].find(c=>c.innerHTML.includes(id));
    // fallback: search by index
    if (!this.container) return;
    let target = null;
    [...this.container.children].forEach(child => { if (!target && child.querySelector(`[data-close="${id}"]`)) target = child; });
    if (!target) return;
    target.classList.remove('toast--show');
    setTimeout(()=> target.remove(), 300);
    analytics.track('ui_toast_dismiss', {});
  }

  success(msg, opts={}){ return this.show(msg, { type:'success', icon:'✅', ...opts }); }
  error(msg, opts={}){ return this.show(msg, { type:'error', icon:'⚠️', ...opts }); }
  warn(msg, opts={}){ return this.show(msg, { type:'warning', icon:'⚠️', ...opts }); }
  info(msg, opts={}){ return this.show(msg, { type:'info', icon:'ℹ️', ...opts }); }
}

export const toast = new ToastService();
window.toast = toast;
