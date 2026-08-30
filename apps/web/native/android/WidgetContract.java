package com.cshouuu.moneydance;

/** Shared names used by the Capacitor bridge, widget provider and ticker service. */
public final class WidgetContract {
    private WidgetContract() {}

    public static final int SNAPSHOT_VERSION = 1;

    public static final String PREFERENCES = "money_dance_widget";
    public static final String KEY_SNAPSHOT_JSON = "snapshot_json";
    public static final String KEY_PENDING_ACTIONS_JSON = "pending_actions_json";
    public static final String KEY_LAUNCH_TARGET = "launch_target";
    public static final String KEY_REALTIME_ENABLED = "realtime_enabled";

    // Internal keys. These are deliberately not part of the JavaScript contract.
    static final String KEY_ACTIVE_SLACKING_SESSION_ID = "active_slacking_session_id";
    static final String KEY_TICKER_RUNNING = "ticker_running";
    static final String KEY_TICKER_START_FAILED = "ticker_start_failed";
    static final String KEY_NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested";
    static final String KEY_REALTIME_SUPPRESSED_DAY = "realtime_suppressed_day";

    public static final String ACTION_SLACKING_START = "com.cshouuu.moneydance.widget.SLACKING_START";
    public static final String ACTION_SLACKING_STOP = "com.cshouuu.moneydance.widget.SLACKING_STOP";
    public static final String ACTION_OVERTIME_STOP = "com.cshouuu.moneydance.widget.OVERTIME_STOP";
    public static final String ACTION_ENABLE_REALTIME = "com.cshouuu.moneydance.widget.ENABLE_REALTIME";
    public static final String ACTION_DISABLE_REALTIME = "com.cshouuu.moneydance.widget.DISABLE_REALTIME";
    public static final String ACTION_STOP_REALTIME = "com.cshouuu.moneydance.widget.STOP_REALTIME";
    public static final String EXTRA_EXPECTED_START_AT = "expected_start_at";

    public static final String EVENT_SLACKING_START = "slacking_start";
    public static final String EVENT_SLACKING_STOP = "slacking_stop";
    public static final String EVENT_OVERTIME_STOP = "overtime_stop";

    public static final String OVERTIME_LAUNCH_TARGET = "/overtime?start=1";
    public static final String SLACKING_LAUNCH_TARGET = "/slacking";
    public static final String ROOT_LAUNCH_TARGET = "/";
    public static final String NOTIFICATION_CHANNEL_ID = "money_dance_widget_realtime";
    public static final int NOTIFICATION_ID = 2301;
    public static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 2302;
}
