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
            WidgetPrefs.resetToToday(context, appWidgetId);
        } else if (AllibyWidgetProvider.ACTION_PREV_MONTH.equals(action)) {
            WidgetPrefs.shiftCalendarMonth(context, appWidgetId, -1);
        } else if (AllibyWidgetProvider.ACTION_NEXT_MONTH.equals(action)) {
            WidgetPrefs.shiftCalendarMonth(context, appWidgetId, 1);
        } else if (AllibyWidgetProvider.ACTION_SET_MODE_AGENDA.equals(action)) {
            WidgetPrefs.setViewMode(context, appWidgetId, "agenda");
        } else if (AllibyWidgetProvider.ACTION_SET_MODE_CALENDAR.equals(action)) {
            WidgetPrefs.setViewMode(context, appWidgetId, "calendar");
        } else if (AllibyWidgetProvider.ACTION_SELECT_DAY.equals(action)) {
            String date = intent.getStringExtra(AllibyWidgetProvider.EXTRA_DATE);
            if (date == null) return;
            WidgetPrefs.setSelectedDate(context, appWidgetId, date);
            WidgetPrefs.setViewMode(context, appWidgetId, "agenda");
        } else {
            return;
        }

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        AllibyWidgetProvider.updateOne(context, mgr, appWidgetId);
    }
}
