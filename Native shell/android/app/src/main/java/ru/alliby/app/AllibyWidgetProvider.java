package ru.alliby.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class AllibyWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_alliby);

            // Список: данные тянутся через AllibyWidgetService/RemoteViewsFactory.
            Intent listIntent = new Intent(context, AllibyWidgetService.class);
            listIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            listIntent.setData(Uri.parse(listIntent.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_list, listIntent);
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);

            // Клик по строке списка — через маленькую прозрачную Activity-роутер,
            // т.к. RemoteViewsFactory поддерживает только один PendingIntent-шаблон.
            Intent rowIntent = new Intent(context, WidgetClickRouterActivity.class);
            rowIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            PendingIntent rowPendingIntent = PendingIntent.getActivity(
                context, appWidgetId, rowIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
            );
            views.setPendingIntentTemplate(R.id.widget_list, rowPendingIntent);

            // Кнопка «Открыть» — deep-link на вкладку «Алиби» (ловится appUrlOpen в client/index.html).
            Intent openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=alibi"));
            openIntent.setPackage(context.getPackageName());
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent openPending = PendingIntent.getActivity(
                context, 1000 + appWidgetId, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_btn_open, openPending);

            // Кнопка «+» — новое личное событие.
            Intent addIntent = new Intent(context, AddPersonalEventActivity.class);
            addIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent addPending = PendingIntent.getActivity(
                context, 2000 + appWidgetId, addIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_btn_add, addPending);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list);
    }

    /** Вызывается из AllibyWidgetPlugin и AddPersonalEventActivity после любого изменения данных. */
    static void refreshAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, AllibyWidgetProvider.class));
        if (ids.length > 0) {
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        }
    }
}
