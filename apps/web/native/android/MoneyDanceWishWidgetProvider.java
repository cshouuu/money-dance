package com.cshouuu.moneydance;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

/** Hourly wish progress, independent of the salary widget's foreground ticker. */
public class MoneyDanceWishWidgetProvider extends AppWidgetProvider {
    private static final String SELECT = "com.cshouuu.moneydance.WISH_SELECT";
    private static final int[] ROWS = { R.id.wish_slot_one, R.id.wish_slot_two, R.id.wish_slot_three };

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id);
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!SELECT.equals(intent.getAction())) return;
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (id < 0 || manager.getAppWidgetInfo(id) == null
                || !new ComponentName(context, getClass()).equals(manager.getAppWidgetInfo(id).provider)) return;
        context.getSharedPreferences("wish-widget", Context.MODE_PRIVATE).edit()
                .putInt("selected-" + id, Math.max(0, Math.min(2, intent.getIntExtra("slot", 0)))).apply();
        render(context, manager, id);
    }

    @Override public void onDeleted(Context context, int[] ids) {
        android.content.SharedPreferences.Editor editor = context.getSharedPreferences("wish-widget", Context.MODE_PRIVATE).edit();
        for (int id : ids) editor.remove("selected-" + id);
        editor.apply();
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, MoneyDanceWishWidgetProvider.class))) render(context, manager, id);
    }

    private static double earned(JSONObject wish, double extra) {
        return Math.min(Math.max(0, wish.optDouble("price", 0)), Math.max(0, wish.optDouble("earnedAmount", 0) + extra));
    }

    private static double progress(JSONObject wish, double extra) {
        double price = wish.optDouble("price", 0);
        return price <= 0 ? 1 : Math.max(0, Math.min(1, earned(wish, extra) / price));
    }

    private static void render(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.money_dance_wish_widget);
        JSONObject snapshot = WidgetStateStore.getSnapshot(context).optJSONObject("wishWidget");
        JSONArray wishes = snapshot == null ? null : snapshot.optJSONArray("wishes");
        int count = wishes == null ? 0 : Math.min(3, wishes.length());
        long now = System.currentTimeMillis();
        double extra = 0;
        if (snapshot != null) {
            long until = Math.min(now, snapshot.optLong("validUntil", now));
            JSONArray timeline = snapshot.optJSONArray("timeline");
            if (timeline != null) for (int i = 0; i < timeline.length(); i++) {
                JSONObject slice = timeline.optJSONObject(i);
                if (slice == null) continue;
                extra += Math.max(0L, Math.min(until, slice.optLong("endAt")) - slice.optLong("startAt")) / 1000D
                        * Math.max(0, slice.optDouble("ratePerSecond", 0));
            }
        }
        int selected = Math.max(0, Math.min(count - 1, context.getSharedPreferences("wish-widget", Context.MODE_PRIVATE).getInt("selected-" + id, 0)));
        for (int slot = 0; slot < 3; slot++) {
            JSONObject wish = wishes == null ? null : wishes.optJSONObject(slot);
            views.setViewVisibility(ROWS[slot], wish == null ? View.GONE : View.VISIBLE);
            if (wish == null) continue;
            views.setTextViewText(ROWS[slot], (slot == selected ? "● " : "○ ") + wish.optString("name", "心愿")
                    + "  " + String.format(Locale.CHINA, "%.0f%%", progress(wish, extra) * 100));
            Intent select = new Intent(context, MoneyDanceWishWidgetProvider.class).setAction(SELECT)
                    .setData(Uri.parse("moneydance://wish-select/" + id + "/" + slot))
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra("slot", slot);
            views.setOnClickPendingIntent(ROWS[slot], PendingIntent.getBroadcast(context, 0, select,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        JSONObject active = count == 0 ? null : wishes.optJSONObject(selected);
        double value = active == null ? 0 : progress(active, extra);
        views.setImageViewBitmap(R.id.wish_pie, pie(value));
        views.setTextViewText(R.id.wish_title, active == null ? "把心愿放到桌面" : active.optString("name", "心愿"));
        views.setTextViewText(R.id.wish_amount, active == null ? "打开清单，指定最多 3 个心愿" : String.format(Locale.CHINA,
                "已积累 ¥%.2f / ¥%.2f", earned(active, extra), active.optDouble("price", 0)));
        views.setTextViewText(R.id.wish_updated, snapshot != null && now > snapshot.optLong("validUntil", 0)
                ? "打开应用刷新进度" : "更新于 " + android.text.format.DateFormat.format("MM-dd HH:mm", now));
        Intent open = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("moneydance://open/convert"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent launch = PendingIntent.getActivity(context, 4201, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.wish_manage, launch);
        views.setOnClickPendingIntent(R.id.wish_pie, launch);
        manager.updateAppWidget(id, views);
    }

    private static Bitmap pie(double progress) {
        Bitmap bitmap = Bitmap.createBitmap(240, 240, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        RectF bounds = new RectF(8, 8, 232, 232);
        paint.setColor(Color.rgb(231, 232, 212));
        canvas.drawOval(bounds, paint);
        paint.setColor(Color.rgb(128, 145, 75));
        canvas.drawArc(bounds, -90, (float) (progress * 360), true, paint);
        // Small label disc preserves a visible filled pie, matching the wage chart.
        paint.setColor(Color.rgb(255, 253, 245));
        canvas.drawCircle(120, 120, 57, paint);
        paint.setColor(Color.rgb(44, 52, 36));
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(32);
        paint.setFakeBoldText(true);
        canvas.drawText(String.format(Locale.CHINA, "%.0f%%", progress * 100), 120, 132, paint);
        return bitmap;
    }
}
