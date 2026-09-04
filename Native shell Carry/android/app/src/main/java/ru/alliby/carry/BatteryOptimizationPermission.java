package ru.alliby.carry;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * Без исключения из оптимизации батареи система может задерживать/съедать сам
 * data-message пуш carry_order_assigned в спящем режиме на многих прошивках,
 * и телефон не разбудится на новый заказ (см. CarryFirebaseMessagingService).
 * Показываем поясняющую модалку, затем системный запрос
 * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (прямой Да/Нет с уже выбранным
 * приложением, без похода в список).
 */
final class BatteryOptimizationPermission {
    private BatteryOptimizationPermission() {}

    /** @return true если разрешения не было и была показана модалка. */
    static boolean maybeRequest(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        PowerManager pm = (PowerManager) activity.getSystemService(Activity.POWER_SERVICE);
        String pkg = activity.getPackageName();
        if (pm == null || pm.isIgnoringBatteryOptimizations(pkg)) return false;

        new AlertDialog.Builder(activity)
            .setTitle("Заказы могут не разбудить телефон")
            .setMessage("Система ограничивает уведомления в спящем режиме. Чтобы новый заказ будил телефон и открывал экран принятия вовремя, разрешите Alliby Carry работать без ограничений батареи.")
            .setCancelable(true)
            .setPositiveButton("Разрешить", (dialog, which) -> {
                try {
                    activity.startActivity(new Intent(
                        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + pkg)
                    ));
                } catch (Exception e) {}
            })
            .setNegativeButton("Позже", null)
            .show();
        return true;
    }
}
