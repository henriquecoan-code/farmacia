// Simple Admin Test
console.log('Admin script loading...');

class AdminApp {
  constructor() {
    console.log('AdminApp constructor called');
    this.products = [];
    this.clients = [];
    console.log('AdminApp initialized');
  }
}

// Initialize admin app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, creating AdminApp');
  window.adminApp = new AdminApp();
});

export default AdminApp;