package ru.alliby.app;

import android.content.Intent;
import android.widget.RemoteViewsService;

public class AllibyWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new AllibyWidgetRemoteViewsFactory(getApplicationContext());
    }
}
