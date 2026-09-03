package ru.alliby.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Locale;

class AllibyWidgetRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private static final int MAX_ITEMS = 20;
    private static final int COLOR_ALLIBY = Color.parseColor("#e8743b");
    private static final int COLOR_PERSONAL = Color.parseColor("#3b82f6");

    private final Context context;
    private final ArrayList<JSONObject> items = new ArrayList<>();

    AllibyWidgetRemoteViewsFactory(Context context) {
        this.context = context;
    }

    @Override
    public void onCreate() {}

    @Override
    public void onDataSetChanged() {
        items.clear();
        long now = System.currentTimeMillis();

        appendUpcoming(PersonalEventsStore.listPersonal(context), "personal", now);
        appendUpcoming(PersonalEventsStore.listAlliby(context), "alliby", now);

        Collections.sort(items, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return Long.compare(a.optLong("atMillis"), b.optLong("atMillis"));
            }
        });
        while (items.size() > MAX_ITEMS) {
            items.remove(items.size() - 1);
        }
    }

    private void appendUpcoming(JSONArray arr, String kind, long now) {
        if (arr == null) return;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            if (o.optLong("atMillis") < now) continue;
            try {
                JSONObject copy = new JSONObject(o.toString());
                copy.put("kind", kind);
                items.add(copy);
            } catch (Exception ignored) {}
        }
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
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_alliby_item);
        JSONObject o = items.get(position);
        String kind = o.optString("kind");
        String title = o.optString("title", kind.equals("alliby") ? "Запись" : "Событие");
        long atMillis = o.optLong("atMillis");

        rv.setTextViewText(R.id.item_title, title);
        rv.setTextViewText(R.id.item_time, formatTime(atMillis));
        rv.setInt(R.id.item_dot, "setColorFilter", kind.equals("alliby") ? COLOR_ALLIBY : COLOR_PERSONAL);

        Intent fillInIntent = new Intent();
        fillInIntent.putExtra("kind", kind);
        fillInIntent.putExtra("id", o.optString("id"));
        rv.setOnClickFillInIntent(R.id.item_dot, fillInIntent);
        rv.setOnClickFillInIntent(R.id.item_title, fillInIntent);
        rv.setOnClickFillInIntent(R.id.item_time, fillInIntent);

        return rv;
    }

    private String formatTime(long atMillis) {
        Calendar target = Calendar.getInstance();
        target.setTimeInMillis(atMillis);
        Calendar today = Calendar.getInstance();
        Calendar tomorrow = Calendar.getInstance();
        tomorrow.add(Calendar.DAY_OF_YEAR, 1);

        SimpleDateFormat time = new SimpleDateFormat("HH:mm", Locale.getDefault());
        if (sameDay(target, today)) {
            return "Сегодня, " + time.format(target.getTime());
        } else if (sameDay(target, tomorrow)) {
            return "Завтра, " + time.format(target.getTime());
        } else {
            SimpleDateFormat full = new SimpleDateFormat("d MMM, HH:mm", Locale.getDefault());
            return full.format(target.getTime());
        }
    }

    private boolean sameDay(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
            && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
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
        return items.get(position).optString("id").hashCode();
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }
}
