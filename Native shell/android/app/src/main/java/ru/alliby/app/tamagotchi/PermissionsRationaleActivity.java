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
        text.setText("Игра «Питомец» в Alliby читает из Health Connect шаги, дистанцию, " +
            "активные калории, сон, тренировки, пульс, вес, процент жира и питание, " +
            "чтобы по вашей активности за день рассчитывать сытость, энергию и настроение " +
            "питомца и показывать сводки в игре и виджете. Данные обрабатываются только " +
            "на устройстве, не передаются на серверы Alliby и третьим лицам и не " +
            "используются для рекламы. Доступ можно отозвать в настройках Health Connect.\n\n" +
            "Политика конфиденциальности: alliby.ru/privacy");
        setContentView(text);
    }
}
