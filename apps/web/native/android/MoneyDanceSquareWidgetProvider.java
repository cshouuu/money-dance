package com.cshouuu.moneydance;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Independent 2x2 home-screen entry that shares the row widget's state and actions. */
public class MoneyDanceSquareWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        WidgetRenderer.updateSquare(context, manager, widgetIds);
        WidgetTickerService.reconcile(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager manager,
            int appWidgetId,
            Bundle newOptions
    ) {
        WidgetRenderer.updateSquare(context, manager, new int[] { appWidgetId });
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
        if (WidgetRenderer.hasWidgets(context)) {
            WidgetTickerService.reconcile(context);
            return;
        }
        WidgetStateStore.setRealtimeEnabled(context, false);
        WidgetStateStore.clearRealtimeSuppression(context);
        WidgetTickerService.stop(context);
    }
}
