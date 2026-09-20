package ru.alliby.app.tamagotchi;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Вес владельца питомца (кг) и дневной баланс мышечной/жировой массы, задаются
 * в веб-версии и зеркалятся сюда через TamagotchiPlugin.setBodyWeightKg /
 * setBodyComposition, чтобы ими мог пользоваться и нативный виджет
 * (PetWidgetProvider), у которого нет доступа к localStorage WebView.
 */
public class TamagotchiPrefs {

    private static final String PREFS = "alliby_tamagotchi_prefs";
    private static final String KEY_WEIGHT_KG = "body_weight_kg";
    private static final String KEY_COMPOSITION_DATE = "body_composition_date";
    private static final String KEY_MUSCLE_G = "body_composition_muscle_g";
    private static final String KEY_FAT_G = "body_composition_fat_g";

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String todayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** 0f, если вес ещё не задан пользователем. */
    public static float bodyWeightKg(Context ctx) {
        return prefs(ctx).getFloat(KEY_WEIGHT_KG, 0f);
    }

    public static void setBodyWeightKg(Context ctx, float weightKg) {
        prefs(ctx).edit().putFloat(KEY_WEIGHT_KG, weightKg).apply();
    }

    public static void setBodyComposition(Context ctx, float muscleG, float fatG) {
        prefs(ctx).edit()
            .putString(KEY_COMPOSITION_DATE, todayKey())
            .putFloat(KEY_MUSCLE_G, muscleG)
            .putFloat(KEY_FAT_G, fatG)
            .apply();
    }

    /**
     * Баланс массы за сегодня — null, если веб-версия не открывалась сегодня
     * (значение осталось бы от вчера и вводило бы в заблуждение).
     */
    public static BodyComposition todayBodyComposition(Context ctx) {
        SharedPreferences p = prefs(ctx);
        if (!todayKey().equals(p.getString(KEY_COMPOSITION_DATE, null))) return null;
        return new BodyComposition(p.getFloat(KEY_MUSCLE_G, 0f), p.getFloat(KEY_FAT_G, 0f));
    }

    public static class BodyComposition {
        public final float muscleG;
        public final float fatG;

        BodyComposition(float muscleG, float fatG) {
            this.muscleG = muscleG;
            this.fatG = fatG;
        }
    }
}
