import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.alliby.carry',
  appName: 'Alliby Carry',
  // Загружаем живой сайт — нативная оболочка рендерит production URL
  server: {
    url: 'https://carry.alliby.ru',
    cleartext: false,
  },
  // Папка www нужна Capacitor формально, но реально грузим server.url
  webDir: 'www',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#14b8a6',
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
    Geolocation: {
      // Курьер шлёт геопозицию, пока на смене — обычные foreground-запросы,
      // без фонового трекинга в v1 (см. Alliby_Carry_spec.md).
    },
  },
  android: {
    // Push через FCM — google-services.json кладётся в android/app/
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
