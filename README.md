# SEVEN NURSES — Redesign Frontend

এই package-টি আপনার দেওয়া
`Seven_Nurses_Online_Exam_COMPLETE_FIXED.html`
এর mobile-first blue/green card design অনুসরণ করে তৈরি করা হয়েছে।

## Files

- index.html — student login, exam, timer, result/review
- admin.html — Firebase Admin login, dashboard, questions, results, settings
- style.css — original-style responsive UI
- app.js — student frontend
- firebase-config.js — seven-nurses8 public Firebase config
- exam.html/result.html — compatibility redirects
- firebase-messaging-sw.js — push notification service worker

## Important

Current Render backend-এর API contract যদি আগের server.js থেকে আলাদা হয়,
endpoint field names অনুযায়ী সামান্য adjustment লাগতে পারে।

Firebase service-account/private key এই package-এ রাখা হয়নি।
