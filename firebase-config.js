import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-8-lNp8bTySo0Ebb6l3hK58xf59HNxcE",
  authDomain: "seven-nurses-c7a87.firebaseapp.com",
  databaseURL: "https://seven-nurses-c7a87-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "seven-nurses-c7a87",
  storageBucket: "seven-nurses-c7a87.firebasestorage.app",
  messagingSenderId: "306184363213",
  appId: "1:306184363213:web:adb9078db0ce8141df9d84",
  measurementId: "G-GX1BSWX9T7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

export { app, auth, analytics, firebaseConfig };
