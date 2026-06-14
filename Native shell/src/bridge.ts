/**
 * Alliby Native Bridge
 *
 * Инициализируется при старте нативного приложения.
 * Слушает события из WebView и проксирует их к нативным плагинам Capacitor.
 * Также слушает нативные события и отправляет их в WebView через postMessage.
 *
 * Контракт:
 *   WebView → Native : window.AllibyNative.<method>(args)
 *   Native → WebView : window.postMessage({ type: 'alliby:<event>', ...data }, '*')
 */

import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Badge } from '@capawesome/capacitor-badge';

// ─── Push Notifications ──────────────────────────────────────────────────────

async function initPush(userId: string) {
  // Запрашиваем разрешение
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== 'granted') return;

  await PushNotifications.register();

  // Получаем FCM/APNs токен — отправляем в WebView для сохранения в БД
  PushNotifications.addListener('registration', token => {
    notifyWebView('push:registered', { token: token.value, userId });
  });

  PushNotifications.addListener('registrationError', err => {
    console.error('Push registration error:', err);
  });

  // Нотификация пришла пока приложение открыто
  PushNotifications.addListener('pushNotificationReceived', notification => {
    notifyWebView('push:received', {
      title: notification.title,
      body: notification.body,
      data: notification.data,
    });
  });

  // Пользователь тапнул на нотификацию
  PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const data = action.notification.data as Record<string, string>;
    notifyWebView('push:tapped', { data });

    // Навигация по типу уведомления
    if (data?.type === 'order_ready' || data?.type === 'order_status') {
      notifyWebView('navigate', { screen: 'calenabs', tab: 'orders' });
    }
    if (data?.type === 'booking_confirmed') {
      notifyWebView('navigate', { screen: 'calenabs', tab: 'bookings' });
    }
  });
}

async function clearPush() {
  await PushNotifications.removeAllListeners();
  await PushNotifications.removeAllDeliveredNotifications();
}

// ─── Geolocation ─────────────────────────────────────────────────────────────

async function getCurrentLocation() {
  const { coords } = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 8000,
  });
  return { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
}

// ─── Haptics ─────────────────────────────────────────────────────────────────

const HAPTIC_MAP: Record<string, ImpactStyle> = {
  light:  ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy:  ImpactStyle.Heavy,
};

async function haptic(style: 'light' | 'medium' | 'heavy' = 'medium') {
  await Haptics.impact({ style: HAPTIC_MAP[style] ?? ImpactStyle.Medium });
}

// ─── Badge ───────────────────────────────────────────────────────────────────

async function setBadge(count: number) {
  if (count <= 0) {
    await Badge.clear();
  } else {
    await Badge.set({ count });
  }
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

async function setTheme(dark: boolean) {
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  await StatusBar.setBackgroundColor({ color: dark ? '#0f0f0f' : '#ffffff' });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

function initAppLifecycle() {
  App.addListener('appStateChange', ({ isActive }) => {
    notifyWebView('app:stateChange', { isActive });
  });

  App.addListener('backButton', () => {
    notifyWebView('app:backButton', {});
  });
}

// ─── WebView communication ───────────────────────────────────────────────────

function notifyWebView(type: string, data: Record<string, unknown>) {
  const webview = document.querySelector('capacitor-app') as HTMLElement & {
    contentWindow?: Window;
  };
  const target = (webview as { contentWindow?: Window })?.contentWindow ?? window;
  target.postMessage({ type: `alliby:${type}`, ...data }, '*');
}

// ─── Public API (доступна в WebView как window.AllibyNative) ─────────────────

export const AllibyNative = {
  registerPush:      (userId: string)                        => initPush(userId),
  clearPush:         ()                                      => clearPush(),
  requestLocation:   ()                                      => getCurrentLocation(),
  haptic:            (style: 'light' | 'medium' | 'heavy')  => haptic(style),
  setBadge:          (count: number)                         => setBadge(count),
  setTheme:          (dark: boolean)                         => setTheme(dark),
};

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initBridge() {
  initAppLifecycle();
  // Экспортируем в глобальный контекст WebView
  (window as unknown as Record<string, unknown>).AllibyNative = AllibyNative;
}
