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

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class ScheduleWidgetProvider extends AppWidgetProvider {

    static final String ACTION_PREV_DAY = "ru.alliby.app.schedule.ACTION_PREV_DAY";
    static final String ACTION_NEXT_DAY = "ru.alliby.app.schedule.ACTION_NEXT_DAY";
    static final String ACTION_TODAY = "ru.alliby.app.schedule.ACTION_TODAY";
    static final String ACTION_PREV_MONTH = "ru.alliby.app.schedule.ACTION_PREV_MONTH";
    static final String ACTION_NEXT_MONTH = "ru.alliby.app.schedule.ACTION_NEXT_MONTH";
    static final String ACTION_SET_MODE_TODAY = "ru.alliby.app.schedule.ACTION_SET_MODE_TODAY";
    static final String ACTION_SET_MODE_CALENDAR = "ru.alliby.app.schedule.ACTION_SET_MODE_CALENDAR";
    static final String ACTION_SELECT_DAY = "ru.alliby.app.schedule.ACTION_SELECT_DAY";
    static final String EXTRA_APPWIDGET_ID = AppWidgetManager.EXTRA_APPWIDGET_ID;
    static final String EXTRA_DATE = "date";

    private static final int COLOR_ACCENT = Color.parseColor("#e8743b");
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
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);

        views.setInt(R.id.schedule_widget_root, "setBackgroundResource",
            dark ? R.drawable.widget_background_dark : R.drawable.widget_background);
        int textPrimary = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        int textSecondary = dark ? 0xff9a9a9a : 0xff666666;
        views.setTextColor(R.id.schedule_widget_title, textPrimary);
        views.setTextColor(R.id.schedule_date_label, textSecondary);
        views.setTextColor(R.id.schedule_widget_empty, dark ? 0xff888888 : 0xff999999);

        String selectedDate = ScheduleWidgetPrefs.selectedDate(context, appWidgetId);
        boolean isCalendar = "calendar".equals(ScheduleWidgetPrefs.viewMode(context, appWidgetId));
        int weekday = IsoWeek.weekday(selectedDate);
        int week = IsoWeek.weekParity(selectedDate);

        views.setViewVisibility(R.id.schedule_widget_list, isCalendar ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.schedule_widget_empty, isCalendar ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.schedule_widget_calendar, isCalendar ? View.VISIBLE : View.GONE);

        views.setInt(R.id.schedule_mode_switch, "setBackgroundResource",
            dark ? R.drawable.widget_switch_track_dark : R.drawable.widget_switch_track);
        views.setInt(R.id.schedule_mode_today_wrap, "setBackgroundResource", isCalendar ? 0 : R.drawable.widget_switch_thumb);
        views.setInt(R.id.schedule_mode_calendar_wrap, "setBackgroundResource", isCalendar ? R.drawable.widget_switch_thumb : 0);
        views.setInt(R.id.schedule_btn_mode_today, "setColorFilter", isCalendar ? textSecondary : 0xffffffff);
        views.setInt(R.id.schedule_btn_mode_calendar, "setColorFilter", isCalendar ? 0xffffffff : textSecondary);
        views.setOnClickPendingIntent(R.id.schedule_btn_mode_today,
            navPendingIntent(context, appWidgetId, ACTION_SET_MODE_TODAY, 20000));
        views.setOnClickPendingIntent(R.id.schedule_btn_mode_calendar,
            navPendingIntent(context, appWidgetId, ACTION_SET_MODE_CALENDAR, 21000));

        if (isCalendar) {
            String yearMonth = ScheduleWidgetPrefs.calendarYearMonth(context, appWidgetId);
            views.setTextViewText(R.id.schedule_date_label, formatMonthLabel(yearMonth));
            views.setTextViewText(R.id.schedule_week_label, "");
            buildCalendarWeeks(context, views, appWidgetId, yearMonth, dark);
        } else {
            views.setTextViewText(R.id.schedule_date_label, formatDateLabel(selectedDate));
            views.setTextViewText(R.id.schedule_week_label, "Неделя " + week);
        }

        if (!isCalendar) {
            Intent listIntent = new Intent(context, ScheduleWidgetService.class);
            listIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            listIntent.setData(Uri.parse(listIntent.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.schedule_widget_list, listIntent);
            views.setEmptyView(R.id.schedule_widget_list, R.id.schedule_widget_empty);
        }

        Intent rowIntent = new Intent(context, EditScheduleDayActivity.class);
        rowIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent rowPendingIntent = PendingIntent.getActivity(
            context, appWidgetId, rowIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        views.setPendingIntentTemplate(R.id.schedule_widget_list, rowPendingIntent);

        Intent editIntent = new Intent(context, EditScheduleDayActivity.class);
        editIntent.putExtra("weekday", weekday);
        editIntent.putExtra("week", week);
        editIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent editPending = PendingIntent.getActivity(
            context, 1000 + appWidgetId, editIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.schedule_btn_edit, editPending);

        views.setOnClickPendingIntent(R.id.schedule_btn_prev_day,
            navPendingIntent(context, appWidgetId, isCalendar ? ACTION_PREV_MONTH : ACTION_PREV_DAY, 22000));
        views.setOnClickPendingIntent(R.id.schedule_btn_next_day,
            navPendingIntent(context, appWidgetId, isCalendar ? ACTION_NEXT_MONTH : ACTION_NEXT_DAY, 23000));
        views.setOnClickPendingIntent(R.id.schedule_date_label,
            navPendingIntent(context, appWidgetId, ACTION_TODAY, 24000));

        appWidgetManager.updateAppWidget(appWidgetId, views);
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.schedule_widget_list);
    }

    private static PendingIntent navPendingIntent(Context context, int appWidgetId, String action, int reqOffset) {
        Intent intent = new Intent(context, ScheduleDateNavReceiver.class);
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

            String tomorrow = IsoWeek.addDays(today, 1);
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
        views.removeAllViews(R.id.schedule_calendar_weeks);

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
        String selected = ScheduleWidgetPrefs.selectedDate(context, appWidgetId);
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

                if (ScheduleStore.hasLessons(context, IsoWeek.weekday(ds), IsoWeek.weekParity(ds))) {
                    RemoteViews dotRv = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_dot);
                    dotRv.setInt(R.id.calendar_dot, "setColorFilter", COLOR_ACCENT);
                    cellRv.addView(R.id.calendar_cell_dots, dotRv);
                }

                Intent selIntent = new Intent(context, ScheduleDateNavReceiver.class);
                selIntent.setAction(ACTION_SELECT_DAY);
                selIntent.putExtra(EXTRA_APPWIDGET_ID, appWidgetId);
                selIntent.putExtra(EXTRA_DATE, ds);
                PendingIntent selPending = PendingIntent.getBroadcast(
                    context, ("sched_" + appWidgetId + "_" + ds).hashCode(), selIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                cellRv.setOnClickPendingIntent(R.id.calendar_cell_root, selPending);
            }

            if (!hasDay) {
                cellRv.setTextColor(R.id.calendar_cell_day, dimColor);
            }

            rowRv.addView(R.id.calendar_row_root, cellRv);
            if (i % 7 == 6) {
                views.addView(R.id.schedule_calendar_weeks, rowRv);
            }
        }
    }

    private static int[] allWidgetIds(Context context, AppWidgetManager mgr) {
        return mgr.getAppWidgetIds(new ComponentName(context, ScheduleWidgetProvider.class));
    }

    /** Лёгкое обновление всех экземпляров после правки расписания (без смены темы). */
    static void refreshAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : allWidgetIds(context, mgr)) {
            updateOne(context, mgr, id);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            ScheduleWidgetPrefs.clearWidget(context, id);
        }
    }
}
