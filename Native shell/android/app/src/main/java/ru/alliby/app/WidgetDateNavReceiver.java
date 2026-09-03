package ru.alliby.app;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WidgetDateNavReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        int appWidgetId = intent.getIntExtra(AllibyWidgetProvider.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        String action = intent.getAction();
        if (AllibyWidgetProvider.ACTION_TOGGLE_THEME.equals(action)) {
            WidgetPrefs.cycleThemeMode(context);
            AllibyWidgetProvider.refreshAllFull(context);
            return;
        }
        if (AllibyWidgetProvider.ACTION_PREV_DAY.equals(action)) {
            WidgetPrefs.shiftSelectedDate(context, appWidgetId, -1);
        } else if (AllibyWidgetProvider.ACTION_NEXT_DAY.equals(action)) {
            WidgetPrefs.shiftSelectedDate(context, appWidgetId, 1);
        } else if (AllibyWidgetProvider.ACTION_TODAY.equals(action)) {
            WidgetPrefs.setSelectedDate(context, appWidgetId, WidgetPrefs.todayStr());
        } else {
            return;
        }

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        AllibyWidgetProvider.updateOne(context, mgr, appWidgetId);
    }
}
