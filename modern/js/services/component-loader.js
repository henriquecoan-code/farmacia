/**
 * Component Loader Service
 * Manages loading of reusable components like header and footer
 */
class ComponentLoader {
    constructor() {
        this.components = new Map();
        this.cache = new Map();
    }

    /**
     * Load a component from the components directory
     * @param {string} componentName - Name of the component file (without .html)
     * @param {string} targetSelector - CSS selector where to insert the component
     * @param {Object} options - Additional options
     */
    async loadComponent(componentName, targetSelector, options = {}) {
        try {
            // Check cache first
            let html = this.cache.get(componentName);
            
            if (!html) {
                const response = await fetch(`modern/components/${componentName}.html`);
                if (!response.ok) {
                    throw new Error(`Failed to load component: ${componentName}`);
                }
                html = await response.text();
                this.cache.set(componentName, html);
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
        }
        
        return success;
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
}

// Export for use in other modules
export { ComponentLoader };
export default ComponentLoader;