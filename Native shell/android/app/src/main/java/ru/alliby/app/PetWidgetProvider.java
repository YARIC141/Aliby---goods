package ru.alliby.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Locale;

import ru.alliby.app.tamagotchi.HealthConnectSteps;
import ru.alliby.app.tamagotchi.TamagotchiPrefs;

/**
 * Домашний виджет "Питомец": показывает все метрики Health Connect за сегодня
 * (шаги, дистанция, калории, сон, тренировка, пульс) прямо на рабочем столе,
 * без открытия приложения. Читает Health Connect напрямую тем же кодом, что и
 * веб-версия тамагочи через TamagotchiPlugin (HealthConnectSteps требует
 * только Context, не Activity) — поэтому периодическое обновление системой
 * (updatePeriodMillis) работает и когда приложение полностью закрыто.
 * Каждая метрика независима: если разрешение на конкретную метрику не выдано,
 * по ней просто показывается "—", остальные при этом показываются нормально.
 * Тема (светлая/тёмная/системная) — общая для всех виджетов Alliby, хранится
 * в WidgetPrefs; кнопка на этом виджете переключает её так же, как на Alliby.
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

    /** Перерисовывает все экземпляры этого виджета — вызывается после смены темы с другого
     * виджета, а также из TamagotchiPlugin сразу после каждого успешного запроса к Health
     * Connect из веб-версии, чтобы виджет не ждал системного updatePeriodMillis (минимум
     * 30 минут и может задерживаться Doze) и показывал те же цифры, что и открытое приложение. */
    public static void refreshAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, PetWidgetProvider.class));
        for (int id : ids) {
            updateOne(context, mgr, id, () -> {});
        }
    }

    private static void updateOne(Context context, AppWidgetManager appWidgetManager, int appWidgetId, OnDone onDone) {
        Context appContext = context.getApplicationContext();
        boolean dark = WidgetPrefs.isDark(context);
        int textPrimary = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        int textSecondary = dark ? 0xff9a9a9a : 0xff666666;
        int textEmpty = dark ? 0xff888888 : 0xff999999;
        int backgroundRes = dark ? R.drawable.widget_background_dark : R.drawable.widget_background;

        Intent openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=tamagotchi"));
        openIntent.setPackage(context.getPackageName());
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            context, 1000 + appWidgetId, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent themeIntent = new Intent(context, WidgetDateNavReceiver.class);
        themeIntent.setAction(AllibyWidgetProvider.ACTION_TOGGLE_THEME);
        themeIntent.putExtra(AllibyWidgetProvider.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent themePending = PendingIntent.getBroadcast(
            context, 8000 + appWidgetId, themeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (!HealthConnectSteps.isAvailable(appContext)) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_pet);
            views.setInt(R.id.pet_widget_root, "setBackgroundResource", backgroundRes);
            views.setTextColor(R.id.pet_title, textPrimary);
            views.setTextColor(R.id.pet_empty, textEmpty);
            views.setOnClickPendingIntent(R.id.pet_btn_theme, themePending);
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
                // Некоторые фитнес-браслеты (напр. Zepp Life) считают активные калории сами
                // по шагам и весу, но не пишут их в Health Connect отдельной записью — тогда
                // activeCaloriesKcal приходит null/0 при ненулевых шагах. Оцениваем калории
                // тем же способом, что и веб-версия (см. refreshHealthConnectMetrics в
                // tamagotchi/index.html), используя вес, зеркалированный из веб-версии.
                Double calories = metrics.getActiveCaloriesKcal();
                if ((calories == null || calories == 0) && steps != null && steps > 0) {
                    float weightKg = TamagotchiPrefs.bodyWeightKg(appContext);
                    if (weightKg > 0) calories = steps * weightKg * 0.0005;
                }

                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_pet);
                views.setInt(R.id.pet_widget_root, "setBackgroundResource", backgroundRes);
                views.setTextColor(R.id.pet_title, textPrimary);
                views.setOnClickPendingIntent(R.id.pet_btn_theme, themePending);
                views.setOnClickPendingIntent(R.id.pet_btn_open, openPending);
                views.setOnClickPendingIntent(R.id.pet_widget_root, openPending);
                views.setViewVisibility(R.id.pet_metrics, View.VISIBLE);
                views.setViewVisibility(R.id.pet_empty, View.GONE);

                int[] labelIds = {
                    R.id.pet_lbl_steps, R.id.pet_lbl_distance, R.id.pet_lbl_calories,
                    R.id.pet_lbl_sleep, R.id.pet_lbl_exercise, R.id.pet_lbl_heart,
                    R.id.pet_lbl_muscle, R.id.pet_lbl_fat
                };
                for (int id : labelIds) views.setTextColor(id, textSecondary);

                int[] valueIds = {
                    R.id.pet_val_steps, R.id.pet_val_distance, R.id.pet_val_calories,
                    R.id.pet_val_sleep, R.id.pet_val_exercise, R.id.pet_val_heart,
                    R.id.pet_val_muscle, R.id.pet_val_fat
                };
                for (int id : valueIds) views.setTextColor(id, textPrimary);

                views.setTextViewText(R.id.pet_val_steps, steps == null ? "—" : String.valueOf(steps));
                views.setTextViewText(R.id.pet_val_distance, formatDistance(metrics.getDistanceMeters()));
                views.setTextViewText(R.id.pet_val_calories, formatCalories(calories));
                views.setTextViewText(R.id.pet_val_sleep, formatMinutesHm(metrics.getSleepMinutes()));
                views.setTextViewText(R.id.pet_val_exercise, formatMinutes(metrics.getExerciseMinutes()));
                views.setTextViewText(R.id.pet_val_heart, formatHeartRate(metrics.getAvgHeartRateBpm()));

                TamagotchiPrefs.BodyComposition comp = TamagotchiPrefs.todayBodyComposition(appContext);
                views.setTextViewText(R.id.pet_val_muscle, formatSignedGrams(comp == null ? null : comp.muscleG));
                views.setTextViewText(R.id.pet_val_fat, formatSignedGrams(comp == null ? null : comp.fatG));

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

    private static String formatSignedGrams(Float grams) {
        if (grams == null) return "—";
        long rounded = Math.round((double) Math.abs(grams));
        return (grams >= 0 ? "+" : "−") + rounded + " г";
    }
}
