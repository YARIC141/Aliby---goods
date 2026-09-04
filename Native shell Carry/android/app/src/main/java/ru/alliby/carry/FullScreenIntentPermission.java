package ru.alliby.carry;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

/**
 * С Android 14 (API 34) USE_FULL_SCREEN_INTENT в манифесте не даёт разрешения
 * автоматически — система его выдаёт по умолчанию только категориям "звонки"/
 * "будильники". Без ручного включения пользователем полноэкранные уведомления
 * молча деградируют до обычного heads-up: звук/вибрация играют, но
 * CarryFirebaseMessagingService.setFullScreenIntent(...) не запускает
 * MainActivity, и экран не включается — ровно симптом "звук есть, экран не
 * включается". Показываем модалку и ведём в системную настройку разрешения.
 */
final class FullScreenIntentPermission {
    private FullScreenIntentPermission() {}

    /** @return true если разрешения не было и была показана модалка. */
    static boolean maybeRequest(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false;
        NotificationManager nm = (NotificationManager) activity.getSystemService(Activity.NOTIFICATION_SERVICE);
        if (nm == null || nm.canUseFullScreenIntent()) return false;

        new AlertDialog.Builder(activity)
            .setTitle("Экран не включится на новый заказ")
            .setMessage("Android требует отдельного разрешения на полноэкранные уведомления. Без него звук сыграет, но экран не включится и карточка заказа не откроется поверх блокировки. Включите разрешение в настройках.")
            .setCancelable(true)
            .setPositiveButton("Открыть настройки", (dialog, which) -> {
                try {
                    activity.startActivity(new Intent(
                        Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                        Uri.parse("package:" + activity.getPackageName())
                    ));
                } catch (Exception e) {}
            })
            .setNegativeButton("Позже", null)
            .show();
        return true;
    }
}
