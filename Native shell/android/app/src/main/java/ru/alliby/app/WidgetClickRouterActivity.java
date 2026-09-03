package ru.alliby.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Невидимая Activity-трамплин для кликов по строкам списка в виджете.
 * RemoteViewsFactory поддерживает только один PendingIntent-шаблон на всю
 * коллекцию (setPendingIntentTemplate), поэтому конкретный пункт назначения
 * (своё событие -> редактирование, событие Alliby -> открыть приложение)
 * определяется здесь по extras из fillInIntent.
 */
public class WidgetClickRouterActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String kind = getIntent().getStringExtra("kind");
        String id = getIntent().getStringExtra("id");

        Intent target;
        if ("personal".equals(kind)) {
            target = new Intent(this, AddPersonalEventActivity.class);
            target.putExtra("id", id);
        } else {
            target = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=alibi"));
            target.setPackage(getPackageName());
        }
        target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(target);
        finish();
    }
}
