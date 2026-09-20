package ru.alliby.app.tamagotchi;

import android.content.ActivityNotFoundException;
import android.content.Intent;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.contract.ActivityResultContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Set;

import ru.alliby.app.PetWidgetProvider;

/**
 * Мост JS -> Health Connect для тамагочи. UI и вся логика питомца остаются в
 * веб-версии (client/../tamagotchi/index.html) как были — плагин лишь отдаёт
 * ей шаги из Health Connect вместо акселерометра, который использует веб-версия
 * в обычном браузере.
 */
@CapacitorPlugin(name = "Tamagotchi")
public class TamagotchiPlugin extends Plugin {

    private final ActivityResultContract<Set<String>, Set<String>> permissionContract =
        HealthConnectSteps.requestPermissionContract();

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", HealthConnectSteps.isAvailable(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openHealthConnectSetup(PluginCall call) {
        try {
            getActivity().startActivity(HealthConnectSteps.resolveSetupIntent(getContext()));
        } catch (ActivityNotFoundException ignored) {
        }
        call.resolve();
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Intent intent = permissionContract.createIntent(getContext(), HealthConnectSteps.READ_ALL_PERMISSIONS);
        startActivityForResult(call, intent, "handlePermissionResult");
    }

    @ActivityCallback
    private void handlePermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Set<String> granted = permissionContract.parseResult(result.getResultCode(), result.getData());
        JSObject out = new JSObject();
        out.put("granted", granted.containsAll(HealthConnectSteps.READ_STEPS_PERMISSIONS));
        call.resolve(out);
    }

    @PluginMethod
    public void getTodaySteps(PluginCall call) {
        HealthConnectSteps.fetchTodaySteps(getContext(), steps -> {
            JSObject out = new JSObject();
            if (steps == null) {
                out.put("available", false);
            } else {
                out.put("available", true);
                out.put("steps", steps);
            }
            call.resolve(out);
            PetWidgetProvider.refreshAll(getContext());
        });
    }

    /**
     * Остальные метрики Health Connect (дистанция, калории, сон, тренировки, пульс).
     * В отличие от getTodaySteps здесь нет общего available — каждое поле кладётся
     * в результат, только если по нему есть данные и выдано разрешение; JS-сторона
     * сама проверяет наличие конкретного ключа.
     */
    @PluginMethod
    public void getTodayHealthMetrics(PluginCall call) {
        HealthConnectSteps.fetchTodayMetrics(getContext(), metrics -> {
            JSObject out = new JSObject();
            if (metrics.getDistanceMeters() != null) out.put("distanceMeters", metrics.getDistanceMeters());
            if (metrics.getActiveCaloriesKcal() != null) out.put("activeCaloriesKcal", metrics.getActiveCaloriesKcal());
            if (metrics.getSleepMinutes() != null) out.put("sleepMinutes", metrics.getSleepMinutes());
            if (metrics.getExerciseMinutes() != null) out.put("exerciseMinutes", metrics.getExerciseMinutes());
            if (metrics.getAvgHeartRateBpm() != null) out.put("avgHeartRateBpm", metrics.getAvgHeartRateBpm());
            call.resolve(out);
            PetWidgetProvider.refreshAll(getContext());
        });
    }

    /**
     * Зеркалит вес владельца из веб-версии в SharedPreferences, чтобы им мог
     * пользоваться нативный виджет питомца — он не имеет доступа к localStorage
     * WebView и иначе не смог бы посчитать калории тем же способом, что и веб-версия.
     */
    @PluginMethod
    public void setBodyWeightKg(PluginCall call) {
        double weightKg = call.getDouble("weightKg", 0.0);
        TamagotchiPrefs.setBodyWeightKg(getContext(), (float) weightKg);
        call.resolve();
        PetWidgetProvider.refreshAll(getContext());
    }

    /**
     * Зеркалит дневной баланс мышечной/жировой массы (те же граммы, что и в
     * карточке "Композиция тела") в SharedPreferences для виджета питомца —
     * см. TamagotchiPrefs.todayBodyComposition.
     */
    @PluginMethod
    public void setBodyComposition(PluginCall call) {
        double muscleG = call.getDouble("muscleG", 0.0);
        double fatG = call.getDouble("fatG", 0.0);
        TamagotchiPrefs.setBodyComposition(getContext(), (float) muscleG, (float) fatG);
        call.resolve();
        PetWidgetProvider.refreshAll(getContext());
    }

    /**
     * Тренировки за сегодня как отдельные сессии (время начала/конца, тип, средний пульс
     * именно за эту сессию, оценка калорий) — в отличие от getTodayHealthMetrics, где
     * exerciseMinutes и avgHeartRateBpm это суточные агрегаты без привязки к конкретной
     * тренировке.
     */
    @PluginMethod
    public void getTodayWorkouts(PluginCall call) {
        HealthConnectSteps.fetchTodayWorkouts(getContext(), sessions -> {
            JSArray arr = new JSArray();
            for (HealthConnectSteps.WorkoutSession s : sessions) {
                JSObject w = new JSObject();
                w.put("startTimeMs", s.getStartTimeMs());
                w.put("endTimeMs", s.getEndTimeMs());
                w.put("durationMinutes", Math.round((s.getEndTimeMs() - s.getStartTimeMs()) / 60000.0));
                w.put("type", s.getLabel());
                if (s.getAvgHeartRateBpm() != null) w.put("avgHeartRateBpm", s.getAvgHeartRateBpm());
                if (s.getCaloriesKcal() != null) w.put("caloriesKcal", s.getCaloriesKcal());
                arr.put(w);
            }
            JSObject out = new JSObject();
            out.put("workouts", arr);
            call.resolve(out);
        });
    }

    /**
     * Последнее известное измерение веса и % жира тела (напр. с умных весов,
     * синхронизированных в Health Connect стороннм приложением) — не "за сегодня",
     * т.к. взвешиваются не каждый день; берётся самая свежая запись за 90 дней.
     */
    @PluginMethod
    public void getBodyMetrics(PluginCall call) {
        HealthConnectSteps.fetchLatestBodyMetrics(getContext(), metrics -> {
            JSObject out = new JSObject();
            if (metrics.getWeightKg() != null) out.put("weightKg", metrics.getWeightKg());
            if (metrics.getBodyFatPercent() != null) out.put("bodyFatPercent", metrics.getBodyFatPercent());
            call.resolve(out);
        });
    }
}
