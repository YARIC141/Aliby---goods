package ru.alliby.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;

class ScheduleWidgetRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private static final int COLOR_ACCENT = Color.parseColor("#e8743b");
    private static final int TEXT_LIGHT_PRIMARY = Color.parseColor("#1a1a1a");
    private static final int TEXT_LIGHT_SECONDARY = Color.parseColor("#999999");
    private static final int TEXT_LIGHT_HOMEWORK = Color.parseColor("#666666");
    private static final int TEXT_DARK_PRIMARY = Color.parseColor("#f0f0f0");
    private static final int TEXT_DARK_SECONDARY = Color.parseColor("#9a9a9a");
    private static final int TEXT_DARK_HOMEWORK = Color.parseColor("#bdbdbd");

    private final Context context;
    private final int appWidgetId;
    private final ArrayList<JSONObject> items = new ArrayList<>();
    private int weekday;
    private int week;

    ScheduleWidgetRemoteViewsFactory(Context context, int appWidgetId) {
        this.context = context;
        this.appWidgetId = appWidgetId;
    }

    @Override
    public void onCreate() {}

    @Override
    public void onDataSetChanged() {
        String selectedDate = ScheduleWidgetPrefs.selectedDate(context, appWidgetId);
        weekday = IsoWeek.weekday(selectedDate);
        week = IsoWeek.weekParity(selectedDate);
        items.clear();
        items.addAll(ScheduleStore.listForDay(context, weekday, week));
    }

    @Override
    public void onDestroy() {
        items.clear();
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_schedule_item);
        JSONObject o = items.get(position);
        boolean dark = WidgetPrefs.isDark(context);

        String startTime = o.optString("startTime", "");
        int durationMin = o.optInt("durationMin", 0);
        String endTime = IsoWeek.addMinutesToTime(startTime, durationMin);
        String room = o.optString("room", "");
        String homework = o.optString("homework", "");

        rv.setTextViewText(R.id.schedule_item_time_start, startTime);
        rv.setTextViewText(R.id.schedule_item_time_end, endTime);
        rv.setTextViewText(R.id.schedule_item_subject, o.optString("subject", ""));
        rv.setInt(R.id.schedule_item_dot, "setColorFilter", COLOR_ACCENT);

        String meta = room.isEmpty()
            ? (durationMin > 0 ? durationMin + " мин" : "")
            : (durationMin > 0 ? "Каб. " + room + " · " + durationMin + " мин" : "Каб. " + room);
        if (meta.isEmpty()) {
            rv.setViewVisibility(R.id.schedule_item_meta, android.view.View.GONE);
        } else {
            rv.setViewVisibility(R.id.schedule_item_meta, android.view.View.VISIBLE);
            rv.setTextViewText(R.id.schedule_item_meta, meta);
        }

        if (homework.isEmpty()) {
            rv.setViewVisibility(R.id.schedule_item_homework, android.view.View.GONE);
        } else {
            rv.setViewVisibility(R.id.schedule_item_homework, android.view.View.VISIBLE);
            rv.setTextViewText(R.id.schedule_item_homework, "ДЗ: " + homework);
        }

        rv.setTextColor(R.id.schedule_item_time_start, dark ? TEXT_DARK_PRIMARY : TEXT_LIGHT_PRIMARY);
        rv.setTextColor(R.id.schedule_item_time_end, dark ? TEXT_DARK_SECONDARY : TEXT_LIGHT_SECONDARY);
        rv.setTextColor(R.id.schedule_item_subject, dark ? TEXT_DARK_PRIMARY : TEXT_LIGHT_PRIMARY);
        rv.setTextColor(R.id.schedule_item_meta, dark ? TEXT_DARK_SECONDARY : TEXT_LIGHT_SECONDARY);
        rv.setTextColor(R.id.schedule_item_homework, dark ? TEXT_DARK_HOMEWORK : TEXT_LIGHT_HOMEWORK);

        Intent fillInIntent = new Intent();
        fillInIntent.putExtra("weekday", weekday);
        fillInIntent.putExtra("week", week);
        rv.setOnClickFillInIntent(R.id.schedule_item_subject, fillInIntent);
        rv.setOnClickFillInIntent(R.id.schedule_item_meta, fillInIntent);
        rv.setOnClickFillInIntent(R.id.schedule_item_time_start, fillInIntent);

        return rv;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        JSONObject o = items.get(position);
        return (o.optString("id") + "|" + o.optString("startTime")).hashCode();
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }
}
