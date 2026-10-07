# SEVEN NURSES

## Render Environment Variables
- ADMIN_UID=oj3TdOnQiWROOgKa9jVL8a3p74S2
- SESSION_SECRET=use-a-long-random-secret
- FIREBASE_DATABASE_URL=https://seven-nurses8-default-rtdb.firebaseio.com
- FIREBASE_SERVICE_ACCOUNT_JSON=entire Firebase service-account JSON on one line

Build: `npm install`
Start: `npm start`

Firebase Realtime Database rules can remain closed because the server uses Firebase Admin SDK.
Never commit the service account JSON/private key.
