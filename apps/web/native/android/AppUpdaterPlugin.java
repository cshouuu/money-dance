package com.cshouuu.moneydance;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String RELEASE_HOST = "github.com";
    private static final String RELEASE_PATH_PREFIX = "/cshouuu/money-dance/releases/download/";
    private static final String RELEASES_API = "https://api.github.com/repos/cshouuu/money-dance/releases/latest";

    private boolean isTrustedReleaseUri(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && RELEASE_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith(RELEASE_PATH_PREFIX);
    }

    private String readBody(InputStream input) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"));
        StringBuilder body = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) body.append(line);
        reader.close();
        return body.toString();
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
            call.reject("Unable to read app version", error);
        }
    }

    @PluginMethod
    public void getLatestRelease(PluginCall call) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(RELEASES_API).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "Money-Dance-Android");

                int status = connection.getResponseCode();
                if (status == 404) {
                    JSObject result = new JSObject();
                    result.put("found", false);
                    call.resolve(result);
                    return;
                }
                if (status < 200 || status >= 300) {
                    call.reject("Release check failed with HTTP " + status);
                    return;
                }

                JSONObject release = new JSONObject(readBody(connection.getInputStream()));
                String tag = release.optString("tag_name", "");
                JSONArray assets = release.optJSONArray("assets");
                String apkName = "";
                String apkUrl = "";
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.optJSONObject(i);
                        if (asset == null) continue;
                        String name = asset.optString("name", "");
                        String url = asset.optString("browser_download_url", "");
                        if (name.endsWith(".apk") && isTrustedReleaseUri(Uri.parse(url))) {
                            apkName = name;
                            apkUrl = url;
                            break;
                        }
                    }
                }

                JSObject result = new JSObject();
                if (tag.isEmpty() || apkName.isEmpty() || apkUrl.isEmpty()) {
                    result.put("found", false);
                    call.resolve(result);
                    return;
                }

                result.put("found", true);
                result.put("tag", tag);
                result.put("version", tag.replaceFirst("(?i)^v", "").split("-")[0]);
                result.put("title", release.optString("name", "Money Dance " + tag));
                result.put("notes", release.optString("body", ""));
                result.put("apkName", apkName);
                result.put("apkUrl", apkUrl);
                result.put("htmlUrl", release.optString("html_url", "https://github.com/cshouuu/money-dance/releases/latest"));
                result.put("publishedAt", release.optString("published_at", ""));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Unable to check latest release", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "money-dance-update-check").start();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String fileName = call.getString("fileName", "money-dance-update.apk");
        Uri uri = Uri.parse(url);

        if (!isTrustedReleaseUri(uri)) {
            call.reject("Untrusted update URL");
            return;
        }
        if (!fileName.matches("[A-Za-z0-9._-]+\\.apk")) {
            call.reject("Invalid APK file name");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settingsIntent);
            JSObject result = new JSObject();
            result.put("status", "permission_required");
            call.resolve(result);
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Download manager unavailable");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(uri)
                .setTitle("Money Dance 更新")
                .setDescription("正在下载 " + fileName)
                .setMimeType(APK_MIME)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);

        long downloadId = manager.enqueue(request);
        Context context = getContext().getApplicationContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context receiverContext, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (completedId != downloadId) return;
                try {
                    context.unregisterReceiver(this);
                } catch (Exception ignored) {
                }

                Uri apkUri = manager.getUriForDownloadedFile(downloadId);
                if (apkUri == null) return;

                Intent installIntent = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apkUri, APK_MIME)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                context.startActivity(installIntent);
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(receiver, filter);
        }

        JSObject result = new JSObject();
        result.put("status", "downloading");
        result.put("downloadId", downloadId);
        call.resolve(result);
    }
}
