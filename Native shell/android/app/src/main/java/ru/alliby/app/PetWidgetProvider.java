package ru.alliby.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Locale;

import ru.alliby.app.tamagotchi.HealthConnectSteps;

/**
 * Домашний виджет "Питомец": показывает все метрики Health Connect за сегодня
 * (шаги, дистанция, калории, сон, тренировка, пульс) прямо на рабочем столе,
 * без открытия приложения. Читает Health Connect напрямую тем же кодом, что и
 * веб-версия тамагочи через TamagotchiPlugin (HealthConnectSteps требует
 * только Context, не Activity) — поэтому периодическое обновление системой
 * (updatePeriodMillis) работает и когда приложение полностью закрыто.
 * Каждая метрика независима: если разрешение на конкретную метрику не выдано,
 * по ней просто показывается "—", остальные при этом показываются нормально.
 */
public class PetWidgetProvider extends AppWidgetProvider {

    private interface OnDone {
        void run();
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        final PendingResult pendingResult = goAsync();
        final int[] remaining = { appWidgetIds.length };
        for (int appWidgetId : appWidgetIds) {
            updateOne(context, appWidgetManager, appWidgetId, () -> {
                synchronized (remaining) {
                    remaining[0]--;
                    if (remaining[0] <= 0) pendingResult.finish();
                }
            });
        }
    }

    private void updateOne(Context context, AppWidgetManager appWidgetManager, int appWidgetId, OnDone onDone) {
        Context appContext = context.getApplicationContext();

        Intent openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=tamagotchi"));
        openIntent.setPackage(context.getPackageName());
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            context, 1000 + appWidgetId, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (!HealthConnectSteps.isAvailable(appContext)) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_pet);
            views.setOnClickPendingIntent(R.id.pet_btn_open, openPending);
            views.setOnClickPendingIntent(R.id.pet_widget_root, openPending);
            views.setViewVisibility(R.id.pet_metrics, View.GONE);
            views.setViewVisibility(R.id.pet_empty, View.VISIBLE);
            appWidgetManager.updateAppWidget(appWidgetId, views);
            onDone.run();
            return;
        }

        HealthConnectSteps.fetchTodaySteps(appContext, steps ->
            HealthConnectSteps.fetchTodayMetrics(appContext, metrics -> {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_pet);
                views.setOnClickPendingIntent(R.id.pet_btn_open, openPending);
                views.setOnClickPendingIntent(R.id.pet_widget_root, openPending);
                views.setViewVisibility(R.id.pet_metrics, View.VISIBLE);
                views.setViewVisibility(R.id.pet_empty, View.GONE);

                views.setTextViewText(R.id.pet_val_steps, steps == null ? "—" : String.valueOf(steps));
                views.setTextViewText(R.id.pet_val_distance, formatDistance(metrics.getDistanceMeters()));
                views.setTextViewText(R.id.pet_val_calories, formatCalories(metrics.getActiveCaloriesKcal()));
                views.setTextViewText(R.id.pet_val_sleep, formatMinutesHm(metrics.getSleepMinutes()));
                views.setTextViewText(R.id.pet_val_exercise, formatMinutes(metrics.getExerciseMinutes()));
                views.setTextViewText(R.id.pet_val_heart, formatHeartRate(metrics.getAvgHeartRateBpm()));

                appWidgetManager.updateAppWidget(appWidgetId, views);
                onDone.run();
            })
        );
    }

    private static String formatDistance(Double meters) {
        if (meters == null) return "—";
        return String.format(Locale.getDefault(), "%.1f км", meters / 1000.0);
    }

    private static String formatCalories(Double kcal) {
        if (kcal == null) return "—";
        return String.format(Locale.getDefault(), "%.0f ккал", kcal);
    }

    private static String formatMinutesHm(Long minutes) {
        if (minutes == null) return "—";
        long h = minutes / 60;
        long m = minutes % 60;
        return h > 0
            ? String.format(Locale.getDefault(), "%dч %02dм", h, m)
            : String.format(Locale.getDefault(), "%d мин", m);
    }

    private static String formatMinutes(Long minutes) {
        if (minutes == null) return "—";
        return String.format(Locale.getDefault(), "%d мин", minutes);
    }

    private static String formatHeartRate(Long bpm) {
        if (bpm == null) return "—";
        return bpm + " уд/мин";
    }
}
