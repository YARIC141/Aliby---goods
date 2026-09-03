package ru.alliby.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

/**
 * Разрешение "Будильники и напоминания" (SCHEDULE_EXACT_ALARM, API 31+) нужно и для
 * личных событий виджета (AlarmManager напрямую), и для напоминаний о записях/аренде
 * из клиентского приложения (Capacitor LocalNotifications тоже планирует их через
 * AlarmManager) — без него система переносит будильники на потом в Doze, и звук
 * напоминания может не сработать вовремя или вообще не сработать.
 */
final class ExactAlarmPermission {
    private ExactAlarmPermission() {}

    static void maybeRequest(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        AlarmManager am = (AlarmManager) activity.getSystemService(Activity.ALARM_SERVICE);
        if (am != null && !am.canScheduleExactAlarms()) {
            Toast.makeText(activity, "Разрешите «Будильники и напоминания», чтобы напоминания звучали вовремя", Toast.LENGTH_LONG).show();
            try {
                activity.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e) {}
        }
    }
}
