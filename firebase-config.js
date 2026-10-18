// ==================================================
// SEVEN NURSES
// FIREBASE CONFIG
// ==================================================

import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";


// ==================================================
// FIREBASE CONFIG
// ==================================================

const firebaseConfig = {

  apiKey:
    "তোমার Firebase API KEY",

  authDomain:
    "seven-nurses-c7a87.firebaseapp.com",

  databaseURL:
    "https://seven-nurses-c7a87-default-rtdb.asia-southeast1.firebasedatabase.app",

  projectId:
    "seven-nurses-c7a87",

  storageBucket:
    "seven-nurses-c7a87.firebasestorage.app",

  messagingSenderId:
    "তোমার Messaging Sender ID",

  appId:
    "তোমার App ID"

};


// ==================================================
// INITIALIZE FIREBASE
// ==================================================

const app =
  getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);


// ==================================================
// SERVICES
// ==================================================

const auth =
  getAuth(app);

const db =
  getDatabase(app);

const storage =
  getStorage(app);


// ==================================================
// EXPORT
// ==================================================

export {
  app,
  auth,
  db,
  storage
};
