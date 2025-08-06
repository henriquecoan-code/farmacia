// Test Firebase Import
console.log('Testing Firebase import...');

try {
  import('./services/firebase-service.js').then(module => {
    console.log('Firebase service imported successfully', module);
    const firebaseService = new module.FirebaseService();
    console.log('Firebase service instance created');
  }).catch(error => {
    console.error('Error importing Firebase service:', error);
  });
} catch (error) {
  console.error('Error with import:', error);
}