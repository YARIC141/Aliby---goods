package ru.alliby.app.tamagotchi;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Вес владельца питомца (кг), задаётся в веб-версии и зеркалится сюда через
 * TamagotchiPlugin.setBodyWeightKg, чтобы им мог пользоваться и нативный
 * виджет (PetWidgetProvider), у которого нет доступа к localStorage WebView.
 */
public class TamagotchiPrefs {

    private static final String PREFS = "alliby_tamagotchi_prefs";
    private static final String KEY_WEIGHT_KG = "body_weight_kg";

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 0f, если вес ещё не задан пользователем. */
    public static float bodyWeightKg(Context ctx) {
        return prefs(ctx).getFloat(KEY_WEIGHT_KG, 0f);
    }

    public static void setBodyWeightKg(Context ctx, float weightKg) {
        prefs(ctx).edit().putFloat(KEY_WEIGHT_KG, weightKg).apply();
    }
}
