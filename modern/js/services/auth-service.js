// Authentication Service - Handles user authentication
import { eventBus } from './event-bus.js';

export class AuthService {
  constructor() {
    this.user = null;
    this.firebaseService = null;
    this.isLoginMode = true;
  }

  init() {
    // Will be set by the main app
  }

  setFirebaseService(firebaseService) {
    this.firebaseService = firebaseService;
    this.setupAuthStateListener();
  }

  setupAuthStateListener() {
    if (this.firebaseService && this.firebaseService.isInitialized) {
      this.firebaseService.onAuthStateChanged((user) => {
        this.user = user;
        this.updateUserUI();
        eventBus.emit('auth:stateChanged', { user });
      });
    } else {
      // Update UI immediately with no user when Firebase is not available
      this.user = null;
      this.updateUserUI();
      eventBus.emit('auth:stateChanged', { user: null });
    }
  }

  // Show authentication modal
  showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      this.updateAuthModalUI();
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  // Hide authentication modal
  hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
  // Remove both possible class patterns used by different implementations
  modal.classList.remove('active');
  modal.classList.remove('modal--active');
      document.body.style.overflow = '';
      this.clearAuthForm();
    }
  }

  // Toggle between login and register
  toggleAuthMode() {
    this.isLoginMode = !this.isLoginMode;
    this.updateAuthModalUI();
  }

  // Update auth modal UI
  updateAuthModalUI() {
    const title = document.getElementById('auth-modal-title');
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    const authToggle = document.getElementById('auth-toggle');
    const authSwitchText = authToggle && authToggle.parentElement;

    if (title && submitBtn && authToggle && authSwitchText) {
      if (this.isLoginMode) {
        title.textContent = 'Entrar';
        submitBtn.textContent = 'Entrar';
        authToggle.textContent = 'Cadastre-se';
        authSwitchText.innerHTML = 'Não tem conta? <a href="#" id="auth-toggle">Cadastre-se</a>';
      } else {
        title.textContent = 'Cadastrar';
        submitBtn.textContent = 'Cadastrar';
        authToggle.textContent = 'Entrar';
        authSwitchText.innerHTML = 'Já tem conta? <a href="#" id="auth-toggle">Entrar</a>';
      }
      // Note: Event listener is handled by event delegation in main app, no need to reattach
    }
  }

  // Handle auth form submission
  async handleAuthSubmit(event) {
    event.preventDefault();
    
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    
    const email = emailEl ? emailEl.value : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!email || !password) {
      this.showError('Por favor, preencha todos os campos');
      return;
    }

    if (!this.firebaseService || !this.firebaseService.isInitialized) {
      this.showError('Modo offline: Autenticação não disponível no momento. Tente novamente quando a conexão for restaurada.');
      return;
    }

    try {
      this.showLoading();

      if (this.isLoginMode) {
        await this.firebaseService.signIn(email, password);
        this.showSuccess('Login realizado com sucesso!');
  eventBus.emit('auth:login', { user: this.firebaseService.getCurrentUser?.() || null });
      } else {
        await this.firebaseService.signUp(email, password);
        this.showSuccess('Conta criada com sucesso!');
  eventBus.emit('auth:login', { user: this.firebaseService.getCurrentUser?.() || null, newUser: true });
      }

      this.hideAuthModal();
    } catch (error) {
      console.error('Auth error:', error);
      this.showError(this.getErrorMessage(error));
    } finally {
      this.hideLoading();
    }
  }

  // Sign out user
  async signOut() {
    if (!this.firebaseService || !this.firebaseService.isInitialized) {
      this.showError('Modo offline: Logout não disponível no momento.');
      return;
    }

    try {
      await this.firebaseService.signOut();
  // Fecha qualquer modal de auth aberto (defensivo)
  this.hideAuthModal();
  // Remove dropdown imediatamente para feedback visual instantâneo
  this.removeUserDropdown();
  // Atualiza UI (listener também fará, mas garante rapidez)
  this.updateUserUI();
      this.showSuccess('Logout realizado com sucesso!');
  eventBus.emit('auth:logout', {});
    } catch (error) {
      console.error('Sign out error:', error);
      this.showError('Erro ao fazer logout');
    }
  }

  // Update user UI
  updateUserUI() {
    const userBtn = document.getElementById('user-btn');
    if (!userBtn) return;

    if (this.user) {
      // User is logged in
      userBtn.innerHTML = `
        <i class="fas fa-user-check"></i>
        <span>${(this.user.email && this.user.email.split('@')[0]) || 'Usuário'}</span>
      `;
      
      // Add dropdown menu
      this.addUserDropdown();

      // Fecha modal caso ainda esteja aberto (classes diferentes suportadas)
      const modal = document.getElementById('auth-modal');
      if (modal && (modal.classList.contains('active') || modal.classList.contains('modal--active'))) {
        this.hideAuthModal();
      }

      // Abre o dropdown ao passar o mouse e fecha ao sair
      userBtn.onmouseenter = () => {
        const dropdown = userBtn.querySelector('.user-dropdown');
        if (dropdown) dropdown.classList.add('active');
      };
      userBtn.onmouseleave = () => {
        const dropdown = userBtn.querySelector('.user-dropdown');
        if (dropdown) dropdown.classList.remove('active');
      };

      // Permite cliques nos links do dropdown; evita abrir modal quando clicar no botão em si
      userBtn.onclick = (e) => {
        // Se o clique veio de um link do dropdown, não impedir navegação
        const link = e.target?.closest('a.user-dropdown__item');
        if (link) return; // deixa propagar/navegar
        // Caso contrário, apenas evita o comportamento padrão do botão
        e.stopPropagation();
        e.preventDefault();
      };
    } else {
      // User is not logged in
      userBtn.innerHTML = `
        <i class="fas fa-user"></i>
        <span>Entrar</span>
      `;
      
      // Remove dropdown if exists
      this.removeUserDropdown();
    }
  }

  // Add user dropdown menu
  addUserDropdown() {
    const userBtn = document.getElementById('user-btn');
    if (!userBtn || userBtn.querySelector('.user-dropdown')) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'user-dropdown';
    dropdown.innerHTML = `
      <div class="user-dropdown__content">
        <a href="conta.html" class="user-dropdown__item" id="account-link">
          <i class="fas fa-user-circle"></i>
          Minha Conta
        </a>
        <a href="pedidos.html" class="user-dropdown__item" id="orders-link">
          <i class="fas fa-box"></i>
          Meus Pedidos
        </a>
        <a href="#" class="user-dropdown__item" id="sign-out-btn">
          <i class="fas fa-sign-out-alt"></i>
          Sair
        </a>
      </div>
    `;

    userBtn.appendChild(dropdown);
    
    // Add styles
    this.addUserDropdownStyles();

    // Add click event to toggle dropdown
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });

    // Add sign out event
    const signOutBtn = dropdown.querySelector('#sign-out-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.signOut();
      });
    }

    // Navegação: Minha Conta / Meus Pedidos
    const accountLink = dropdown.querySelector('#account-link');
    if (accountLink) {
      accountLink.addEventListener('click', (e) => {
        // Evita que o clique suba até o botão (que poderia abrir modal)
        e.stopPropagation();
        // Permitir navegação padrão, apenas fechar o dropdown rapidamente
        const dd = userBtn.querySelector('.user-dropdown');
        if (dd) dd.classList.remove('active');
      });
    }
    const ordersLink = dropdown.querySelector('#orders-link');
    if (ordersLink) {
      ordersLink.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = userBtn.querySelector('.user-dropdown');
        if (dd) dd.classList.remove('active');
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdown.classList.remove('active');
    });
  }

  // Remove user dropdown
  removeUserDropdown() {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown) {
      dropdown.remove();
    }
  }

  // Add user dropdown styles
  addUserDropdownStyles() {
    if (document.getElementById('user-dropdown-styles')) return;

    const style = document.createElement('style');
    style.id = 'user-dropdown-styles';
    style.textContent = `
      .user-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background-color: var(--white);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        min-width: 200px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all var(--transition-fast);
      }

      .user-dropdown.active {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .user-dropdown__content {
        padding: var(--spacing-2);
      }

      .user-dropdown__item {
        display: flex;
        align-items: center;
        gap: var(--spacing-3);
        padding: var(--spacing-3) var(--spacing-4);
        color: var(--gray-700);
        text-decoration: none;
        border-radius: var(--radius);
        transition: background-color var(--transition-fast);
      }

      .user-dropdown__item:hover {
        background-color: var(--gray-50);
        color: var(--primary-color);
      }

      .action-btn {
        position: relative;
      }
    `;
    document.head.appendChild(style);
  }

  // Clear auth form
  clearAuthForm() {
    const email = document.getElementById('auth-email');
    const password = document.getElementById('auth-password');
    
    if (email) email.value = '';
    if (password) password.value = '';
  }

  // Get error message from Firebase error
  getErrorMessage(error) {
    switch (error.code) {
      case 'auth/user-not-found':
        return 'Usuário não encontrado';
      case 'auth/wrong-password':
        return 'Senha incorreta';
      case 'auth/email-already-in-use':
        return 'E-mail já está em uso';
      case 'auth/weak-password':
        return 'Senha muito fraca. Use pelo menos 6 caracteres';
      case 'auth/invalid-email':
        return 'E-mail inválido';
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Tente novamente mais tarde';
      default:
        return 'Erro de autenticação. Tente novamente';
    }
  }

  // Show success message
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  // Show error message
  showError(message) {
    this.showNotification(message, 'error');
  }

  // Show loading state
  showLoading() {
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';
    }
  }

  // Hide loading state
  hideLoading() {
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = this.isLoginMode ? 'Entrar' : 'Cadastrar';
    }
  }

  // Show notification
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.innerHTML = `
      <div class="notification__content">
        <i class="fas ${this.getNotificationIcon(type)}"></i>
        <span>${message}</span>
      </div>
    `;

    // Add styles if not exists
    this.addNotificationStyles();

    // Add to page
    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);

    // Remove notification after 5 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  // Get notification icon
  getNotificationIcon(type) {
    switch (type) {
      case 'success': return 'fa-check-circle';
      case 'error': return 'fa-exclamation-circle';
      case 'warning': return 'fa-exclamation-triangle';
      default: return 'fa-info-circle';
    }
  }

  // Add notification styles
  addNotificationStyles() {
    if (document.getElementById('notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      .notification {
        position: fixed;
        top: var(--spacing-4);
        right: var(--spacing-4);
        background-color: var(--white);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: var(--spacing-4);
        z-index: 10000;
        transform: translateX(100%);
        transition: transform var(--transition);
        min-width: 300px;
        max-width: 400px;
      }

      .notification.show {
        transform: translateX(0);
      }

      .notification--success {
        border-left: 4px solid var(--success-color);
      }

      .notification--error {
        border-left: 4px solid var(--error-color);
      }

      .notification--warning {
        border-left: 4px solid var(--warning-color);
      }

      .notification--info {
        border-left: 4px solid var(--primary-color);
      }

      .notification__content {
        display: flex;
        align-items: center;
        gap: var(--spacing-3);
      }

      .notification--success .notification__content i {
        color: var(--success-color);
      }

      .notification--error .notification__content i {
        color: var(--error-color);
      }

      .notification--warning .notification__content i {
        color: var(--warning-color);
      }

      .notification--info .notification__content i {
        color: var(--primary-color);
      }
    `;
    document.head.appendChild(style);
  }
}