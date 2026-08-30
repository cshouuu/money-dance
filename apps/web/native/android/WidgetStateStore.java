package com.cshouuu.moneydance;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Private, process-local persistence used by every native widget component. */
public final class WidgetStateStore {
    private static final Object LOCK = new Object();

    private WidgetStateStore() {}

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(
                WidgetContract.PREFERENCES,
                Context.MODE_PRIVATE
        );
    }

    private static JSONObject parseObject(String value) {
        if (value == null || value.trim().isEmpty()) return new JSONObject();
        try {
            return new JSONObject(value);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private static JSONArray parseArray(String value) {
        if (value == null || value.trim().isEmpty()) return new JSONArray();
        try {
            return new JSONArray(value);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    public static String getSnapshotJson(Context context) {
        return preferences(context).getString(WidgetContract.KEY_SNAPSHOT_JSON, "");
    }

    public static JSONObject getSnapshot(Context context) {
        return parseObject(getSnapshotJson(context));
    }

    public static boolean saveSnapshotJson(Context context, String snapshotJson) {
        return saveSnapshotJson(context, snapshotJson, new JSONArray());
    }

    public static boolean saveSnapshotJson(
            Context context,
            String snapshotJson,
            JSONArray appliedActionIds
    ) {
        JSONObject next = parseObject(snapshotJson);
        if (!isValidSnapshot(next)) return false;
        Set<String> applied = stringSet(appliedActionIds);

        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONObject previous = parseObject(prefs.getString(WidgetContract.KEY_SNAPSHOT_JSON, ""));
            JSONArray pending = parseArray(prefs.getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]"));
            JSONArray remaining = actionsWithoutIds(pending, applied);
            reconcileTimersWithPendingActions(next, remaining);
            long previousStart = activeStartAt(previous, "slacking");
            long nextStart = activeStartAt(next, "slacking");
            SharedPreferences.Editor editor = prefs.edit()
                    .putString(WidgetContract.KEY_SNAPSHOT_JSON, next.toString())
                    .putString(WidgetContract.KEY_PENDING_ACTIONS_JSON, remaining.toString());
            if (nextStart <= 0L || nextStart != previousStart) {
                editor.remove(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID);
            }
            return editor.commit();
        }
    }

    public static String getPendingActionsJson(Context context) {
        return preferences(context).getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]");
    }

    public static int getPendingActionCount(Context context) {
        return parseArray(getPendingActionsJson(context)).length();
    }

    public static boolean acknowledgeActions(Context context, JSONArray actionIds) {
        Set<String> acknowledged = stringSet(actionIds);
        if (acknowledged.isEmpty()) return true;

        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONArray current = parseArray(prefs.getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]"));
            JSONArray remaining = actionsWithoutIds(current, acknowledged);
            return prefs.edit()
                    .putString(WidgetContract.KEY_PENDING_ACTIONS_JSON, remaining.toString())
                    .commit();
        }
    }

    public static String getLaunchTarget(Context context) {
        return preferences(context).getString(WidgetContract.KEY_LAUNCH_TARGET, "");
    }

    public static void setLaunchTarget(Context context, String target) {
        preferences(context).edit()
                .putString(WidgetContract.KEY_LAUNCH_TARGET, target == null ? "" : target)
                .commit();
    }

    public static String consumeLaunchTarget(Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            String target = prefs.getString(WidgetContract.KEY_LAUNCH_TARGET, "");
            prefs.edit().remove(WidgetContract.KEY_LAUNCH_TARGET).commit();
            return target == null ? "" : target;
        }
    }

    public static boolean isRealtimeEnabled(Context context) {
        return preferences(context).getBoolean(WidgetContract.KEY_REALTIME_ENABLED, false);
    }

    public static void setRealtimeEnabled(Context context, boolean enabled) {
        preferences(context).edit()
                .putBoolean(WidgetContract.KEY_REALTIME_ENABLED, enabled)
                .commit();
    }

    public static boolean isTickerRunning(Context context) {
        return preferences(context).getBoolean(WidgetContract.KEY_TICKER_RUNNING, false);
    }

    public static void setTickerRunning(Context context, boolean running) {
        preferences(context).edit()
                .putBoolean(WidgetContract.KEY_TICKER_RUNNING, running)
                .apply();
    }

    /** Atomically records the one user-facing notification permission prompt. */
    public static boolean markNotificationPermissionRequestIfNeeded(Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            if (prefs.getBoolean(WidgetContract.KEY_NOTIFICATION_PERMISSION_REQUESTED, false)) {
                return false;
            }
            return prefs.edit()
                    .putBoolean(WidgetContract.KEY_NOTIFICATION_PERMISSION_REQUESTED, true)
                    .commit();
        }
    }

    public static boolean hasActiveSlacking(Context context) {
        return isActive(getSnapshot(context), "slacking");
    }

    public static boolean hasActiveOvertime(Context context) {
        return isActive(getSnapshot(context), "overtime");
    }

    public static boolean shouldTick(Context context) {
        return isRealtimeEnabled(context) || hasActiveSlacking(context) || hasActiveOvertime(context);
    }

    public static boolean hasUsableSnapshot(Context context, long now) {
        JSONObject snapshot = getSnapshot(context);
        if (snapshot.optInt("version", -1) != WidgetContract.SNAPSHOT_VERSION) return false;
        long validUntil = snapshot.optLong("validUntil", -1L);
        return validUntil > now;
    }

    public static boolean toggleSlacking(Context context, long occurredAt) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONObject snapshot = parseObject(prefs.getString(WidgetContract.KEY_SNAPSHOT_JSON, ""));
            JSONArray pending = parseArray(prefs.getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]"));
            JSONObject slacking = snapshot.optJSONObject("slacking");
            boolean active = slacking != null && slacking.optBoolean("active", false);
            String actionId = UUID.randomUUID().toString();
            String sessionId = prefs.getString(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID, "");
            if (sessionId == null || sessionId.isEmpty()) sessionId = UUID.randomUUID().toString();

            JSONObject action = new JSONObject();
            try {
                action.put("actionId", actionId);
                action.put("occurredAt", occurredAt);
                action.put("sessionId", sessionId);

                SharedPreferences.Editor editor = prefs.edit();
                if (active) {
                    long startAt = Math.max(0L, slacking.optLong("startAt", occurredAt));
                    long endAt = Math.max(startAt, occurredAt);
                    double secondRate = finiteNonNegative(snapshot.optDouble("secondRate", 0D));
                    double earnedAmount = ((endAt - startAt) / 1000D) * secondRate;
                    action.put("type", WidgetContract.EVENT_SLACKING_STOP);
                    action.put("startAt", startAt);
                    action.put("endAt", endAt);
                    action.put("earnedAmount", earnedAmount);
                    snapshot.remove("slacking");
                    editor.remove(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID);
                } else {
                    JSONObject nextSlacking = new JSONObject();
                    nextSlacking.put("active", true);
                    nextSlacking.put("startAt", occurredAt);
                    snapshot.put("slacking", nextSlacking);
                    action.put("type", WidgetContract.EVENT_SLACKING_START);
                    action.put("startAt", occurredAt);
                    editor.putString(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID, sessionId);
                }
                pending.put(action);
                return editor
                        .putString(WidgetContract.KEY_SNAPSHOT_JSON, snapshot.toString())
                        .putString(WidgetContract.KEY_PENDING_ACTIONS_JSON, pending.toString())
                        .commit();
            } catch (JSONException ignored) {
                return false;
            }
        }
    }

    public static boolean stopOvertime(Context context, long occurredAt) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONObject snapshot = parseObject(prefs.getString(WidgetContract.KEY_SNAPSHOT_JSON, ""));
            JSONObject overtime = snapshot.optJSONObject("overtime");
            if (overtime == null || !overtime.optBoolean("active", false)) return false;

            long startAt = Math.max(0L, overtime.optLong("startAt", occurredAt));
            long endAt = Math.max(startAt, occurredAt);
            String payMode = overtime.optString("payMode", "unpaid");
            if (!"fixed".equals(payMode)
                    && !"multiplier".equals(payMode)
                    && !"unpaid".equals(payMode)) payMode = "unpaid";
            double multiplier = finiteNonNegative(overtime.optDouble("multiplier", 1D));
            double fixedAmount = finiteNonNegative(overtime.optDouble("fixedAmount", 0D));
            double secondRate = finiteNonNegative(snapshot.optDouble("secondRate", 0D));
            double earnedAmount;
            if ("fixed".equals(payMode)) earnedAmount = fixedAmount;
            else if ("multiplier".equals(payMode)) {
                earnedAmount = ((endAt - startAt) / 1000D) * secondRate * multiplier;
            } else earnedAmount = 0D;

            JSONObject action = new JSONObject();
            try {
                action.put("actionId", UUID.randomUUID().toString());
                action.put("type", WidgetContract.EVENT_OVERTIME_STOP);
                action.put("occurredAt", occurredAt);
                action.put("sessionId", UUID.randomUUID().toString());
                action.put("startAt", startAt);
                action.put("endAt", endAt);
                action.put("earnedAmount", earnedAmount);
                action.put("payMode", payMode);
                if (overtime.has("multiplier")) action.put("multiplier", multiplier);
                if (overtime.has("fixedAmount")) action.put("fixedAmount", fixedAmount);

                JSONArray pending = parseArray(prefs.getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]"));
                pending.put(action);
                snapshot.remove("overtime");
                return prefs.edit()
                        .putString(WidgetContract.KEY_SNAPSHOT_JSON, snapshot.toString())
                        .putString(WidgetContract.KEY_PENDING_ACTIONS_JSON, pending.toString())
                        .commit();
            } catch (JSONException ignored) {
                return false;
            }
        }
    }

    private static boolean isActive(JSONObject snapshot, String key) {
        JSONObject value = snapshot.optJSONObject(key);
        return value != null && value.optBoolean("active", false);
    }

    private static long activeStartAt(JSONObject snapshot, String key) {
        JSONObject value = snapshot.optJSONObject(key);
        if (value == null || !value.optBoolean("active", false)) return -1L;
        return value.optLong("startAt", -1L);
    }

    private static double finiteNonNegative(double value) {
        return isFinite(value) ? Math.max(0D, value) : 0D;
    }

    private static boolean isValidSnapshot(JSONObject snapshot) {
        if (snapshot.optInt("version", -1) != WidgetContract.SNAPSHOT_VERSION) return false;
        long syncedAt = snapshot.optLong("syncedAt", -1L);
        long validUntil = snapshot.optLong("validUntil", -1L);
        double secondRate = snapshot.optDouble("secondRate", Double.NaN);
        JSONArray timeline = snapshot.optJSONArray("workTimeline");
        if (syncedAt < 0L || validUntil <= syncedAt
                || !isFinite(secondRate) || secondRate < 0D || timeline == null) return false;
        for (int index = 0; index < timeline.length(); index += 1) {
            JSONObject segment = timeline.optJSONObject(index);
            if (segment == null) return false;
            long startAt = segment.optLong("startAt", -1L);
            long endAt = segment.optLong("endAt", -1L);
            double baseAmount = segment.optDouble("baseAmount", Double.NaN);
            double rate = segment.optDouble("ratePerSecond", Double.NaN);
            if (startAt < 0L || endAt < startAt
                    || !isFinite(baseAmount) || baseAmount < 0D
                    || !isFinite(rate) || rate < 0D) return false;
        }
        return validActiveTimer(snapshot.optJSONObject("slacking"), false)
                && validActiveTimer(snapshot.optJSONObject("overtime"), true);
    }

    private static boolean validActiveTimer(JSONObject timer, boolean overtime) {
        if (timer == null) return true;
        if (!timer.optBoolean("active", false) || timer.optLong("startAt", -1L) < 0L) return false;
        if (!overtime) return true;
        String payMode = timer.optString("payMode", "");
        if (!"unpaid".equals(payMode) && !"multiplier".equals(payMode) && !"fixed".equals(payMode)) {
            return false;
        }
        if ("multiplier".equals(payMode)) {
            double multiplier = timer.optDouble("multiplier", Double.NaN);
            return isFinite(multiplier) && multiplier >= 0D;
        }
        if ("fixed".equals(payMode)) {
            double fixedAmount = timer.optDouble("fixedAmount", Double.NaN);
            return isFinite(fixedAmount) && fixedAmount >= 0D;
        }
        return true;
    }

    private static boolean isFinite(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value);
    }

    private static Set<String> stringSet(JSONArray values) {
        Set<String> result = new HashSet<>();
        if (values == null) return result;
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.optString(index, "");
            if (!value.isEmpty()) result.add(value);
        }
        return result;
    }

    private static JSONArray actionsWithoutIds(JSONArray actions, Set<String> excludedIds) {
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action != null && !excludedIds.contains(action.optString("actionId", ""))) {
                remaining.put(action);
            }
        }
        return remaining;
    }

    private static void reconcileTimersWithPendingActions(JSONObject snapshot, JSONArray pending) {
        for (int index = 0; index < pending.length(); index += 1) {
            JSONObject action = pending.optJSONObject(index);
            if (action == null) continue;
            String type = action.optString("type", "");
            if (WidgetContract.EVENT_SLACKING_START.equals(type)) {
                if (activeStartAt(snapshot, "slacking") >= 0L) continue;
                long occurredAt = action.optLong("occurredAt", -1L);
                if (occurredAt < 0L) continue;
                JSONObject slacking = new JSONObject();
                try {
                    slacking.put("active", true);
                    slacking.put("startAt", occurredAt);
                    snapshot.put("slacking", slacking);
                } catch (JSONException ignored) {
                }
            } else if (WidgetContract.EVENT_SLACKING_STOP.equals(type)) {
                if (activeStartAt(snapshot, "slacking") == action.optLong("startAt", -1L)) {
                    snapshot.remove("slacking");
                }
            } else if (WidgetContract.EVENT_OVERTIME_STOP.equals(type)) {
                if (activeStartAt(snapshot, "overtime") == action.optLong("startAt", -1L)) {
                    snapshot.remove("overtime");
                }
            }
        }
    }
}
