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
import java.util.Collections;
import java.util.Comparator;
import java.util.Locale;

class AllibyWidgetRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private static final int COLOR_ALLIBY = Color.parseColor("#e8743b");
    private static final int COLOR_PERSONAL = Color.parseColor("#3b82f6");
    private static final int COLOR_ORDER = Color.parseColor("#22c55e");
    private static final int TEXT_LIGHT_PRIMARY = Color.parseColor("#1a1a1a");
    private static final int TEXT_LIGHT_SECONDARY = Color.parseColor("#999999");
    private static final int TEXT_DARK_PRIMARY = Color.parseColor("#f0f0f0");
    private static final int TEXT_DARK_SECONDARY = Color.parseColor("#9a9a9a");

    private final Context context;
    private final int appWidgetId;
    private final ArrayList<JSONObject> items = new ArrayList<>();

    AllibyWidgetRemoteViewsFactory(Context context, int appWidgetId) {
        this.context = context;
        this.appWidgetId = appWidgetId;
    }

    @Override
    public void onCreate() {}

    @Override
    public void onDataSetChanged() {
        items.clear();
        String selectedDate = WidgetPrefs.selectedDate(context, appWidgetId);

        appendForDate(PersonalEventsStore.listPersonal(context), selectedDate);
        appendForDate(PersonalEventsStore.listAlliby(context), selectedDate);

        Collections.sort(items, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return Long.compare(a.optLong("atMillis"), b.optLong("atMillis"));
            }
        });

        // Текущие заказы не привязаны к выбранному дню — показываем их всегда сверху,
        // независимо от того, какой день сейчас пролистан в виджете.
        JSONArray orders = PersonalEventsStore.listOrders(context);
        ArrayList<JSONObject> orderItems = new ArrayList<>();
        if (orders != null) {
            for (int i = 0; i < orders.length(); i++) {
                JSONObject o = orders.optJSONObject(i);
                if (o != null) orderItems.add(o);
            }
        }
        Collections.sort(orderItems, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return Long.compare(b.optLong("atMillis"), a.optLong("atMillis"));
            }
        });
        items.addAll(0, orderItems);
    }

    private void appendForDate(JSONArray arr, String selectedDate) {
        if (arr == null) return;
        SimpleDateFormat dayFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            long at = o.optLong("atMillis");
            String ds = dayFmt.format(new java.util.Date(at));
            if (!selectedDate.equals(ds)) continue;
            items.add(o);
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
        String type = o.optString("type", "personal");
        boolean isPersonal = "personal".equals(type);
        boolean isOrder = "order".equals(type);
        long atMillis = o.optLong("atMillis");
        boolean dark = WidgetPrefs.isDark(context);

        String title;
        String meta;
        int dotColor;
        if (isOrder) {
            title = o.optString("store", "Заказ");
            meta = o.optString("status", "");
            dotColor = COLOR_ORDER;
        } else {
            title = o.optString("title", isPersonal ? "Событие" : "Запись");
            String store = o.optString("store", "");
            String address = o.optString("address", "");
            meta = store.isEmpty() ? address : (address.isEmpty() ? store : store + ", " + address);
            dotColor = isPersonal ? COLOR_PERSONAL : COLOR_ALLIBY;
        }

        rv.setTextViewText(R.id.item_title, title);
        rv.setInt(R.id.item_dot, "setColorFilter", dotColor);
        rv.setTextColor(R.id.item_title, dark ? TEXT_DARK_PRIMARY : TEXT_LIGHT_PRIMARY);
        rv.setTextColor(R.id.item_meta, dark ? TEXT_DARK_SECONDARY : TEXT_LIGHT_SECONDARY);
        rv.setTextColor(R.id.item_time, dark ? TEXT_DARK_SECONDARY : TEXT_LIGHT_SECONDARY);

        if (meta.isEmpty()) {
            rv.setViewVisibility(R.id.item_meta, android.view.View.GONE);
        } else {
            rv.setViewVisibility(R.id.item_meta, android.view.View.VISIBLE);
            rv.setTextViewText(R.id.item_meta, meta);
        }

        rv.setViewVisibility(R.id.item_time, android.view.View.VISIBLE);
        rv.setTextViewText(R.id.item_time, formatTime(atMillis));

        Intent fillInIntent = new Intent();
        fillInIntent.putExtra("type", type);
        fillInIntent.putExtra("id", o.optString("id"));
        rv.setOnClickFillInIntent(R.id.item_dot, fillInIntent);
        rv.setOnClickFillInIntent(R.id.item_title, fillInIntent);
        rv.setOnClickFillInIntent(R.id.item_meta, fillInIntent);
        rv.setOnClickFillInIntent(R.id.item_time, fillInIntent);

        return rv;
    }

    private String formatTime(long atMillis) {
        return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new java.util.Date(atMillis));
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
