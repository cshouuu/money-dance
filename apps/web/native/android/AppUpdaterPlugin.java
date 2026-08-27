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

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String GITHUB_RELEASE_HOST = "github.com";
    private static final String GITHUB_RELEASE_PATH_PREFIX = "/cshouuu/money-dance/releases/download/";
    private static final String R2_RELEASE_HOST = "money-dance-6gl.pages.dev";
    private static final String R2_RELEASE_PATH_PREFIX = "/download/releases/";
    private static final String R2_UPDATE_MANIFEST_URL = "https://money-dance-6gl.pages.dev/download/latest.json";
    private static final String GITHUB_UPDATE_MANIFEST_URL = "https://github.com/cshouuu/money-dance/releases/latest/download/money-dance-update.json";
    private static final int HTTP_TIMEOUT_MS = 12000;
    private static final int MAX_REDIRECTS = 6;

    private boolean isTrustedReleaseUri(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getPath() == null) {
            return false;
        }
        boolean githubRelease = GITHUB_RELEASE_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath().startsWith(GITHUB_RELEASE_PATH_PREFIX);
        boolean r2Release = R2_RELEASE_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath().startsWith(R2_RELEASE_PATH_PREFIX);
        return githubRelease || r2Release;
    }

    private String readBody(InputStream input) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"));
        StringBuilder body = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) body.append(line);
        reader.close();
        return body.toString();
    }

    private JSONObject fetchManifestFrom(String manifestUrl) throws Exception {
        URL current = new URL(manifestUrl);
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) current.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(HTTP_TIMEOUT_MS);
                connection.setReadTimeout(HTTP_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("User-Agent", "Money-Dance-Android");
                connection.setRequestProperty("Cache-Control", "no-cache");

                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.isEmpty()) {
                        throw new IllegalStateException("UPDATE_MANIFEST_REDIRECT_WITHOUT_LOCATION");
                    }
                    URL next = new URL(current, location);
                    if (!"https".equalsIgnoreCase(next.getProtocol())) {
                        throw new SecurityException("UPDATE_MANIFEST_UNSAFE_REDIRECT");
                    }
                    current = next;
                    continue;
                }
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException("UPDATE_MANIFEST_HTTP_" + status + "_HOST_" + current.getHost());
                }
                return new JSONObject(readBody(connection.getInputStream()));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        throw new IllegalStateException("UPDATE_MANIFEST_TOO_MANY_REDIRECTS");
    }

    private JSONObject fetchUpdateManifest() throws Exception {
        Exception r2Error = null;
        try {
            return fetchManifestFrom(R2_UPDATE_MANIFEST_URL);
        } catch (Exception error) {
            r2Error = error;
        }

        try {
            return fetchManifestFrom(GITHUB_UPDATE_MANIFEST_URL);
        } catch (Exception githubError) {
            throw new IllegalStateException(
                    "R2_" + errorMessage(r2Error) + "; GITHUB_" + errorMessage(githubError),
                    githubError
            );
        }
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
                JSONObject manifest = fetchUpdateManifest();
                String tag = manifest.optString("tag", "");
                String version = manifest.optString("version", "");
                String apkName = manifest.optString("apkName", "");
                String apkUrl = manifest.optString("apkUrl", "");

                if (tag.isEmpty() || version.isEmpty() || apkName.isEmpty() || apkUrl.isEmpty()) {
                    call.reject("Invalid update manifest: REQUIRED_FIELDS_MISSING");
                    return;
                }
                if (!apkName.matches("[A-Za-z0-9._-]+\\.apk") || !isTrustedReleaseUri(Uri.parse(apkUrl))) {
                    call.reject("Invalid update manifest: UNTRUSTED_APK_METADATA");
                    return;
                }

                JSObject result = new JSObject();
                result.put("found", true);
                result.put("tag", tag);
                result.put("version", version);
                result.put("title", manifest.optString("title", "Money Dance " + tag));
                result.put("notes", manifest.optString("notes", ""));
                result.put("apkName", apkName);
                result.put("apkUrl", apkUrl);
                result.put("htmlUrl", manifest.optString("htmlUrl", "https://github.com/cshouuu/money-dance/releases/latest"));
                result.put("publishedAt", manifest.optString("publishedAt", ""));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("UPDATE_CHECK_FAILED: " + errorMessage(error), error);
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
