package com.cshouuu.moneydance;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Home-screen entry point registered with the Android launcher. */
public class MoneyDanceWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        WidgetRenderer.update(context, manager, widgetIds);
        WidgetTickerService.reconcile(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager manager,
            int appWidgetId,
            Bundle newOptions
    ) {
        WidgetRenderer.update(context, manager, new int[] { appWidgetId });
    }

    @Override
    public void onEnabled(Context context) {
        WidgetRenderer.updateAll(context);
        WidgetTickerService.reconcile(context);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        WidgetTickerService.reconcile(context);
    }

    @Override
    public void onDisabled(Context context) {
        WidgetStateStore.setRealtimeEnabled(context, false);
        WidgetStateStore.clearRealtimeSuppression(context);
        WidgetTickerService.stop(context);
    }
}
