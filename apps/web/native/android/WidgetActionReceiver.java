package com.cshouuu.moneydance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles explicit PendingIntents created by this app's RemoteViews. */
public class WidgetActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        long now = System.currentTimeMillis();

        // A launcher can retain an immutable PendingIntent after the final widget
        // is removed. Never let a stale capability mutate timer state.
        if (!WidgetRenderer.hasWidgets(context)) {
            WidgetStateStore.setRealtimeEnabled(context, false);
            WidgetTickerService.stop(context);
            return;
        }

        if (WidgetContract.ACTION_SLACKING_START.equals(action)) {
            if (!WidgetStateStore.hasActiveSlacking(context)
                    && WidgetStateStore.hasUsableSnapshot(context, now)) {
                WidgetStateStore.startSlacking(context, now);
            }
        } else if (WidgetContract.ACTION_SLACKING_STOP.equals(action)) {
            WidgetStateStore.stopSlacking(
                    context,
                    now,
                    intent.getLongExtra(WidgetContract.EXTRA_EXPECTED_START_AT, -1L)
            );
        } else if (WidgetContract.ACTION_OVERTIME_STOP.equals(action)) {
            WidgetStateStore.stopOvertime(
                    context,
                    now,
                    intent.getLongExtra(WidgetContract.EXTRA_EXPECTED_START_AT, -1L)
            );
        } else if (WidgetContract.ACTION_ENABLE_REALTIME.equals(action)) {
            if (WidgetStateStore.hasUsableSnapshot(context, now)) {
                WidgetStateStore.setRealtimeEnabled(context, true);
                WidgetStateStore.clearRealtimeSuppression(context);
                WidgetStateStore.setTickerStartFailed(context, false);
            }
        } else if (WidgetContract.ACTION_DISABLE_REALTIME.equals(action)
                || WidgetContract.ACTION_STOP_REALTIME.equals(action)) {
            WidgetStateStore.setRealtimeEnabled(context, false);
            WidgetStateStore.suppressRealtimeForDay(context, now);
            WidgetStateStore.setTickerStartFailed(context, false);
        } else {
            return;
        }

        WidgetTickerService.reconcile(context);
        WidgetRenderer.updateAll(context);
    }
}
