// Produtos Page App
import ComponentLoader from './services/component-loader.js';

class ProdutosApp {
    constructor() {
        this.componentLoader = new ComponentLoader();
        this.init();
    }

    async init() {
        try {
            // Load components first
            await this.loadComponents();
            
            // Setup event listeners after components are loaded
            this.setupEventListeners();
            
            console.log('Produtos app initialized successfully');
        } catch (error) {
            console.error('Error initializing produtos app:', error);
        }
    }

    async loadComponents() {
        try {
            // Load header and footer components
            await this.componentLoader.loadHeader();
            await this.componentLoader.loadFooter();
            
            console.log('Components loaded successfully in produtos page');
        } catch (error) {
            console.error('Error loading components:', error);
        }
    }

    setupEventListeners() {
        // Wait for components to be loaded before setting up event listeners
        document.addEventListener('componentLoaded', (event) => {
            if (event.detail.componentName === 'header') {
                this.setupHeaderEventListeners();
            }
        });
    }

    setupHeaderEventListeners() {
        // Header search
        const searchInput = document.querySelector('.search-box__input');
        const searchButton = document.querySelector('.search-box__button');
        
        if (searchInput && searchButton) {
            searchButton.addEventListener('click', () => this.handleSearch());
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSearch();
            });
        }

        // User authentication
        const userBtn = document.getElementById('user-btn');
        if (userBtn) {
            userBtn.addEventListener('click', () => {
                alert('Sistema de login será implementado em breve!');
            });
        }

        // Cart modal
        const cartBtn = document.getElementById('cart-btn');
        if (cartBtn) {
            cartBtn.addEventListener('click', () => {
                alert('Carrinho será implementado em breve!');
            });
        }

        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }

        // Mobile sidebar close events
        const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        if (mobileSidebarClose) {
            mobileSidebarClose.addEventListener('click', () => this.closeMobileSidebar());
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => this.closeMobileSidebar());
        }
    }

    handleSearch() {
        const searchInput = document.querySelector('.search-box__input');
        if (searchInput && searchInput.value.trim()) {
            alert(`Buscar por: ${searchInput.value}`);
        }
    }

    toggleMobileMenu() {
        const sidebar = document.getElementById('mobile-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        const toggle = document.getElementById('mobile-menu-toggle');
        
        if (sidebar && overlay && toggle) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            toggle.classList.toggle('active');
            
            if (sidebar.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    }

    closeMobileSidebar() {
        const sidebar = document.getElementById('mobile-sidebar');
        const overlay = document.getElementById('mobile-overlay');
        const toggle = document.getElementById('mobile-menu-toggle');
        
        if (sidebar && overlay && toggle) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            toggle.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProdutosApp();
});

export default ProdutosApp;