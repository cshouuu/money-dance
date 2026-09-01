package com.cshouuu.moneydance;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String PGYER_HOST = "www.pgyer.com";
    private static final String PGYER_APP_SHORTCUT = "__PGYER_APP_SHORTCUT__";
    private static final String PGYER_RELEASE_PAGE_URL = "https://www.pgyer.com/" + PGYER_APP_SHORTCUT;
    private static final int HTTP_TIMEOUT_MS = 12000;
    private static final int MAX_REDIRECTS = 4;
    private static final int MAX_PAGE_CHARS = 1_000_000;
    private static final Pattern APP_NAME_PATTERN = Pattern.compile("Money\\s*Dance", Pattern.CASE_INSENSITIVE);
    private static final Pattern VERSION_PATTERN = Pattern.compile(
            "(?:版本|Version)\\s*[：:]\\s*(\\d+\\.\\d+\\.\\d+)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern META_VERSION_PATTERN = Pattern.compile(
            "Money\\s*Dance\\s+(\\d+\\.\\d+\\.\\d+)\\s*Build",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern UPDATED_PATTERN = Pattern.compile(
            "(?:更新时间|Updated)\\s*[：:]\\s*(\\d{4}-\\d{2}-\\d{2})",
            Pattern.CASE_INSENSITIVE
    );

    private static final class ReleaseInfo {
        final String version;
        final String publishedAt;

        ReleaseInfo(String version, String publishedAt) {
            this.version = version;
            this.publishedAt = publishedAt;
        }
    }

    private boolean isTrustedPgyerUrl(URL url) {
        int port = url.getPort();
        return "https".equalsIgnoreCase(url.getProtocol())
                && PGYER_HOST.equalsIgnoreCase(url.getHost())
                && (port == -1 || port == 443);
    }

    private String readBody(InputStream input) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"))) {
            StringBuilder body = new StringBuilder();
            char[] buffer = new char[4096];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                if (body.length() + read > MAX_PAGE_CHARS) {
                    throw new IllegalStateException("PGYER_PAGE_TOO_LARGE");
                }
                body.append(buffer, 0, read);
            }
            return body.toString();
        }
    }

    private String fetchReleasePage() throws Exception {
        URL current = new URL(PGYER_RELEASE_PAGE_URL);
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            if (!isTrustedPgyerUrl(current)) {
                throw new SecurityException("PGYER_UNTRUSTED_REDIRECT");
            }

            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) current.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(HTTP_TIMEOUT_MS);
                connection.setReadTimeout(HTTP_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "text/html");
                connection.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
                connection.setRequestProperty("User-Agent", "Money-Dance-Android");
                connection.setRequestProperty("Cache-Control", "no-cache");

                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.isEmpty()) {
                        throw new IllegalStateException("PGYER_REDIRECT_WITHOUT_LOCATION");
                    }
                    current = new URL(current, location);
                    continue;
                }
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException("PGYER_HTTP_" + status);
                }
                return readBody(connection.getInputStream());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        throw new IllegalStateException("PGYER_TOO_MANY_REDIRECTS");
    }

    private ReleaseInfo parseReleasePage(String page) {
        if (!APP_NAME_PATTERN.matcher(page).find()) {
            throw new IllegalStateException("PGYER_APP_MISMATCH");
        }

        Matcher versionMatcher = VERSION_PATTERN.matcher(page);
        if (!versionMatcher.find()) {
            versionMatcher = META_VERSION_PATTERN.matcher(page);
            if (!versionMatcher.find()) {
                throw new IllegalStateException("PGYER_PAGE_FORMAT_CHANGED");
            }
        }

        Matcher updatedMatcher = UPDATED_PATTERN.matcher(page);
        String publishedAt = updatedMatcher.find() ? updatedMatcher.group(1) : "";
        return new ReleaseInfo(versionMatcher.group(1), publishedAt);
    }

    private String errorMessage(Exception error) {
        if (error == null) return "UnknownError: no_detail";
        String detail = error.getMessage();
        if (detail == null || detail.trim().isEmpty()) detail = "no_detail";
        return error.getClass().getSimpleName() + ": " + detail;
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "0.0.0" : info.versionName);
            result.put("versionCode", versionCode);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read app version: " + errorMessage(error), error);
        }
    }

    @PluginMethod
    public void getLatestRelease(PluginCall call) {
        new Thread(() -> {
            try {
                ReleaseInfo release = parseReleasePage(fetchReleasePage());
                String tag = "v" + release.version;
                JSObject result = new JSObject();
                result.put("found", true);
                result.put("tag", tag);
                result.put("version", release.version);
                result.put("title", "Money Dance " + tag);
                result.put("notes", "请在蒲公英下载页查看本次更新说明。");
                result.put("releasePageUrl", PGYER_RELEASE_PAGE_URL);
                result.put("publishedAt", release.publishedAt);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("UPDATE_CHECK_FAILED: " + errorMessage(error), error);
            }
        }, "money-dance-pgyer-update-check").start();
    }

    @PluginMethod
    public void openReleasePage(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PGYER_RELEASE_PAGE_URL));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("status", "opened");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("OPEN_PGYER_FAILED: " + errorMessage(error), error);
        }
    }
}
