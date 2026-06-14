/**
 * Alliby Client Integration
 *
 * Этот сниппет добавляется в client/index.html.
 * Предоставляет единый API для вызова нативных функций с автоматическим
 * fallback на браузерные API когда приложение открыто не в нативной оболочке.
 *
 * Вставить в client/index.html сразу после <script> тега с основным кодом:
 *
 *   // ─── NATIVE BRIDGE ───
 *   (function() { /* содержимое этого файла * / })();
 */

(function () {
  'use strict';

  // Определяем запущены ли мы внутри нативной оболочки Capacitor
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform?.());

  // ─── Push-уведомления ────────────────────────────────────────────────────────

  /**
   * Вызвать после успешного входа пользователя.
   * В нативе: регистрирует FCM/APNs и сохраняет токен в БД.
   * В браузере: работает через существующий Service Worker Web Push.
   */
  window.AllibyBridge = {

    registerPush(userId) {
      if (isNative && window.AllibyNative) {
        window.AllibyNative.registerPush(userId);
      }
      // Web push через SW остаётся как fallback (уже реализован в основном коде)
    },

    clearPush() {
      if (isNative && window.AllibyNative) {
        window.AllibyNative.clearPush();
      }
    },

    // ─── Геолокация ────────────────────────────────────────────────────────────

    /**
     * Получить текущие координаты.
     * В нативе: через Capacitor Geolocation (лучшие разрешения на iOS).
     * В браузере: через navigator.geolocation.
     * Возвращает Promise<{ lat, lng, accuracy }> | null
     */
    async requestLocation() {
      if (isNative && window.AllibyNative) {
        try {
          return await window.AllibyNative.requestLocation();
        } catch (e) {
          console.warn('Native geolocation failed, falling back', e);
        }
      }
      // Fallback: браузерный API
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          err => reject(err),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    },

    // ─── Хаптик ────────────────────────────────────────────────────────────────

    /**
     * style: 'light' | 'medium' | 'heavy'
     * В браузере: navigator.vibrate как fallback.
     */
    haptic(style = 'medium') {
      if (isNative && window.AllibyNative) {
        window.AllibyNative.haptic(style);
        return;
      }
      // Fallback: вибрация
      const durations = { light: 30, medium: 60, heavy: 100 };
      navigator.vibrate?.(durations[style] ?? 60);
    },

    // ─── Бэдж на иконке ────────────────────────────────────────────────────────

    /**
     * Устанавливает счётчик на иконке приложения.
     * count = 0 → очищает бэдж.
     */
    setBadge(count) {
      if (isNative && window.AllibyNative) {
        window.AllibyNative.setBadge(count);
        return;
      }
      // Fallback: Web App Badge API (поддерживается в Chrome/Edge, ограниченно iOS)
      if (navigator.setAppBadge) {
        count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
      }
    },

    // ─── Тема ──────────────────────────────────────────────────────────────────

    /**
     * Синхронизирует статус-бар с темой приложения.
     * dark: true → тёмный статус-бар, false → светлый.
     */
    setTheme(dark) {
      if (isNative && window.AllibyNative) {
        window.AllibyNative.setTheme(dark);
      }
      // В браузере тема управляется через CSS — ничего дополнительного не нужно
    },
  };

  // ─── Входящие события от нативного слоя ─────────────────────────────────────

  window.addEventListener('message', function (e) {
    const msg = e.data;
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('alliby:')) return;

    const type = msg.type.replace('alliby:', '');

    switch (type) {

      // FCM/APNs токен получен — сохранить в push_subscriptions
      case 'push:registered':
        _handlePushRegistration(msg.token, msg.userId);
        break;

      // Push пришёл пока приложение открыто — показать in-app уведомление
      case 'push:received':
        _showInAppNotification(msg.title, msg.body, msg.data);
        break;

      // Пользователь тапнул на push — навигация
      case 'navigate':
        if (typeof goTo === 'function') goTo(msg.screen);
        if (msg.tab && typeof setTab === 'function') setTab(msg.tab);
        break;

      // Приложение вернулось на передний план — обновить данные
      case 'app:stateChange':
        if (msg.isActive) {
          // Перезапустить WebSocket если отвалился
          if (typeof realtimeSubscribeOrders === 'function' && window._session?.user?.id) {
            realtimeSubscribeOrders(window._session.user.id);
          }
        }
        break;

      // Android кнопка "Назад"
      case 'app:backButton':
        if (typeof goBack === 'function') goBack();
        break;
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async function _handlePushRegistration(deviceToken, userId) {
    if (!deviceToken || !userId) return;
    const platform = window.Capacitor?.getPlatform?.() ?? 'web'; // 'ios' | 'android'
    try {
      // Сохраняем device_token в push_subscriptions
      await window._supabase?.from('push_subscriptions').upsert({
        user_id: userId,
        app: 'client',
        device_token: deviceToken,
        platform,
        endpoint: deviceToken,   // для совместимости со схемой
        p256dh: '',
        auth_key: '',
      }, { onConflict: 'user_id,app' });
    } catch (err) {
      console.error('Failed to save push token', err);
    }
  }

  function _showInAppNotification(title, body, data) {
    // Простой toast — можно заменить на кастомный UI
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;top:calc(env(safe-area-inset-top) + 12px);left:12px;right:12px;
      background:var(--surface-2,#fff);border:1px solid var(--border,#eee);
      border-radius:14px;padding:12px 16px;z-index:9999;
      box-shadow:0 4px 20px rgba(0,0,0,.15);cursor:pointer;
    `;
    el.innerHTML = `<div style="font-weight:600;font-size:14px">${title ?? ''}</div>
                    <div style="font-size:13px;color:#666;margin-top:2px">${body ?? ''}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

})();
