package com.cshouuu.moneydance;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/** Converts the shared snapshot into the small RemoteViews surface. */
public final class WidgetRenderer {
    private WidgetRenderer() {}

    public static int widgetCount(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MoneyDanceWidgetProvider.class));
        return ids == null ? 0 : ids.length;
    }

    public static boolean hasWidgets(Context context) {
        return widgetCount(context) > 0;
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MoneyDanceWidgetProvider.class));
        update(context, manager, ids);
    }

    public static void update(Context context, AppWidgetManager manager, int[] widgetIds) {
        if (widgetIds == null || widgetIds.length == 0) return;
        long now = System.currentTimeMillis();
        JSONObject snapshot = WidgetStateStore.getSnapshot(context);
        for (int widgetId : widgetIds) {
            manager.updateAppWidget(widgetId, views(context, snapshot, now));
        }
    }

    private static RemoteViews views(Context context, JSONObject snapshot, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money_dance_widget);
        boolean snapshotValid = snapshot.optInt("version", -1) == WidgetContract.SNAPSHOT_VERSION;
        boolean stale = snapshotValid
                && snapshot.optLong("validUntil", Long.MAX_VALUE) > 0L
                && now >= snapshot.optLong("validUntil", Long.MAX_VALUE);
        JSONObject slacking = snapshot.optJSONObject("slacking");
        JSONObject overtime = snapshot.optJSONObject("overtime");
        boolean slackingActive = isActive(slacking);
        boolean overtimeActive = isActive(overtime);
        boolean showSlacking = slackingActive && (!overtimeActive
                || slacking.optLong("startAt", 0L) >= overtime.optLong("startAt", 0L));
        boolean showOvertime = overtimeActive && !showSlacking;
        double secondRate = nonNegative(snapshot.optDouble("secondRate", 0D));
        boolean realtimeEnabled = WidgetStateStore.isRealtimeEnabled(context);
        boolean tickerRunning = WidgetStateStore.isTickerRunning(context);
        boolean tickerStartFailed = WidgetStateStore.didTickerStartFail(context);
        boolean paidWorkNow = WidgetStateStore.currentWorkRate(context, now) > 0D;

        String title;
        String detail;
        double amount;
        if (showSlacking) {
            long startAt = Math.max(0L, slacking.optLong("startAt", now));
            long elapsed = Math.max(0L, now - startAt);
            title = "正在摸鱼";
            amount = (elapsed / 1000D) * secondRate;
            detail = duration(elapsed) + " · +¥" + rate(secondRate) + "/秒";
        } else if (showOvertime) {
            long startAt = Math.max(0L, overtime.optLong("startAt", now));
            long elapsed = Math.max(0L, now - startAt);
            String payMode = overtime.optString("payMode", "unpaid");
            double multiplier = nonNegative(overtime.optDouble("multiplier", 1D));
            double fixedAmount = nonNegative(overtime.optDouble("fixedAmount", 0D));
            title = "正在加班";
            if ("fixed".equals(payMode)) {
                amount = fixedAmount;
                detail = duration(elapsed) + " · 固定加班费";
            } else if ("multiplier".equals(payMode)) {
                amount = (elapsed / 1000D) * secondRate * multiplier;
                detail = duration(elapsed) + " · " + compact(multiplier) + "倍工资";
            } else {
                amount = 0D;
                detail = duration(elapsed) + " · 只计时间";
            }
        } else if (!snapshotValid || stale) {
            title = stale ? "工资数据待刷新" : "尚未同步工资数据";
            amount = 0D;
            detail = "打开 Money Dance 刷新";
        } else {
            Earnings earnings = timelineEarnings(snapshot.optJSONArray("workTimeline"), now);
            title = "今日实时收益";
            amount = earnings.amount;
            detail = earnings.ratePerSecond > 0D
                    ? "+¥" + rate(earnings.ratePerSecond) + "/秒"
                    : "当前未在计薪时段";
        }

        views.setTextViewText(R.id.widget_title, title);
        String amountText = (snapshotValid && !stale) || slackingActive || overtimeActive
                ? money(amount)
                : "--";
        views.setTextViewText(R.id.widget_amount, amountText);
        views.setTextViewText(R.id.widget_detail, detail);
        String liveBadge;
        String liveDescription;
        if (tickerStartFailed) {
            liveBadge = "恢复";
            liveDescription = "恢复桌面实时刷新";
        } else if (slackingActive || overtimeActive) {
            liveBadge = tickerRunning ? "计时" : "启动";
            liveDescription = tickerRunning ? "计时正在实时刷新" : "正在启动实时刷新";
        } else if (realtimeEnabled) {
            liveBadge = tickerRunning ? (paidWorkNow ? "实时" : "待机") : "启动";
            liveDescription = tickerRunning
                    ? (paidWorkNow ? "实时刷新已开启，点按可关闭" : "实时刷新待机，点按可关闭")
                    : "正在启动实时刷新";
        } else {
            liveBadge = paidWorkNow ? "开启" : "实时关";
            liveDescription = snapshotValid && !stale ? "开启桌面实时刷新" : "打开应用同步工资数据";
        }
        views.setTextViewText(R.id.widget_live_badge, liveBadge);
        views.setTextViewText(R.id.widget_slacking_button, slackingActive ? "结束" : "摸鱼");
        views.setTextViewText(R.id.widget_overtime_button, overtimeActive ? "结束" : "加班");
        views.setContentDescription(
                R.id.widget_root,
                "打开 Money Dance。" + title + "，" + amountText + "，" + detail
        );
        views.setContentDescription(R.id.widget_live_badge, liveDescription);
        views.setContentDescription(
                R.id.widget_slacking_button,
                slackingActive ? "结束摸鱼计时" : "开始摸鱼计时"
        );
        views.setContentDescription(
                R.id.widget_overtime_button,
                overtimeActive ? "结束加班计时" : "开始加班计时并选择计薪方式"
        );

        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context));
        PendingIntent liveIntent;
        if (slackingActive || overtimeActive) {
            liveIntent = openTargetIntent(context, WidgetContract.ROOT_LAUNCH_TARGET, 7103);
        } else if (tickerStartFailed) {
            liveIntent = actionIntent(context, WidgetContract.ACTION_ENABLE_REALTIME, 7103);
        } else if (realtimeEnabled) {
            liveIntent = actionIntent(context, WidgetContract.ACTION_DISABLE_REALTIME, 7103);
        } else if (snapshotValid && !stale) {
            liveIntent = actionIntent(context, WidgetContract.ACTION_ENABLE_REALTIME, 7103);
        } else {
            liveIntent = openTargetIntent(context, WidgetContract.ROOT_LAUNCH_TARGET, 7103);
        }
        views.setOnClickPendingIntent(R.id.widget_live_badge, liveIntent);
        views.setOnClickPendingIntent(
                R.id.widget_slacking_button,
                slackingActive
                        ? actionIntent(
                                context,
                                WidgetContract.ACTION_SLACKING_STOP,
                                7101,
                                slacking.optLong("startAt", -1L)
                        )
                        : snapshotValid && !stale
                        ? actionIntent(context, WidgetContract.ACTION_SLACKING_START, 7101)
                        : openTargetIntent(context, WidgetContract.SLACKING_LAUNCH_TARGET, 7101)
        );
        views.setOnClickPendingIntent(
                R.id.widget_overtime_button,
                overtimeActive
                        ? actionIntent(
                                context,
                                WidgetContract.ACTION_OVERTIME_STOP,
                                7102,
                                overtime.optLong("startAt", -1L)
                        )
                        // Opening the pay-mode selector must be a direct activity
                        // PendingIntent. Android 12+ can block receiver-to-activity
                        // trampolines, and overtime cannot safely choose a pay mode
                        // without asking the user first.
                        : openTargetIntent(context, WidgetContract.OVERTIME_LAUNCH_TARGET, 7102)
        );
        return views;
    }

    private static PendingIntent openAppIntent(Context context) {
        return openTargetIntent(context, WidgetContract.ROOT_LAUNCH_TARGET, 7100);
    }

    private static PendingIntent openTargetIntent(Context context, String target, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("moneydance://open" + target))
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, pendingIntentFlags());
    }

    private static PendingIntent actionIntent(Context context, String action, int requestCode) {
        return actionIntent(context, action, requestCode, -1L);
    }

    private static PendingIntent actionIntent(
            Context context,
            String action,
            int requestCode,
            long expectedStartAt
    ) {
        Intent intent = new Intent(context, WidgetActionReceiver.class)
                .setAction(action)
                // PendingIntent identity deliberately includes the timer start.
                // Extras are ignored when Android compares PendingIntents, so an
                // old launcher token could otherwise be updated to stop a newer
                // timer that reused the same request code.
                .setData(new Uri.Builder()
                        .scheme("moneydance")
                        .authority("widget-action")
                        .appendPath(action)
                        .appendPath(Long.toString(expectedStartAt))
                        .build())
                .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        if (expectedStartAt >= 0L) {
            intent.putExtra(WidgetContract.EXTRA_EXPECTED_START_AT, expectedStartAt);
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags());
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }

    private static boolean isActive(JSONObject value) {
        return value != null && value.optBoolean("active", false);
    }

    private static Earnings timelineEarnings(JSONArray timeline, long now) {
        if (timeline == null || timeline.length() == 0) return new Earnings(0D, 0D);
        double amount = 0D;
        for (int index = 0; index < timeline.length(); index += 1) {
            JSONObject segment = timeline.optJSONObject(index);
            if (segment == null) continue;
            long startAt = segment.optLong("startAt", 0L);
            long endAt = Math.max(startAt, segment.optLong("endAt", startAt));
            double baseAmount = nonNegative(segment.optDouble("baseAmount", amount));
            double segmentRate = nonNegative(segment.optDouble("ratePerSecond", 0D));
            if (now < startAt) return new Earnings(baseAmount, 0D);
            if (now < endAt) {
                return new Earnings(baseAmount + ((now - startAt) / 1000D) * segmentRate, segmentRate);
            }
            amount = baseAmount + ((endAt - startAt) / 1000D) * segmentRate;
        }
        return new Earnings(amount, 0D);
    }

    private static String money(double amount) {
        return String.format(Locale.CHINA, "¥%,.2f", nonNegative(amount));
    }

    private static String rate(double amount) {
        return String.format(Locale.CHINA, "%.5f", nonNegative(amount));
    }

    private static String compact(double amount) {
        if (Math.rint(amount) == amount) return String.format(Locale.CHINA, "%.0f", amount);
        return String.format(Locale.CHINA, "%.2f", amount).replaceAll("0+$", "").replaceAll("\\.$", "");
    }

    private static String duration(long elapsedMillis) {
        long totalSeconds = Math.max(0L, elapsedMillis / 1000L);
        long hours = totalSeconds / 3600L;
        long minutes = (totalSeconds % 3600L) / 60L;
        long seconds = totalSeconds % 60L;
        return String.format(Locale.CHINA, "%02d:%02d:%02d", hours, minutes, seconds);
    }

    private static double nonNegative(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value) ? Math.max(0D, value) : 0D;
    }

    private static final class Earnings {
        final double amount;
        final double ratePerSecond;

        Earnings(double amount, double ratePerSecond) {
            this.amount = amount;
            this.ratePerSecond = ratePerSecond;
        }
    }
}
