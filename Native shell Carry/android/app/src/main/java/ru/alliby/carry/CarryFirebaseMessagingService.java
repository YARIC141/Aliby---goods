package ru.alliby.carry;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * carry_order_assigned приходит как чистый data-message (см. supabase/functions/send-push) —
 * поэтому onMessageReceived() вызывается гарантированно, даже когда приложение свёрнуто/убито,
 * и мы можем повесить full-screen intent, будящий телефон поверх блокировки, как у входящего звонка.
 * Наследуемся от плагинного MessagingService, а не от FirebaseMessagingService напрямую, — так
 * сохраняется штатная пересылка остальных типов пушей в JS (pushNotificationReceived).
 */
public class CarryFirebaseMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    private static final String CHANNEL_ID = "alliby_orders_incoming";
    private static final String TYPE_ORDER_ASSIGNED = "carry_order_assigned";
    private static final int NOTIFICATION_ID = 9100;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (TYPE_ORDER_ASSIGNED.equals(data.get("type"))) {
            showIncomingOrderNotification(data);
        }
    }

    private void showIncomingOrderNotification(Map<String, String> data) {
        Context ctx = getApplicationContext();
        ensureChannel(ctx);

        String title = data.containsKey("title") ? data.get("title") : "🚴 Новый заказ";
        String body = data.containsKey("body") ? data.get("body") : "Вам назначена доставка";

        Intent intent = new Intent(ctx, MainActivity.class);
        intent.putExtra(MainActivity.EXTRA_OPEN_INCOMING_ORDER, true);
        String orderId = data.get("order_id");
        if (orderId != null) intent.putExtra("order_id", orderId);
        intent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        PendingIntent pendingIntent = PendingIntent.getActivity(
            ctx, NOTIFICATION_ID, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Resources res = ctx.getResources();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(ctx, R.color.colorAccent))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true);

        NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());
    }

    /** Идемпотентно: пересоздание уже существующего канала с тем же id — no-op. */
    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Новые заказы", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Будит телефон при новом предложении заказа");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        channel.setSound(sound, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build());
        nm.createNotificationChannel(channel);
    }
}
