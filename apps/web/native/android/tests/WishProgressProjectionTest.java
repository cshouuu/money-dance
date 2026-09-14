package com.cshouuu.moneydance;

import org.json.JSONArray;
import org.json.JSONObject;

/** Executes the production native projection, without a device or Android UI. */
public final class WishProgressProjectionTest {
    private static JSONObject wish(String id, double amount) throws Exception {
        return new JSONObject().put("id", id).put("price", 100D).put("earnedAmount", amount).put("startedAt", 0L);
    }
    private static JSONObject slice(String id, long start, long end, double rate) throws Exception {
        return new JSONObject().put("wishId", id).put("startAt", start).put("endAt", end).put("ratePerSecond", rate);
    }
    private static void equal(double expected, double actual) {
        if (Math.abs(expected - actual) > .000001) throw new AssertionError("Expected " + expected + ", got " + actual);
    }
    public static void main(String[] args) throws Exception {
        JSONObject snapshot = new JSONObject().put("allocationMode", "sequential").put("validUntil", 20_000L)
            .put("allocationTimeline", new JSONArray().put(slice("A", 0, 10_000, 1)).put(slice("B", 10_000, 20_000, 1)));
        equal(15, WishProgressProjection.earned(snapshot, wish("A", 5), 15_000));
        equal(5, WishProgressProjection.earned(snapshot, wish("B", 0), 15_000));
        equal(0, WishProgressProjection.earned(snapshot, wish("C", 0), 15_000));
        equal(10, WishProgressProjection.earned(snapshot, wish("B", 0), 30_000));
        snapshot.getJSONArray("allocationTimeline").put(slice("C", 12_000, 12_000, 0).put("amount", 9D));
        equal(0, WishProgressProjection.earned(snapshot, wish("C", 0), 11_999));
        equal(9, WishProgressProjection.earned(snapshot, wish("C", 0), 12_000));
        JSONObject free = wish("F", 0).put("price", 0).put("startedAt", 15_000L);
        equal(0, WishProgressProjection.progress(snapshot, free, 14_000));
        equal(1, WishProgressProjection.progress(snapshot, free, 15_000));
        JSONObject legacy = new JSONObject().put("validUntil", 20_000L).put("timeline", new JSONArray().put(slice("", 0, 20_000, 1)));
        equal(10, WishProgressProjection.earned(legacy, wish("A", 0).put("startedAt", 10_000L), 20_000));
        equal(100, WishProgressProjection.earned(snapshot, wish("A", 98), 20_000));
        System.out.println("WishProgressProjection: 10 native regression checks passed");
    }
}
