import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.alliby_business.app',
  appName: 'Alliby Business',
  // Загружаем живой сайт — нативная оболочка рендерит production URL
  server: {
    url: 'https://admin.alliby.ru',
    cleartext: false,
  },
  // Папка www нужна Capacitor формально, но реально грузим server.url
  webDir: 'www',
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#78b4e0',
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
    Geolocation: {
      // Для центрирования карты зон доставки на текущей позиции заведения
    },
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
