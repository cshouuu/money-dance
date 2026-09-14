package com.cshouuu.moneydance;

import org.json.JSONArray;
import org.json.JSONObject;

/** Currency slices are assigned by the full app queue before selecting widget
 * slots. Hidden wishes therefore still reserve their own share of income. */
final class WishProgressProjection {
    static double earned(JSONObject snapshot, JSONObject wish, long now) {
        double price = Math.max(0, wish.optDouble("price", 0));
        double amount = Math.max(0, wish.optDouble("earnedAmount", 0));
        if (snapshot == null) return Math.min(price, amount);
        long until = Math.min(now, snapshot.optLong("validUntil", now));
        boolean sequential = "sequential".equals(snapshot.optString("allocationMode"));
        JSONArray timeline = snapshot.optJSONArray(sequential ? "allocationTimeline" : "timeline");
        if (timeline != null) for (int i = 0; i < timeline.length(); i++) {
            JSONObject slice = timeline.optJSONObject(i);
            if (slice == null || (sequential && !wish.optString("id").equals(slice.optString("wishId")))) continue;
            long start = slice.optLong("startAt");
            if (!sequential) start = Math.max(start, wish.optLong("startedAt", 0));
            if (sequential && slice.has("amount")) {
                if (until >= start) amount += Math.max(0, slice.optDouble("amount", 0));
            } else {
                amount += Math.max(0, Math.min((double) until, slice.optDouble("endAt")) - Math.max((double) start, slice.optDouble("startAt")))
                        / 1000D * Math.max(0, slice.optDouble("ratePerSecond", 0));
            }
        }
        return Math.min(price, Math.max(0, amount));
    }

    static double progress(JSONObject snapshot, JSONObject wish, long now) {
        double price = wish.optDouble("price", 0);
        long at = snapshot == null ? now : Math.min(now, snapshot.optLong("validUntil", now));
        if (price <= 0) return at < wish.optLong("startedAt", 0) ? 0 : 1;
        return Math.max(0, Math.min(1, earned(snapshot, wish, now) / price));
    }
}
