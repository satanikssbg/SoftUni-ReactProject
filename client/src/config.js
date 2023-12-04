import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const APP_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3030';

const PER_PAGE = Number(10);

const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const INITIALIZE_FIREBASE = initializeApp({
    apiKey: 'AIzaSyDVCyjbX7hSP4-zOrH-gWH-aH2MqCTQv4o',
    authDomain: 'portal-silistra-react.firebaseapp.com',
    projectId: 'portal-silistra-react',
    storageBucket: 'portal-silistra-react.appspot.com',
    messagingSenderId: '457581867256',
    appId: '1:457581867256:web:6ae7c24541d6a24ed54b0d',
});

const FIREBASE_STORAGE = getStorage(INITIALIZE_FIREBASE);

export {
    APP_URL,
    API_URL,
    PER_PAGE,
    ALLOWED_IMAGE_EXT,
    FIREBASE_STORAGE
};