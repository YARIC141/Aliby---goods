package ru.alliby.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;

/**
 * Локальный шаблон расписания занятий для виджета "Расписание занятий".
 * Уроки хранятся по паре (weekday 1..7, week 1|2), а не по конкретной дате —
 * поэтому редактирование дня недели сразу переписывает расписание для всех
 * дат, которые на этот день недели/чётность недели попадают.
 */
class ScheduleStore {

    private static final String PREFS = "alliby_widget_prefs";
    private static final String KEY_LESSONS = "schedule_lessons";

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray listAll(Context ctx) {
        String raw = prefs(ctx).getString(KEY_LESSONS, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void saveAll(Context ctx, JSONArray arr) {
        prefs(ctx).edit().putString(KEY_LESSONS, arr.toString()).apply();
    }

    static ArrayList<JSONObject> listForDay(Context ctx, int weekday, int week) {
        JSONArray all = listAll(ctx);
        ArrayList<JSONObject> result = new ArrayList<>();
        for (int i = 0; i < all.length(); i++) {
            JSONObject o = all.optJSONObject(i);
            if (o == null) continue;
            if (o.optInt("weekday") == weekday && o.optInt("week") == week) {
                result.add(o);
            }
        }
        Collections.sort(result, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return a.optString("startTime", "").compareTo(b.optString("startTime", ""));
            }
        });
        return result;
    }

    static boolean hasLessons(Context ctx, int weekday, int week) {
        JSONArray all = listAll(ctx);
        for (int i = 0; i < all.length(); i++) {
            JSONObject o = all.optJSONObject(i);
            if (o != null && o.optInt("weekday") == weekday && o.optInt("week") == week) return true;
        }
        return false;
    }

    /**
     * Полностью заменяет набор уроков для конкретного (день недели, неделя 1|2)
     * новым списком — так редактирование дня "переписывает" его целиком.
     */
    static void replaceForDay(Context ctx, int weekday, int week, JSONArray newLessons) {
        JSONArray all = listAll(ctx);
        JSONArray next = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject o = all.optJSONObject(i);
            if (o == null) continue;
            if (o.optInt("weekday") == weekday && o.optInt("week") == week) continue;
            next.put(o);
        }
        for (int i = 0; i < newLessons.length(); i++) {
            JSONObject o = newLessons.optJSONObject(i);
            if (o == null) continue;
            try {
                o.put("weekday", weekday);
                o.put("week", week);
                if (o.optString("id", "").isEmpty()) {
                    o.put("id", "lsn_" + System.currentTimeMillis() + "_" + i);
                }
            } catch (JSONException ignored) {
            }
            next.put(o);
        }
        saveAll(ctx, next);
    }
}
