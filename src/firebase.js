import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyCebyffYs-VifEbCUOyLFqmy-87Bx_0N0s",
    authDomain: "kiara-c4f93.firebaseapp.com",
    projectId: "kiara-c4f93",
    storageBucket: "kiara-c4f93.firebasestorage.app",
    messagingSenderId: "66636637714",
    appId: "1:66636637714:web:cd756c88af54964539dacb",
    measurementId: "G-ZMQW9C13ST"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
