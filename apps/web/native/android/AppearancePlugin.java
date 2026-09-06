package com.cshouuu.moneydance;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Keeps the native window behind safe areas aligned with the web theme. */
@CapacitorPlugin(name = "Appearance")
public class AppearancePlugin extends Plugin {
    private static final String PREFS = "money_dance_appearance";
    private static final String CANVAS = "canvas";

    @PluginMethod
    public void setCanvas(PluginCall call) {
        String color = call.getString("color");
        if (color == null || !color.matches("#[0-9A-Fa-f]{6}")) {
            call.reject("Expected a six-digit canvas color");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                .edit().putString(CANVAS, color).apply();
            applySaved(getActivity(), getBridge().getWebView());
            call.resolve();
        });
    }

    @SuppressWarnings("deprecation")
    public static void applySaved(Activity activity, WebView webView) {
        String saved = activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
            .getString(CANVAS, "#F5F2EA");
        int canvas = Color.parseColor(saved != null && saved.matches("#[0-9A-Fa-f]{6}") ? saved : "#F5F2EA");
        Window window = activity.getWindow();
        window.setBackgroundDrawable(new ColorDrawable(canvas));
        window.getDecorView().setBackgroundColor(canvas);
        if (webView != null) webView.setBackgroundColor(canvas);
        window.setStatusBarColor(Color.TRANSPARENT);
        int flags = window.getDecorView().getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        // Older Android cannot display dark navigation icons on a light surface.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.setNavigationBarColor(canvas);
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        window.getDecorView().setSystemUiVisibility(flags);
    }
}
