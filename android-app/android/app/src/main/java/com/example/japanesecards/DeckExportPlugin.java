package com.example.japanesecards;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "DeckExport", permissions = {
    @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
})
public class DeckExportPlugin extends Plugin {
    @Override
    public void load() {
        // Forget the previous directory selection and release its retained access.
        SharedPreferences old = getContext().getSharedPreferences("dictionary-export", 0);
        String uri = old.getString("uri", "");
        if (!uri.isEmpty()) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(uri),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (SecurityException ignored) { }
        }
        old.edit().clear().apply();
    }

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "deck.json");
        String contents = call.getString("contents");
        if (contents == null || !filename.endsWith(".json") || filename.contains("/") || filename.contains("\\")) {
            call.reject("Invalid deck export.");
            return;
        }
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageGranted");
            return;
        }
        getBridge().execute(() -> writeDownloads(call, filename, contents));
    }

    @PermissionCallback
    private void storageGranted(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) save(call);
        else call.reject("Allow storage access to save the deck in Downloads.");
    }

    private void writeDownloads(PluginCall call, String filename, String contents) {
        Uri output = null;
        File legacyFile = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                output = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (output == null) throw new java.io.IOException("No export file was created");
                try (OutputStream stream = getContext().getContentResolver().openOutputStream(output, "w")) {
                    if (stream == null) throw new java.io.IOException("Cannot open export file");
                    stream.write(contents.getBytes(StandardCharsets.UTF_8));
                }
                ContentValues complete = new ContentValues();
                complete.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(output, complete, null, null);
            } else {
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloads.isDirectory() && !downloads.mkdirs()) throw new java.io.IOException("Cannot create Downloads");
                File candidate = new File(downloads, filename);
                int suffix = 1;
                while (!candidate.createNewFile()) {
                    candidate = new File(downloads, filename.substring(0, filename.length() - 5) + " (" + suffix++ + ").json");
                }
                legacyFile = candidate;
                try (OutputStream stream = new FileOutputStream(legacyFile)) {
                    stream.write(contents.getBytes(StandardCharsets.UTF_8));
                }
                MediaScannerConnection.scanFile(getContext(), new String[]{legacyFile.getAbsolutePath()},
                    new String[]{"application/json"}, null);
            }
            call.resolve();
        } catch (Exception error) {
            if (output != null) {
                try { getContext().getContentResolver().delete(output, null, null); } catch (Exception ignored) { }
            }
            if (legacyFile != null) legacyFile.delete();
            call.reject("Export failed. Check available space and try again.", error);
        }
    }
}
