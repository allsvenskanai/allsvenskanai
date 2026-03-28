importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDQBtrYhiWbtOTvNHjeJS3WetXx9kYRbAc",
  authDomain: "allsvenskanai.firebaseapp.com",
  projectId: "allsvenskanai",
  storageBucket: "allsvenskanai.firebasestorage.app",
  messagingSenderId: "165931219052",
  appId: "1:165931219052:web:6b80cf43571c7567558049"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.fcmOptions,
  });
});

// Click handler — open app when notification clicked
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.link || 'https://allsvenskanai.se';
  e.waitUntil(clients.openWindow(url));
});
