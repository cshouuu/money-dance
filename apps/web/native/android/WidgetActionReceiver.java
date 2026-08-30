package com.cshouuu.moneydance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Handles explicit PendingIntents created by this app's RemoteViews. */
public class WidgetActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        long now = System.currentTimeMillis();

        if (WidgetContract.ACTION_SLACKING_TOGGLE.equals(action)) {
            if (WidgetStateStore.hasActiveSlacking(context)
                    || WidgetStateStore.hasUsableSnapshot(context, now)) {
                WidgetStateStore.toggleSlacking(context, now);
            } else {
                openTarget(context, WidgetContract.SLACKING_LAUNCH_TARGET);
            }
        } else if (WidgetContract.ACTION_OVERTIME.equals(action)) {
            if (WidgetStateStore.hasActiveOvertime(context)) {
                WidgetStateStore.stopOvertime(context, now);
            } else {
                openTarget(context, WidgetContract.OVERTIME_LAUNCH_TARGET);
            }
        } else if (WidgetContract.ACTION_TOGGLE_REALTIME.equals(action)) {
            if (WidgetStateStore.isRealtimeEnabled(context)) {
                WidgetStateStore.setRealtimeEnabled(context, false);
            } else if (WidgetStateStore.hasUsableSnapshot(context, now)) {
                WidgetStateStore.setRealtimeEnabled(context, true);
            } else {
                openTarget(context, WidgetContract.ROOT_LAUNCH_TARGET);
            }
        } else if (WidgetContract.ACTION_STOP_REALTIME.equals(action)) {
            WidgetStateStore.setRealtimeEnabled(context, false);
        } else {
            return;
        }

        WidgetRenderer.updateAll(context);
        WidgetTickerService.reconcile(context);
    }

    private void openTarget(Context context, String target) {
        WidgetStateStore.setLaunchTarget(context, target);
        Intent launch = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("moneydance://open" + target))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(launch);
    }
}
