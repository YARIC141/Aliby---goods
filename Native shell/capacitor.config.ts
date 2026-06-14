import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.alliby.app',
  appName: 'Alliby',
  // Загружаем живой сайт — нативная оболочка рендерит production URL
  server: {
    url: 'https://alliby.ru',
    cleartext: false,
  },
  // Папка www нужна Capacitor формально, но реально грузим server.url
  webDir: 'www',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'default',
      backgroundColor: '#ffffff',
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
    Geolocation: {
      // iOS: запрашивать разрешение только "пока используется"
    },
  },
  android: {
    // Все push-уведомления через FCM
    // google-services.json помещается в android/app/
  },
  ios: {
    // APNs настраивается в Xcode → Signing & Capabilities → Push Notifications
    contentInset: 'automatic',
  },
};

export default config;
