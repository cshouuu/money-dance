package com.cshouuu.moneydance;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
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
        synchronized (LOCK) {
            preferences(context).edit()
                    .putString(WidgetContract.KEY_LAUNCH_TARGET, target == null ? "" : target)
                    .commit();
        }
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

    public static void suppressRealtimeForDay(Context context, long now) {
        preferences(context).edit()
                .putInt(WidgetContract.KEY_REALTIME_SUPPRESSED_DAY, localDayToken(now))
                .commit();
    }

    public static void clearRealtimeSuppression(Context context) {
        preferences(context).edit()
                .remove(WidgetContract.KEY_REALTIME_SUPPRESSED_DAY)
                .commit();
    }

    public static boolean isRealtimeSuppressed(Context context, long now) {
        return preferences(context).getInt(WidgetContract.KEY_REALTIME_SUPPRESSED_DAY, -1)
                == localDayToken(now);
    }

    public static boolean isTickerRunning(Context context) {
        return preferences(context).getBoolean(WidgetContract.KEY_TICKER_RUNNING, false);
    }

    public static void setTickerRunning(Context context, boolean running) {
        preferences(context).edit()
                .putBoolean(WidgetContract.KEY_TICKER_RUNNING, running)
                .apply();
    }

    public static boolean didTickerStartFail(Context context) {
        return preferences(context).getBoolean(WidgetContract.KEY_TICKER_START_FAILED, false);
    }

    public static void setTickerStartFailed(Context context, boolean failed) {
        preferences(context).edit()
                .putBoolean(WidgetContract.KEY_TICKER_START_FAILED, failed)
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

    public static long activeSlackingStartAt(Context context) {
        return activeStartAt(getSnapshot(context), "slacking");
    }

    public static long activeOvertimeStartAt(Context context) {
        return activeStartAt(getSnapshot(context), "overtime");
    }

    public static double currentWorkRate(Context context, long now) {
        JSONObject snapshot = getSnapshot(context);
        if (!hasUsableSnapshot(snapshot, now)) return 0D;
        JSONArray timeline = snapshot.optJSONArray("workTimeline");
        if (timeline == null) return 0D;
        for (int index = 0; index < timeline.length(); index += 1) {
            JSONObject segment = timeline.optJSONObject(index);
            if (segment == null) continue;
            long startAt = segment.optLong("startAt", -1L);
            long endAt = segment.optLong("endAt", -1L);
            if (now >= startAt && now < endAt) {
                return finiteNonNegative(segment.optDouble("ratePerSecond", 0D));
            }
        }
        return 0D;
    }

    /** Integrates only positive-rate timeline slices for an active slacking timer. */
    static SlackingEarnings slackingEarnings(JSONObject snapshot, JSONObject slacking, long endAt) {
        long startAt = Math.max(0L, slacking.optLong("startAt", endAt));
        long safeEndAt = Math.max(startAt, endAt);
        long syncedAt = Math.max(startAt, snapshot.optLong("syncedAt", startAt));
        boolean hasSyncedBase = slacking.has("earnedAmountAtSync")
                && slacking.has("paidSecondsAtSync");
        double amount = hasSyncedBase
                ? finiteNonNegative(slacking.optDouble("earnedAmountAtSync", 0D))
                : ((Math.min(safeEndAt, syncedAt) - startAt) / 1000D)
                        * finiteNonNegative(snapshot.optDouble("secondRate", 0D));
        double paidSeconds = hasSyncedBase
                ? finiteNonNegative(slacking.optDouble("paidSecondsAtSync", 0D))
                : Math.max(0L, Math.min(safeEndAt, syncedAt) - startAt) / 1000D;
        double currentRate = 0D;
        long integrationStart = Math.max(startAt, syncedAt);
        JSONArray timeline = snapshot.optJSONArray("workTimeline");
        if (timeline == null || safeEndAt <= integrationStart) {
            return new SlackingEarnings(amount, paidSeconds, currentRate);
        }

        for (int index = 0; index < timeline.length(); index += 1) {
            JSONObject segment = timeline.optJSONObject(index);
            if (segment == null) continue;
            long segmentStart = segment.optLong("startAt", -1L);
            long segmentEnd = segment.optLong("endAt", -1L);
            double rate = finiteNonNegative(segment.optDouble("ratePerSecond", 0D));
            if (segmentStart < 0L || segmentEnd <= segmentStart || rate <= 0D) continue;
            long overlapStart = Math.max(integrationStart, segmentStart);
            long overlapEnd = Math.min(safeEndAt, segmentEnd);
            if (overlapEnd > overlapStart) {
                double seconds = (overlapEnd - overlapStart) / 1000D;
                paidSeconds += seconds;
                amount += seconds * rate;
            }
            if (safeEndAt >= segmentStart && safeEndAt < segmentEnd) currentRate = rate;
        }
        return new SlackingEarnings(amount, paidSeconds, currentRate);
    }

    public static long nextPaidWorkStartAt(Context context, long now) {
        JSONObject snapshot = getSnapshot(context);
        if (!hasUsableSnapshot(snapshot, now)) return -1L;
        JSONArray timeline = snapshot.optJSONArray("workTimeline");
        if (timeline == null) return -1L;
        for (int index = 0; index < timeline.length(); index += 1) {
            JSONObject segment = timeline.optJSONObject(index);
            if (segment == null) continue;
            long startAt = segment.optLong("startAt", -1L);
            long endAt = segment.optLong("endAt", -1L);
            double rate = finiteNonNegative(segment.optDouble("ratePerSecond", 0D));
            if (rate <= 0D || endAt <= now) continue;
            return Math.max(now, startAt);
        }
        return -1L;
    }

    /**
     * Returns the next useful foreground wake-up delay. Timers and paid work use
     * one-second rendering; a same-day zero-rate gap sleeps until the next paid
     * slice instead of sending Binder/RemoteViews work every second.
     */
    public static long nextTickerDelayMillis(Context context, long now) {
        if (hasActiveSlacking(context) || hasActiveOvertime(context)) return 1000L;
        if (!isRealtimeEnabled(context) || !hasUsableSnapshot(context, now)) return -1L;
        if (currentWorkRate(context, now) > 0D) return 1000L;
        long nextPaidAt = nextPaidWorkStartAt(context, now);
        if (nextPaidAt < 0L || !isSameLocalDay(now, nextPaidAt)) return -1L;
        return Math.max(100L, nextPaidAt - now);
    }

    public static boolean shouldRunTicker(Context context, long now) {
        return nextTickerDelayMillis(context, now) >= 0L;
    }

    public static boolean hasUsableSnapshot(Context context, long now) {
        return hasUsableSnapshot(getSnapshot(context), now);
    }

    private static boolean hasUsableSnapshot(JSONObject snapshot, long now) {
        if (snapshot.optInt("version", -1) != WidgetContract.SNAPSHOT_VERSION) return false;
        long validUntil = snapshot.optLong("validUntil", -1L);
        return validUntil > now;
    }

    public static boolean startSlacking(Context context, long occurredAt) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONObject snapshot = parseObject(prefs.getString(WidgetContract.KEY_SNAPSHOT_JSON, ""));
            JSONArray pending = parseArray(prefs.getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]"));
            JSONObject slacking = snapshot.optJSONObject("slacking");
            if (slacking != null && slacking.optBoolean("active", false)) return false;
            String sessionId = prefs.getString(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID, "");
            if (sessionId == null || sessionId.isEmpty()) sessionId = UUID.randomUUID().toString();

            JSONObject action = new JSONObject();
            try {
                action.put("actionId", UUID.randomUUID().toString());
                action.put("occurredAt", occurredAt);
                action.put("sessionId", sessionId);
                action.put("type", WidgetContract.EVENT_SLACKING_START);
                action.put("startAt", occurredAt);
                putStartBusinessDate(action, null, occurredAt);
                JSONObject nextSlacking = new JSONObject();
                nextSlacking.put("active", true);
                nextSlacking.put("startAt", occurredAt);
                nextSlacking.put("earnedAmountAtSync", 0D);
                nextSlacking.put("paidSecondsAtSync", 0D);
                putStartBusinessDate(nextSlacking, action, occurredAt);
                snapshot.put("slacking", nextSlacking);
                pending.put(action);
                return prefs.edit()
                        .putString(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID, sessionId)
                        .putString(WidgetContract.KEY_SNAPSHOT_JSON, snapshot.toString())
                        .putString(WidgetContract.KEY_PENDING_ACTIONS_JSON, pending.toString())
                        .commit();
            } catch (JSONException ignored) {
                return false;
            }
        }
    }

    public static boolean stopSlacking(Context context, long occurredAt, long expectedStartAt) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONObject snapshot = parseObject(prefs.getString(WidgetContract.KEY_SNAPSHOT_JSON, ""));
            JSONObject slacking = snapshot.optJSONObject("slacking");
            if (slacking == null || !slacking.optBoolean("active", false)) return false;
            long startAt = Math.max(0L, slacking.optLong("startAt", occurredAt));
            if (expectedStartAt < 0L || startAt != expectedStartAt) return false;
            long endAt = Math.max(startAt, occurredAt);
            SlackingEarnings earnings = slackingEarnings(snapshot, slacking, endAt);
            String sessionId = prefs.getString(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID, "");
            if (sessionId == null || sessionId.isEmpty()) sessionId = UUID.randomUUID().toString();

            JSONObject action = new JSONObject();
            try {
                action.put("actionId", UUID.randomUUID().toString());
                action.put("type", WidgetContract.EVENT_SLACKING_STOP);
                action.put("occurredAt", occurredAt);
                action.put("sessionId", sessionId);
                action.put("startAt", startAt);
                action.put("endAt", endAt);
                putStartBusinessDate(action, slacking, startAt);
                action.put("earnedAmount", earnings.amount);
                action.put("paidDurationSeconds", earnings.paidSeconds);
                JSONArray pending = parseArray(prefs.getString(WidgetContract.KEY_PENDING_ACTIONS_JSON, "[]"));
                pending.put(action);
                snapshot.remove("slacking");
                return prefs.edit()
                        .remove(WidgetContract.KEY_ACTIVE_SLACKING_SESSION_ID)
                        .putString(WidgetContract.KEY_SNAPSHOT_JSON, snapshot.toString())
                        .putString(WidgetContract.KEY_PENDING_ACTIONS_JSON, pending.toString())
                        .commit();
            } catch (JSONException ignored) {
                return false;
            }
        }
    }

    public static boolean stopOvertime(Context context, long occurredAt, long expectedStartAt) {
        synchronized (LOCK) {
            SharedPreferences prefs = preferences(context);
            JSONObject snapshot = parseObject(prefs.getString(WidgetContract.KEY_SNAPSHOT_JSON, ""));
            JSONObject overtime = snapshot.optJSONObject("overtime");
            if (overtime == null || !overtime.optBoolean("active", false)) return false;

            long startAt = Math.max(0L, overtime.optLong("startAt", occurredAt));
            if (expectedStartAt < 0L || startAt != expectedStartAt) return false;
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
                putStartBusinessDate(action, overtime, startAt);
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

    private static int localDayToken(long timestamp) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestamp);
        return calendar.get(Calendar.YEAR) * 1000 + calendar.get(Calendar.DAY_OF_YEAR);
    }

    private static String localDate(long timestamp) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestamp);
        return String.format(
                java.util.Locale.US,
                "%04d-%02d-%02d",
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH) + 1,
                calendar.get(Calendar.DAY_OF_MONTH)
        );
    }

    /** Mirrors JavaScript Date#getTimezoneOffset: UTC - local, in minutes. */
    private static int timezoneOffsetMinutes(long timestamp) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestamp);
        int localMinusUtc = calendar.get(Calendar.ZONE_OFFSET) + calendar.get(Calendar.DST_OFFSET);
        return -(localMinusUtc / 60_000);
    }

    private static void putStartBusinessDate(
            JSONObject target,
            JSONObject source,
            long startAt
    ) throws JSONException {
        String date = source == null ? "" : source.optString("startLocalDate", "");
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) date = localDate(startAt);
        int offset = source != null && source.has("startTimezoneOffsetMinutes")
                ? source.optInt("startTimezoneOffsetMinutes", timezoneOffsetMinutes(startAt))
                : timezoneOffsetMinutes(startAt);
        target.put("startLocalDate", date);
        target.put("startTimezoneOffsetMinutes", offset);
    }

    private static boolean isSameLocalDay(long left, long right) {
        return localDayToken(left) == localDayToken(right);
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
        if (!overtime) {
            if (timer.has("earnedAmountAtSync")) {
                double earnedAmount = timer.optDouble("earnedAmountAtSync", Double.NaN);
                if (!isFinite(earnedAmount) || earnedAmount < 0D) return false;
            }
            if (timer.has("paidSecondsAtSync")) {
                double paidSeconds = timer.optDouble("paidSecondsAtSync", Double.NaN);
                if (!isFinite(paidSeconds) || paidSeconds < 0D) return false;
            }
            return true;
        }
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
                    slacking.put("earnedAmountAtSync", 0D);
                    slacking.put("paidSecondsAtSync", 0D);
                    putStartBusinessDate(slacking, action, occurredAt);
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

    static final class SlackingEarnings {
        final double amount;
        final double paidSeconds;
        final double currentRate;

        SlackingEarnings(double amount, double paidSeconds, double currentRate) {
            this.amount = amount;
            this.paidSeconds = paidSeconds;
            this.currentRate = currentRate;
        }
    }
}
