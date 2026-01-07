import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDE5ezDYXd2pFYT0qrjuBm1KURGwIcNo4w",
    authDomain: "portfolio-raw.firebaseapp.com",
    projectId: "portfolio-raw",
    storageBucket: "portfolio-raw.firebasestorage.app",
    messagingSenderId: "246223117560",
    appId: "1:246223117560:web:a733d1623f04a7ce47af0d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
