package ru.alliby.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** Тема виджета и выбранный день (по каждому экземпляру виджета отдельно). */
class WidgetPrefs {

    private static final String PREFS = "alliby_widget_prefs";
    private static final String KEY_THEME = "widget_theme"; // "system" | "light" | "dark"
    private static final String KEY_DATE_PREFIX = "widget_date_";
    private static final String KEY_MODE_PREFIX = "widget_mode_"; // "agenda" | "calendar"
    private static final String KEY_CAL_YM_PREFIX = "widget_calym_"; // "yyyy-MM"

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String themeMode(Context ctx) {
        return prefs(ctx).getString(KEY_THEME, "system");
    }

    static void setThemeMode(Context ctx, String mode) {
        prefs(ctx).edit().putString(KEY_THEME, mode).apply();
    }

    /** Циклический переход "система" -> "светлая" -> "тёмная" -> "система" по кнопке на самом виджете. */
    static void cycleThemeMode(Context ctx) {
        String mode = themeMode(ctx);
        String next = "system".equals(mode) ? "light" : "light".equals(mode) ? "dark" : "system";
        setThemeMode(ctx, next);
    }

    static boolean isDark(Context ctx) {
        String mode = themeMode(ctx);
        if ("dark".equals(mode)) return true;
        if ("light".equals(mode)) return false;
        int uiMode = ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return uiMode == Configuration.UI_MODE_NIGHT_YES;
    }

    static String selectedDate(Context ctx, int appWidgetId) {
        String d = prefs(ctx).getString(KEY_DATE_PREFIX + appWidgetId, null);
        return d != null ? d : todayStr();
    }

    static void setSelectedDate(Context ctx, int appWidgetId, String ds) {
        prefs(ctx).edit().putString(KEY_DATE_PREFIX + appWidgetId, ds).apply();
    }

    static void shiftSelectedDate(Context ctx, int appWidgetId, int deltaDays) {
        String current = selectedDate(ctx, appWidgetId);
        Calendar cal = Calendar.getInstance();
        String[] parts = current.split("-");
        cal.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]));
        cal.add(Calendar.DAY_OF_YEAR, deltaDays);
        setSelectedDate(ctx, appWidgetId, new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime()));
    }

    static String viewMode(Context ctx, int appWidgetId) {
        return prefs(ctx).getString(KEY_MODE_PREFIX + appWidgetId, "agenda");
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
        Calendar cal = Calendar.getInstance();
        cal.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, 1);
        cal.add(Calendar.MONTH, deltaMonths);
        setCalendarYearMonth(ctx, appWidgetId, new SimpleDateFormat("yyyy-MM", Locale.US).format(cal.getTime()));
    }

    static void resetToToday(Context ctx, int appWidgetId) {
        setSelectedDate(ctx, appWidgetId, todayStr());
        setCalendarYearMonth(ctx, appWidgetId, todayStr().substring(0, 7));
    }

    static void clearWidget(Context ctx, int appWidgetId) {
        prefs(ctx).edit()
            .remove(KEY_DATE_PREFIX + appWidgetId)
            .remove(KEY_MODE_PREFIX + appWidgetId)
            .remove(KEY_CAL_YM_PREFIX + appWidgetId)
            .apply();
    }

    static String todayStr() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
    }
}
