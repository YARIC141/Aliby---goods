package ru.alliby.app.tamagotchi;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

/**
 * Экран-обоснование, который Health Connect открывает по ссылке "почему приложению
 * нужны эти разрешения". Обязателен по правилам Health Connect, иначе система не
 * считает приложение валидным получателем health-разрешений (не появляется в списке
 * приложений в настройках Health Connect) — см. AndroidManifest.xml.
 */
public class PermissionsRationaleActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView text = new TextView(this);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        text.setPadding(padding, padding, padding, padding);
        text.setTextSize(16);
        text.setText("Тамагочи запрашивает доступ к шагам (Health Connect), чтобы " +
            "отслеживать вашу активность за день и отражать её в состоянии питомца. " +
            "Данные используются только локально на устройстве и никуда не передаются.");
        setContentView(text);
    }
}
