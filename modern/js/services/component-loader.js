/**
 * Component Loader Service
 * Manages loading of reusable components like header and footer
 */
class ComponentLoader {
    constructor() {
        this.components = new Map();
        this.cache = new Map();
    this.cacheTTLms = 1000 * 60 * 60 * 6; // 6h
    this.version = 'v1';
    }

    /**
     * Load a component from the components directory
     * @param {string} componentName - Name of the component file (without .html)
     * @param {string} targetSelector - CSS selector where to insert the component
     * @param {Object} options - Additional options
     */
    async loadComponent(componentName, targetSelector, options = {}) {
        try {
            // Show skeleton placeholder
            this.injectSkeleton(targetSelector, componentName);

            // In-memory cache first
            let html = this.cache.get(componentName);
            // LocalStorage cache
            if (!html) {
                const lsKey = `component_cache_${this.version}_${componentName}`;
                try {
                    const raw = localStorage.getItem(lsKey);
                    if (raw) {
                        const obj = JSON.parse(raw);
                        if (Date.now() - obj.t < this.cacheTTLms && obj.html) {
                            html = obj.html;
                            this.cache.set(componentName, html);
                        }
                    }
                } catch {}
            }
            // Network fetch if still missing
            if (!html) {
                const response = await fetch(`modern/components/${componentName}.html`, { cache: 'no-cache' });
                if (!response.ok) throw new Error(`Failed to load component: ${componentName}`);
                html = await response.text();
                this.cache.set(componentName, html);
                // Persist
                try { localStorage.setItem(`component_cache_${this.version}_${componentName}`, JSON.stringify({ t: Date.now(), html })); } catch {}
            }

            // Find target element
            const targetElement = document.querySelector(targetSelector);
            if (!targetElement) {
                throw new Error(`Target element not found: ${targetSelector}`);
            }

            // Insert HTML
            if (options.append) {
                targetElement.insertAdjacentHTML('beforeend', html);
            } else {
                targetElement.innerHTML = html;
            }

            // Mark as loaded
            this.components.set(componentName, {
                loaded: true,
                target: targetSelector,
                element: targetElement
            });

            // Trigger custom event
            this.triggerComponentLoaded(componentName, targetElement);

            return true;
        } catch (error) {
            console.error(`Error loading component ${componentName}:`, error);
            // Fallback minimal markup
            const targetElement = document.querySelector(targetSelector);
            if (targetElement && !targetElement.innerHTML.trim()) {
                targetElement.innerHTML = this.fallbackMarkup(componentName);
            }
            return false;
        }
    }

    /**
     * Load header component
     * @param {string} type - 'default' or 'admin'
     */
    async loadHeader(type = 'default') {
        const componentName = type === 'admin' ? 'admin-header' : 'header';
        const success = await this.loadComponent(componentName, '#header-container');
        
        if (success && type === 'default') {
            // Set active navigation link based on current page
            this.setActiveNavigation();
            
            // Setup header event listeners for modals
            this.setupHeaderEventListeners();
        }
        
        return success;
    }

    /**
     * Setup event listeners for header buttons
     */
    setupHeaderEventListeners() {
        // User button - open auth modal
        const userBtn = document.getElementById('user-btn');
        if (userBtn) {
            userBtn.addEventListener('click', () => {
                if (window.modalsManager) {
                    window.modalsManager.openAuthModal('login');
                }
            });
        }

        // Cart button - open cart modal
        const cartBtn = document.getElementById('cart-btn');
        if (cartBtn) {
            cartBtn.addEventListener('click', () => {
                if (window.modalsManager) {
                    window.modalsManager.openCartModal();
                }
            });
        }
    }

    /**
     * Load footer component
     */
    async loadFooter() {
        return await this.loadComponent('footer', '#footer-container');
    }

    /**
     * Set active navigation link based on current page
     */
    setActiveNavigation() {
        const currentPage = window.location.pathname.split('/').pop() || 'modern-index.html';
        const navLinks = document.querySelectorAll('.nav__link');
        
        navLinks.forEach(link => {
            link.classList.remove('nav__link--active');
            const href = link.getAttribute('href');
            
            if (href === currentPage || 
                (currentPage === 'modern-index.html' && href === '#') ||
                (currentPage === '' && href === '#')) {
                link.classList.add('nav__link--active');
            }
        });
    }

    /**
     * Trigger component loaded event
     */
    triggerComponentLoaded(componentName, element) {
        const event = new CustomEvent('componentLoaded', {
            detail: { componentName, element }
        });
        document.dispatchEvent(event);
    }

    /**
     * Check if component is loaded
     */
    isLoaded(componentName) {
        return this.components.has(componentName) && this.components.get(componentName).loaded;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    injectSkeleton(targetSelector, componentName){
        const target = document.querySelector(targetSelector);
        if (!target) return;
        if (target.dataset.skeletonInserted) return;
        // Basic skeleton style (only once)
        if (!document.getElementById('component-skeleton-style')) {
            const style = document.createElement('style');
            style.id = 'component-skeleton-style';
            style.textContent = `.skeleton-loading{position:relative;overflow:hidden;background:var(--gray-100);border-radius:var(--radius);} .skeleton-shimmer:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.6) 50%,rgba(255,255,255,0) 100%);animation:sk-shimmer 1.2s linear infinite;}@keyframes sk-shimmer{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}} .skeleton-header{height:110px;} .skeleton-footer{height:200px;margin-top:2rem;}`;
            document.head.appendChild(style);
        }
        const div = document.createElement('div');
        div.className = `skeleton-loading skeleton-${componentName === 'footer' ? 'footer':'header'} skeleton-shimmer`;
        target.innerHTML = '';
        target.appendChild(div);
        target.dataset.skeletonInserted = '1';
    }

    fallbackMarkup(componentName){
        if (componentName === 'header' || componentName === 'admin-header') {
            return `<header style="background:var(--primary-color);color:#fff;padding:.75rem 1rem;font-family:var(--font-family);"><strong>Farmácia</strong></header>`;
        }
        if (componentName === 'footer') {
            return `<footer style="background:var(--gray-100);padding:1rem;text-align:center;font-size:.75rem;">&copy; Farmácia</footer>`;
        }
        return '';
    }
}

// Export for use in other modules
export { ComponentLoader };
export default ComponentLoader;