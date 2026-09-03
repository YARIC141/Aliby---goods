package ru.alliby.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;

public class AllibyWidgetProvider extends AppWidgetProvider {

    static final String ACTION_PREV_DAY = "ru.alliby.app.widget.ACTION_PREV_DAY";
    static final String ACTION_NEXT_DAY = "ru.alliby.app.widget.ACTION_NEXT_DAY";
    static final String ACTION_TODAY = "ru.alliby.app.widget.ACTION_TODAY";
    static final String ACTION_TOGGLE_THEME = "ru.alliby.app.widget.ACTION_TOGGLE_THEME";
    static final String ACTION_PREV_MONTH = "ru.alliby.app.widget.ACTION_PREV_MONTH";
    static final String ACTION_NEXT_MONTH = "ru.alliby.app.widget.ACTION_NEXT_MONTH";
    static final String ACTION_SET_MODE_AGENDA = "ru.alliby.app.widget.ACTION_SET_MODE_AGENDA";
    static final String ACTION_SET_MODE_CALENDAR = "ru.alliby.app.widget.ACTION_SET_MODE_CALENDAR";
    static final String ACTION_SELECT_DAY = "ru.alliby.app.widget.ACTION_SELECT_DAY";
    static final String EXTRA_APPWIDGET_ID = AppWidgetManager.EXTRA_APPWIDGET_ID;
    static final String EXTRA_DATE = "date";

    private static final int COLOR_ACCENT = Color.parseColor("#e8743b");
    private static final int COLOR_BOOKING = Color.parseColor("#e8743b");
    private static final int COLOR_PERSONAL = Color.parseColor("#3b82f6");
    private static final int COLOR_ORDER = Color.parseColor("#22c55e");
    private static final int COLOR_RENT = Color.parseColor("#ef4444");
    private static final String[] MONTHS_RU = {
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    };

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
        boolean isCalendar = "calendar".equals(WidgetPrefs.viewMode(context, appWidgetId));

        views.setViewVisibility(R.id.widget_list, isCalendar ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_empty, isCalendar ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_calendar, isCalendar ? View.VISIBLE : View.GONE);

        views.setInt(R.id.widget_btn_mode_note, "setColorFilter", isCalendar ? textSecondary : COLOR_ACCENT);
        views.setInt(R.id.widget_btn_mode_calendar, "setColorFilter", isCalendar ? COLOR_ACCENT : textSecondary);
        views.setOnClickPendingIntent(R.id.widget_btn_mode_note,
            navPendingIntent(context, appWidgetId, ACTION_SET_MODE_AGENDA, 10000));
        views.setOnClickPendingIntent(R.id.widget_btn_mode_calendar,
            navPendingIntent(context, appWidgetId, ACTION_SET_MODE_CALENDAR, 11000));

        if (isCalendar) {
            String yearMonth = WidgetPrefs.calendarYearMonth(context, appWidgetId);
            views.setTextViewText(R.id.widget_date_label, formatMonthLabel(yearMonth));
            buildCalendarWeeks(context, views, appWidgetId, yearMonth, dark);
        } else {
            views.setTextViewText(R.id.widget_date_label, formatDateLabel(selectedDate));
        }

        if (!isCalendar) {
            Intent listIntent = new Intent(context, AllibyWidgetService.class);
            listIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            listIntent.setData(Uri.parse(listIntent.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_list, listIntent);
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);
        }

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
            navPendingIntent(context, appWidgetId, isCalendar ? ACTION_PREV_MONTH : ACTION_PREV_DAY, 4000));
        views.setOnClickPendingIntent(R.id.widget_btn_next_day,
            navPendingIntent(context, appWidgetId, isCalendar ? ACTION_NEXT_MONTH : ACTION_NEXT_DAY, 5000));
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

    private static String formatMonthLabel(String yearMonth) {
        try {
            String[] p = yearMonth.split("-");
            return MONTHS_RU[Integer.parseInt(p[1]) - 1] + " " + p[0];
        } catch (Exception e) {
            return yearMonth;
        }
    }

    private static void buildCalendarWeeks(Context context, RemoteViews views, int appWidgetId, String yearMonth, boolean dark) {
        views.removeAllViews(R.id.widget_calendar_weeks);

        String[] p = yearMonth.split("-");
        int year = Integer.parseInt(p[0]);
        int month0 = Integer.parseInt(p[1]) - 1;

        Calendar cal = Calendar.getInstance();
        cal.set(year, month0, 1, 0, 0, 0);
        int mondayFirstDow = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        int daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
        int totalCells = mondayFirstDow + daysInMonth;
        int totalWithTrailing = totalCells + (7 - totalCells % 7) % 7;
        String prefix = yearMonth + "-";

        String today = WidgetPrefs.todayStr();
        String selected = WidgetPrefs.selectedDate(context, appWidgetId);
        Map<String, LinkedHashSet<String>> dayTypes = collectDayTypes(context);
        int dimColor = dark ? 0xff555555 : 0xffcccccc;
        int normalColor = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        int selectedBg = dark ? R.drawable.widget_calendar_selected_dark : R.drawable.widget_calendar_selected;

        RemoteViews rowRv = null;
        for (int i = 0; i < totalWithTrailing; i++) {
            if (i % 7 == 0) {
                rowRv = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_row);
            }

            RemoteViews cellRv = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_cell);
            boolean hasDay = i >= mondayFirstDow && i < mondayFirstDow + daysInMonth;

            if (!hasDay) {
                cellRv.setTextViewText(R.id.calendar_cell_day, "");
                cellRv.setInt(R.id.calendar_cell_day, "setBackgroundResource", 0);
            } else {
                int dayNum = i - mondayFirstDow + 1;
                String ds = prefix + (dayNum < 10 ? "0" + dayNum : String.valueOf(dayNum));
                boolean isToday = ds.equals(today);
                boolean isSelected = ds.equals(selected);

                cellRv.setTextViewText(R.id.calendar_cell_day, String.valueOf(dayNum));
                cellRv.setTextColor(R.id.calendar_cell_day, isToday ? COLOR_ACCENT : normalColor);
                cellRv.setInt(R.id.calendar_cell_day, "setBackgroundResource", isSelected ? selectedBg : 0);

                LinkedHashSet<String> types = dayTypes.get(ds);
                if (types != null) {
                    for (String type : types) {
                        RemoteViews dotRv = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_dot);
                        dotRv.setInt(R.id.calendar_dot, "setColorFilter", colorForType(type));
                        cellRv.addView(R.id.calendar_cell_dots, dotRv);
                    }
                }

                Intent selIntent = new Intent(context, WidgetDateNavReceiver.class);
                selIntent.setAction(ACTION_SELECT_DAY);
                selIntent.putExtra(EXTRA_APPWIDGET_ID, appWidgetId);
                selIntent.putExtra(EXTRA_DATE, ds);
                PendingIntent selPending = PendingIntent.getBroadcast(
                    context, (appWidgetId + "_" + ds).hashCode(), selIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                cellRv.setOnClickPendingIntent(R.id.calendar_cell_root, selPending);
            }

            if (!hasDay) {
                cellRv.setTextColor(R.id.calendar_cell_day, dimColor);
            }

            rowRv.addView(R.id.calendar_row_root, cellRv);
            if (i % 7 == 6) {
                views.addView(R.id.widget_calendar_weeks, rowRv);
            }
        }
    }

    private static int colorForType(String type) {
        if ("rent".equals(type)) return COLOR_RENT;
        if ("personal".equals(type)) return COLOR_PERSONAL;
        if ("order".equals(type)) return COLOR_ORDER;
        return COLOR_BOOKING;
    }

    private static Map<String, LinkedHashSet<String>> collectDayTypes(Context context) {
        Map<String, LinkedHashSet<String>> map = new HashMap<>();
        addDayTypes(map, PersonalEventsStore.listPersonal(context));
        addDayTypes(map, PersonalEventsStore.listAlliby(context));
        addDayTypes(map, PersonalEventsStore.listOrders(context));
        return map;
    }

    private static void addDayTypes(Map<String, LinkedHashSet<String>> map, JSONArray arr) {
        if (arr == null) return;
        SimpleDateFormat dayFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            long at = o.optLong("atMillis");
            if (at <= 0) continue;
            String type = o.optString("type", "");
            if (type.isEmpty()) continue;
            String ds = dayFmt.format(new java.util.Date(at));
            LinkedHashSet<String> set = map.get(ds);
            if (set == null) {
                set = new LinkedHashSet<>();
                map.put(ds, set);
            }
            set.add(type);
        }
    }

    private static int[] allWidgetIds(Context context, AppWidgetManager mgr) {
        int[] a = mgr.getAppWidgetIds(new ComponentName(context, AllibyWidgetProvider.class));
        int[] b = mgr.getAppWidgetIds(new ComponentName(context, AllibyWidgetProviderTall.class));
        int[] all = new int[a.length + b.length];
        System.arraycopy(a, 0, all, 0, a.length);
        System.arraycopy(b, 0, all, a.length, b.length);
        return all;
    }

    /** Вызывается из AllibyWidgetPlugin и AddPersonalEventActivity после изменения данных (без смены темы/даты). */
    static void refreshAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = allWidgetIds(context, mgr);
        if (ids.length > 0) {
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        }
    }

    /** Полная перерисовка всех виджетов (шапка + список) — после смены темы. */
    static void refreshAllFull(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : allWidgetIds(context, mgr)) {
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
