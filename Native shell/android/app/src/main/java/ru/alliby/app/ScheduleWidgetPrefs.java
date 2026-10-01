package ru.alliby.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Состояние конкретного экземпляра виджета "Расписание занятий" (по appWidgetId). */
class ScheduleWidgetPrefs {

    private static final String PREFS = "alliby_widget_prefs";
    private static final String KEY_DATE_PREFIX = "sched_date_";
    private static final String KEY_MODE_PREFIX = "sched_mode_"; // "today" | "calendar"
    private static final String KEY_CAL_YM_PREFIX = "sched_calym_"; // "yyyy-MM"

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String selectedDate(Context ctx, int appWidgetId) {
        String d = prefs(ctx).getString(KEY_DATE_PREFIX + appWidgetId, null);
        return d != null ? d : WidgetPrefs.todayStr();
    }

    static void setSelectedDate(Context ctx, int appWidgetId, String ds) {
        prefs(ctx).edit().putString(KEY_DATE_PREFIX + appWidgetId, ds).apply();
    }

    static void shiftSelectedDate(Context ctx, int appWidgetId, int deltaDays) {
        setSelectedDate(ctx, appWidgetId, IsoWeek.addDays(selectedDate(ctx, appWidgetId), deltaDays));
    }

    static String viewMode(Context ctx, int appWidgetId) {
        return prefs(ctx).getString(KEY_MODE_PREFIX + appWidgetId, "today");
    }

    static void setViewMode(Context ctx, int appWidgetId, String mode) {
        prefs(ctx).edit().putString(KEY_MODE_PREFIX + appWidgetId, mode).apply();
    }

    static String calendarYearMonth(Context ctx, int appWidgetId) {
        String stored = prefs(ctx).getString(KEY_CAL_YM_PREFIX + appWidgetId, null);
        if (stored != null) return stored;
        return selectedDate(ctx, appWidgetId).substring(0, 7);
    }

    static void setCalendarYearMonth(Context ctx, int appWidgetId, String yearMonth) {
        prefs(ctx).edit().putString(KEY_CAL_YM_PREFIX + appWidgetId, yearMonth).apply();
    }

    static void shiftCalendarMonth(Context ctx, int appWidgetId, int deltaMonths) {
        String[] parts = calendarYearMonth(ctx, appWidgetId).split("-");
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, 1);
        cal.add(java.util.Calendar.MONTH, deltaMonths);
        setCalendarYearMonth(ctx, appWidgetId,
            new java.text.SimpleDateFormat("yyyy-MM", java.util.Locale.US).format(cal.getTime()));
    }

    static void resetToToday(Context ctx, int appWidgetId) {
        setSelectedDate(ctx, appWidgetId, WidgetPrefs.todayStr());
        setCalendarYearMonth(ctx, appWidgetId, WidgetPrefs.todayStr().substring(0, 7));
    }

    static void clearWidget(Context ctx, int appWidgetId) {
        prefs(ctx).edit()
            .remove(KEY_DATE_PREFIX + appWidgetId)
            .remove(KEY_MODE_PREFIX + appWidgetId)
            .remove(KEY_CAL_YM_PREFIX + appWidgetId)
            .apply();
    }
}
