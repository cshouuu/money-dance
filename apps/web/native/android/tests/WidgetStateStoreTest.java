package com.cshouuu.moneydance;

import org.json.JSONArray;
import org.json.JSONObject;

/** Standalone JVM regression checks; run with Android stubs and JSON-java. */
public final class WidgetStateStoreTest {
    private static final long START = 1_000_000L;

    private static JSONObject slice(double rate) throws Exception {
        return new JSONObject().put("startAt", START).put("endAt", START + 3_600_000L)
                .put("baseAmount", 200D).put("ratePerSecond", rate);
    }

    private static JSONObject snapshot() throws Exception {
        return new JSONObject().put("syncedAt", START)
                .put("workTimeline", new JSONArray().put(slice(0D)));
    }

    private static void check(JSONObject snapshot, double amount, double seconds) throws Exception {
        JSONObject active = new JSONObject().put("startAt", START)
                .put("earnedAmountAtSync", 5D).put("paidSecondsAtSync", 50D);
        WidgetStateStore.SlackingEarnings result = WidgetStateStore.slackingEarnings(snapshot, active, START + 3_600_000L);
        if (Math.abs(result.amount - amount) > 0.000001 || Math.abs(result.paidSeconds - seconds) > 0.000001) {
            throw new AssertionError("Expected " + amount + "/" + seconds + ", got " + result.amount + "/" + result.paidSeconds);
        }
    }

    public static void main(String[] args) throws Exception {
        // Paid vacation alone does not create work or slacking earnings.
        check(snapshot().put("paidWorkTimeline", new JSONArray()), 5D, 50D);
        // Duty keeps accruing work value even though daily vacation pay is fixed.
        check(snapshot().put("paidWorkTimeline", new JSONArray().put(slice(1D / 60D))), 65D, 3650D);
        // Zero-wage actual work still contributes its recorded duration.
        check(snapshot().put("paidWorkTimeline", new JSONArray().put(slice(0D))), 5D, 3650D);
        // Pre-upgrade snapshots remain readable with the original salary slices.
        check(snapshot().put("workTimeline", new JSONArray().put(slice(1D / 60D))), 65D, 3650D);
        check(snapshot(), 5D, 50D);
        System.out.println("WidgetStateStore: 5 regression cases passed");
    }
}
