package ru.alliby.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * Оптимизация батареи (отдельно от SCHEDULE_EXACT_ALARM, см. ExactAlarmPermission) —
 * основная причина беззвучных напоминаний в спящем режиме на многих прошивках:
 * даже с точным alarm'ом система может задерживать сам показ уведомления/звук,
 * если приложение не в списке "без ограничений". Показываем свою поясняющую
 * модалку, а затем — системный запрос ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
 * (даёт прямой Да/Нет диалог с уже выбранным приложением, без похода в список).
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
            .setTitle("Напоминания могут не сработать")
            .setMessage("Телефон ограничивает уведомления в спящем режиме. Чтобы напоминания о записях и звук приходили вовремя, разрешите Alliby работать без ограничений батареи.")
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
