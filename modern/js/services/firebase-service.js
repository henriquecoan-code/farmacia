// Firebase Service - Handles all Firebase operations
export class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.isInitialized = false;
  // Lightweight client cache (localStorage)
  this._productsCacheKey = 'products_cache_v2';
  // TTL in ms (default 60 min)
  this._productsCacheTTL = 60 * 60 * 1000;
  }

  async init() {
    try {
      // Use the existing Firebase config from the current site
      const firebaseConfig = {
        apiKey: "AIzaSyDlTtNFfZIVIPJCIuJvnLB89idtAdKaFr8",
        authDomain: "farmaciasaobenedito-bcb2c.firebaseapp.com",
        databaseURL: "https://farmaciasaobenedito-bcb2c-default-rtdb.firebaseio.com",
        projectId: "farmaciasaobenedito-bcb2c",
        storageBucket: "farmaciasaobenedito-bcb2c.appspot.com",
        messagingSenderId: "789057690355",
        appId: "1:789057690355:web:e01ee3616df2679fe2f586",
        measurementId: "G-DHFR7WKVWS"
      };

      // Dynamic import Firebase modules
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js');
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js');
      const { getFirestore } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');

      this.app = initializeApp(firebaseConfig);
      this.auth = getAuth(this.app);
      this.firestore = getFirestore(this.app);
      this.isInitialized = true;

      console.log('Firebase initialized successfully');
    } catch (error) {
      console.warn('Firebase initialization failed, running in offline mode:', error);
      // Don't throw error, just mark as not initialized so fallback can be used
      this.isInitialized = false;
    }
  }

  // Authentication methods
  async signIn(email, password) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js');
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  // =============== ORDERS (NEW) ===============
  /**
   * Create a new order document. Expects shape:
   * { id (number), createdAt, items[], totals{subtotal,shipping,discount,total}, shippingMethod, paymentMethod, installments?, address{}, user, coupon?, status, history[] }
   */
  async createOrder(order) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const payload = Object.assign({}, order, {
        status: order.status || 'pending',
        history: order.history || [ { status: order.status || 'pending', at: new Date().toISOString(), note: 'Pedido criado' } ]
      });
      const docRef = await addDoc(collection(this.firestore, 'orders'), payload);
      return docRef.id; // Firestore id (string) returned; keep numeric id inside payload.id
    } catch (e) {
      console.error('Error creating order', e);
      throw e;
    }
  }

  async listOrders({ status=null, limit:lim=100 } = {}) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { collection, getDocs, query, where, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      let q = query(collection(this.firestore, 'orders'), orderBy('createdAt','desc'), limit(lim));
      if (status) {
        q = query(collection(this.firestore, 'orders'), where('status','==', status), orderBy('createdAt','desc'), limit(lim));
      }
      const snap = await getDocs(q);
      const orders = [];
      snap.forEach(doc => orders.push(Object.assign({ _docId: doc.id }, doc.data())));
      return orders;
    } catch (e) {
      console.error('Error listing orders', e);
      return [];
    }
  }

  /**
   * List orders for a specific user (by uid first, fallback to email)
   * Options: { uid?: string, email?: string, limit?: number, status?: string }
   */
  async listOrdersByUser({ uid=null, email=null, status=null, limit:lim=100 } = {}) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    const { collection, getDocs, query, where, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
    const ordersCol = collection(this.firestore, 'orders');
    const results = [];
    let snap = null;
    try {
      if (uid) {
        try {
          // Try with orderBy for better UX; if index missing, fallback below
          let q = query(ordersCol, where('user.uid','==', uid), orderBy('createdAt','desc'), limit(lim));
          if (status) q = query(ordersCol, where('user.uid','==', uid), where('status','==', status), orderBy('createdAt','desc'), limit(lim));
          snap = await getDocs(q);
        } catch (err) {
          // Fallback without orderBy to avoid composite index requirement
          let q = query(ordersCol, where('user.uid','==', uid), limit(lim));
          if (status) q = query(ordersCol, where('user.uid','==', uid), where('status','==', status), limit(lim));
          snap = await getDocs(q);
        }
      }
      if ((!snap || snap.empty) && email) {
        try {
          let q = query(ordersCol, where('user.email','==', email), orderBy('createdAt','desc'), limit(lim));
          if (status) q = query(ordersCol, where('user.email','==', email), where('status','==', status), orderBy('createdAt','desc'), limit(lim));
          snap = await getDocs(q);
        } catch (err) {
          let q = query(ordersCol, where('user.email','==', email), limit(lim));
          if (status) q = query(ordersCol, where('user.email','==', email), where('status','==', status), limit(lim));
          snap = await getDocs(q);
        }
      }
      if (snap) {
        snap.forEach(doc => results.push(Object.assign({ _docId: doc.id }, doc.data())));
      }
      return results;
    } catch (e) {
      console.error('Error listing orders by user', e);
      return [];
    }
  }

  async updateOrderStatus(docId, newStatus, note='') {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const ref = doc(this.firestore, 'orders', docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Order not found');
      const data = snap.data();
      const history = Array.isArray(data.history)? data.history.slice(): [];
      history.push({ status: newStatus, at: new Date().toISOString(), note });
      await updateDoc(ref, { status: newStatus, history });
      return true;
    } catch (e) {
      console.error('Error updating order status', e);
      throw e;
    }
  }

  async signUp(email, password) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js');
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  async signOut() {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    const { signOut } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js');
    return signOut(this.auth);
  }

  // Firestore methods
  async getProducts() {
    // Local cache
    const cached = this._getLocalCache(this._productsCacheKey);
    const now = Date.now();

    // If not initialized, try to serve cache; otherwise throw for caller fallback
    if (!this.isInitialized) {
      if (cached?.items && cached.items.length) return cached.items;
      throw new Error('Firebase not initialized');
    }

    try {
      const { collection, getDocs, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');

      // Allow manual bypass via query param (?nocache=1)
      const nocache = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nocache');

      // First, get remote productsVersion (cheap single-doc read)
      let remoteVersion = null;
      try {
        const metaRef = doc(this.firestore, 'meta', 'counters');
        const metaSnap = await getDoc(metaRef);
        if (metaSnap.exists()) {
          const data = metaSnap.data();
          remoteVersion = typeof data.productsVersion === 'number' ? data.productsVersion : null;
        }
      } catch (e) {
        // ignore; we may still use TTL cache below
      }

      // Decide if we can return cache
      if (!nocache && cached?.items && Array.isArray(cached.items)) {
        const ageOk = (now - (cached.ts || 0) < this._productsCacheTTL);
        if (remoteVersion !== null) {
          if (cached.version === remoteVersion && ageOk) {
            return cached.items;
          }
        } else {
          // If meta/counters not readable, fallback to TTL-based cache
          if (ageOk) {
            console.info('[FirebaseService] Using cached products (meta unavailable)');
            return cached.items;
          }
        }
      }

      // Fetch from Firestore when no valid cache
      const querySnapshot = await getDocs(collection(this.firestore, 'produtos'));
      let products = [];
      querySnapshot.forEach((d) => {
        const data = d.data();
        if (data.criadoEm && data.criadoEm.toDate) {
          data.criadoEm = data.criadoEm.toDate();
        }
        products.push(Object.assign({ id: d.id }, data));
      });

      // If Firestore returned empty (e.g., rules blocked or collection empty), fallback to local JSON if available
      if (!products.length && typeof window !== 'undefined' && !window.SHOWCASE_MODE) {
        try {
          const resp = await fetch('/data/products.json', { cache: 'no-store' });
          const items = await resp.json();
          if (Array.isArray(items) && items.length) {
            console.info('[FirebaseService] Fallback to /data/products.json');
            products = items;
          }
        } catch {}
      }

      // Save/update local cache
      const newCache = {
        items: products,
        version: remoteVersion ?? (cached?.version ?? 0),
        ts: now
      };
      this._setLocalCache(this._productsCacheKey, newCache);
      return products;
    } catch (error) {
      console.error('Error getting products:', error);
      if (cached?.items && cached.items.length) return cached.items;
      return [];
    }
  }

  async getProduct(id) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'produtos', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return Object.assign({ id: docSnap.id }, docSnap.data());
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting product:', error);
      return null;
    }
  }

  async addProduct(product) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
  const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
  const docRef = await addDoc(collection(this.firestore, 'produtos'), product);
  // Bump products version for cache invalidation
  this._bumpProductsVersion().catch(() => {});
      return docRef.id;
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  }

  async updateProduct(id, product) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'produtos', id);
      await updateDoc(docRef, product);
  // Bump products version for cache invalidation
  this._bumpProductsVersion().catch(() => {});
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async deleteProduct(id) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'produtos', id);
      await deleteDoc(docRef);
  // Bump products version for cache invalidation
  this._bumpProductsVersion().catch(() => {});
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  // Cliente methods
  async getClients() {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const querySnapshot = await getDocs(collection(this.firestore, 'clientes'));
      
      const clients = [];
      querySnapshot.forEach((doc) => {
        clients.push(Object.assign({ id: doc.id }, doc.data()));
      });
      
      return clients;
    } catch (error) {
      console.error('Error getting clients:', error);
      return [];
    }
  }

  async getClient(id) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'clientes', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return Object.assign({ id: docSnap.id }, docSnap.data());
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting client:', error);
      return null;
    }
  }

  async getClientByEmail(email) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { collection, getDocs, query, where, limit } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const q = query(collection(this.firestore, 'clientes'), where('email','==', email), limit(1));
      const snap = await getDocs(q);
      let found = null;
      snap.forEach(doc => { if (!found) found = Object.assign({ id: doc.id }, doc.data()); });
      return found;
    } catch (error) {
      console.error('Error getting client by email:', error);
      return null;
    }
  }

  async addAddressToClient(clientId, address, { favorite = false } = {}) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { doc, getDoc, updateDoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'clientes', clientId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Client not found');
      const data = snap.data();
      const addresses = Array.isArray(data.addresses) ? data.addresses.slice() : [];
      // Normalize
      const newAddress = Object.assign({ id: 'addr_' + Date.now().toString(36), favorite: !!favorite, createdAt: new Date().toISOString() }, address);
      if (favorite) {
        addresses.forEach(a => a.favorite = false);
      }
      addresses.push(newAddress);
      await updateDoc(docRef, { addresses });
      return newAddress;
    } catch (e) {
      console.error('Error adding address to client', e);
      throw e;
    }
  }

  async updateClientAddress(clientId, addressId, patch) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'clientes', clientId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Client not found');
      const data = snap.data();
      let addresses = Array.isArray(data.addresses) ? data.addresses.slice() : [];
      let updated = false;
      addresses = addresses.map(a => {
        if (a.id === addressId) { updated = true; return Object.assign({}, a, patch, { updatedAt: new Date().toISOString() }); }
        return a;
      });
      if (!updated) throw new Error('Address not found');
      // If patch.favorite true set others false
      if (patch.favorite) addresses.forEach(a => { if (a.id !== addressId) a.favorite = false; });
      await updateDoc(docRef, { addresses });
      return true;
    } catch (e) {
      console.error('Error updating client address', e);
      throw e;
    }
  }

  async setFavoriteAddress(clientId, addressId) {
    return this.updateClientAddress(clientId, addressId, { favorite: true });
  }

  async deleteClientAddress(clientId, addressId) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    try {
      const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'clientes', clientId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error('Client not found');
      const data = snap.data();
      const addresses = (data.addresses || []).filter(a => a.id !== addressId);
      await updateDoc(docRef, { addresses });
      return true;
    } catch (e) {
      console.error('Error deleting client address', e);
      throw e;
    }
  }

  async addClient(client) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = await addDoc(collection(this.firestore, 'clientes'), client);
      return docRef.id;
    } catch (error) {
      console.error('Error adding client:', error);
      throw error;
    }
  }

  async updateClient(id, client) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'clientes', id);
      await updateDoc(docRef, client);
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }

  async deleteClient(id) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const docRef = doc(this.firestore, 'clientes', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting client:', error);
      throw error;
    }
  }

  // Initialize sample data if collections are empty
  async initializeSampleData() {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      // Check if products collection is empty
      const products = await this.getProducts();
      if (products.length === 0) {
        console.log('Initializing sample products...');
        await this.createSampleProducts();
      }

      // Check if clients collection is empty  
      const clients = await this.getClients();
      if (clients.length === 0) {
        console.log('Initializing sample clients...');
        await this.createSampleClients();
      }
    } catch (error) {
      console.error('Error initializing sample data:', error);
    }
  }

  async createSampleProducts() {
    const sampleProducts = [
      {
        name: 'Dipirona 500mg',
        category: 'medicamentos',
        price: 8.90,
        stock: 50,
        description: 'Analgésico e antitérmico - 20 comprimidos',
        status: 'active',
        featured: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Protetor Solar FPS 60',
        category: 'dermocosmeticos',
        price: 45.90,
        stock: 25,
        description: 'Proteção solar para todos os tipos de pele',
        status: 'active',
        featured: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Vitamina C 1g',
        category: 'suplementos',
        price: 25.90,
        stock: 30,
        description: 'Suplemento vitamínico - 30 cápsulas',
        status: 'active',
        featured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Termômetro Digital',
        category: 'equipamentos',
        price: 18.90,
        stock: 15,
        description: 'Termômetro digital com display LCD',
        status: 'active',
        featured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Shampoo Infantil',
        category: 'bebes',
        price: 12.50,
        stock: 40,
        description: 'Shampoo suave para bebês - 200ml',
        status: 'active',
        featured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const product of sampleProducts) {
      await this.addProduct(product);
    }
  }

  async createSampleClients() {
    const sampleClients = [
      {
        name: 'Maria Silva',
        email: 'maria.silva@email.com',
        phone: '(11) 99999-1234',
        cpf: '123.456.789-01',
        birthDate: '1985-03-15',
        address: {
          street: 'Rua das Flores, 123',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01234-567'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'João Santos',
        email: 'joao.santos@email.com', 
        phone: '(11) 98888-5678',
        cpf: '987.654.321-09',
        birthDate: '1978-11-22',
        address: {
          street: 'Av. Central, 456',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '98765-432'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        name: 'Ana Costa',
        email: 'ana.costa@email.com',
        phone: '(11) 97777-9876',
        cpf: '456.789.123-45',
        birthDate: '1992-07-08',
        address: {
          street: 'Rua do Comércio, 789',
          city: 'São Paulo',
          state: 'SP', 
          zipCode: '54321-987'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const client of sampleClients) {
      await this.addClient(client);
    }
  }

  // Auth state observer
  onAuthStateChanged(callback) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    import('https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js').then(({ onAuthStateChanged }) => {
      onAuthStateChanged(this.auth, callback);
    });
  }

  // Get current user
  getCurrentUser() {
    if (!this.isInitialized) return null;
    return this.auth.currentUser;
  }

  // ===== Client-side cache helpers =====
  _getLocalCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  _setLocalCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota errors
    }
  }

  async _bumpProductsVersion() {
    if (!this.isInitialized) return;
    try {
      const { doc, setDoc, serverTimestamp, increment } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const metaRef = doc(this.firestore, 'meta', 'counters');
      await setDoc(metaRef, { productsVersion: increment(1), productsUpdatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn('[FirebaseService] Failed to bump products version', e);
    }
  }
}