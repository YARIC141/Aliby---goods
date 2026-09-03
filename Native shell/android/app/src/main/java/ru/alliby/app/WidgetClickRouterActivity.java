package ru.alliby.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Невидимая Activity-трамплин для кликов по строкам списка в виджете.
 * RemoteViewsFactory поддерживает только один PendingIntent-шаблон на всю
 * коллекцию (setPendingIntentTemplate), поэтому конкретный пункт назначения
 * (своё событие -> редактирование, запись/аренда Alliby -> открыть приложение
 * на нужном событии) определяется здесь по extras из fillInIntent.
 */
public class WidgetClickRouterActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String type = getIntent().getStringExtra("type");
        String id = getIntent().getStringExtra("id");

        Intent target;
        if ("personal".equals(type)) {
            target = new Intent(this, AddPersonalEventActivity.class);
            target.putExtra("id", id);
        } else if ("rent".equals(type)) {
            target = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=rent&id=" + Uri.encode(id)));
            target.setPackage(getPackageName());
        } else if ("order".equals(type)) {
            target = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=order&id=" + Uri.encode(id)));
            target.setPackage(getPackageName());
        } else {
            target = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=booking&id=" + Uri.encode(id)));
            target.setPackage(getPackageName());
        }
        target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(target);
        finish();
    }
}
