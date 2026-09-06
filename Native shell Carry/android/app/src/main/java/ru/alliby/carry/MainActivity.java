package ru.alliby.carry;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public static final String EXTRA_OPEN_INCOMING_ORDER = "open_incoming_order";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean isIncomingOrder = getIntent() != null
            && getIntent().getBooleanExtra(EXTRA_OPEN_INCOMING_ORDER, false);
        handleIncomingOrderIntent(getIntent());
        // Не показываем модалку поверх экрана срочного принятия заказа — не мешаем таймеру оффера.
        if (!isIncomingOrder) {
            if (!FullScreenIntentPermission.maybeRequest(this)) {
                BatteryOptimizationPermission.maybeRequest(this);
            }
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(
                new NotificationBridge(this), "CarryNotifications");
        }
    }

    // Позволяет JS (carry/index.html) остановить мелодию оффера ровно в момент
    // ответа курьера (принял/отказался/истёк таймер) — до этого уведомление
    // 9100 у CarryFirebaseMessagingService звонит как входящий вызов и само
    // по себе не гаснет от открытия экрана.
    // Класс объявлен public — reflection-вызов addJavascriptInterface на части
    // WebView-версий ненадёжен для приватных/вложенных классов.
    public static class NotificationBridge {
        private final Context appCtx;

        public NotificationBridge(Context ctx) {
            this.appCtx = ctx.getApplicationContext();
        }

        @JavascriptInterface
        public void cancelIncomingOrder() {
            Log.d("CarryNotif", "cancelIncomingOrder() called from JS");
            NotificationManagerCompat.from(appCtx).cancel(CarryFirebaseMessagingService.NOTIFICATION_ID);
        }

        // Экран "Профиль" в carry/index.html — выбор мелодии оффера ("Ваш текущий
        // звонок" / "8-bit"). Читается в фоновом CarryFirebaseMessagingService,
        // поэтому хранится в SharedPreferences, а не в localStorage WebView.
        @JavascriptInterface
        public void setOrderSound(String sound) {
            appCtx.getSharedPreferences(CarryFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(CarryFirebaseMessagingService.PREF_ORDER_SOUND, sound)
                .apply();
        }

        @JavascriptInterface
        public String getOrderSound() {
            SharedPreferences prefs = appCtx.getSharedPreferences(
                CarryFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getString(CarryFirebaseMessagingService.PREF_ORDER_SOUND, "default");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingOrderIntent(intent);
    }

    private void handleIncomingOrderIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(EXTRA_OPEN_INCOMING_ORDER, false)) return;

        wakeScreenOverLockscreen();

        // MainActivity — singleTask, при повторном показе onCreate() не вызывается заново,
        // поэтому принудительно переключаем WebView на экран заказов независимо от того,
        // где курьер был до пробуждения телефона.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(
                    "if (typeof goToMain === 'function') { goToMain(); }", null));
        }
    }

    private void wakeScreenOverLockscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
    }
}
