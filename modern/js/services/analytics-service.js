// Simple Analytics Service (client-side only)
// Stores events in localStorage and logs to console. Placeholder for future backend.
export class AnalyticsService {
  constructor(namespace = 'analyticsEvents') {
    this.key = namespace;
    this.bufferLimit = 200;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  save(events) {
    try {
      localStorage.setItem(this.key, JSON.stringify(events.slice(-this.bufferLimit)));
    } catch (e) {
      console.warn('Analytics save failed', e);
    }
  }

  track(type, payload = {}) {
    const evt = {
      type,
      payload,
      ts: Date.now()
    };
    const events = this.load();
    events.push(evt);
    this.save(events);
    console.debug('[analytics]', type, payload);
  }

  getAll() {
    return this.load();
  }

  // Basic derived metrics (conversion funil simples)
  summarize() {
    const evts = this.getAll();
    const counts = (type) => evts.filter(e => e.type === type).length;
    const last = (type) => [...evts].reverse().find(e => e.type === type) || null;
    const prodRenders = counts('products_render');
    const cartAdds = counts('cart_add') + counts('cart_add') + counts('cart_add');
    const distinctProductsAdded = new Set(evts.filter(e => e.type === 'cart_add').map(e => e.payload.productId)).size;
    const authLogins = counts('auth_login');
    return {
      totals: {
        productsRender: prodRenders,
        cartAdd: counts('cart_add'),
        cartRemove: counts('cart_remove'),
        cartUpdate: counts('cart_update'),
        cartCleared: counts('cart_cleared'),
        authLogin: authLogins,
        authLogout: counts('auth_logout')
      },
      conversion: {
        addPerRender: prodRenders ? (counts('cart_add') / prodRenders) : 0,
        distinctProductsAdded,
      },
      lastEvents: {
        render: last('products_render'),
        add: last('cart_add'),
        login: last('auth_login')
      }
    };
  }

  exportJSON() {
    try {
      return JSON.stringify(this.getAll(), null, 2);
    } catch {
      return '[]';
    }
  }

  download(filename = 'analytics-events.json') {
    const data = this.exportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
}

export const analytics = new AnalyticsService();
// Optional global helper for manual download (dev tool)
window.analyticsDownload = () => analytics.download();
window.analyticsSummary = () => console.table(analytics.summarize());
