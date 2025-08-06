// UI Service - Handles UI interactions and notifications
export class UIService {
  constructor() {
    this.loadingOverlay = null;
  }

  // Show loading overlay
  showLoading() {
    this.loadingOverlay = document.getElementById('loading-overlay');
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('active');
    }
  }

  // Hide loading overlay
  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.remove('active');
    }
  }

  // Show success notification
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  // Show error notification
  showError(message) {
    this.showNotification(message, 'error');
  }

  // Show warning notification
  showWarning(message) {
    this.showNotification(message, 'warning');
  }

  // Show info notification
  showInfo(message) {
    this.showNotification(message, 'info');
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
        <button class="notification__close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    // Add styles if not exists
    this.addNotificationStyles();

    // Add to page
    document.body.appendChild(notification);

    // Add close event
    const closeBtn = notification.querySelector('.notification__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideNotification(notification);
      });
    }

    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.hideNotification(notification);
    }, 5000);

    return notification;
  }

  // Hide notification
  hideNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
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
    if (document.getElementById('ui-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'ui-notification-styles';
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

      .notification__content span {
        flex: 1;
      }

      .notification__close {
        background: none;
        border: none;
        color: var(--gray-400);
        cursor: pointer;
        padding: var(--spacing-1);
        border-radius: var(--radius);
        transition: color var(--transition-fast);
      }

      .notification__close:hover {
        color: var(--gray-600);
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

      /* Stack notifications */
      .notification:nth-child(n+2) {
        top: calc(var(--spacing-4) + 80px);
      }

      .notification:nth-child(n+3) {
        top: calc(var(--spacing-4) + 160px);
      }

      .notification:nth-child(n+4) {
        opacity: 0.8;
        transform: scale(0.95) translateX(100%);
      }

      .notification:nth-child(n+4).show {
        transform: scale(0.95) translateX(0);
      }
    `;
    document.head.appendChild(style);
  }

  // Show confirmation dialog
  showConfirmation(message, onConfirm, onCancel) {
    const modal = document.createElement('div');
    modal.className = 'modal confirmation-modal';
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__content">
        <div class="modal__header">
          <h3>Confirmação</h3>
        </div>
        <div class="modal__body">
          <p>${message}</p>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary cancel-btn">Cancelar</button>
          <button class="btn btn--primary confirm-btn">Confirmar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Add event listeners
    const confirmBtn = modal.querySelector('.confirm-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const backdrop = modal.querySelector('.modal__backdrop');

    const closeModal = () => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => modal.remove(), 300);
    };

    confirmBtn.addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });

    cancelBtn.addEventListener('click', () => {
      closeModal();
      if (onCancel) onCancel();
    });

    backdrop.addEventListener('click', () => {
      closeModal();
      if (onCancel) onCancel();
    });

    return modal;
  }

  // Show prompt dialog
  showPrompt(message, defaultValue = '', onSubmit, onCancel) {
    const modal = document.createElement('div');
    modal.className = 'modal prompt-modal';
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__content">
        <div class="modal__header">
          <h3>Entrada</h3>
        </div>
        <div class="modal__body">
          <p>${message}</p>
          <div class="form-group">
            <input type="text" class="prompt-input" value="${defaultValue}" placeholder="Digite aqui...">
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--secondary cancel-btn">Cancelar</button>
          <button class="btn btn--primary submit-btn">Enviar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    const input = modal.querySelector('.prompt-input');
    input.focus();
    input.select();

    // Add event listeners
    const submitBtn = modal.querySelector('.submit-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const backdrop = modal.querySelector('.modal__backdrop');

    const closeModal = () => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => modal.remove(), 300);
    };

    const submit = () => {
      const value = input.value.trim();
      closeModal();
      if (onSubmit) onSubmit(value);
    };

    submitBtn.addEventListener('click', submit);

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submit();
    });

    cancelBtn.addEventListener('click', () => {
      closeModal();
      if (onCancel) onCancel();
    });

    backdrop.addEventListener('click', () => {
      closeModal();
      if (onCancel) onCancel();
    });

    return modal;
  }

  // Smooth scroll to element
  scrollToElement(element, offset = 0) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    
    if (element) {
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }

  // Add ripple effect to button
  addRippleEffect(button) {
    button.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
      `;
      
      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);
      
      setTimeout(() => ripple.remove(), 600);
    });

    // Add ripple animation CSS
    this.addRippleStyles();
  }

  // Add ripple styles
  addRippleStyles() {
    if (document.getElementById('ripple-styles')) return;

    const style = document.createElement('style');
    style.id = 'ripple-styles';
    style.textContent = `
      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Format currency
  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  // Format date
  formatDate(date) {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
  }

  // Format relative time
  formatRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} dia${days > 1 ? 's' : ''} atrás`;
    if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
    if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
    return 'Agora';
  }

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Throttle function
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}