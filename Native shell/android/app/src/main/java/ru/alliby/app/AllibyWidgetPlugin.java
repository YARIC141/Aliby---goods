package ru.alliby.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Мост JS -> нативный домашний виджет.
 * client/index.html (_doSyncReminders) пушит сюда снимок ближайших
 * записей/аренды после каждой синхронизации напоминаний; виджет их читает
 * из SharedPreferences (см. PersonalEventsStore), без обращения к WebView.
 */
@CapacitorPlugin(name = "AllibyWidget")
public class AllibyWidgetPlugin extends Plugin {

    @PluginMethod
    public void updateAllibyEvents(PluginCall call) {
        JSArray events = call.getArray("events");
        JSONArray out = new JSONArray();
        if (events != null) {
            for (int i = 0; i < events.length(); i++) {
                try {
                    JSONObject src = events.getJSONObject(i);
                    JSONObject item = new JSONObject();
                    item.put("id", src.optString("id"));
                    item.put("type", src.optString("type", "booking"));
                    item.put("title", src.optString("title"));
                    item.put("store", src.optString("store"));
                    item.put("address", src.optString("address"));
                    item.put("atMillis", src.optLong("atMillis"));
                    out.put(item);
                } catch (JSONException ignored) {}
            }
        }
        PersonalEventsStore.saveAllibyEvents(getContext(), out);
        AllibyWidgetProvider.refreshAll(getContext());
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void updateOrders(PluginCall call) {
        JSArray orders = call.getArray("orders");
        JSONArray out = new JSONArray();
        if (orders != null) {
            for (int i = 0; i < orders.length(); i++) {
                try {
                    JSONObject src = orders.getJSONObject(i);
                    JSONObject item = new JSONObject();
                    item.put("id", src.optString("id"));
                    item.put("type", "order");
                    item.put("store", src.optString("store"));
                    item.put("status", src.optString("status"));
                    item.put("atMillis", src.optLong("atMillis"));
                    out.put(item);
                } catch (JSONException ignored) {}
            }
        }
        PersonalEventsStore.saveOrders(getContext(), out);
        AllibyWidgetProvider.refreshAll(getContext());
        call.resolve(new JSObject());
    }
}
