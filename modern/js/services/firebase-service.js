// Firebase Service - Handles all Firebase operations
export class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.isInitialized = false;
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
      console.error('Error initializing Firebase:', error);
      throw error;
    }
  }

  // Authentication methods
  async signIn(email, password) {
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js');
    return signInWithEmailAndPassword(this.auth, email, password);
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
    if (!this.isInitialized) throw new Error('Firebase not initialized');
    
    try {
      const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
      const querySnapshot = await getDocs(collection(this.firestore, 'produtos'));
      
      const products = [];
      querySnapshot.forEach((doc) => {
        products.push(Object.assign({ id: doc.id }, doc.data()));
      });
      
      return products;
    } catch (error) {
      console.error('Error getting products:', error);
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
}