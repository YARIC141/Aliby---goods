package ru.alliby.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public class PersonalEventAlarmReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "alliby_personal_events";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) title = "Событие";

        ensureChannel(context);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context, id != null ? id.hashCode() : 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.colorAccent))
            .setContentTitle(title)
            .setContentText("Личное событие")
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.alliby_reminder));
        }

        try {
            NotificationManagerCompat.from(context).notify(id != null ? id.hashCode() : 0, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS не выдано пользователем — тихо игнорируем, как и остальной ремайндер-пайплайн.
        }
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Личные события", NotificationManager.IMPORTANCE_HIGH
        );
        channel.enableVibration(true);
        Uri sound = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.alliby_reminder);
        channel.setSound(sound, new android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
            .build());
        nm.createNotificationChannel(channel);
    }
}
