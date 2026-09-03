package ru.alliby.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Локальное хранилище событий для домашнего виджета Alliby.
 * Два независимых списка в одном SharedPreferences:
 *  - "personal_events" — события, которые пользователь создаёт прямо с виджета
 *    (не связаны с аккаунтом/Supabase, живут только на этом устройстве);
 *  - "alliby_events" — снимок ближайших записей/аренды, который пушит JS
 *    (client/index.html, _doSyncReminders) через AllibyWidgetPlugin.
 */
class PersonalEventsStore {

    private static final String PREFS = "alliby_widget_prefs";
    private static final String KEY_PERSONAL = "personal_events";
    private static final String KEY_ALLIBY = "alliby_events";

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray listPersonal(Context ctx) {
        return readArray(ctx, KEY_PERSONAL);
    }

    static JSONArray listAlliby(Context ctx) {
        return readArray(ctx, KEY_ALLIBY);
    }

    static void saveAllibyEvents(Context ctx, JSONArray events) {
        prefs(ctx).edit().putString(KEY_ALLIBY, events.toString()).apply();
    }

    static JSONObject findPersonal(Context ctx, String id) {
        if (id == null) return null;
        JSONArray arr = listPersonal(ctx);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    /** Добавляет новое событие (id == null/пустой) или заменяет существующее по id. */
    static void upsertPersonal(Context ctx, JSONObject event) {
        JSONArray arr = listPersonal(ctx);
        JSONArray next = new JSONArray();
        String id = event.optString("id", "");
        boolean replaced = false;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            if (!replaced && id.equals(o.optString("id"))) {
                next.put(event);
                replaced = true;
            } else {
                next.put(o);
            }
        }
        if (!replaced) next.put(event);
        prefs(ctx).edit().putString(KEY_PERSONAL, next.toString()).apply();
    }

    static void deletePersonal(Context ctx, String id) {
        JSONArray arr = listPersonal(ctx);
        JSONArray next = new JSONArray();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) next.put(o);
        }
        prefs(ctx).edit().putString(KEY_PERSONAL, next.toString()).apply();
    }

    private static JSONArray readArray(Context ctx, String key) {
        String raw = prefs(ctx).getString(key, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
