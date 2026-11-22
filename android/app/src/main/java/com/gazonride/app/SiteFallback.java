package com.gazonride.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Some mobile operators reset connections to github.io. The web app's own
 * files are therefore also inside the APK (assets/site/, copied by CI from the
 * same commit) and the last good copy of each file is kept on the phone.
 *
 * Every request for the app's own pages is tried on the network first; when
 * that fails (reset, timeout, server error) the copy on the phone is served
 * from the same address, so the page, its saved data and the map keys keep
 * working exactly as before. Maps, Supabase, weather etc. are not touched.
 */
final class SiteFallback {
    private static final int CONNECT_MS = 6000, READ_MS = 12000;
    private static final long OFFLINE_HOLD_MS = 60000, WAIT_WITH_COPY_MS = 3500;
    private static final ExecutorService POOL = Executors.newCachedThreadPool();

    private final Context ctx;
    private final String prefix;
    private final boolean rootChannel;
    private final File dir;
    private volatile long offlineUntil = 0;

    SiteFallback(Context ctx, String prefix, String buildTag) {
        this.ctx = ctx.getApplicationContext();
        this.prefix = prefix;
        this.rootChannel = !prefix.endsWith("/beta/");
        this.dir = new File(ctx.getFilesDir(), "site-cache");
        // Files kept by an older APK may be older than this APK's own copy.
        SharedPreferences p = ctx.getSharedPreferences("gazonride", Context.MODE_PRIVATE);
        String tag = buildTag == null ? "" : buildTag;
        if (!tag.equals(p.getString("site_cache_build", null))) {
            deleteTree(dir);
            p.edit().putString("site_cache_build", tag).apply();
        }
    }

    /** Path inside the app ("index.html", "js/x.js"), or null when the URL is not one of the app's own files. */
    static String relPath(String prefix, boolean rootChannel, Uri u) {
        if (u == null || u.getScheme() == null || u.getHost() == null) return null;
        String path = u.getPath() == null ? "/" : u.getPath();
        String base = u.getScheme() + "://" + u.getHost() + path;
        if (!base.startsWith(prefix)) return null;
        String rel = base.substring(prefix.length());
        if (rootChannel && rel.startsWith("beta/")) return null;
        if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
        if (rel.contains("..") || rel.contains("\\") || rel.startsWith("/")) return null;
        return rel;
    }

    static String mime(String rel) {
        String r = rel.toLowerCase(Locale.ROOT);
        int dot = r.lastIndexOf('.');
        String ext = dot < 0 ? "" : r.substring(dot + 1);
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            case "woff2": return "font/woff2";
            case "txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    WebResourceResponse handle(WebResourceRequest req) {
        try {
            if (req == null || !"GET".equalsIgnoreCase(req.getMethod())) return null;
            Uri u = req.getUrl();
            String rel = relPath(prefix, rootChannel, u);
            if (rel == null) return null;
            String q = u.getQuery() == null ? "" : u.getQuery();
            File f = new File(dir, rel), meta = new File(dir, rel + ".q");
            // Versioned files (?v=…) never change: no need to download them again.
            boolean versioned = !rel.endsWith(".html") && ("&" + q).contains("&v=");
            if (versioned && f.isFile() && q.equals(readSmall(meta))) return local(rel, new FileInputStream(f));

            if (System.currentTimeMillis() >= offlineUntil) {
                final String url = u.toString();
                final Map<String, String> headers = req.getRequestHeaders();
                final boolean keep = !rel.startsWith("photos/");
                // The download keeps running (and refreshes the copy on the
                // phone) even when we stop waiting for it.
                Future<Net> job = POOL.submit(() -> {
                    Net n = fetch(url, headers);
                    if (n.status == 200 && keep) save(f, meta, n.body, q);
                    return n;
                });
                boolean local = hasLocal(rel, f);
                try {
                    // A stalled site must not leave the screen white: with a
                    // copy on the phone, wait only briefly for the network.
                    Net n = local ? job.get(WAIT_WITH_COPY_MS, TimeUnit.MILLISECONDS) : job.get();
                    if (n.status < 500 || !local) return response(n.mime, n.charset, n.status, n.body, rel);
                } catch (TimeoutException | ExecutionException e) {
                    offlineUntil = System.currentTimeMillis() + OFFLINE_HOLD_MS;
                    android.util.Log.w("GazOnRide", "Site slow/unreachable, using the copy on the phone: " + e);
                    if (!local) return null;
                }
            }
            if (f.isFile()) return local(rel, new FileInputStream(f));
            try { return local(rel, ctx.getAssets().open("site/" + rel)); }
            catch (IOException none) { return null; } // not bundled: let WebView try (and show its error)
        } catch (Exception e) {
            return null;
        }
    }

    private boolean hasLocal(String rel, File f) {
        if (f.isFile()) return true;
        try (InputStream in = ctx.getAssets().open("site/" + rel)) { return true; }
        catch (IOException e) { return false; }
    }

    private static final class Net { int status; String mime, charset; byte[] body; }

    private static Net fetch(String url, Map<String, String> headers) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(CONNECT_MS);
            c.setReadTimeout(READ_MS);
            c.setInstanceFollowRedirects(true);
            c.setUseCaches(false);
            if (headers != null) for (Map.Entry<String, String> h : headers.entrySet()) {
                String k = h.getKey() == null ? "" : h.getKey().toLowerCase(Locale.ROOT);
                // Accept-Encoding would hand us undecoded gzip; conditional and
                // range headers would give 304/206 that we cannot answer from.
                if (k.equals("user-agent") || k.equals("accept") || k.equals("accept-language"))
                    c.setRequestProperty(h.getKey(), h.getValue());
            }
            Net n = new Net();
            n.status = c.getResponseCode();
            InputStream in = n.status >= 400 ? c.getErrorStream() : c.getInputStream();
            n.body = in == null ? new byte[0] : readAll(in);
            String ct = c.getContentType();
            if (ct != null) {
                String[] parts = ct.split(";");
                n.mime = parts[0].trim();
                for (String p : parts) {
                    String t = p.trim();
                    if (t.toLowerCase(Locale.ROOT).startsWith("charset=")) n.charset = t.substring(8).replace("\"", "").trim();
                }
            }
            return n;
        } finally {
            c.disconnect();
        }
    }

    private static WebResourceResponse response(String mime, String charset, int status, byte[] body, String rel) {
        String m = mime == null || mime.isEmpty() ? mime(rel) : mime;
        Map<String, String> h = new HashMap<>();
        if (rel.endsWith(".html")) h.put("Cache-Control", "no-cache");
        String reason = status == 200 ? "OK" : status == 404 ? "Not Found" : "Status " + status;
        return new WebResourceResponse(m, charset, status, reason, h, new ByteArrayInputStream(body));
    }

    private static WebResourceResponse local(String rel, InputStream in) {
        String m = mime(rel);
        String cs = m.startsWith("text/") || m.contains("json") || m.contains("svg") ? "utf-8" : null;
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        return new WebResourceResponse(m, cs, 200, "OK", h, in);
    }

    private static void save(File f, File meta, byte[] body, String q) {
        try {
            File parent = f.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return;
            File tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(body); }
            if (!tmp.renameTo(f)) { tmp.delete(); return; }
            try (FileOutputStream o = new FileOutputStream(meta)) { o.write(q.getBytes(StandardCharsets.UTF_8)); }
        } catch (IOException ignored) {}
    }

    private static String readSmall(File f) {
        if (!f.isFile()) return null;
        try (InputStream in = new FileInputStream(f)) { return new String(readAll(in), StandardCharsets.UTF_8); }
        catch (IOException e) { return null; }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream i = in) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            while ((n = i.read(b)) > 0) o.write(b, 0, n);
            return o.toByteArray();
        }
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
