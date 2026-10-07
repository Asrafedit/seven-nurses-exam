import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {getMessaging,isSupported,getToken,onMessage} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging.js';
const firebaseConfig={apiKey:'AIzaSyArek6tP3kPlGpngJ1gn6MNpFzOh28JpiQ',authDomain:'seven-nurses8.firebaseapp.com',projectId:'seven-nurses8',storageBucket:'seven-nurses8.firebasestorage.app',messagingSenderId:'912003149859',appId:'1:912003149859:web:d4a4f41a6060b37275c196',measurementId:'G-YS5KRB087J'};
export const app=initializeApp(firebaseConfig);export const auth=getAuth(app);export {isSupported,getToken,onMessage};
