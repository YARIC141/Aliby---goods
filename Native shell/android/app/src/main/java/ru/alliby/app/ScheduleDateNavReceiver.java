package ru.alliby.app;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ScheduleDateNavReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        int appWidgetId = intent.getIntExtra(ScheduleWidgetProvider.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        String action = intent.getAction();
        if (ScheduleWidgetProvider.ACTION_PREV_DAY.equals(action)) {
            ScheduleWidgetPrefs.shiftSelectedDate(context, appWidgetId, -1);
        } else if (ScheduleWidgetProvider.ACTION_NEXT_DAY.equals(action)) {
            ScheduleWidgetPrefs.shiftSelectedDate(context, appWidgetId, 1);
        } else if (ScheduleWidgetProvider.ACTION_TODAY.equals(action)) {
            ScheduleWidgetPrefs.resetToToday(context, appWidgetId);
        } else if (ScheduleWidgetProvider.ACTION_PREV_MONTH.equals(action)) {
            ScheduleWidgetPrefs.shiftCalendarMonth(context, appWidgetId, -1);
        } else if (ScheduleWidgetProvider.ACTION_NEXT_MONTH.equals(action)) {
            ScheduleWidgetPrefs.shiftCalendarMonth(context, appWidgetId, 1);
        } else if (ScheduleWidgetProvider.ACTION_SET_MODE_TODAY.equals(action)) {
            ScheduleWidgetPrefs.setViewMode(context, appWidgetId, "today");
        } else if (ScheduleWidgetProvider.ACTION_SET_MODE_CALENDAR.equals(action)) {
            ScheduleWidgetPrefs.setViewMode(context, appWidgetId, "calendar");
        } else if (ScheduleWidgetProvider.ACTION_SELECT_DAY.equals(action)) {
            String date = intent.getStringExtra(ScheduleWidgetProvider.EXTRA_DATE);
            if (date == null) return;
            ScheduleWidgetPrefs.setSelectedDate(context, appWidgetId, date);
            ScheduleWidgetPrefs.setViewMode(context, appWidgetId, "today");
        } else {
            return;
        }

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ScheduleWidgetProvider.updateOne(context, mgr, appWidgetId);
    }
}
