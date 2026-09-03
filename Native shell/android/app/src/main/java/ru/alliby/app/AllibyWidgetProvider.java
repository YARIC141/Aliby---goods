package ru.alliby.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class AllibyWidgetProvider extends AppWidgetProvider {

    static final String ACTION_PREV_DAY = "ru.alliby.app.widget.ACTION_PREV_DAY";
    static final String ACTION_NEXT_DAY = "ru.alliby.app.widget.ACTION_NEXT_DAY";
    static final String ACTION_TODAY = "ru.alliby.app.widget.ACTION_TODAY";
    static final String ACTION_TOGGLE_THEME = "ru.alliby.app.widget.ACTION_TOGGLE_THEME";
    static final String EXTRA_APPWIDGET_ID = AppWidgetManager.EXTRA_APPWIDGET_ID;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateOne(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateOne(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        boolean dark = WidgetPrefs.isDark(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_alliby);

        views.setInt(R.id.widget_root, "setBackgroundResource",
            dark ? R.drawable.widget_background_dark : R.drawable.widget_background);
        int textPrimary = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        int textSecondary = dark ? 0xff9a9a9a : 0xff666666;
        views.setTextColor(R.id.widget_title, textPrimary);
        views.setTextColor(R.id.widget_date_label, textSecondary);
        views.setTextColor(R.id.widget_empty, dark ? 0xff888888 : 0xff999999);

        String selectedDate = WidgetPrefs.selectedDate(context, appWidgetId);
        views.setTextViewText(R.id.widget_date_label, formatDateLabel(selectedDate));

        Intent listIntent = new Intent(context, AllibyWidgetService.class);
        listIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        listIntent.setData(Uri.parse(listIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, listIntent);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        Intent rowIntent = new Intent(context, WidgetClickRouterActivity.class);
        rowIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent rowPendingIntent = PendingIntent.getActivity(
            context, appWidgetId, rowIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.widget_list, rowPendingIntent);

        Intent openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=calenabs"));
        openIntent.setPackage(context.getPackageName());
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            context, 1000 + appWidgetId, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_btn_open, openPending);

        Intent addIntent = new Intent(context, AddPersonalEventActivity.class);
        addIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent addPending = PendingIntent.getActivity(
            context, 2000 + appWidgetId, addIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_btn_add, addPending);

        Intent settingsIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=reminders"));
        settingsIntent.setPackage(context.getPackageName());
        settingsIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent settingsPending = PendingIntent.getActivity(
            context, 3000 + appWidgetId, settingsIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_btn_settings, settingsPending);

        views.setOnClickPendingIntent(R.id.widget_btn_theme,
            navPendingIntent(context, appWidgetId, ACTION_TOGGLE_THEME, 7000));

        views.setOnClickPendingIntent(R.id.widget_btn_prev_day,
            navPendingIntent(context, appWidgetId, ACTION_PREV_DAY, 4000));
        views.setOnClickPendingIntent(R.id.widget_btn_next_day,
            navPendingIntent(context, appWidgetId, ACTION_NEXT_DAY, 5000));
        views.setOnClickPendingIntent(R.id.widget_date_label,
            navPendingIntent(context, appWidgetId, ACTION_TODAY, 6000));

        appWidgetManager.updateAppWidget(appWidgetId, views);
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list);
    }

    private static PendingIntent navPendingIntent(Context context, int appWidgetId, String action, int reqOffset) {
        Intent intent = new Intent(context, WidgetDateNavReceiver.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_APPWIDGET_ID, appWidgetId);
        return PendingIntent.getBroadcast(
            context, reqOffset + appWidgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String formatDateLabel(String ds) {
        try {
            String today = WidgetPrefs.todayStr();
            if (ds.equals(today)) return "Сегодня";

            Calendar cal = Calendar.getInstance();
            String[] parts = today.split("-");
            cal.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]));
            cal.add(Calendar.DAY_OF_YEAR, 1);
            String tomorrow = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
            if (ds.equals(tomorrow)) return "Завтра";

            String[] dp = ds.split("-");
            Calendar dcal = Calendar.getInstance();
            dcal.set(Integer.parseInt(dp[0]), Integer.parseInt(dp[1]) - 1, Integer.parseInt(dp[2]));
            return new SimpleDateFormat("d MMMM, EEEE", new Locale("ru")).format(dcal.getTime());
        } catch (Exception e) {
            return ds;
        }
    }

    /** Вызывается из AllibyWidgetPlugin и AddPersonalEventActivity после изменения данных (без смены темы/даты). */
    static void refreshAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, AllibyWidgetProvider.class));
        if (ids.length > 0) {
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        }
    }

    /** Полная перерисовка всех виджетов (шапка + список) — после смены темы. */
    static void refreshAllFull(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, AllibyWidgetProvider.class));
        for (int id : ids) {
            updateOne(context, mgr, id);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            WidgetPrefs.clearWidget(context, id);
        }
    }
}
