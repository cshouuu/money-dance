package com.cshouuu.moneydance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * User-visible foreground service used only while second-level widget rendering
 * is explicitly enabled or a widget timer is active.
 */
public class WidgetTickerService extends Service {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean screenReceiverRegistered;
    private String lastNotificationText = "";
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            if (WidgetStateStore.isRealtimeEnabled(WidgetTickerService.this)
                    && !WidgetStateStore.hasUsableSnapshot(WidgetTickerService.this, now)
                    && !WidgetStateStore.hasActiveSlacking(WidgetTickerService.this)
                    && !WidgetStateStore.hasActiveOvertime(WidgetTickerService.this)) {
                WidgetStateStore.setRealtimeEnabled(WidgetTickerService.this, false);
            }
            long nextDelay = WidgetStateStore.nextTickerDelayMillis(WidgetTickerService.this, now);
            if (!WidgetRenderer.hasWidgets(WidgetTickerService.this) || nextDelay < 0L) {
                if (!WidgetStateStore.hasActiveSlacking(WidgetTickerService.this)
                        && !WidgetStateStore.hasActiveOvertime(WidgetTickerService.this)) {
                    WidgetStateStore.setRealtimeEnabled(WidgetTickerService.this, false);
                }
                WidgetRenderer.updateAll(WidgetTickerService.this);
                stopSelf();
                return;
            }
            // Widget calculations always use wall-clock timestamps, never tick counts.
            WidgetRenderer.updateAll(WidgetTickerService.this);
            refreshNotificationIfNeeded();
            if (nextDelay <= 1000L) {
                long alignedDelay = 1000L - (SystemClock.uptimeMillis() % 1000L);
                handler.postDelayed(this, Math.max(100L, alignedDelay));
            } else {
                handler.postDelayed(this, nextDelay);
            }
        }
    };
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                handler.removeCallbacks(tick);
            } else if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                handler.removeCallbacks(tick);
                handler.post(tick);
            }
        }
    };

    public static void reconcile(Context context) {
        Context app = context.getApplicationContext();
        long now = System.currentTimeMillis();
        if (!WidgetRenderer.hasWidgets(app)) {
            stop(app);
            return;
        }
        if (!WidgetStateStore.shouldRunTicker(app, now)) {
            if (!WidgetStateStore.hasActiveSlacking(app)
                    && !WidgetStateStore.hasActiveOvertime(app)) {
                WidgetStateStore.setRealtimeEnabled(app, false);
            }
            stop(app);
            WidgetRenderer.updateAll(app);
            return;
        }
        Intent intent = new Intent(app, WidgetTickerService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(intent);
            else app.startService(intent);
        } catch (RuntimeException ignored) {
            // Some OEMs can still reject a background start. The timestamp model
            // remains correct and the next explicit widget/app action retries it.
            WidgetStateStore.setTickerRunning(app, false);
            WidgetStateStore.setTickerStartFailed(app, true);
            WidgetRenderer.updateAll(app);
        }
    }

    public static void stop(Context context) {
        Context app = context.getApplicationContext();
        app.stopService(new Intent(app, WidgetTickerService.class));
        WidgetStateStore.setTickerRunning(app, false);
        WidgetStateStore.setTickerStartFailed(app, false);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        IntentFilter screenFilter = new IntentFilter();
        screenFilter.addAction(Intent.ACTION_SCREEN_ON);
        screenFilter.addAction(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenReceiver, screenFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReceiver, screenFilter);
        }
        screenReceiverRegistered = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = notification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                    WidgetContract.NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            );
        } else {
            startForeground(WidgetContract.NOTIFICATION_ID, notification);
        }
        WidgetStateStore.setTickerRunning(this, true);
        WidgetStateStore.setTickerStartFailed(this, false);
        handler.removeCallbacks(tick);
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power == null || power.isInteractive()) handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        if (screenReceiverRegistered) {
            try {
                unregisterReceiver(screenReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            screenReceiverRegistered = false;
        }
        WidgetStateStore.setTickerRunning(this, false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                WidgetContract.NOTIFICATION_CHANNEL_ID,
                "桌面实时收益",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("在桌面小组件中每秒更新工资、摸鱼或加班收益");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification notification() {
        String text = notificationText();
        lastNotificationText = text;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, WidgetContract.NOTIFICATION_CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.money_dance_widget_notification)
                .setContentTitle("Money Dance 桌面实时收益")
                .setContentText(text)
                .setContentIntent(openAppIntent())
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE);
        if (WidgetStateStore.isRealtimeEnabled(this)
                && !WidgetStateStore.hasActiveSlacking(this)
                && !WidgetStateStore.hasActiveOvertime(this)) {
            builder.addAction(
                    android.R.drawable.ic_media_pause,
                    "停止实时显示",
                    stopRealtimeIntent()
            );
        }
        return builder.build();
    }

    private String notificationText() {
        String text;
        if (WidgetStateStore.hasActiveSlacking(this)) text = "正在每秒更新摸鱼收益";
        else if (WidgetStateStore.hasActiveOvertime(this)) text = "正在每秒更新加班收益";
        else if (WidgetStateStore.currentWorkRate(this, System.currentTimeMillis()) > 0D) {
            text = "正在每秒更新桌面实时收益";
        } else text = "实时收益将在下一计薪时段继续";
        return text;
    }

    private void refreshNotificationIfNeeded() {
        String nextText = notificationText();
        if (nextText.equals(lastNotificationText)) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(WidgetContract.NOTIFICATION_ID, notification());
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("moneydance://open/"))
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 7200, intent, pendingIntentFlags());
    }

    private PendingIntent stopRealtimeIntent() {
        Intent intent = new Intent(this, WidgetActionReceiver.class)
                .setAction(WidgetContract.ACTION_STOP_REALTIME)
                .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(this, 7201, intent, pendingIntentFlags());
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }
}
