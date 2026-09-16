package com.cshouuu.moneydance;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** User-selected JSON documents only; no broad storage permission is required. */
@CapacitorPlugin(name = "DataBackup")
public class DataBackupPlugin extends Plugin {
    private static final int MAX_BYTES = 8 * 1024 * 1024;

    @PluginMethod
    public void save(PluginCall call) {
        String text = call.getString("text");
        String filename = call.getString("filename", "MoneyDance-backup.json");
        if (text == null || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES
                || filename == null || filename.contains("/") || filename.contains("\\")
                || filename.length() > 150 || !filename.endsWith(".json")) {
            call.reject("INVALID_BACKUP");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try { startActivityForResult(call, intent, "saved"); }
        catch (Exception error) { call.reject("FILE_PICKER_UNAVAILABLE", error); }
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // Some providers identify JSON as text/plain or application/octet-stream.
        // The web layer validates the format and schema before it can be imported.
        intent.setType("*/*");
        try { startActivityForResult(call, intent, "opened"); }
        catch (Exception error) { call.reject("FILE_PICKER_UNAVAILABLE", error); }
    }

    private Uri selected(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject value = new JSObject(); value.put("cancelled", true); call.resolve(value);
            return null;
        }
        return result.getData().getData();
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = selected(call, result);
        if (uri == null) return;
        // Document providers may perform cloud I/O. Keep it off the UI thread.
        getBridge().execute(() -> {
            String text = call.getString("text");
            if (text == null) { call.reject("BACKUP_CONTENT_LOST"); return; }
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new java.io.IOException("No output stream");
                stream.write(text.getBytes(StandardCharsets.UTF_8));
                stream.flush();
            } catch (Exception error) { call.reject("BACKUP_SAVE_FAILED", error); return; }
            JSObject value = new JSObject(); value.put("cancelled", false); call.resolve(value);
        });
    }

    @ActivityCallback
    private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = selected(call, result);
        if (uri == null) return;
        getBridge().execute(() -> {
            try (InputStream stream = getContext().getContentResolver().openInputStream(uri);
                 ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                if (stream == null) throw new java.io.IOException("No input stream");
                byte[] buffer = new byte[8192];
                int length;
                while ((length = stream.read(buffer)) != -1) {
                    if (bytes.size() + length > MAX_BYTES) throw new java.io.IOException("Backup exceeds 8 MB");
                    bytes.write(buffer, 0, length);
                }
                JSObject value = new JSObject();
                value.put("text", new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                value.put("cancelled", false); call.resolve(value);
            } catch (Exception error) { call.reject("BACKUP_OPEN_FAILED", error); }
        });
    }
}
