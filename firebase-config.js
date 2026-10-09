import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyArek6tP3kPlGpngJ1gn6MNpFzOh28JpiQ",
  authDomain: "seven-nurses8.firebaseapp.com",
  databaseURL: "https://seven-nurses8-default-rtdb.firebaseio.com",
  projectId: "seven-nurses8",
  storageBucket: "seven-nurses8.firebasestorage.app",
  messagingSenderId: "912003149859",
  appId: "1:912003149859:web:d4a4f41a6060b37275c196",
  measurementId: "G-YS5KRB087J"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const FCM_VAPID_KEY =
  "BEGu_jEEMxMRI2O0YmWlQjGFSEnyWV-tSCl0sJa2ax9KMW6gpiSHNzG7qsoXcBqm44AqkmBYAUnN0u3pQKhK9dc";

export { app, auth, firebaseConfig, FCM_VAPID_KEY };
