package com.cshouuu.moneydance;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        saveSnapshotValue(call);
    }

    // Kept as an alias so the web bridge can use the more descriptive verb.
    @PluginMethod
    public void syncSnapshot(PluginCall call) {
        saveSnapshotValue(call);
    }

    private void saveSnapshotValue(PluginCall call) {
        String snapshot = call.getString("snapshot", "");
        if (snapshot.isEmpty()) {
            JSObject object = call.getObject("snapshot");
            if (object != null) snapshot = object.toString();
        }
        JSONArray appliedActionIds = jsonArray(call.getArray("appliedActionIds", new JSArray()));
        if (!WidgetStateStore.saveSnapshotJson(getContext(), snapshot, appliedActionIds)) {
            call.reject("INVALID_WIDGET_SNAPSHOT");
            return;
        }
        WidgetRenderer.updateAll(getContext());
        WidgetTickerService.reconcile(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void getPendingActions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("actions", WidgetStateStore.getPendingActionsJson(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void ackActions(PluginCall call) {
        JSONArray values = jsonArray(call.getArray("actionIds", new JSArray()));
        if (!WidgetStateStore.acknowledgeActions(getContext(), values)) {
            call.reject("WIDGET_ACTION_ACK_FAILED");
            return;
        }
        JSObject result = new JSObject();
        result.put("remaining", WidgetStateStore.getPendingActionCount(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void consumeLaunchTarget(PluginCall call) {
        String target = WidgetStateStore.consumeLaunchTarget(getContext());
        JSObject result = new JSObject();
        result.put("target", target.isEmpty() ? JSONObject.NULL : target);
        call.resolve(result);
    }

    @PluginMethod
    public void setRealtimeEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        WidgetStateStore.setRealtimeEnabled(getContext(), enabled);
        WidgetRenderer.updateAll(getContext());
        WidgetTickerService.reconcile(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    private JSObject status() {
        JSObject result = new JSObject();
        result.put("widgetCount", WidgetRenderer.widgetCount(getContext()));
        result.put("hasSnapshot", !WidgetStateStore.getSnapshotJson(getContext()).isEmpty());
        result.put("pendingActionCount", WidgetStateStore.getPendingActionCount(getContext()));
        result.put("launchTarget", WidgetStateStore.getLaunchTarget(getContext()));
        result.put("realtimeEnabled", WidgetStateStore.isRealtimeEnabled(getContext()));
        result.put("serviceRunning", WidgetStateStore.isTickerRunning(getContext()));
        result.put("tickerRunning", WidgetStateStore.isTickerRunning(getContext()));
        result.put("hasActiveSlacking", WidgetStateStore.hasActiveSlacking(getContext()));
        result.put("hasActiveOvertime", WidgetStateStore.hasActiveOvertime(getContext()));
        return result;
    }

    private JSONArray jsonArray(JSArray values) {
        try {
            return new JSONArray(values.toString());
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }
}
