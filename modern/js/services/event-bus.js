// Simple Event Bus for cross-service communication
export class EventBus {
  constructor() { this.listeners = {}; }
  on(event, callback) { (this.listeners[event] ||= new Set()).add(callback); return () => this.off(event, callback); }
  off(event, callback) { this.listeners[event]?.delete(callback); }
  emit(event, payload) { this.listeners[event]?.forEach(cb => { try { cb(payload); } catch(e){ console.error('EventBus listener error', e); } }); }
}
export const eventBus = new EventBus();
